import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  claimNextItem,
  completeItem,
  failItem,
  recoverInterruptedItems,
  recordAutomaticRetry,
  updateItemProgress,
  type ClaimedRenderItem,
} from "./lib/jobs";
import {
  cleanupDeletedJobs,
  heartbeatItem,
  isItemExecutionActive,
  recoverStaleControls,
  releaseInterruptedItem,
  writeWorkerHeartbeat,
} from "./lib/job-control";
import {
  executeInSlot,
  RenderInterrupted,
  stopSlotProcess,
  type RenderSlotProcess,
} from "./lib/render-slot-process";
import {
  isRetryableRenderError,
  MAX_AUTO_RENDER_RETRIES,
} from "./lib/render-retry";
import { dataRoot, ensureStorage, outputsDir, tempDir } from "./lib/storage";
import {
  getRenderRuntimeConfig,
  getRenderTimeoutMs,
  runWithRenderRetries,
  runWorkerSlots,
} from "./lib/worker-runtime";

let stopping = false;
let recoveryPending = 0;
let recoveryTail: Promise<unknown> = Promise.resolve();
const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
const slots: RenderSlotProcess[] = [];
const activeItems = new Map<number, ClaimedRenderItem>();

function acquireWorkerLock() {
  const lockPath = path.join(dataRoot, "worker.lock");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const descriptor = fs.openSync(lockPath, "wx");
      fs.writeFileSync(descriptor, String(process.pid));
      fs.closeSync(descriptor);
      return () => fs.rmSync(lockPath, { force: true });
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

async function processItem(
  item: ClaimedRenderItem,
  slot: RenderSlotProcess,
  config: ReturnType<typeof getRenderRuntimeConfig>,
) {
  const temporary = path.join(tempDir, `${item.id}-${item.run_token}.mp4`);
  const output = path.join(outputsDir, `${item.id}.mp4`);
  activeItems.set(slot.id, item);
  try {
    const metrics = await runWithRenderRetries({
      configuredConcurrency: config.concurrency,
      maxRetries: MAX_AUTO_RENDER_RETRIES,
      isRetryable: (error) =>
        !(error instanceof RenderInterrupted) && isRetryableRenderError(error),
      operation: async (attempt, concurrency) => {
        if (!isItemExecutionActive(item) || stopping)
          throw new RenderInterrupted();
        if (attempt > 0) await stopSlotProcess(slot);
        await fsp.rm(temporary, { force: true });
        let lastProgress = -1,
          lastStage = "";
        console.log(
          `[worker:${slot.id}] 开始 ${item.id} / ${item.effect_name}，并发 ${concurrency}，编码 ${config.preset}，尝试 ${attempt + 1}`,
        );
        return executeInSlot(
          slot,
          item,
          temporary,
          {
            concurrency,
            preset: config.preset,
            softwareRendering: attempt > 0,
            timeoutInMilliseconds: getRenderTimeoutMs(item.toolType, attempt),
          },
          () => !stopping && isItemExecutionActive(item),
          (progress, stage) => {
            const percent = Math.floor(progress * 100);
            if (percent !== lastProgress || stage !== lastStage) {
              lastProgress = percent;
              lastStage = stage;
              updateItemProgress(item.id, progress, item.run_token, stage);
            }
          },
        );
      },
      onRetry: async (error, retry) => {
        await stopSlotProcess(slot);
        await fsp.rm(temporary, { force: true });
        if (!isItemExecutionActive(item) || stopping)
          throw new RenderInterrupted();
        recordAutomaticRetry(
          item.id,
          retry,
          MAX_AUTO_RENDER_RETRIES,
          error,
          item.run_token,
        );
        console.warn(
          `[worker:${slot.id}] ${item.id} 降级重试 ${retry}`,
          String(error),
        );
        await wait(retry * 500);
      },
      runRecovery: async (operation) => {
        recoveryPending++;
        const previous = recoveryTail;
        let release!: () => void;
        recoveryTail = new Promise<void>((resolve) => {
          release = resolve;
        });
        await previous;
        try {
          return await operation();
        } finally {
          recoveryPending--;
          release();
        }
      },
    });
    if (!isItemExecutionActive(item)) throw new RenderInterrupted();
    await fsp.rename(temporary, output);
    if (!completeItem(item, output)) {
      await fsp.rm(output, { force: true });
      throw new RenderInterrupted();
    }
    console.log(
      `[worker:${slot.id}] 完成 ${item.id} ${JSON.stringify(metrics)}`,
    );
  } catch (error) {
    if (error instanceof RenderInterrupted || !isItemExecutionActive(item)) {
      await stopSlotProcess(slot);
      releaseInterruptedItem(item);
      console.log(`[worker:${slot.id}] 已中断 ${item.id}，保留已完成结果`);
    } else {
      failItem(item, error);
      console.error(`[worker:${slot.id}] 失败 ${item.id}`, error);
    }
  } finally {
    await fsp.rm(temporary, { force: true }).catch(() => {});
    activeItems.delete(slot.id);
    await cleanupDeletedJobs();
  }
}

async function run() {
  ensureStorage();
  const release = acquireWorkerLock();
  if (!release) return;
  recoverInterruptedItems();
  const config = getRenderRuntimeConfig();
  slots.push(
    ...Array.from({ length: config.slots }, (_, i) => ({
      id: i + 1,
      child: null,
    })),
  );
  let housekeeping = false;
  const heartbeat = setInterval(() => {
    writeWorkerHeartbeat();
    for (const item of activeItems.values()) heartbeatItem(item);
    recoverStaleControls();
    if (!housekeeping) {
      housekeeping = true;
      void cleanupDeletedJobs().finally(() => {
        housekeeping = false;
      });
    }
  }, 2000);
  writeWorkerHeartbeat();
  console.log(
    `[worker] 独立进程 ${config.slots} 槽位 × ${config.concurrency} 帧并发`,
  );
  try {
    await runWorkerSlots({
      slots: config.slots,
      shouldStop: () => stopping,
      canClaim: () => recoveryPending === 0,
      claim: () => claimNextItem(),
      handle: (item, id) => processItem(item, slots[id - 1], config),
      idleWait: () => wait(300),
    });
  } finally {
    clearInterval(heartbeat);
    await Promise.all(slots.map(stopSlotProcess));
    release();
  }
}
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("exit", () => {
  for (const slot of slots)
    if (
      slot.child?.pid &&
      slot.child.exitCode === null &&
      process.platform === "win32"
    )
      spawnSync("taskkill.exe", ["/pid", String(slot.child.pid), "/t", "/f"], {
        windowsHide: true,
        stdio: "ignore",
      });
});
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
