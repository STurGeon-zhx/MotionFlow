/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
module.exports = async function (root, privateKey) {
  const files = [];
  async function walk(relative, source) {
    const entries = await fs.readdir(source, { withFileTypes: true });
    for (const entry of entries) {
      if (
        ["cache", "dev", "trace", "diagnostics", "types"].includes(
          entry.name,
        ) ||
        entry.isSymbolicLink()
      )
        continue;
      const rel = relative + "/" + entry.name,
        full = path.join(source, entry.name);
      if (entry.isDirectory()) await walk(rel, full);
      else if (entry.isFile()) {
        const bytes = await fs.readFile(full);
        files.push({
          path: rel,
          source: full,
          size: bytes.length,
          sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        });
      }
    }
  }
  for (const folder of ["src", ".next", "public"])
    await walk(folder, path.join(root, folder));
  await walk(
    "remotion-bundle",
    path.join(root, ".data/review/remotion-bundle"),
  );
  for (const file of [
    "server.ts",
    "package.json",
    "next.config.ts",
    "tsconfig.json",
    "next-env.d.ts",
  ]) {
    const bytes = await fs.readFile(path.join(root, file));
    files.push({
      path: file,
      source: path.join(root, file),
      size: bytes.length,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    });
  }
  let envelope;
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === "/manifest") {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(envelope));
        return;
      }
      const index = Number((req.url ?? "").slice("/files/".length));
      if (
        !req.url?.startsWith("/files/") ||
        !Number.isInteger(index) ||
        !files[index]
      ) {
        res.writeHead(404).end();
        return;
      }
      const data = await fs.readFile(files[index].source);
      res.setHeader("Content-Length", data.length);
      res.end(data);
    } catch {
      res.writeHead(500).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = "http://127.0.0.1:" + server.address().port;
  const manifest = {
    schemaVersion: 1,
    version: "1.1.2",
    runtimeId: "motionflow-win32-x64-node-runtime-1",
    files: files.map(({ path, size, sha256 }, i) => ({
      path,
      size,
      sha256,
      url: url + "/files/" + i,
    })),
  };
  const payload = Buffer.from(JSON.stringify(manifest));
  envelope = {
    payload: payload.toString("base64"),
    signature: crypto.sign(null, payload, privateKey).toString("base64"),
  };
  return {
    url,
    close: () => new Promise((resolve) => server.close(resolve)),
    count: files.length,
  };
};
