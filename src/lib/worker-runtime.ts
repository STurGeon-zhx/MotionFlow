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
}: {
  slots: number;
  shouldStop: () => boolean;
  canClaim?: () => boolean;
  claim: () => T | null;
  handle: (item: T, slotId: number) => Promise<void>;
  idleWait: () => Promise<void>;
}) {
  const runSlot = async (slotId: number) => {
    while (!shouldStop()) {
      if (!canClaim()) {
        await idleWait();
        continue;
      }
      const item = claim();
      if (!item) {
        await idleWait();
        continue;
      }
      await handle(item, slotId);
    }
  };
  await Promise.all(Array.from({length: slots}, (_, index) => runSlot(index + 1)));
}
