import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';

import { verifyAdminToken, type AdminPayload } from '../auth/jwt.js';
import config from '../config.js';
import { forbidden, serviceUnavailable, unauthorized } from '../http/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminPayload;
    }
  }
}

/**
 * 所有管理接口都必须带这个请求头。
 *
 * 管理会话放在 httpOnly cookie 里（不希望 XSS 能读到它），代价是要自己防 CSRF。
 * 自定义请求头无法由跨站的表单或简单请求携带 —— 浏览器会先发 CORS 预检，
 * 而本服务不会给第三方站点放行，因此这一条就足以挡住 CSRF。
 * SameSite=Strict 是第二道防线。
 */
const REQUIRED_HEADER = 'x-admin-request';

/** 管理后台没配凭据就整体关停，而不是放一个空口令的后台出去。 */
export const requireAdminEnabled: RequestHandler = (_req, _res, next) => {
  if (!config.admin.enabled) {
    next(serviceUnavailable('管理后台未启用，请在服务端配置 ADMIN_PASSWORD'));
    return;
  }
  next();
};

export const requireAdminHeader: RequestHandler = (req, _res, next) => {
  if (req.headers[REQUIRED_HEADER] !== '1') {
    next(forbidden('请求来源不合法'));
    return;
  }
  next();
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  const token = req.cookies?.[config.admin.cookie.name];
  if (!token) {
    next(unauthorized('未登录管理后台'));
    return;
  }
  try {
    req.admin = verifyAdminToken(token);
    next();
  } catch {
    next(unauthorized('管理会话已过期，请重新登录'));
  }
};

const limiter = (windowMs: number, max: number, message: string) =>
  rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => !config.isProduction,
    handler: (_req, res) => {
      res.status(429).json({ code: 429, errorMessage: message });
    },
  });

/**
 * 管理员口令是单点突破就能拿到全部用户数据的凭据，
 * 限流比普通登录更严：15 分钟只给 5 次。
 */
export const adminLoginLimiter = limiter(
  15 * 60 * 1000,
  5,
  '尝试过于频繁，请 15 分钟后再试',
);

/** 已登录后的管理操作，防止脚本刷接口。 */
export const adminApiLimiter = limiter(5 * 60 * 1000, 300, '操作过于频繁，请稍后再试');
