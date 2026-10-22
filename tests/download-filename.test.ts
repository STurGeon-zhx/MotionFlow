import {describe, expect, it} from 'vitest';
import {getAttachmentDisposition, getVideoDownloadFilename} from '@/lib/download-filename';

describe('成片下载文件名', () => {
  it('沿用上传素材名称并替换为 MP4 扩展名', () => {
    expect(getVideoDownloadFilename('产品主图.jpg')).toBe('产品主图.mp4');
    expect(getVideoDownloadFilename('活动海报.final.png')).toBe('活动海报.final.mp4');
  });

  it('清理系统不允许的字符并为中文生成兼容响应头', () => {
    expect(getVideoDownloadFilename('促销:主图?.webp')).toBe('促销_主图_.mp4');
    const disposition = getAttachmentDisposition('产品主图.mp4');
    expect(disposition).toContain('filename="____.mp4"');
    expect(disposition).toContain("filename*=UTF-8''%E4%BA%A7%E5%93%81%E4%B8%BB%E5%9B%BE.mp4");
  });
});
