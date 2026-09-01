import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';

import config from '../config.js';
import { unauthorized } from '../http/errors.js';
import { verifyAccessToken, type AccessPayload } from './jwt.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AccessPayload;
    }
  }
}

/** 统一的 Bearer token 校验，替代原先在各处重复的内联 verify 逻辑。 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(unauthorized('未登录'));
    return;
  }
  try {
    req.auth = verifyAccessToken(header.slice(7));
    next();
  } catch {
    next(unauthorized('登录状态已失效'));
  }
};

const limiter = (windowMs: number, max: number, message: string) =>
  rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // 开发环境不限流，避免本地反复调试被拦。
    skip: () => !config.isProduction,
    handler: (_req, res) => {
      res.status(429).json({ code: 429, errorMessage: message });
    },
  });

/** 登录/注册是撞库的主要入口，必须限流。 */
export const loginLimiter = limiter(15 * 60 * 1000, 10, '尝试过于频繁，请 15 分钟后再试');
export const registerLimiter = limiter(60 * 60 * 1000, 5, '注册过于频繁，请稍后再试');
export const refreshLimiter = limiter(15 * 60 * 1000, 120, '请求过于频繁，请稍后再试');
