import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {claimNextItem, completeItem, failItem, recoverInterruptedItems, recordAutomaticRetry, updateItemProgress} from './lib/jobs';
import {renderClaimedItem} from './lib/render-video';
import {isRetryableRenderError, MAX_AUTO_RENDER_RETRIES} from './lib/render-retry';
import {dataRoot, ensureStorage, outputsDir, tempDir} from './lib/storage';

let stopping = false;
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function acquireWorkerLock() {
  const lockPath = path.join(dataRoot, 'worker.lock');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const descriptor = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(descriptor, String(process.pid));
      fs.closeSync(descriptor);
      return () => fs.rmSync(lockPath, {force: true});
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
      const existingPid = Number(fs.readFileSync(lockPath, 'utf8'));
      try {
        process.kill(existingPid, 0);
        console.log(`[worker] 已有渲染 Worker 正在运行（PID ${existingPid}），当前进程退出`);
        return null;
      } catch {
        fs.rmSync(lockPath, {force: true});
      }
    }
  }
  return null;
}

async function run() {
  ensureStorage();
  const releaseLock = acquireWorkerLock();
  if (!releaseLock) return;
  const recovered = recoverInterruptedItems();
  console.log(`[worker] 已启动${recovered ? `，恢复 ${recovered} 个中断任务` : ''}`);
  try {
    while (!stopping) {
      const item = claimNextItem();
      if (!item) {
        await wait(800);
        continue;
      }
      const temporary = path.join(tempDir, `${item.id}.mp4`);
      const output = path.join(outputsDir, `${item.id}.mp4`);
      try {
        for (let attempt = 0; attempt <= MAX_AUTO_RENDER_RETRIES; attempt++) {
          try {
            await fsp.rm(temporary, {force: true});
            let lastWritten = -1;
            await renderClaimedItem(item, temporary, (progress) => {
              const rounded = Math.floor(progress * 100);
              if (rounded !== lastWritten) {
                lastWritten = rounded;
                updateItemProgress(item.id, progress);
              }
            });
            break;
          } catch (error) {
            await fsp.rm(temporary, {force: true});
            if (attempt >= MAX_AUTO_RENDER_RETRIES || !isRetryableRenderError(error)) throw error;
            recordAutomaticRetry(item.id, attempt + 1, MAX_AUTO_RENDER_RETRIES, error);
            console.warn(`[worker] ${item.id} 临时失败，自动重试 ${attempt + 1}/${MAX_AUTO_RENDER_RETRIES}`);
            await wait((attempt + 1) * 1500);
          }
        }
        await fsp.rename(temporary, output);
        completeItem(item, output);
        console.log(`[worker] 完成 ${item.id} / ${item.effect_name}`);
      } catch (error) {
        await fsp.rm(temporary, {force: true});
        failItem(item, error);
        console.error(`[worker] 失败 ${item.id}`, error);
      }
    }
  } finally {
    releaseLock();
  }
}

process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });

void run();
