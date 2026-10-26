/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const { createHash, verify, randomUUID } = require("node:crypto");
const { compareVersions } = require("./github-updates.cjs");
const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");
const versionPattern = /^\d+\.\d+\.\d+$/;
function safeRelative(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 240 ||
    value.includes("\\") ||
    value.startsWith("/") ||
    value
      .split("/")
      .some(
        (part) =>
          !part ||
          part === "." ||
          part === ".." ||
          /[<>:"|?*\x00-\x1f]/.test(part) ||
          /[ .]$/.test(part) ||
          /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(part),
      )
  )
    throw Error("更新包含非法文件路径");
  if (value.toLowerCase().startsWith(".next/node_modules/"))
    throw Error("代码更新不能替换运行环境依赖");
  if (
    !/^(src\/|public\/|\.next\/|remotion-bundle\/|server\.ts$|next\.config\.ts$|next-env\.d\.ts$|tsconfig\.json$|package\.json$)/.test(
      value,
    )
  )
    throw Error("更新包含不允许替换的目录");
  return value;
}
function verifyManifest(envelope, publicKey, runtimeId) {
  if (!publicKey)
    throw Error("此测试版尚未配置正式更新公钥，不能应用未签名更新");
  let bytes;
  try {
    bytes = Buffer.from(envelope.payload, "base64");
    if (
      bytes.length > 4 * 1024 * 1024 ||
      !verify(null, bytes, publicKey, Buffer.from(envelope.signature, "base64"))
    )
      throw Error();
  } catch {
    throw Error("更新签名无效");
  }
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw Error("更新清单损坏");
  }
  if (
    manifest.schemaVersion !== 1 ||
    !versionPattern.test(manifest.version) ||
    !Array.isArray(manifest.files) ||
    !manifest.files.length ||
    manifest.files.length > 5000
  )
    throw Error("更新清单格式不正确");
  if (manifest.runtimeId !== runtimeId)
    throw Error("新版需要升级底层运行环境，请等待程序升级版");
  const seen = new Set();
  let total = 0;
  for (const file of manifest.files) {
    safeRelative(file.path);
    const key = file.path.toLowerCase();
    if (seen.has(key)) throw Error("更新存在重复路径");
    seen.add(key);
    if (
      !Number.isSafeInteger(file.size) ||
      file.size < 0 ||
      file.size > 64 * 1024 * 1024 ||
      !/^[a-f\d]{64}$/i.test(file.sha256)
    )
      throw Error("更新文件信息无效");
    total += file.size;
  }
  if (total > 256 * 1024 * 1024) throw Error("代码更新大小超过限制");
  for (const required of [
    "server.ts",
    "package.json",
    ".next/BUILD_ID",
    "src/worker.ts",
  ])
    if (!seen.has(required.toLowerCase())) throw Error("更新缺少必要程序文件");
  return { ...manifest, totalSize: total, digest: sha(bytes) };
}
async function atomicJson(file, data) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const temporary = file + "." + randomUUID() + ".tmp";
  try {
    await fs.promises.writeFile(temporary, JSON.stringify(data, null, 2), {
      flag: "wx",
    });
    await fs.promises.rename(temporary, file);
  } finally {
    await fs.promises.rm(temporary, { force: true });
  }
}
function readPointer(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, "active.json"), "utf8"));
  } catch {
    return {};
  }
}
function versionDirectory(root, version) {
  if (!versionPattern.test(version)) throw Error("无效的代码版本");
  return path.join(root, "versions", version);
}
function checkedUrl(value, baseUrl, allowLocal = false) {
  const url = new URL(value);
  const base = new URL(baseUrl);
  const local =
    allowLocal &&
    ["127.0.0.1", "localhost"].includes(url.hostname) &&
    url.origin === base.origin;
  if (
    !local &&
    (url.protocol !== "https:" ||
      url.origin !== base.origin ||
      !url.pathname.toLowerCase().startsWith(base.pathname.toLowerCase()))
  )
    throw Error("更新文件来源不受信任");
  return url.href;
}
async function stageCodeUpdate(envelope, root, options) {
  const manifest = verifyManifest(
    envelope,
    options.publicKey,
    options.runtimeId,
  );
  if (options.expectedVersion && manifest.version !== options.expectedVersion)
    throw Error("更新清单版本与正式发布版本不一致");
  if (
    options.currentVersion &&
    compareVersions(manifest.version, options.currentVersion) <= 0
  )
    throw Error("不能下载旧版本");
  const existing = path.join(
    versionDirectory(root, manifest.version),
    "version.json",
  );
  if (fs.existsSync(existing)) {
    const marker = JSON.parse(await fs.promises.readFile(existing, "utf8"));
    if (marker.digest !== manifest.digest)
      throw Error("版本号相同但更新内容不同");
    await verifyStaged(
      root,
      manifest.version,
      options.runtimeId,
      options.publicKey,
    );
    await atomicJson(path.join(root, "pending.json"), {
      version: manifest.version,
    });
    return marker;
  }
  const staging = path.join(root, "staging", randomUUID());
  await fs.promises.mkdir(staging, { recursive: true });
  let received = 0;
  try {
    for (const file of manifest.files) {
      const url = checkedUrl(file.url, options.baseUrl, options.allowLocal);
      const response = await options.fetchImpl(url, {
        signal: AbortSignal.timeout(120000),
      });
      if (!response.ok || !response.body) throw Error("代码文件下载失败");
      const output = path.join(staging, ...file.path.split("/"));
      await fs.promises.mkdir(path.dirname(output), { recursive: true });
      const handle = await fs.promises.open(output, "wx");
      let size = 0;
      const hash = createHash("sha256");
      try {
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > file.size) throw Error("更新文件大小不符");
          await handle.writeFile(chunk);
          hash.update(chunk);
          received += chunk.length;
          options.onProgress?.({
            stage: "downloading",
            received,
            total: manifest.totalSize,
          });
        }
      } finally {
        await handle.close();
      }
      if (
        size !== file.size ||
        hash.digest("hex").toLowerCase() !== file.sha256.toLowerCase()
      )
        throw Error("更新文件校验失败");
    }
    options.onProgress?.({
      stage: "verifying",
      received,
      total: manifest.totalSize,
    });
    const marker = {
      envelope,
      version: manifest.version,
      runtimeId: manifest.runtimeId,
      digest: manifest.digest,
      files: manifest.files.map(({ path, size, sha256 }) => ({
        path,
        size,
        sha256,
      })),
    };
    await atomicJson(path.join(staging, "version.json"), marker);
    const final = versionDirectory(root, manifest.version);
    await fs.promises.mkdir(path.dirname(final), { recursive: true });
    await fs.promises.rename(staging, final);
    await atomicJson(path.join(root, "pending.json"), {
      version: manifest.version,
    });
    return marker;
  } finally {
    await fs.promises.rm(staging, { recursive: true, force: true });
  }
}
async function verifyStaged(root, version, runtimeId, publicKey) {
  const dir = versionDirectory(root, version);
  const marker = JSON.parse(
    await fs.promises.readFile(path.join(dir, "version.json"), "utf8"),
  );
  const signed = verifyManifest(marker.envelope, publicKey, runtimeId);
  if (signed.digest !== marker.digest) throw Error("已暂存的签名清单被修改");
  if (
    marker.version !== version ||
    signed.version !== version ||
    marker.runtimeId !== runtimeId
  )
    throw Error("待应用版本不兼容");
  for (const file of signed.files) {
    const location = path.join(dir, ...safeRelative(file.path).split("/"));
    if ((await fs.promises.lstat(location)).isSymbolicLink())
      throw Error("更新文件不能是符号链接");
    const bytes = await fs.promises.readFile(location);
    if (bytes.length !== file.size || sha(bytes) !== file.sha256.toLowerCase())
      throw Error("待应用文件已损坏");
  }
  return dir;
}
async function activateCodeUpdate(root, version, options) {
  const dir = await verifyStaged(
    root,
    version,
    options.runtimeId,
    options.publicKey,
  );
  const previous = readPointer(root);
  if (previous.version && compareVersions(version, previous.version) <= 0)
    throw Error("不能应用旧版本");
  let backup;
  let backedUp = false;
  try {
    backup = await options.backup();
    backedUp = true;
    await atomicJson(path.join(root, "active.json"), {
      version,
      previousVersion: previous.version ?? null,
      healthy: false,
    });
    if (!(await options.startAndCheck(dir, version)))
      throw Error("新版启动健康检查失败");
    await atomicJson(path.join(root, "active.json"), {
      version,
      previousVersion: previous.version ?? null,
      healthy: true,
    });
    await fs.promises.rm(path.join(root, "pending.json"), { force: true });
    return { version };
  } catch (error) {
    await options.stop?.();
    await atomicJson(path.join(root, "active.json"), previous);
    if (backedUp) await options.restore(backup);
    await options.restartPrevious?.();
    throw new Error(`更新未生效，已恢复旧版：${error.message}`);
  }
}
module.exports = {
  safeRelative,
  verifyManifest,
  stageCodeUpdate,
  verifyStaged,
  activateCodeUpdate,
  versionDirectory,
  readPointer,
  atomicJson,
  checkedUrl,
};
