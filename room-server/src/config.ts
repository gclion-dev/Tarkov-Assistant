import crypto from 'crypto';

// 必须在任何读取 process.env 的模块之前完成加载。
// 本文件是整个服务读取环境变量的唯一入口，其他模块只允许 import 本文件导出的 config，
// 这样无论 ESM 的模块求值顺序如何，dotenv 一定已经执行过。
import 'dotenv/config';

const DEV_SECRET_PLACEHOLDER = 'change-me-in-production';

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

const readBool = (value: string | undefined, fallback: boolean) => {
  if (value === undefined || value === '') {
    return fallback;
  }
  return value === 'true' || value === '1';
};

const readInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const resolveSecret = () => {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret || secret === DEV_SECRET_PLACEHOLDER) {
    if (IS_PRODUCTION) {
      throw new Error(
        '生产环境必须提供一个自定义的 JWT_SECRET，可用 `openssl rand -hex 32` 生成。',
      );
    }
    console.warn('[config] 未配置 JWT_SECRET，正在使用开发用的固定密钥，请勿用于生产环境。');
    return 'insecure-development-secret';
  }
  if (IS_PRODUCTION && secret.length < 32) {
    throw new Error('生产环境的 JWT_SECRET 至少需要 32 个字符。');
  }
  return secret;
};

const baseSecret = resolveSecret();

// access token 与 refresh token 使用从同一份 JWT_SECRET 派生出的两个独立密钥，
// 避免二者互相冒用（否则 refresh token 可以直接当成 7 天有效期的 access token 使用）。
const deriveKey = (label: string) =>
  crypto.createHmac('sha256', baseSecret).update(label).digest('hex');

const corsOrigin = (process.env.CORS_ORIGIN || 'http://localhost:8001')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

export const config = {
  nodeEnv: NODE_ENV,
  isProduction: IS_PRODUCTION,
  port: readInt(process.env.PORT, 3001),
  // 同源部署（nginx 反代 /api 与 /ws）时无需跨域；设为 '*' 表示不校验 Origin。
  corsOrigin,
  corsEnabled: !corsOrigin.includes('*'),
  /**
   * 信任的代理层数，用于取真实客户端 IP 做限流。
   *
   * 默认 1：容器内的 nginx 会把 X-Forwarded-For 覆盖成单一且已归一化的客户端 IP
   * （见 docker/nginx.conf 的 set_real_ip_from / real_ip_recursive off），
   * 因此无论外层还套了多少级反代，应用这里都只需要信任 1 跳。
   * 这个数字调大反而会让客户端可以通过伪造 X-Forwarded-For 绕过限流。
   */
  trustProxyHops: readInt(process.env.TRUST_PROXY_HOPS, IS_PRODUCTION ? 1 : 0),
  dbPath: process.env.DB_PATH || './data/room.db',
  jwt: {
    accessSecret: deriveKey('access-token'),
    refreshSecret: deriveKey('refresh-token'),
    accessExpires: process.env.JWT_ACCESS_EXPIRES || '30m',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
  },
  cookie: {
    name: 'refresh_token',
    path: '/api/auth',
    // HTTPS 由外层 nginx-proxy-manager 终止，浏览器看到的是 https，因此生产环境应为 true。
    secure: readBool(process.env.COOKIE_SECURE, IS_PRODUCTION),
    maxAgeMs: readInt(process.env.REFRESH_TTL_MS, 7 * 24 * 60 * 60 * 1000),
    // 轮转后旧 refresh token 的宽限期，用于容忍多标签页并发刷新，避免误判为重放攻击。
    rotationGraceMs: readInt(process.env.REFRESH_GRACE_MS, 60 * 1000),
  },
  auth: {
    bcryptRounds: readInt(process.env.BCRYPT_ROUNDS, 10),
    maxSessionsPerUser: readInt(process.env.MAX_SESSIONS_PER_USER, 10),
  },
  room: {
    maxMembers: readInt(process.env.ROOM_MAX_MEMBERS, 6),
    ttlMs: readInt(process.env.ROOM_TTL_MS, 4 * 60 * 60 * 1000),
    // 服务端兜底节流：单个连接上报位置的最小间隔。
    locationMinIntervalMs: readInt(process.env.ROOM_LOCATION_MIN_INTERVAL_MS, 200),
    // 单个连接每 10 秒允许的事件总数，超出即断开。
    eventBurst: readInt(process.env.ROOM_EVENT_BURST, 300),
  },
} as const;

export default config;
