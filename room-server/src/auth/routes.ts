import bcrypt from 'bcryptjs';
import { Router, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

import config from '../config.js';
import db from '../db.js';
import { asyncHandler, badRequest, conflict, forbidden, unauthorized } from '../http/errors.js';
import {
  assertInviteCodeUsable,
  consumeInviteCode,
  recordInviteUse,
} from '../invites/store.js';
import { signAccessToken, verifyRefreshToken } from './jwt.js';
import { loginLimiter, refreshLimiter, registerLimiter, requireAuth } from './middleware.js';
import {
  issueRefreshToken,
  lookupRefreshToken,
  revokeAllSessions,
  revokeFamilyById,
  revokeRefreshFamily,
  rotateRefreshToken,
} from './sessions.js';
import { loginSchema, parseBody, registerSchema } from './validators.js';

const router = Router();

interface UserRow {
  id: string;
  email: string;
  nickname: string;
  status?: string;
}

const toUser = (row: UserRow) => ({ id: row.id, email: row.email, nickname: row.nickname });

const findUserById = (id: string) =>
  db.prepare('SELECT id, email, nickname, status FROM users WHERE id = ?').get(id) as
    | UserRow
    | undefined;

const setRefreshCookie = (res: Response, token: string) => {
  res.cookie(config.cookie.name, token, {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: 'lax',
    maxAge: config.cookie.maxAgeMs,
    path: config.cookie.path,
  });
};

const clearRefreshCookie = (res: Response) => {
  res.clearCookie(config.cookie.name, {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: 'lax',
    path: config.cookie.path,
  });
};

const readRefreshCookie = (cookies: Record<string, string> | undefined) => {
  const token = cookies?.[config.cookie.name];
  if (!token) {
    throw unauthorized('未登录');
  }
  return token;
};

interface CreateUserParams {
  id: string;
  email: string;
  nickname: string;
  passwordHash: string;
  /** null 表示本次注册不需要邀请码。 */
  inviteCode: string | null;
}

/**
 * 建号与扣邀请码名额放在同一个事务里。
 *
 * 拆开做的话两个方向都会出错：先扣码后建号，邮箱撞车时名额白白消耗；
 * 先建号后扣码，两个人拿同一个一次性码并发注册就都能成功。
 * 事务里任何一步抛错（邮箱唯一索引冲突、码已失效）都会整体回滚。
 */
const createUser = db.transaction((params: CreateUserParams) => {
  const now = Date.now();
  const invite = params.inviteCode ? consumeInviteCode(params.inviteCode, now) : null;

  db.prepare('INSERT INTO users (id, email, nickname, password_hash) VALUES (?, ?, ?, ?)').run(
    params.id,
    params.email,
    params.nickname,
    params.passwordHash,
  );

  if (invite) {
    // 依赖上面刚插入的 users 行（invite_code_uses.user_id 有外键），顺序不能调换。
    recordInviteUse(invite.id, params.id, params.email, now);
  }
});

/** 公开配置，前端据此决定注册表单要不要显示邀请码输入框。 */
router.get('/config', (_req, res) => {
  res.json({ code: 200, data: { inviteRequired: config.invite.required } });
});

router.post(
  '/register',
  registerLimiter,
  asyncHandler(async (req, res) => {
    const { email, password, nickname, inviteCode } = parseBody(registerSchema, req.body);

    const requireInvite = config.invite.required;
    if (requireInvite && !inviteCode) {
      throw badRequest('请填写邀请码');
    }

    const existing = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email);
    if (existing) {
      throw conflict('该邮箱已注册');
    }
    if (requireInvite) {
      // 先做一次只读预检：码本来就不对时不必再花上百毫秒算 bcrypt。
      assertInviteCodeUsable(inviteCode!);
    }

    const id = uuidv4();
    // 异步版本，避免 hash 计算阻塞事件循环（同一进程还要转发实时位置广播）。
    const passwordHash = await bcrypt.hash(password, config.auth.bcryptRounds);
    try {
      createUser({
        id,
        email,
        nickname,
        passwordHash,
        inviteCode: requireInvite ? inviteCode! : null,
      });
    } catch (err) {
      // 并发注册时唯一索引兜底。
      if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw conflict('该邮箱已注册');
      }
      throw err;
    }

    const user = { id, email, nickname };
    setRefreshCookie(res, issueRefreshToken(id));
    res.json({ code: 200, data: { accessToken: signAccessToken({ sub: id, nickname }), user } });
  }),
);

router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = parseBody(loginSchema, req.body);
    const row = db
      .prepare(
        'SELECT id, email, nickname, status, password_hash FROM users WHERE lower(email) = ?',
      )
      .get(email) as (UserRow & { password_hash: string }) | undefined;

    const matched = row ? await bcrypt.compare(password, row.password_hash) : false;
    if (!row || !matched) {
      throw unauthorized('邮箱或密码错误');
    }
    // 密码校验通过之后才判断状态：先判状态会让攻击者拿任意邮箱去探测哪些账号存在。
    if (row.status === 'disabled') {
      throw forbidden('账号已被停用，请联系管理员');
    }

    setRefreshCookie(res, issueRefreshToken(row.id));
    res.json({
      code: 200,
      data: {
        accessToken: signAccessToken({ sub: row.id, nickname: row.nickname }),
        user: toUser(row),
      },
    });
  }),
);

router.post(
  '/refresh',
  refreshLimiter,
  asyncHandler(async (req, res) => {
    const refreshToken = readRefreshCookie(req.cookies);

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      clearRefreshCookie(res);
      throw unauthorized('登录已过期');
    }

    // 账号状态要在 token 状态之前判断。
    // 停用时会顺手作废全部会话，如果先看 token，被停用的用户拿自己的 token 来刷新
    // 会落进下面的「重放」分支，收到一句「登录状态异常」——既误导用户，
    // 也把一次正常的封禁记成了疑似凭证泄露。
    // 能走到这里说明 refresh token 的签名有效，因此不存在借此探测账号状态的问题。
    const user = findUserById(payload.sub);
    if (!user) {
      revokeAllSessions(payload.sub);
      clearRefreshCookie(res);
      throw unauthorized('用户不存在');
    }
    if (user.status === 'disabled') {
      // 停用时已经作废过一次，这里再兜一次，防止停用后又签发出新会话。
      revokeAllSessions(payload.sub, 'logout');
      clearRefreshCookie(res);
      throw forbidden('账号已被停用，请联系管理员');
    }

    const lookup = lookupRefreshToken(refreshToken, payload.sub);
    if (lookup.status === 'reused') {
      // 已登出、已超出宽限期或库里查不到的 token 被再次使用，按凭证泄露处理。
      // 能定位到 family 就只作废这一条登录链，否则保守起见作废该用户全部会话。
      if (lookup.row) {
        revokeFamilyById(lookup.row.family_id, 'reuse');
      } else {
        revokeAllSessions(payload.sub);
      }
      clearRefreshCookie(res);
      throw unauthorized('登录状态异常，请重新登录');
    }
    if (lookup.status === 'expired') {
      clearRefreshCookie(res);
      throw unauthorized('登录已过期');
    }

    // grace 表示这是多标签页并发刷新的落败方：cookie 已被赢家更新，这里只补发 access token。
    if (lookup.status === 'valid') {
      setRefreshCookie(res, rotateRefreshToken(lookup.row));
    }

    res.json({
      code: 200,
      data: {
        accessToken: signAccessToken({ sub: user.id, nickname: user.nickname }),
        user: toUser(user),
      },
    });
  }),
);

router.post('/logout', (req, res) => {
  const refreshToken = req.cookies?.[config.cookie.name];
  if (refreshToken) {
    // 整条 family 立即失效，包含还在轮转宽限期里的旧 token。
    revokeRefreshFamily(refreshToken);
  }
  clearRefreshCookie(res);
  res.json({ code: 200, data: null });
});

router.get('/me', requireAuth, (req, res, next) => {
  const user = findUserById(req.auth!.sub);
  if (!user) {
    next(unauthorized('用户不存在'));
    return;
  }
  res.json({ code: 200, data: { user: toUser(user) } });
});

export default router;
