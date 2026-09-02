import rateLimit from 'express-rate-limit';

import config from '../config.js';

/**
 * 按图识别会消耗大模型额度，必须限额。
 *
 * 与其他限流器不同，这里刻意**不** skip 开发环境：额度是真金白银，
 * 本地反复调试同样会烧，不该因为 NODE_ENV 就放开。
 *
 * 计数按登录用户，而不是 IP —— 同一 WiFi 下的朋友不该互相挤占额度，
 * 换个网络也不该重置额度。因此本中间件必须挂在 requireAuth 之后。
 */
export const imageSearchLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: config.zhipu.dailyLimit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.auth?.sub ?? req.ip ?? 'unknown',
  handler: (_req, res) => {
    res.status(429).json({
      code: 429,
      errorMessage: `按图识别每天最多使用 ${config.zhipu.dailyLimit} 次，请明天再试`,
    });
  },
});
