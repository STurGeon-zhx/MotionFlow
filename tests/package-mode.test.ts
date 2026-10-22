import {afterEach, describe, expect, it} from 'vitest';
import {getDownloadMode} from '../src/lib/package-mode';

const originalMode = process.env.MOTION_DOWNLOAD_MODE;

afterEach(() => {
  if (originalMode === undefined) delete process.env.MOTION_DOWNLOAD_MODE;
  else process.env.MOTION_DOWNLOAD_MODE = originalMode;
});

describe('发行版下载模式', () => {
  it('默认继续使用 ZIP', () => {
    delete process.env.MOTION_DOWNLOAD_MODE;
    expect(getDownloadMode()).toBe('zip');
  });

  it('发行版可切换为 MP4 导出', () => {
    process.env.MOTION_DOWNLOAD_MODE = 'mp4';
    expect(getDownloadMode()).toBe('mp4');
  });
});
