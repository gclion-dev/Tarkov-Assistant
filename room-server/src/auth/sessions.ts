import crypto from 'crypto';

import { v4 as uuidv4 } from 'uuid';

import config from '../config.js';
import db from '../db.js';
import { signRefreshToken } from './jwt.js';

/**
 * rotated —— 正常轮转产生的旧 token，享受宽限期（容忍多标签页并发刷新）。
 * logout / reuse —— 必须立即失效，不享受宽限期。
 */
type RevokeReason = 'rotated' | 'logout' | 'reuse';

interface TokenRow {
  id: string;
  user_id: string;
  family_id: string;
  revoked: number;
  revoked_at: number | null;
  revoke_reason: RevokeReason | null;
  expires_at: number;
}

export type RefreshLookup =
  | { status: 'valid'; row: TokenRow }
  /** 已轮转但仍在宽限期内：多标签页并发刷新的正常竞态，只补发 access token。 */
  | { status: 'grace'; row: TokenRow }
  /** 未知、已登出或超出宽限期的 token：视为重放。有 row 时作废整条 family，否则作废该用户全部会话。 */
  | { status: 'reused'; row?: TokenRow }
  | { status: 'expired' };

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

const insertStmt = db.prepare(
  `INSERT INTO refresh_tokens (id, user_id, family_id, token_hash, expires_at, created_at)
   VALUES (?, ?, ?, ?, ?, ?)`,
);

const findStmt = db.prepare(
  `SELECT id, user_id, family_id, revoked, revoked_at, revoke_reason, expires_at
   FROM refresh_tokens WHERE token_hash = ?`,
);

const revokeByIdStmt = db.prepare(
  `UPDATE refresh_tokens SET revoked = 1, revoked_at = ?, revoke_reason = ?
   WHERE id = ? AND revoked = 0`,
);

/** 按 family 失效：登出与重放检测都用它，可以立刻生效且不影响其他设备。 */
const revokeFamilyStmt = db.prepare(
  `UPDATE refresh_tokens SET revoked = 1, revoked_at = ?, revoke_reason = ?
   WHERE family_id = ?`,
);

const revokeAllStmt = db.prepare(
  `UPDATE refresh_tokens SET revoked = 1, revoked_at = ?, revoke_reason = ?
   WHERE user_id = ? AND revoked = 0`,
);

/** 每个用户只保留最近 N 个会话，超出的旧会话直接失效。 */
const trimSessions = db.prepare(
  `UPDATE refresh_tokens SET revoked = 1, revoked_at = @now, revoke_reason = 'logout'
   WHERE user_id = @userId AND revoked = 0 AND id NOT IN (
     SELECT id FROM refresh_tokens
     WHERE user_id = @userId AND revoked = 0
     ORDER BY created_at DESC, id DESC
     LIMIT @keep
   )`,
);

/** 已撤销且过了宽限期、或早已过期的记录没有任何用途，直接删除。 */
const pruneStmt = db.prepare(
  `DELETE FROM refresh_tokens
   WHERE expires_at < @now OR (revoked = 1 AND COALESCE(revoked_at, 0) < @graceDeadline)`,
);

const insertToken = (userId: string, familyId: string) => {
  const now = Date.now();
  const sid = uuidv4();
  const token = signRefreshToken({ sub: userId, sid });
  insertStmt.run(sid, userId, familyId, hashToken(token), now + config.cookie.maxAgeMs, now);
  return token;
};

/** 登录 / 注册：开启一条新的 token family。 */
export const issueRefreshToken = (userId: string) => {
  const token = insertToken(userId, uuidv4());
  trimSessions.run({ now: Date.now(), userId, keep: config.auth.maxSessionsPerUser });
  return token;
};

export const lookupRefreshToken = (token: string, userId: string): RefreshLookup => {
  const row = findStmt.get(hashToken(token)) as TokenRow | undefined;
  if (!row || row.user_id !== userId) {
    return { status: 'reused' };
  }
  if (row.expires_at <= Date.now()) {
    return { status: 'expired' };
  }
  if (row.revoked) {
    const withinGrace = Date.now() - (row.revoked_at ?? 0) <= config.cookie.rotationGraceMs;
    // 只有轮转产生的旧 token 才允许在宽限期内继续换取 access token；
    // 登出与重放撤销必须立即生效，否则登出后 token 还能再用一分钟。
    if (row.revoke_reason === 'rotated' && withinGrace) {
      return { status: 'grace', row };
    }
    return { status: 'reused', row };
  }
  return { status: 'valid', row };
};

export const revokeFamilyById = (familyId: string, reason: RevokeReason) => {
  revokeFamilyStmt.run(Date.now(), reason, familyId);
};

/** 轮转：撤销旧 token 并在同一 family 内签发新 token，两步在同一事务里完成。 */
export const rotateRefreshToken = db.transaction((row: TokenRow) => {
  revokeByIdStmt.run(Date.now(), 'rotated' satisfies RevokeReason, row.id);
  return insertToken(row.user_id, row.family_id);
});

/** 登出：整条 family 立即失效，包括宽限期内的旧 token。 */
export const revokeRefreshFamily = (token: string, reason: RevokeReason = 'logout') => {
  const row = findStmt.get(hashToken(token)) as TokenRow | undefined;
  if (row) {
    revokeFamilyStmt.run(Date.now(), reason, row.family_id);
  }
};

export const revokeAllSessions = (userId: string, reason: RevokeReason = 'reuse') => {
  revokeAllStmt.run(Date.now(), reason, userId);
};

export const pruneRefreshTokens = () => {
  const now = Date.now();
  pruneStmt.run({ now, graceDeadline: now - config.cookie.rotationGraceMs });
};

export const startSessionCleanup = () => {
  pruneRefreshTokens();
  const timer = setInterval(pruneRefreshTokens, 60 * 60 * 1000);
  timer.unref();
  return () => clearInterval(timer);
};
