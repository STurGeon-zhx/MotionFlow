import fs from 'node:fs';
import path from 'node:path';
import {spawn, spawnSync, type ChildProcess} from 'node:child_process';
import {dataRoot, ensureStorage} from './lib/storage';
import {stopSlotProcess} from './lib/render-slot-process';
import {superviseWorkerProcess} from './lib/worker-runtime';

function acquireWorkerLock() {
  const lockPath = path.join(dataRoot, "worker.lock");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const descriptor = fs.openSync(lockPath, "wx");
      fs.writeFileSync(descriptor, String(process.pid));
      fs.closeSync(descriptor);
      return () => {
        if (fs.existsSync(lockPath) && fs.readFileSync(lockPath, 'utf8') === String(process.pid)) fs.rmSync(lockPath, {force: true});
      };
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "EEXIST"
      )
        throw error;
      const pid = Number(fs.readFileSync(lockPath, "utf8"));
      try {
        process.kill(pid, 0);
        console.log(`[worker] 已有 Worker ${pid}`);
        return null;
      } catch {
        fs.rmSync(lockPath, { force: true });
      }
    }
  }
  return null;
}


ensureStorage();
const release = acquireWorkerLock();
if (release) {
  let runner: ChildProcess | null = null;
  const supervisor = superviseWorkerProcess({
    spawnWorker: () => {
      runner = spawn(process.execPath, [...process.execArgv, path.join(import.meta.dirname, 'worker-runner.ts')], {
        windowsHide: true, stdio: ['ignore', 'inherit', 'inherit', 'ipc'], env: process.env,
      });
      console.log('[worker] 调度进程启动 PID=' + runner.pid);
      return runner;
    },
    stopWorker: async child => {
      if (runner === child) runner = null;
      await stopSlotProcess({id: 0, child});
    },
    onError: error => console.error('[worker] 自动恢复', error),
  });
  let closing = false;
  const stop = () => {
    if (closing) return;
    closing = true;
    void supervisor.stop().finally(release);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  process.on('exit', () => {
    if (runner?.pid && runner.exitCode === null && process.platform === 'win32') {
      spawnSync('taskkill.exe', ['/pid', String(runner.pid), '/t', '/f'], {windowsHide: true, stdio: 'ignore', timeout: 5000});
    }
    release();
  });
}
