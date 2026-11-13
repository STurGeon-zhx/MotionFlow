import type {ChildProcess} from 'node:child_process';
import type {X264Preset} from '@remotion/renderer';

const presets: X264Preset[] = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow', 'placebo'];

function positiveInteger(value: string | undefined, fallback: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

export function getRenderRuntimeConfig(env: NodeJS.ProcessEnv = process.env) {
  const preset = presets.includes(env.MOTION_RENDER_PRESET as X264Preset)
    ? env.MOTION_RENDER_PRESET as X264Preset
    : 'veryfast';
  return {
    slots: positiveInteger(env.MOTION_RENDER_SLOTS, 2, 4),
    concurrency: positiveInteger(env.MOTION_RENDER_CONCURRENCY, 4, 16),
    preset,
  };
}

export function getAttemptConcurrency(configured: number, attempt: number) {
  if (attempt >= 2) return 1;
  if (attempt === 1) return Math.min(configured, 2);
  return configured;
}

function timeoutSeconds(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 60) return fallback;
  return Math.min(Math.round(parsed), 3600);
}

export function getRenderTimeoutMs(toolType: 'single_intro' | 'three_image_motion', attempt: number, env: NodeJS.ProcessEnv = process.env) {
  const baseSeconds = toolType === 'three_image_motion'
    ? timeoutSeconds(env.MOTION_SEQUENCE_RENDER_TIMEOUT_SECONDS, 600)
    : timeoutSeconds(env.MOTION_RENDER_TIMEOUT_SECONDS, 300);
  const attemptMultiplier = attempt >= 2 ? 2 : attempt === 1 ? 1.5 : 1;
  return Math.round(baseSeconds * attemptMultiplier * 1000);
}

export async function runWithRenderRetries<T>({
  configuredConcurrency,
  maxRetries,
  operation,
  isRetryable,
  onRetry,
  runRecovery,
}: {
  configuredConcurrency: number;
  maxRetries: number;
  operation: (attempt: number, concurrency: number) => Promise<T>;
  isRetryable: (error: unknown) => boolean;
  onRetry: (error: unknown, retryNumber: number) => Promise<void>;
  runRecovery: (operation: () => Promise<T>) => Promise<T>;
}) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const concurrency = getAttemptConcurrency(configuredConcurrency, attempt);
    const execute = () => operation(attempt, concurrency);
    try {
      return attempt >= 2 ? await runRecovery(execute) : await execute();
    } catch (error) {
      if (attempt >= maxRetries || !isRetryable(error)) throw error;
      await onRetry(error, attempt + 1);
    }
  }
  throw new Error('渲染重试流程异常结束');
}

export async function runWorkerSlots<T>({
  slots,
  shouldStop,
  canClaim = () => true,
  claim,
  handle,
  idleWait,
  onError = (error) => { console.error("[worker] 调度异常，将继续尝试", error); },
}: {
  slots: number;
  shouldStop: () => boolean;
  canClaim?: () => boolean;
  claim: () => T | null;
  handle: (item: T, slotId: number) => Promise<void>;
  idleWait: () => Promise<void>;
  onError?: (error: unknown, slotId: number, item?: T) => void | Promise<void>;
}) {
  const runSlot = async (slotId: number) => {
    while (!shouldStop()) {
      if (!canClaim()) {
        await idleWait();
        continue;
      }
      let item: T | null = null;
      try {
        item = claim();
        if (!item) {
          await idleWait();
          continue;
        }
        await handle(item, slotId);
      } catch (error) {
        await onError(error, slotId, item ?? undefined);
        await idleWait();
      }
    }
  };
  await Promise.all(Array.from({length: slots}, (_, index) => runSlot(index + 1)));
}

/** 轻量父进程不参与渲染，调度进程退出或心跳停止时释放整棵子进程树后重启。 */
export function superviseWorkerProcess({spawnWorker, stopWorker, onError}: {
  spawnWorker: () => ChildProcess;
  stopWorker: (child: ChildProcess) => Promise<void>;
  onError: (error: unknown) => void;
}) {
  let child: ChildProcess | null = null;
  let stopping = false;
  let lastHeartbeat = 0;
  let restart: ReturnType<typeof setTimeout> | undefined;
  let releasing: Promise<void> | null = null;
  let detach: (() => void) | null = null;
  const scheduleRestart = () => {
    if (!stopping && !restart) restart = setTimeout(() => {restart = undefined; launch();}, 2000);
  };
  const retire = (error: unknown) => {
    if (stopping || releasing || restart) return;
    onError(error);
    const previous = child;
    child = null;
    detach?.(); detach = null;
    releasing = Promise.resolve().then(() => previous ? stopWorker(previous) : undefined)
      .catch(onError).finally(() => {releasing = null; scheduleRestart();});
  };
  const launch = () => {
    if (stopping) return;
    try {
      const current = spawnWorker();
      child = current;
      lastHeartbeat = Date.now();
      const heartbeat = (message: unknown) => {
        if (message && typeof message === 'object' && 'type' in message && message.type === 'worker-heartbeat') lastHeartbeat = Date.now();
      };
      const exited = () => retire(new Error('渲染后台意外退出，正在自动重启'));
      const failed = (error: Error) => retire(error);
      current.on('message', heartbeat);
      current.once('exit', exited);
      current.once('error', failed);
      detach = () => {current.off('message', heartbeat); current.off('exit', exited); current.off('error', failed);};
    } catch (error) {retire(error);}
  };
  const watchdog = setInterval(() => {
    if (child && Date.now() - lastHeartbeat >= 30000) retire(new Error('渲染后台心跳停止，正在释放资源并自动重启'));
  }, 1000);
  launch();
  return {
    async stop() {
      stopping = true;
      clearInterval(watchdog); clearTimeout(restart);
      detach?.(); detach = null;
      const previous = child; child = null;
      await releasing;
      if (previous) await stopWorker(previous);
    },
  };
}
