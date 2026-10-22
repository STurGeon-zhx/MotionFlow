/* eslint-disable @typescript-eslint/no-require-imports */
const {app, BrowserWindow, dialog, ipcMain, Menu, session, shell, net: electronNet} = require('electron');
const {spawn, spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const {createHash, randomUUID} = require('node:crypto');
const {DEFAULT_UPDATE_REPOSITORY, normalizeRepository, checkForUpdate} = require('./github-updates.cjs');

app.setName('MotionFlow');

const packageRoot = path.resolve(process.resourcesPath, '..');
const internalRoot = path.join(packageRoot, '_internal');
const userDataRoot = path.join(packageRoot, 'data', 'desktop-profile');
app.setPath('userData', userDataRoot);

let mainWindow = null;
let webProcess = null;
let workerProcess = null;
let appUrl = null;
let quitting = false;
const selectedDirectories = new Set();

function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(() => port ? resolve(port) : reject(new Error('无法分配本地端口')));
    });
  });
}

function startRuntime(command, port) {
  const nodePath = path.join(internalRoot, 'runtime', 'node.exe');
  const tsxPath = path.join(internalRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  if (!fs.existsSync(nodePath) || !fs.existsSync(tsxPath)) {
    throw new Error('程序运行文件不完整，请重新解压完整安装包。');
  }
  return spawn(nodePath, [tsxPath, ...command], {
    cwd: internalRoot,
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      MOTION_HOSTNAME: '127.0.0.1',
      MOTION_DOWNLOAD_MODE: 'mp4',
      MOTION_DATA_DIR: path.join(packageRoot, 'data'),
      MOTION_MUSIC_DIR: path.join(internalRoot, 'assets', 'music'),
    },
  });
}

async function waitUntilReady(url, child, attempts = 240) {
  for (let index = 0; index < attempts; index++) {
    if (child.exitCode !== null) return false;
    try {
      const response = await fetch(`${url}/api/runtime-config`, {signal: AbortSignal.timeout(1000)});
      if (response.ok) return true;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function stopProcessTree(child) {
  if (!child || child.exitCode !== null) return;
  try {
    spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
      windowsHide: true,
      stdio: 'ignore',
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
  const filename = path.basename(String(value || 'video.mp4')).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim();
  return filename.toLowerCase().endsWith('.mp4') ? filename : `${filename || 'video'}.mp4`;
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
  const cookies = await session.defaultSession.cookies.get({url});
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

ipcMain.handle('motionflow:select-download-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择成片保存位置',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const directoryPath = path.resolve(result.filePaths[0]);
  selectedDirectories.add(directoryPath.toLocaleLowerCase());
  return {path: directoryPath, name: path.basename(directoryPath) || directoryPath};
});

ipcMain.handle('motionflow:save-download-file', async (_event, input) => {
  const directoryPath = path.resolve(String(input?.directoryPath || ''));
  if (!selectedDirectories.has(directoryPath.toLocaleLowerCase())) {
    throw new Error('请先选择下载位置');
  }
  const stat = await fs.promises.stat(directoryPath).catch(() => null);
  if (!stat?.isDirectory()) throw new Error('下载位置不存在或不可写');

  const downloadUrl = new URL(String(input?.url || ''), appUrl);
  if (downloadUrl.origin !== appUrl) throw new Error('无效的下载地址');
  const cookie = await getCookieHeader(appUrl);
  const response = await fetch(downloadUrl, {headers: cookie ? {cookie} : {}});
  if (!response.ok || !response.body) throw new Error(`视频读取失败（${response.status}）`);

  const outputPath = getAvailablePath(directoryPath, input?.filename);
  const temporaryPath = `${outputPath}.motionflow-download`;
  try {
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.promises.writeFile(temporaryPath, buffer);
    await fs.promises.rename(temporaryPath, outputPath);
    return {filename: path.basename(outputPath)};
  } catch (error) {
    await fs.promises.rm(temporaryPath, {force: true}).catch(() => {});
    throw error;
  }
});


const updateSettingsPath = path.join(packageRoot, 'data', 'desktop-updates.json');
let checkedUpdate = null;
let downloadingUpdate = false;
function readUpdateConfig() {
  let repository = '';
  try {repository = JSON.parse(fs.readFileSync(path.join(__dirname, 'update-config.json'),'utf8')).repository || '';} catch {}
  try {const saved = JSON.parse(fs.readFileSync(updateSettingsPath,'utf8')); if(typeof saved.repository === 'string') repository = saved.repository;} catch {}
  return {currentVersion: app.getVersion(), repository: normalizeRepository(repository) || DEFAULT_UPDATE_REPOSITORY};
}
function assertDesktopCaller(event) {
  if (event.sender !== mainWindow?.webContents) throw new Error('无效的更新请求');
}
ipcMain.handle('motionflow:get-update-config', event => {
  assertDesktopCaller(event);
  return readUpdateConfig();
});
ipcMain.handle('motionflow:set-update-repository', async (event, repository) => {
  assertDesktopCaller(event);
  if (downloadingUpdate) throw new Error('请等待当前下载完成');
  const normalized = normalizeRepository(repository) || DEFAULT_UPDATE_REPOSITORY;
  await fs.promises.mkdir(path.dirname(updateSettingsPath),{recursive:true});
  await fs.promises.writeFile(updateSettingsPath,JSON.stringify({repository:normalized},null,2));
  checkedUpdate = null;
  return readUpdateConfig();
});
ipcMain.handle('motionflow:check-for-updates', async event => {
  assertDesktopCaller(event);
  checkedUpdate = await checkForUpdate(readUpdateConfig(), (url, options) => electronNet.fetch(url, options));
  return checkedUpdate;
});
ipcMain.handle('motionflow:download-update', async event => {
  assertDesktopCaller(event);
  if (downloadingUpdate) throw new Error('正在下载，请稍候');
  const asset = checkedUpdate?.status === 'available' ? checkedUpdate.asset : null;
  if (!asset) throw new Error('请先检查更新并确认存在新版压缩包');
  downloadingUpdate = true;
  let temporaryPath;
  let handle;
  try {
    const selection = await dialog.showSaveDialog(mainWindow,{
      title:'保存 MotionFlow 新版',defaultPath:path.join(app.getPath('downloads'),path.basename(asset.name)),
      filters:[{name:'ZIP 压缩包',extensions:['zip']}],
    });
    if(selection.canceled || !selection.filePath) return {canceled:true};
    const response = await electronNet.fetch(asset.url, {signal:AbortSignal.timeout(15*60*1000)});
    if(!response.ok || !response.body) throw new Error('新版下载失败，请检查网络后重试');
    temporaryPath = selection.filePath + '.' + randomUUID() + '.download';
    handle = await fs.promises.open(temporaryPath,'wx');
    const hash = createHash('sha256');
    let received = 0, lastSent = 0;
    const total = asset.size || Number(response.headers.get('content-length')) || 0;
    for await (const chunk of response.body) {
      await handle.writeFile(chunk);hash.update(chunk);received += chunk.length;
      if(Date.now()-lastSent>180) {
        if(!event.sender.isDestroyed()) event.sender.send('motionflow:update-download-progress',{received,total});
        lastSent = Date.now();
      }
    }
    await handle.close();handle=null;
    if(asset.size && received!==asset.size) throw new Error('下载文件不完整，请重试');
    if(asset.digest && ('sha256:'+hash.digest('hex')).toLowerCase()!==asset.digest.toLowerCase())throw new Error('下载校验未通过，请重新下载');
    await fs.promises.rename(temporaryPath,selection.filePath);temporaryPath=null;
    if(!event.sender.isDestroyed()) event.sender.send('motionflow:update-download-progress',{received,total:received});
    shell.showItemInFolder(selection.filePath);
    return {canceled:false,filename:path.basename(selection.filePath)};
  } finally {
    if(handle) await handle.close().catch(()=>{});
    if(temporaryPath) await fs.promises.rm(temporaryPath,{force:true}).catch(()=>{});
    downloadingUpdate = false;
  }
});

async function createMainWindow() {
  const port = await findAvailablePort();
  appUrl = `http://127.0.0.1:${port}`;
  webProcess = startRuntime(['server.ts', '--production'], port);
  workerProcess = startRuntime(['src/worker.ts'], port);

  if (!await waitUntilReady(appUrl, webProcess)) {
    throw new Error('MotionFlow 启动失败，请检查安全软件是否拦截了程序。');
  }

  mainWindow = new BrowserWindow({
    title: 'MotionFlow · 图片动态视频工坊',
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f4f7fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  Menu.setApplicationMenu(null);
  mainWindow.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(appUrl)) event.preventDefault();
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (!quitting) app.quit();
  });
  await mainWindow.loadURL(appUrl);
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.whenReady().then(createMainWindow).catch((error) => {
    dialog.showErrorBox('MotionFlow', error instanceof Error ? error.message : String(error));
    app.quit();
  });
}

app.on('before-quit', () => {
  if (quitting) return;
  quitting = true;
  stopRuntime();
});

app.on('window-all-closed', () => app.quit());
