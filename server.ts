import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import next from 'next';
import {normalizeClientIp} from './src/lib/client-ip';
import {DEVICE_COOKIE_NAME, normalizeDeviceId} from './src/lib/client-identity';

const dev = !process.argv.includes('--production');
const hostname = process.env.MOTION_HOSTNAME ?? '0.0.0.0';
const port = Number(process.env.PORT ?? 3001);
const app = next({dev, hostname, port});
const handle = app.getRequestHandler();

await app.prepare();

createServer((request, response) => {
  const cookies = new Map((request.headers.cookie ?? '').split(';').map((part) => {
    const [key, ...valueParts] = part.trim().split('=');
    const value = valueParts.join('=');
    try {
      return [key, decodeURIComponent(value)];
    } catch {
      return [key, ''];
    }
  }));
  const savedDeviceId = normalizeDeviceId(cookies.get(DEVICE_COOKIE_NAME));
  const deviceId = savedDeviceId === 'unknown' ? `device_${randomUUID().replaceAll('-', '')}` : savedDeviceId;
  if (savedDeviceId === 'unknown') {
    response.setHeader('Set-Cookie', `${DEVICE_COOKIE_NAME}=${deviceId}; Path=/; Max-Age=315360000; HttpOnly; SameSite=Lax`);
  }
  request.headers['x-motion-device-id'] = deviceId;
  request.headers['x-motion-client-ip'] = normalizeClientIp(request.socket.remoteAddress ?? 'unknown');
  void handle(request, response);
}).listen(port, hostname, () => {
  console.log(`MotionFlow 已启动：http://localhost:${port}`);
});
