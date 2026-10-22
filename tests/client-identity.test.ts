import {describe, expect, it} from 'vitest';
import {DEVICE_COOKIE_NAME, getClientOwnerId, normalizeDeviceId} from '@/lib/client-identity';

const deviceA = `device_${'a'.repeat(32)}`;
const deviceB = `device_${'b'.repeat(32)}`;

describe('客户端设备身份识别', () => {
  it('只接受符合格式的设备 ID', () => {
    expect(normalizeDeviceId(deviceA)).toBe(deviceA);
    expect(normalizeDeviceId('192.168.1.2')).toBe('unknown');
    expect(normalizeDeviceId('device_invalid')).toBe('unknown');
  });

  it('优先使用项目服务器写入的可信设备 ID', () => {
    const request = new Request('http://localhost/api/video-jobs', {headers: {
      'x-motion-device-id': deviceA,
      cookie: `${DEVICE_COOKIE_NAME}=${deviceB}`,
    }});
    expect(getClientOwnerId(request)).toBe(deviceA);
  });

  it('直接请求时可以从持久 Cookie 读取设备 ID', () => {
    const request = new Request('http://localhost/api/video-jobs', {headers: {
      cookie: `theme=light; ${DEVICE_COOKIE_NAME}=${deviceB}`,
    }});
    expect(getClientOwnerId(request)).toBe(deviceB);
  });
});
