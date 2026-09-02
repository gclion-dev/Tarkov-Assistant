import jwt from 'jsonwebtoken';

import config from '../config.js';

type Expires = jwt.SignOptions['expiresIn'];

const ACCESS_TYPE = 'access';
const REFRESH_TYPE = 'refresh';
const ADMIN_TYPE = 'admin';

export interface AccessPayload {
  sub: string;
  nickname: string;
}

export interface RefreshPayload {
  sub: string;
  sid: string;
}

export interface AdminPayload {
  /** 管理员用户名。管理员不在 users 表里，所以这里不是用户 id。 */
  sub: string;
}

interface TypedPayload {
  typ: typeof ACCESS_TYPE | typeof REFRESH_TYPE | typeof ADMIN_TYPE;
}

export const signAccessToken = (payload: AccessPayload) =>
  jwt.sign({ ...payload, typ: ACCESS_TYPE }, config.jwt.accessSecret, {
    algorithm: 'HS256',
    expiresIn: config.jwt.accessExpires as Expires,
  });

export const signRefreshToken = (payload: RefreshPayload) =>
  jwt.sign({ ...payload, typ: REFRESH_TYPE }, config.jwt.refreshSecret, {
    algorithm: 'HS256',
    expiresIn: config.jwt.refreshExpires as Expires,
  });

export const verifyAccessToken = (token: string): AccessPayload => {
  const payload = jwt.verify(token, config.jwt.accessSecret, {
    algorithms: ['HS256'],
  }) as AccessPayload & TypedPayload;
  if (payload.typ !== ACCESS_TYPE) {
    throw new jwt.JsonWebTokenError('invalid token type');
  }
  return payload;
};

export const verifyRefreshToken = (token: string): RefreshPayload => {
  const payload = jwt.verify(token, config.jwt.refreshSecret, {
    algorithms: ['HS256'],
  }) as RefreshPayload & TypedPayload;
  if (payload.typ !== REFRESH_TYPE) {
    throw new jwt.JsonWebTokenError('invalid token type');
  }
  return payload;
};

/**
 * 管理会话 token。
 *
 * 独立的密钥 + 独立的 typ：即使某天 access token 的签发逻辑出了问题，
 * 也不可能凭一个普通用户的 token 换到管理权限。
 */
export const signAdminToken = (payload: AdminPayload) =>
  jwt.sign({ ...payload, typ: ADMIN_TYPE }, config.jwt.adminSecret, {
    algorithm: 'HS256',
    expiresIn: Math.floor(config.admin.sessionTtlMs / 1000),
  });

export const verifyAdminToken = (token: string): AdminPayload => {
  const payload = jwt.verify(token, config.jwt.adminSecret, {
    algorithms: ['HS256'],
  }) as AdminPayload & TypedPayload;
  if (payload.typ !== ADMIN_TYPE) {
    throw new jwt.JsonWebTokenError('invalid token type');
  }
  // 用户名可以改。改了之后旧的管理 token 应当立即失效，而不是继续有效到过期。
  if (payload.sub !== config.admin.username) {
    throw new jwt.JsonWebTokenError('admin identity mismatch');
  }
  return payload;
};
