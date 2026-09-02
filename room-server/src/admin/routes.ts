import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Router, type Response } from 'express';

import { signAdminToken } from '../auth/jwt.js';
import { revokeAllSessions } from '../auth/sessions.js';
import { parseBody } from '../auth/validators.js';
import config from '../config.js';
import db from '../db.js';
import { asyncHandler, badRequest, notFound, unauthorized } from '../http/errors.js';
import {
  countAvailableInviteCodes,
  createInviteCodes,
  deleteInviteCode,
  findInviteCodeById,
  listInviteCodes,
  setInviteCodeDisabled,
  toInviteCodeView,
} from '../invites/store.js';
import { countRooms } from '../room/manager.js';
import { disconnectUserSockets } from '../room/socket.js';
import {
  adminApiLimiter,
  adminLoginLimiter,
  requireAdmin,
  requireAdminEnabled,
  requireAdminHeader,
} from './middleware.js';
import {
  adminLoginSchema,
  inviteCodeCreateSchema,
  inviteCodeIdSchema,
  inviteCodeListQuerySchema,
  inviteCodeStatusSchema,
  userIdSchema,
  userListQuerySchema,
  userStatusSchema,
} from './validators.js';

const router = Router();

// 顺序有意义：先判后台是否启用，再校验防 CSRF 的请求头，最后才是各路由自己的鉴权。
router.use(requireAdminEnabled);
router.use(requireAdminHeader);

const setAdminCookie = (res: Response, token: string) => {
  res.cookie(config.admin.cookie.name, token, {
    httpOnly: true,
    secure: config.cookie.secure,
    // Strict 而不是 Lax：管理后台没有任何需要从外站跳转进来的场景。
    sameSite: 'strict',
    maxAge: config.admin.sessionTtlMs,
    path: config.admin.cookie.path,
  });
};

const clearAdminCookie = (res: Response) => {
  res.clearCookie(config.admin.cookie.name, {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: 'strict',
    path: config.admin.cookie.path,
  });
};

/** 定长比较，避免用 === 比较口令时通过响应时间逐字符猜测。 */
const safeEqual = (a: string, b: string) => {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // 长度不同直接判否，但仍走一次等长比较以免长度信息影响耗时。
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
};

const verifyAdminPassword = async (password: string) => {
  if (config.admin.passwordHash) {
    return bcrypt.compare(password, config.admin.passwordHash);
  }
  return safeEqual(password, config.admin.password);
};

router.post(
  '/login',
  adminLoginLimiter,
  asyncHandler(async (req, res) => {
    const { username, password } = parseBody(adminLoginSchema, req.body);

    // 用户名和口令都用定长比较，且失败信息不区分「用户名错」和「口令错」。
    const usernameOk = safeEqual(username, config.admin.username);
    const passwordOk = await verifyAdminPassword(password);
    if (!usernameOk || !passwordOk) {
      throw unauthorized('用户名或密码错误');
    }

    setAdminCookie(res, signAdminToken({ sub: config.admin.username }));
    res.json({ code: 200, data: { username: config.admin.username } });
  }),
);

router.post('/logout', (_req, res) => {
  clearAdminCookie(res);
  res.json({ code: 200, data: null });
});

/** 前端刷新页面后用它确认管理会话是否还在。 */
router.get('/session', requireAdmin, (req, res) => {
  res.json({ code: 200, data: { username: req.admin!.sub } });
});

router.use(requireAdmin, adminApiLimiter);

router.get('/stats', (_req, res) => {
  const users = db
    .prepare(
      `SELECT
         count(*) AS total,
         sum(CASE WHEN status = 'disabled' THEN 1 ELSE 0 END) AS disabled
       FROM users`,
    )
    .get() as { total: number; disabled: number | null };

  const sessions = db
    .prepare(
      'SELECT count(*) AS total FROM refresh_tokens WHERE revoked = 0 AND expires_at > ?',
    )
    .get(Date.now()) as { total: number };

  const recent = db
    .prepare('SELECT count(*) AS total FROM users WHERE created_at > ?')
    .get(Date.now() - 7 * 24 * 60 * 60 * 1000) as { total: number };

  const disabled = users.disabled ?? 0;
  res.json({
    code: 200,
    data: {
      userTotal: users.total,
      userDisabled: disabled,
      userActive: users.total - disabled,
      /** 最近 7 天新注册。 */
      userRecent: recent.total,
      /** 未撤销且未过期的 refresh token 数，约等于活跃登录设备数。 */
      activeSessions: sessions.total,
      /** 内存中的房间数。 */
      rooms: countRooms(),
      /** 注册是否要求邀请码，决定前端要不要提示「余量为 0 时没人能注册」。 */
      inviteRequired: config.invite.required,
      /** 当前还能用的邀请码数量（未停用、未用完、未过期）。 */
      inviteAvailable: countAvailableInviteCodes(),
    },
  });
});

interface UserListRow {
  id: string;
  email: string;
  nickname: string;
  status: string;
  created_at: number;
  status_updated_at: number | null;
  sessions: number;
  prefs_updated_at: number | null;
}

router.get('/users', (req, res) => {
  const query = userListQuerySchema.safeParse(req.query);
  if (!query.success) {
    throw badRequest(query.error.issues[0]?.message || '查询参数不合法');
  }
  const { search, status, page, pageSize } = query.data;

  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (status !== 'all') {
    where.push('u.status = @status');
    params.status = status;
  }
  if (search) {
    // 参数化查询 + 手动转义 LIKE 的通配符，避免用户输入的 % _ 改变匹配语义。
    where.push('(lower(u.email) LIKE @search ESCAPE \'\\\' OR lower(u.nickname) LIKE @search ESCAPE \'\\\')');
    const escaped = search.toLowerCase().replace(/[\\%_]/g, (ch) => `\\${ch}`);
    params.search = `%${escaped}%`;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = (
    db.prepare(`SELECT count(*) AS total FROM users u ${whereSql}`).get(params) as {
      total: number;
    }
  ).total;

  const rows = db
    .prepare(
      `SELECT
         u.id, u.email, u.nickname, u.status, u.created_at, u.status_updated_at,
         (SELECT count(*) FROM refresh_tokens t
            WHERE t.user_id = u.id AND t.revoked = 0 AND t.expires_at > @now) AS sessions,
         (SELECT p.updated_at FROM user_preferences p WHERE p.user_id = u.id) AS prefs_updated_at
       FROM users u
       ${whereSql}
       ORDER BY u.created_at DESC
       LIMIT @limit OFFSET @offset`,
    )
    .all({
      ...params,
      now: Date.now(),
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }) as UserListRow[];

  res.json({
    code: 200,
    data: {
      total,
      page,
      pageSize,
      items: rows.map((row) => ({
        id: row.id,
        email: row.email,
        nickname: row.nickname,
        status: row.status === 'disabled' ? 'disabled' : 'active',
        createdAt: row.created_at,
        statusUpdatedAt: row.status_updated_at,
        activeSessions: row.sessions,
        prefsUpdatedAt: row.prefs_updated_at,
      })),
    },
  });
});

const findUser = (id: string) =>
  db.prepare('SELECT id, email, nickname, status FROM users WHERE id = ?').get(id) as
    | { id: string; email: string; nickname: string; status: string }
    | undefined;

const parseUserId = (raw: unknown) => {
  const parsed = userIdSchema.safeParse({ id: raw });
  if (!parsed.success) {
    throw badRequest('用户 id 不合法');
  }
  return parsed.data.id;
};

router.patch('/users/:id/status', (req, res) => {
  const id = parseUserId(req.params.id);
  const { status } = parseBody(userStatusSchema, req.body);

  const user = findUser(id);
  if (!user) {
    throw notFound('用户不存在');
  }

  db.prepare('UPDATE users SET status = ?, status_updated_at = ? WHERE id = ?').run(
    status,
    Date.now(),
    id,
  );

  let disconnected = 0;
  if (status === 'disabled') {
    // 停用要立刻见效：作废全部 refresh token（否则最长 7 天还能续期），
    // 再断开现存的实时连接。requireAuth 每次都会查状态，所以 access token 也随即失效。
    revokeAllSessions(id, 'logout');
    disconnected = disconnectUserSockets(id, '账号已被停用');
  }

  res.json({ code: 200, data: { id, status, disconnected } });
});

router.post('/users/:id/logout', (req, res) => {
  const id = parseUserId(req.params.id);
  const user = findUser(id);
  if (!user) {
    throw notFound('用户不存在');
  }
  revokeAllSessions(id, 'logout');
  const disconnected = disconnectUserSockets(id, '你已被管理员强制下线');
  res.json({ code: 200, data: { id, disconnected } });
});

router.delete('/users/:id', (req, res) => {
  const id = parseUserId(req.params.id);
  const user = findUser(id);
  if (!user) {
    throw notFound('用户不存在');
  }
  // refresh_tokens 与 user_preferences 都是 ON DELETE CASCADE，
  // 且 db.ts 里开了 foreign_keys = ON，所以这一条就能连带清干净。
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  const disconnected = disconnectUserSockets(id, '账号已被删除');
  res.json({ code: 200, data: { id, email: user.email, disconnected } });
});

// ── 邀请码 ────────────────────────────────────────────────────────
// 挂在 requireAdmin 之后，因此这几条都已经要求有效的管理会话。

const parseInviteCodeId = (raw: unknown) => {
  const parsed = inviteCodeIdSchema.safeParse({ id: raw });
  if (!parsed.success) {
    throw badRequest('邀请码 id 不合法');
  }
  return parsed.data.id;
};

router.get('/invite-codes', (req, res) => {
  const parsed = inviteCodeListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message || '查询参数不合法');
  }
  res.json({
    code: 200,
    data: {
      ...listInviteCodes(parsed.data),
      /** 一并回带全局开关，前端不必再单独请求一次 /stats。 */
      inviteRequired: config.invite.required,
    },
  });
});

router.post('/invite-codes', (req, res) => {
  const { count, maxUses, expiresInDays, note } = parseBody(inviteCodeCreateSchema, req.body);

  // 未指定有效期时用服务端默认值；显式传 0 表示永不过期。
  const days =
    expiresInDays === undefined ? config.invite.defaultTtlMs / (24 * 60 * 60 * 1000) : expiresInDays;
  const expiresAt = days > 0 ? Date.now() + days * 24 * 60 * 60 * 1000 : null;

  const created = createInviteCodes({
    count,
    maxUses,
    note: note || null,
    expiresAt,
    createdBy: req.admin!.sub,
  });

  res.json({ code: 200, data: { items: created } });
});

router.patch('/invite-codes/:id', (req, res) => {
  const id = parseInviteCodeId(req.params.id);
  const { disabled } = parseBody(inviteCodeStatusSchema, req.body);

  const row = findInviteCodeById(id);
  if (!row) {
    throw notFound('邀请码不存在');
  }
  setInviteCodeDisabled(id, disabled);

  const updated = findInviteCodeById(id)!;
  res.json({ code: 200, data: toInviteCodeView(updated) });
});

router.delete('/invite-codes/:id', (req, res) => {
  const id = parseInviteCodeId(req.params.id);
  const row = findInviteCodeById(id);
  if (!row) {
    throw notFound('邀请码不存在');
  }
  deleteInviteCode(id);
  res.json({ code: 200, data: { id, code: row.code } });
});

export default router;
