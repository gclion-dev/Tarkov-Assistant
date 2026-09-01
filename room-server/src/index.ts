import http from 'http';

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { Server } from 'socket.io';

import authRoutes from './auth/routes.js';
import { startSessionCleanup } from './auth/sessions.js';
// config 必须在其他业务模块之前被求值，它内部完成 dotenv 加载。
import config from './config.js';
import db from './db.js';
import { errorHandler } from './http/errors.js';
import { startRoomCleanup } from './room/manager.js';
import { setupRoomSocket } from './room/socket.js';

const app = express();
const server = http.createServer(app);

// 位于 nginx / nginx-proxy-manager 之后，需要信任 X-Forwarded-*，
// 否则限流会把所有请求都算到同一个反代 IP 上。
app.set('trust proxy', config.trustProxyHops);

const io = new Server(server, {
  path: '/ws',
  // 同源部署时 corsEnabled 为 false，socket.io 不做 Origin 校验。
  cors: config.corsEnabled ? { origin: config.corsOrigin, credentials: true } : undefined,
  // 保留 polling 作为降级手段：部分代理/企业网络会阻断 WebSocket。
  transports: ['websocket', 'polling'],
});

// 纯 API 服务，不返回 HTML，因此关掉 CSP 之类的页面级策略，只保留有意义的响应头。
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
if (config.corsEnabled) {
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
}
app.use(express.json({ limit: '16kb' }));
app.use(cookieParser());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRoutes);

app.use((_req, res) => {
  res.status(404).json({ code: 404, errorMessage: '接口不存在' });
});
app.use(errorHandler);

setupRoomSocket(io);

const stopRoomCleanup = startRoomCleanup();
const stopSessionCleanup = startSessionCleanup();

server.listen(config.port, () => {
  console.log(`[room-server] 已启动，监听 :${config.port}（${config.nodeEnv}）`);
});

let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`[room-server] 收到 ${signal}，开始退出...`);
  stopRoomCleanup();
  stopSessionCleanup();
  const done = () => {
    try {
      db.close();
    } catch (err) {
      console.error('[room-server] 关闭数据库失败：', err);
    }
    process.exit(0);
  };
  io.close(() => server.close(done));
  // 兜底：10 秒内没能优雅退出就强制退出，避免容器卡在 stopping 状态。
  setTimeout(() => process.exit(0), 10 * 1000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  console.error('[room-server] 未处理的 Promise rejection：', reason);
});
