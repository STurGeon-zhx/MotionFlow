export const MAX_AUTO_RENDER_RETRIES = 2;

const transientPatterns = [
  'got no response',
  'target closed',
  'page crashed',
  'browser closed',
  'browser process',
  'failed to launch',
  'protocol error',
  'socket hang up',
  'econnreset',
  'econnrefused',
  'timed out',
  'timeout',
  '总耗时超过',
];

export function getRenderErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function isRetryableRenderError(error: unknown) {
  const message = getRenderErrorMessage(error).toLowerCase();
  return transientPatterns.some((pattern) => message.includes(pattern));
}

export function getFriendlyRenderError(error: unknown) {
  const message = getRenderErrorMessage(error);
  if (message.toLowerCase().includes('got no response')) {
    return '本地渲染服务暂时无响应，自动重试后仍未恢复';
  }
  return message;
}
