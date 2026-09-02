import db from '../db.js';

/**
 * 账号状态的读取入口。
 *
 * 停用要立刻生效，所以登录、刷新、每个鉴权请求和 socket 握手四处都要查一次。
 * 这是主键查询、表也小，成本可以忽略；靠 access token 自然过期来生效会有最长
 * 一个 accessExpires（默认 30 分钟）的窗口，对「封号」这个动作来说太慢了。
 */

export type UserStatus = 'active' | 'disabled';

const statusStmt = db.prepare('SELECT status FROM users WHERE id = ?');

export const getUserStatus = (userId: string): UserStatus | undefined => {
  const row = statusStmt.get(userId) as { status?: string } | undefined;
  if (!row) {
    return undefined;
  }
  // 兼容历史数据里可能出现的空值。
  return row.status === 'disabled' ? 'disabled' : 'active';
};

/** 账号存在且未被停用。查不到（已删号）同样返回 false。 */
export const isUserActive = (userId: string) => getUserStatus(userId) === 'active';
