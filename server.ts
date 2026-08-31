import {createServer} from 'node:http';
import next from 'next';
import {normalizeClientIp} from './src/lib/client-ip';

const dev = !process.argv.includes('--production');
const hostname = '0.0.0.0';
const port = Number(process.env.PORT ?? 3001);
const app = next({dev, hostname, port});
const handle = app.getRequestHandler();

await app.prepare();

createServer((request, response) => {
  request.headers['x-motion-client-ip'] = normalizeClientIp(request.socket.remoteAddress ?? 'unknown');
  void handle(request, response);
}).listen(port, hostname, () => {
  console.log(`MotionFlow 已启动：http://localhost:${port}`);
});
