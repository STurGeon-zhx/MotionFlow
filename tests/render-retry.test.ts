import {describe, expect, it} from 'vitest';
import {getFriendlyRenderError, isRetryableRenderError, MAX_AUTO_RENDER_RETRIES} from '@/lib/render-retry';

describe('渲染失败重试', () => {
  it('识别本地渲染服务和浏览器临时错误', () => {
    expect(MAX_AUTO_RENDER_RETRIES).toBe(2);
    expect(isRetryableRenderError(new Error('Visited "http://localhost:3000/index.html" but got no response.'))).toBe(true);
    expect(isRetryableRenderError(new Error('Target closed'))).toBe(true);
    expect(isRetryableRenderError(new Error('图片文件不存在'))).toBe(false);
  });

  it('将本地服务错误转换为用户可读信息', () => {
    expect(getFriendlyRenderError(new Error('Visited localhost but got no response.'))).toBe('本地渲染服务暂时无响应，自动重试后仍未恢复');
  });
});
