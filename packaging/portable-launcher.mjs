import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 3001);
const url = `http://127.0.0.1:${port}`;
const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const env = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: String(port),
  MOTION_HOSTNAME: '127.0.0.1',
  MOTION_DOWNLOAD_MODE: 'mp4',
  MOTION_DATA_DIR: path.join(root, 'data'),
  MOTION_MUSIC_DIR: path.join(root, 'assets', 'music'),
};

function openBrowser() {
  spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], {detached: true, stdio: 'ignore', windowsHide: true}).unref();
}

async function isReady() {
  try {
    const response = await fetch(`${url}/api/runtime-config`, {signal: AbortSignal.timeout(1500)});
    return response.ok;
  } catch {
    return false;
  }
}

if (await isReady()) {
  console.log(`MotionFlow 已经在运行：${url}`);
  openBrowser();
  process.exit(0);
}

console.log('正在启动 MotionFlow，请不要关闭此窗口……');
const web = spawn(process.execPath, [tsxCli, 'server.ts', '--production'], {cwd: root, env, stdio: 'inherit'});
const worker = spawn(process.execPath, [tsxCli, 'src/worker.ts'], {cwd: root, env, stdio: 'inherit'});
let stopping = false;

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  web.kill('SIGTERM');
  worker.kill('SIGTERM');
  setTimeout(() => process.exit(exitCode), 1200).unref();
}

web.once('exit', (code) => {
  if (!stopping) {
    console.error(`网页服务已停止（退出码 ${code ?? '未知'}）。`);
    stop(code ?? 1);
  }
});
worker.once('exit', (code) => {
  if (!stopping && code && code !== 0) console.error(`渲染服务异常停止（退出码 ${code}）。`);
});
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

let ready = false;
for (let attempt = 0; attempt < 90; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  if (await isReady()) {
    ready = true;
    break;
  }
}

if (!ready) {
  console.error('启动超时，请检查上方错误信息。');
  stop(1);
} else {
  console.log(`MotionFlow 已启动：${url}`);
  console.log('全部 MP4 会导出到 Windows“下载\\MotionFlow”目录。');
  openBrowser();
}
