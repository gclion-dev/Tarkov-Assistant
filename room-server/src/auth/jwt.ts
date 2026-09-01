import jwt from 'jsonwebtoken';

import config from '../config.js';

type Expires = jwt.SignOptions['expiresIn'];

const ACCESS_TYPE = 'access';
const REFRESH_TYPE = 'refresh';

export interface AccessPayload {
  sub: string;
  nickname: string;
}

export interface RefreshPayload {
  sub: string;
  sid: string;
}

interface TypedPayload {
  typ: typeof ACCESS_TYPE | typeof REFRESH_TYPE;
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
