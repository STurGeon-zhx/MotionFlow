import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {makeCancelSignal, type HeadlessBrowser} from '@remotion/renderer';
import {claimNextItem, completeItem, failItem, recoverInterruptedItems, recordAutomaticRetry, updateItemProgress, type ClaimedRenderItem} from './lib/jobs';
import {closeRenderBrowser, createRenderBrowser, renderClaimedItem} from './lib/render-video';
import {isRetryableRenderError, MAX_AUTO_RENDER_RETRIES} from './lib/render-retry';
import {dataRoot, ensureStorage, outputsDir, tempDir} from './lib/storage';
import {getRenderRuntimeConfig, getRenderTimeoutMs, runWithRenderRetries, runWorkerSlots} from './lib/worker-runtime';

type RenderSlot = {id: number; browser: HeadlessBrowser | null};

let stopping = false;
let recoveryPending = 0;
let activeSequenceRenders = 0;
let recoveryTail: Promise<void> = Promise.resolve();
let releaseProcessLock: (() => void) | null = null;
const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

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

async function resetSlotBrowser(slot: RenderSlot) {
  await closeRenderBrowser(slot.browser);
  slot.browser = null;
}

async function getSlotBrowser(slot: RenderSlot) {
  if (!slot.browser) slot.browser = await createRenderBrowser();
  return slot.browser;
}

async function runExclusiveRecovery<T>(operation: () => Promise<T>) {
  recoveryPending++;
  const previous = recoveryTail;
  let release!: () => void;
  recoveryTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await operation();
  } finally {
    recoveryPending--;
    release();
  }
}

const seconds = (milliseconds: number | null) => milliseconds === null ? '-' : `${(milliseconds / 1000).toFixed(1)}s`;

async function processItem(item: ClaimedRenderItem, slot: RenderSlot, config: ReturnType<typeof getRenderRuntimeConfig>) {
  const temporary = path.join(tempDir, `${item.id}.mp4`);
  const output = path.join(outputsDir, `${item.id}.mp4`);
  try {
    const completedMetrics = await runWithRenderRetries({
      configuredConcurrency: config.concurrency,
      maxRetries: MAX_AUTO_RENDER_RETRIES,
      isRetryable: isRetryableRenderError,
      operation: async (attempt, concurrency) => {
        if (attempt > 0) {
          await resetSlotBrowser(slot);
          console.warn(`[worker:${slot.id}] ${item.id} 重建浏览器，并发降为 ${concurrency}`);
        }
        await fsp.rm(temporary, {force: true});
        const browser = await getSlotBrowser(slot);
        const {cancel, cancelSignal} = makeCancelSignal();
        const hardTimeoutMs = getRenderTimeoutMs(item.toolType, attempt);
        let hardTimedOut = false;
        const hardTimeout = setTimeout(() => {
          hardTimedOut = true;
          cancel();
        }, hardTimeoutMs);
        let lastWritten = -1;
        console.log(`[worker:${slot.id}] 开始 ${item.id} / ${item.effect_name}，并发 ${concurrency}，编码 ${config.preset}`);
        try {
          return await renderClaimedItem(item, temporary, {
            browser,
            concurrency,
            preset: config.preset,
            timeoutInMilliseconds: hardTimeoutMs,
            cancelSignal,
            onProgress: (progress) => {
              const rounded = Math.floor(progress * 100);
              if (rounded !== lastWritten) {
                lastWritten = rounded;
                updateItemProgress(item.id, progress);
              }
            },
          });
        } catch (error) {
          if (hardTimedOut) {
            const seconds = hardTimeoutMs / 1000;
            throw new Error(attempt < MAX_AUTO_RENDER_RETRIES
              ? `渲染总耗时超过 ${seconds} 秒，已取消并准备降级重试`
              : `恢复模式渲染超过 ${seconds} 秒仍未完成，请检查磁盘空间后手动重试`);
          }
          throw error;
        } finally {
          clearTimeout(hardTimeout);
        }
      },
      onRetry: async (error, retryNumber) => {
        await fsp.rm(temporary, {force: true});
        recordAutomaticRetry(item.id, retryNumber, MAX_AUTO_RENDER_RETRIES, error);
        console.warn(`[worker:${slot.id}] ${item.id} 临时失败，自动重试 ${retryNumber}/${MAX_AUTO_RENDER_RETRIES}`);
        await wait(retryNumber * 1500);
      },
      runRecovery: (operation) => runExclusiveRecovery(async () => {
        console.warn(`[worker:${slot.id}] ${item.id} 进入恢复模式，暂停领取新任务`);
        return operation();
      }),
    });
    await fsp.rename(temporary, output);
    completeItem(item, output);
    console.log(`[worker:${slot.id}] 完成 ${item.id} / ${item.effect_name}，总计 ${seconds(completedMetrics.totalMs)}，帧 ${seconds(completedMetrics.renderedMs)}，编码 ${seconds(completedMetrics.encodedMs)}，实际并发 ${completedMetrics.resolvedConcurrency}`);
  } catch (error) {
    await fsp.rm(temporary, {force: true});
    failItem(item, error);
    console.error(`[worker:${slot.id}] 失败 ${item.id}`, error);
  }
}

async function run() {
  ensureStorage();
  const releaseLock = acquireWorkerLock();
  if (!releaseLock) return;
  releaseProcessLock = releaseLock;
  const recovered = recoverInterruptedItems();
  const config = getRenderRuntimeConfig();
  const slots: RenderSlot[] = Array.from({length: config.slots}, (_, index) => ({id: index + 1, browser: null}));
  console.log(`[worker] 已启动：${config.slots} 个任务槽位 × ${config.concurrency} 路帧并发，编码 ${config.preset}${recovered ? `，恢复 ${recovered} 个中断任务` : ''}`);
  try {
    await runWorkerSlots({
      slots: config.slots,
      shouldStop: () => stopping,
      canClaim: () => recoveryPending === 0,
      claim: () => claimNextItem({allowThreeImageMotion: activeSequenceRenders === 0}),
      handle: async (item, slotId) => {
        const sequence = item.toolType === 'three_image_motion';
        if (sequence) activeSequenceRenders++;
        try {
          await processItem(item, slots[slotId - 1], config);
        } finally {
          if (sequence) activeSequenceRenders--;
        }
      },
      idleWait: () => wait(300),
    });
  } finally {
    await Promise.all(slots.map((slot) => resetSlotBrowser(slot)));
    releaseLock();
    releaseProcessLock = null;
  }
}

process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });
process.on('exit', () => { releaseProcessLock?.(); });

void run();
