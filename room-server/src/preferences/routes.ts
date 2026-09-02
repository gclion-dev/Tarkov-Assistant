import { Router } from 'express';

import { requireAuth, preferencesLimiter } from '../auth/middleware.js';
import { parseBody } from '../auth/validators.js';
import db from '../db.js';
import { badRequest, conflict } from '../http/errors.js';
import { updatePreferencesSchema } from './validators.js';

const router = Router();

/** payload 上限。schema 已经卡了字段和长度，这里再兜一层总大小。 */
const MAX_PAYLOAD_BYTES = 8 * 1024;

interface PreferencesRow {
  payload: string;
  version: number;
  updated_at: number;
}

const selectStmt = db.prepare(
  'SELECT payload, version, updated_at FROM user_preferences WHERE user_id = ?',
);

const readPreferences = (userId: string) => {
  const row = selectStmt.get(userId) as PreferencesRow | undefined;
  if (!row) {
    return null;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(row.payload);
  } catch {
    // 理论上不会发生（写入前一定是 JSON.stringify 的结果）。
    // 真出现了就当作没有记录，让客户端用本地值重新建立，而不是整个接口 500。
    console.warn(`[preferences] 用户 ${userId} 的偏好无法解析，已忽略`);
    return null;
  }
  return { payload, version: row.version, updatedAt: row.updated_at };
};

router.get('/', requireAuth, preferencesLimiter, (req, res) => {
  res.json({ code: 200, data: readPreferences(req.auth!.sub) });
});

router.put('/', requireAuth, preferencesLimiter, (req, res, next) => {
  const { payload, baseVersion } = parseBody(updatePreferencesSchema, req.body);

  const serialized = JSON.stringify(payload);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_PAYLOAD_BYTES) {
    next(badRequest('设置内容过大'));
    return;
  }

  const userId = req.auth!.sub;
  const now = Date.now();

  // 读改写必须在同一个事务里，否则两台设备同时提交会互相覆盖版本号。
  // better-sqlite3 是同步 API，事务内不会有 await 打断。
  const apply = db.transaction(() => {
    const current = selectStmt.get(userId) as PreferencesRow | undefined;
    const currentVersion = current?.version ?? 0;

    if (baseVersion !== currentVersion) {
      return { conflict: true as const, version: currentVersion };
    }

    const nextVersion = currentVersion + 1;
    db.prepare(
      `INSERT INTO user_preferences (user_id, payload, version, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         payload = excluded.payload,
         version = excluded.version,
         updated_at = excluded.updated_at`,
    ).run(userId, serialized, nextVersion, now);

    return { conflict: false as const, version: nextVersion };
  });

  let result: { conflict: boolean; version: number };
  try {
    result = apply();
  } catch (err) {
    // 用户在另一处注销了账号，外键约束会失败。
    if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      next(badRequest('用户不存在'));
      return;
    }
    next(err);
    return;
  }

  if (result.conflict) {
    next(conflict('设置已在其他设备上更新，请重新加载'));
    return;
  }

  res.json({
    code: 200,
    data: { payload, version: result.version, updatedAt: now },
  });
});

export default router;
