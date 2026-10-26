/* eslint-disable @typescript-eslint/no-require-imports */
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  session,
  net: electronNet,
} = require("electron");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const updates = require("./code-updates.cjs");
const {
  DEFAULT_UPDATE_REPOSITORY,
  normalizeRepository,
  compareVersions,
  checkForUpdate,
} = require("./github-updates.cjs");

app.setName("MotionFlow");

const review = process.env.MOTION_DESKTOP_REVIEW === "1";
const projectRoot = path.resolve(__dirname, "..");
const packageRoot = review
  ? projectRoot
  : path.resolve(process.resourcesPath, "..");
const internalRoot = review ? projectRoot : path.join(packageRoot, "_internal");
const applicationRoot = review
  ? path.join(projectRoot, ".data", "review", "desktop")
  : process.env.MOTION_APP_DATA_DIR || path.join(app.getPath("appData"), "MotionFlow");
const dataDirectory = path.join(applicationRoot, "data");
const updateRoot = path.join(applicationRoot, "updates");
const runtimeId = "motionflow-win32-x64-node-runtime-1";
const baseVersion = require(path.join(internalRoot, "package.json")).version;
const publicKeyPath = review
  ? process.env.MOTION_REVIEW_UPDATE_PUBLIC_KEY
  : path.join(__dirname, "update-public-key.pem");
const publicKey =
  publicKeyPath && fs.existsSync(publicKeyPath)
    ? fs.readFileSync(publicKeyPath, "utf8")
    : "";
let activePointer = updates.readPointer(updateRoot);
let runtimeRoot = activePointer.version
  ? updates.versionDirectory(updateRoot, activePointer.version)
  : internalRoot;
let codeVersion = activePointer.version || baseVersion;
fs.mkdirSync(dataDirectory, { recursive: true });
app.setPath("userData", path.join(applicationRoot, "profile"));
if (review) app.setName("MotionFlow Local Review");

let mainWindow = null;
let webProcess = null;
let workerProcess = null;
let appUrl = null;
let quitting = false;
let reviewUpdateFeed = null;
const selectedDirectories = new Set();

function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() =>
        port ? resolve(port) : reject(new Error("无法分配本地端口")),
      );
    });
  });
}

function startRuntime(command, port) {
  const nodePath = review
    ? process.env.MOTION_NODE_EXECUTABLE ||
      "C:\\Program Files\\nodejs\\node.exe"
    : path.join(internalRoot, "runtime", "node.exe");
  const tsxPath = path.join(
    internalRoot,
    "node_modules",
    "tsx",
    "dist",
    "cli.mjs",
  );
  if (!fs.existsSync(nodePath) || !fs.existsSync(tsxPath)) {
    throw new Error("程序运行文件不完整，请检查运行环境。");
  }
  return spawn(nodePath, [tsxPath, ...command], {
    cwd: runtimeRoot,
    windowsHide: true,
    stdio: [
      "ignore",
      fs.openSync(
        path.join(
          applicationRoot,
          command[0] === "server.ts" ? "web.log" : "worker.log",
        ),
        "a",
      ),
      fs.openSync(
        path.join(
          applicationRoot,
          command[0] === "server.ts" ? "web-error.log" : "worker-error.log",
        ),
        "a",
      ),
    ],
    env: {
      ...process.env,
      NODE_ENV:
        review && !fs.existsSync(path.join(runtimeRoot, ".next", "BUILD_ID"))
          ? "development"
          : "production",
      PORT: String(port),
      MOTION_HOSTNAME: "127.0.0.1",
      MOTION_DOWNLOAD_MODE: "mp4",
      MOTION_DATA_DIR: dataDirectory,
      MOTION_CODE_VERSION: codeVersion,
      MOTION_REMOTION_BUNDLE:
        review && runtimeRoot === internalRoot
          ? path.join(projectRoot, ".data/review/remotion-bundle")
          : path.join(runtimeRoot, "remotion-bundle"),
      MOTION_SEQUENCE_ENGINE: process.env.MOTION_SEQUENCE_ENGINE || "sharp",
      MOTION_MUSIC_DIR: path.join(internalRoot, "assets", "music"),
    },
  });
}

async function waitUntilReady(url, child, attempts = 240) {
  for (let index = 0; index < attempts; index++) {
    if (child.exitCode !== null) return false;
    try {
      const response = await fetch(`${url}/api/runtime-config`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) return true;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function stopProcessTree(child) {
  if (!child || child.exitCode !== null) return;
  try {
    spawnSync("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
      windowsHide: true,
      stdio: "ignore",
    });
  } catch {}
}

function stopRuntime() {
  stopProcessTree(workerProcess);
  stopProcessTree(webProcess);
  workerProcess = null;
  webProcess = null;
}

function sanitizeFilename(value) {
  const filename = path
    .basename(String(value || "video.mp4"))
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .trim();
  return filename.toLowerCase().endsWith(".mp4")
    ? filename
    : `${filename || "video"}.mp4`;
}

function getAvailablePath(directoryPath, requestedFilename) {
  const filename = sanitizeFilename(requestedFilename);
  const extension = path.extname(filename);
  const stem = path.basename(filename, extension);
  let candidate = path.join(directoryPath, filename);
  let suffix = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(directoryPath, `${stem}_${suffix}${extension}`);
    suffix += 1;
  }
  return candidate;
}

async function getCookieHeader(url) {
  const cookies = await session.defaultSession.cookies.get({ url });
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

ipcMain.handle("motionflow:select-download-directory", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "选择成片保存位置",
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const directoryPath = path.resolve(result.filePaths[0]);
  selectedDirectories.add(directoryPath.toLocaleLowerCase());
  return {
    path: directoryPath,
    name: path.basename(directoryPath) || directoryPath,
  };
});

ipcMain.handle("motionflow:save-download-file", async (_event, input) => {
  const directoryPath = path.resolve(String(input?.directoryPath || ""));
  if (!selectedDirectories.has(directoryPath.toLocaleLowerCase())) {
    throw new Error("请先选择下载位置");
  }
  const stat = await fs.promises.stat(directoryPath).catch(() => null);
  if (!stat?.isDirectory()) throw new Error("下载位置不存在或不可写");

  const downloadUrl = new URL(String(input?.url || ""), appUrl);
  if (downloadUrl.origin !== appUrl) throw new Error("无效的下载地址");
  const cookie = await getCookieHeader(appUrl);
  const response = await fetch(downloadUrl, {
    headers: cookie ? { cookie } : {},
  });
  if (!response.ok || !response.body)
    throw new Error(`视频读取失败（${response.status}）`);

  const outputPath = getAvailablePath(directoryPath, input?.filename);
  const temporaryPath = `${outputPath}.motionflow-download`;
  try {
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.promises.writeFile(temporaryPath, buffer);
    await fs.promises.rename(temporaryPath, outputPath);
    return { filename: path.basename(outputPath) };
  } catch (error) {
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
});

const updateSettingsPath = path.join(dataDirectory, "desktop-updates.json");
let checkedUpdate = null;
let downloadingUpdate = false;
function readUpdateConfig() {
  let repository = "";
  try {
    repository =
      JSON.parse(
        fs.readFileSync(path.join(__dirname, "update-config.json"), "utf8"),
      ).repository || "";
  } catch {}
  try {
    const saved = JSON.parse(fs.readFileSync(updateSettingsPath, "utf8"));
    if (typeof saved.repository === "string") repository = saved.repository;
  } catch {}
  return {
    currentVersion: codeVersion,
    repository: normalizeRepository(repository) || DEFAULT_UPDATE_REPOSITORY,
  };
}
function assertDesktopCaller(event) {
  if (event.sender !== mainWindow?.webContents)
    throw new Error("无效的更新请求");
}
ipcMain.handle("motionflow:get-update-config", (event) => {
  assertDesktopCaller(event);
  return readUpdateConfig();
});
ipcMain.handle(
  "motionflow:set-update-repository",
  async (event, repository) => {
    assertDesktopCaller(event);
    if (downloadingUpdate) throw new Error("请等待当前下载完成");
    const normalized =
      normalizeRepository(repository) || DEFAULT_UPDATE_REPOSITORY;
    await fs.promises.mkdir(path.dirname(updateSettingsPath), {
      recursive: true,
    });
    await fs.promises.writeFile(
      updateSettingsPath,
      JSON.stringify({ repository: normalized }, null, 2),
    );
    checkedUpdate = null;
    return readUpdateConfig();
  },
);
ipcMain.handle("motionflow:check-for-updates", async (event) => {
  assertDesktopCaller(event);
  if (review && reviewUpdateFeed) {
    const envelope = await electronNet
      .fetch(reviewUpdateFeed + "/manifest")
      .then((response) => response.json());
    const manifest = updates.verifyManifest(envelope, publicKey, runtimeId);
    const { compareVersions } = require("./github-updates.cjs");
    checkedUpdate = {
      status:
        compareVersions(manifest.version, codeVersion) > 0
          ? "available"
          : "up_to_date",
      currentVersion: codeVersion,
      latestVersion: manifest.version,
      codeManifestUrl: reviewUpdateFeed + "/manifest",
      localBaseUrl: reviewUpdateFeed + "/files/",
      notes: "仅用于本地签名更新验收",
    };
    return checkedUpdate;
  }
  checkedUpdate = await checkForUpdate(readUpdateConfig(), (url, options) =>
    electronNet.fetch(url, options),
  );
  if (checkedUpdate.status === "available" && !checkedUpdate.codeManifestUrl)
    return {
      ...checkedUpdate,
      status: "runtime_required",
      asset: null,
      message: "该版本尚未提供兼容的代码更新，本测试版不会下载整包。",
    };
  return { ...checkedUpdate, asset: null };
});
ipcMain.handle("motionflow:download-update", async (event) => {
  assertDesktopCaller(event);
  if (downloadingUpdate) throw new Error("代码更新正在下载");
  if (!checkedUpdate?.codeManifestUrl)
    throw new Error("请先检查可用的代码更新");
  downloadingUpdate = true;
  try {
    const config = readUpdateConfig();
    const response = await electronNet.fetch(checkedUpdate.codeManifestUrl, {
      signal: AbortSignal.timeout(20000),
    });
    if (
      !response.ok ||
      Number(response.headers.get("content-length")) > 5 * 1024 * 1024
    )
      throw new Error("读取更新清单失败");
    const envelope = await response.json();
    const baseUrl =
      review && checkedUpdate.localBaseUrl
        ? checkedUpdate.localBaseUrl
        : "https://github.com/" + config.repository + "/releases/download/";
    const marker = await updates.stageCodeUpdate(envelope, updateRoot, {
      publicKey,
      runtimeId,
      baseUrl,
      allowLocal: review && !!checkedUpdate.localBaseUrl,
      expectedVersion: checkedUpdate.latestVersion,
      currentVersion: codeVersion,
      fetchImpl: (url, options) => electronNet.fetch(url, options),
      onProgress: (progress) => {
        if (!event.sender.isDestroyed())
          event.sender.send("motionflow:update-download-progress", progress);
      },
    });
    if (marker.version !== checkedUpdate.latestVersion)
      throw new Error("更新清单版本与正式发布版本不一致");
    return { ready: true, version: marker.version };
  } finally {
    downloadingUpdate = false;
  }
});
async function ensureRuntimeDependencies(directory) {
  if (directory === internalRoot) return;
  for (const relative of ["node_modules", ".next/node_modules"]) {
    const source = path.join(internalRoot, relative),
      destination = path.join(directory, relative);
    if (fs.existsSync(source) && !fs.existsSync(destination)) {
      await fs.promises.mkdir(path.dirname(destination), { recursive: true });
      await fs.promises.symlink(source, destination, "junction");
    }
  }
}
function databaseBackup() {
  const database = path.join(dataDirectory, "motion-studio.sqlite");
  const backup = path.join(dataDirectory, "update-backup.sqlite");
  if (!fs.existsSync(database)) return null;
  for (const suffix of ["-wal", "-shm"])
    fs.rmSync(backup + suffix, { force: true });
  fs.copyFileSync(database, backup);
  for (const suffix of ["-wal", "-shm"])
    if (fs.existsSync(database + suffix))
      fs.copyFileSync(database + suffix, backup + suffix);
  return backup;
}
async function restoreDatabase(backup) {
  const database = path.join(dataDirectory, "motion-studio.sqlite");
  for (const suffix of ["", "-wal", "-shm"]) {
    await fs.promises.rm(database + suffix, { force: true });
    if (backup && fs.existsSync(backup + suffix))
      await fs.promises.copyFile(backup + suffix, database + suffix);
  }
}
async function bootRuntime() {
  await ensureRuntimeDependencies(runtimeRoot);
  const port = await findAvailablePort();
  appUrl = "http://127.0.0.1:" + port;
  const production = fs.existsSync(path.join(runtimeRoot, ".next", "BUILD_ID"));
  webProcess = startRuntime(
    production ? ["server.ts", "--production"] : ["server.ts"],
    port,
  );
  workerProcess = startRuntime(["src/worker.ts"], port);
  if (!(await waitUntilReady(appUrl, webProcess)))
    throw new Error("本地服务启动健康检查失败");
  for (let attempt = 0; attempt < 20; attempt++) {
    if (workerProcess.exitCode !== null)
      throw new Error("新版渲染服务启动失败");
    try {
      const health = await fetch(appUrl + "/api/runtime-config").then((res) =>
        res.json(),
      );
      if (health.workerOnline) {
        if (review)
          await fs.promises.writeFile(
            path.join(applicationRoot, "runtime.json"),
            JSON.stringify({
              appUrl,
              desktopPid: process.pid,
              webPid: webProcess.pid,
              workerPid: workerProcess.pid,
              codeVersion,
            }),
          );
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("新版渲染服务心跳检查失败");
}
ipcMain.handle("motionflow:apply-update", async (event, confirmed) => {
  assertDesktopCaller(event);
  if (downloadingUpdate) throw new Error("请等待代码下载完成");
  const pending = JSON.parse(
    await fs.promises.readFile(path.join(updateRoot, "pending.json"), "utf8"),
  );
  await updates.verifyStaged(updateRoot, pending.version, runtimeId, publicKey);
  if (compareVersions(pending.version, codeVersion) <= 0)
    throw new Error("不能应用旧版本");
  const cookie = await getCookieHeader(appUrl);
  const response = await fetch(appUrl + "/api/video-jobs?pageSize=50", {
    headers: { cookie },
  });
  const jobs = (await response.json()).jobs || [];
  const active = jobs.filter((job) =>
    ["pending", "running", "pausing"].includes(job.status),
  );
  if (active.length && !confirmed)
    return { needsConfirmation: true, count: active.length };
  for (const job of active)
    await fetch(appUrl + "/api/video-jobs/" + job.id + "/pause", {
      method: "POST",
      headers: { cookie },
    });
  const previousRoot = runtimeRoot,
    previousVersion = codeVersion;
  stopRuntime();
  const result = await updates.activateCodeUpdate(updateRoot, pending.version, {
    runtimeId,
    publicKey,
    backup: databaseBackup,
    restore: restoreDatabase,
    stop: stopRuntime,
    startAndCheck: async (directory, version) => {
      runtimeRoot = directory;
      codeVersion = version;
      await bootRuntime();
      return true;
    },
    restartPrevious: async () => {
      runtimeRoot = previousRoot;
      codeVersion = previousVersion;
      await bootRuntime();
      if (mainWindow) await mainWindow.loadURL(appUrl);
    },
  });
  await mainWindow.loadURL(appUrl);
  return { applied: true, version: result.version };
});

async function createMainWindow() {
  try {
    await bootRuntime();
  } catch (error) {
    stopRuntime();
    if (runtimeRoot === internalRoot || activePointer.healthy === true)
      throw error;
    const previous = activePointer.previousVersion;
    runtimeRoot = previous
      ? updates.versionDirectory(updateRoot, previous)
      : internalRoot;
    codeVersion = previous || baseVersion;
    await updates.atomicJson(
      path.join(updateRoot, "active.json"),
      previous ? { version: previous } : {},
    );
    const backup = path.join(dataDirectory, "update-backup.sqlite");
    if (fs.existsSync(backup)) await restoreDatabase(backup);
    await bootRuntime();
  }

  mainWindow = new BrowserWindow({
    title: review ? "MotionFlow · 本地评审版" : "MotionFlow · 图片动态视频工坊",
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#f4f7fb",
    webPreferences: {
      preload: path.join(
        __dirname,
        fs.existsSync(path.join(__dirname, "electron-preload.cjs"))
          ? "electron-preload.cjs"
          : "preload.cjs",
      ),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  Menu.setApplicationMenu(null);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== appUrl) event.preventDefault();
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  if(review)mainWindow.on('page-title-updated',event=>{event.preventDefault();mainWindow.setTitle('MotionFlow · 本地评审版');});
  mainWindow.on("closed", () => {
    mainWindow = null;
    if (!quitting) app.quit();
  });
  await mainWindow.loadURL(appUrl);
  mainWindow.show();
  mainWindow.focus();
  if (review) {
    await fs.promises.writeFile(
      path.join(applicationRoot, "runtime.json"),
      JSON.stringify({
        appUrl,
        desktopPid: process.pid,
        webPid: webProcess.pid,
        workerPid: workerProcess.pid,
        codeVersion,
      }),
    );
    if (process.env.MOTION_REVIEW_SMOKE === "1")
      setTimeout(() => {
        require(path.join(projectRoot, "scripts/review-desktop-smoke.cjs"))({
          mainWindow,
          appUrl,
          projectRoot,
          setUpdateFeed: (url) => {
            reviewUpdateFeed = url;
          },
          getAppUrl: () => appUrl,
          restartBase: async () => {
            stopRuntime();
            runtimeRoot = internalRoot;
            codeVersion = baseVersion;
            await updates.atomicJson(path.join(updateRoot, "active.json"), {});
            reviewUpdateFeed = null;
            await bootRuntime();
            await mainWindow.loadURL(appUrl);
          },
          stopWorker: () => stopProcessTree(workerProcess),
          restartWorker: () => {
            workerProcess = startRuntime(
              ["src/worker.ts"],
              Number(new URL(appUrl).port),
            );
          },
        }).catch((error) => {
          console.error("[review]", error);
          fs.writeFileSync(
            path.join(applicationRoot, "smoke-error.txt"),
            error.stack || String(error),
          );
        });
      }, 1000);
  }
  if (review && process.env.MOTION_REVIEW_POLISH_SMOKE === "1") {
    setTimeout(() => {
      require(path.join(projectRoot, "scripts/review-polish-smoke.cjs"))({mainWindow, appUrl, projectRoot})
        .catch(error => console.error("[polish-review]", error));
    }, 1000);
  }
  if (review && process.env.MOTION_REVIEW_WORKFLOW_SMOKE === "1") {
    setTimeout(() => {
      require(path.join(projectRoot, "scripts/review-workflow-smoke.cjs"))({mainWindow, appUrl, projectRoot})
        .catch(error => console.error("[workflow-review]", error));
    }, 1000);
  }
  if (review && process.env.MOTION_REVIEW_FINAL_SMOKE === "1") {
    setTimeout(
      () =>
        require(path.join(projectRoot, "scripts/review-final-smoke.cjs"))({
          mainWindow,
          appUrl,
          projectRoot,
        }).catch((error) => console.error("[final-review]", error)),
      1000,
    );
  }
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app
    .whenReady()
    .then(createMainWindow)
    .catch((error) => {
      dialog.showErrorBox(
        "MotionFlow",
        error instanceof Error ? error.message : String(error),
      );
      app.quit();
    });
}

app.on("before-quit", () => {
  if (quitting) return;
  quitting = true;
  stopRuntime();
});

app.on("window-all-closed", () => app.quit());
