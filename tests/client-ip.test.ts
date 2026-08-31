import {describe, expect, it} from 'vitest';
import {getClientIp, normalizeClientIp} from '@/lib/client-ip';

describe('客户端 IP 识别', () => {
  it('统一处理 IPv4、IPv4 映射地址与本机回环地址', () => {
    expect(normalizeClientIp('::ffff:192.168.5.26')).toBe('192.168.5.26');
    expect(normalizeClientIp('192.168.5.26:53120')).toBe('192.168.5.26');
    expect(normalizeClientIp('::1')).toBe('127.0.0.1');
  });

  it('优先使用项目服务器写入的可信客户端地址', () => {
    const request = new Request('http://localhost/api/video-jobs', {headers: {
      'x-motion-client-ip': '::ffff:192.168.5.26',
      'x-forwarded-for': '10.0.0.8',
    }});
    expect(getClientIp(request)).toBe('192.168.5.26');
  });
});
