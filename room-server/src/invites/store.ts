import crypto from 'crypto';

import { v4 as uuidv4 } from 'uuid';

import db from '../db.js';
import { badRequest } from '../http/errors.js';

/**
 * 邀请码的存取与状态判定。
 *
 * 单独成模块而不是塞进 admin/routes.ts：注册流程（auth）和管理后台（admin）都要用它，
 * 而这两侧的鉴权模型完全不同，共享的只能是这层不带权限判断的数据操作。
 */

/**
 * 去掉了 I / O / 0 / 1 的 32 字符表。
 * 邀请码要靠人抄写和口述转达，形近字符是最常见的输入错误来源。
 * 恰好是 2 的幂，所以下面用 `byte % 32` 取字符不会引入偏置。
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 12 个字符 = 60 bit 熵，配合注册接口的限流足以排除穷举。 */
export const INVITE_CODE_LENGTH = 12;

export const MAX_USES_LIMIT = 999;
export const NOTE_MAX = 100;
/** 一次最多生成多少个，避免手滑输入一个大数把库刷满。 */
export const BATCH_LIMIT = 50;

export type InviteCodeStatus = 'available' | 'used' | 'expired' | 'disabled';
export type InviteCodeFilter = 'all' | InviteCodeStatus;

export interface InviteCodeRow {
  id: string;
  code: string;
  note: string | null;
  max_uses: number;
  used_count: number;
  expires_at: number | null;
  disabled: number;
  created_by: string;
  created_at: number;
  last_used_at: number | null;
}

export interface InviteCodeUse {
  email: string;
  userId: string | null;
  usedAt: number;
}

export interface InviteCode {
  id: string;
  code: string;
  note: string | null;
  maxUses: number;
  usedCount: number;
  expiresAt: number | null;
  disabled: boolean;
  status: InviteCodeStatus;
  createdBy: string;
  createdAt: number;
  lastUsedAt: number | null;
  uses: InviteCodeUse[];
}

/**
 * 归一化用户输入：转大写并丢掉不在字符表里的字符。
 * 这样带连字符、空格或从聊天软件里复制来的码都能直接用。
 */
export const normalizeInviteCode = (raw: string) =>
  raw
    .toUpperCase()
    .split('')
    .filter((char) => ALPHABET.includes(char))
    .join('');

export const generateInviteCode = () => {
  const bytes = crypto.randomBytes(INVITE_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
};

/**
 * 判定顺序有意义：
 * 手动停用优先于其他状态，管理员才能把一个还没用完的码临时冻结再放开；
 * 「已用完」优先于「已过期」，因为前者是终态。
 */
const statusOf = (row: InviteCodeRow, now: number): InviteCodeStatus => {
  if (row.disabled) {
    return 'disabled';
  }
  if (row.used_count >= row.max_uses) {
    return 'used';
  }
  if (row.expires_at !== null && row.expires_at <= now) {
    return 'expired';
  }
  return 'available';
};

/** 与 statusOf 等价的 SQL 谓词，用于按状态分页筛选。 */
const STATUS_SQL: Record<InviteCodeStatus, string> = {
  disabled: 'disabled = 1',
  used: 'disabled = 0 AND used_count >= max_uses',
  expired:
    'disabled = 0 AND used_count < max_uses AND expires_at IS NOT NULL AND expires_at <= @now',
  available:
    'disabled = 0 AND used_count < max_uses AND (expires_at IS NULL OR expires_at > @now)',
};

const toInviteCode = (row: InviteCodeRow, now: number, uses: InviteCodeUse[]): InviteCode => ({
  id: row.id,
  code: row.code,
  note: row.note,
  maxUses: row.max_uses,
  usedCount: row.used_count,
  expiresAt: row.expires_at,
  disabled: !!row.disabled,
  status: statusOf(row, now),
  createdBy: row.created_by,
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at,
  uses,
});

const insertCode = db.prepare(
  `INSERT INTO invite_codes (id, code, note, max_uses, used_count, expires_at, disabled, created_by, created_at)
   VALUES (@id, @code, @note, @maxUses, 0, @expiresAt, 0, @createdBy, @createdAt)`,
);

export interface CreateInviteCodeInput {
  count: number;
  maxUses: number;
  note: string | null;
  expiresAt: number | null;
  createdBy: string;
}

/**
 * 批量生成。整批放在一个事务里：要么全部落库，要么一个都不留，
 * 避免管理员看到「说生成 10 个，列表里只有 6 个」这种半成品。
 */
export const createInviteCodes = db.transaction((input: CreateInviteCodeInput): InviteCode[] => {
  const now = Date.now();
  const created: InviteCode[] = [];

  for (let i = 0; i < input.count; i += 1) {
    let code = '';
    // 60 bit 空间里撞码的概率可以忽略，但唯一索引仍然可能报错，重试几次即可。
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = generateInviteCode();
      const existing = db.prepare('SELECT 1 FROM invite_codes WHERE code = ?').get(candidate);
      if (!existing) {
        code = candidate;
        break;
      }
    }
    if (!code) {
      throw new Error('生成邀请码失败：连续多次撞码');
    }

    const row: InviteCodeRow = {
      id: uuidv4(),
      code,
      note: input.note,
      max_uses: input.maxUses,
      used_count: 0,
      expires_at: input.expiresAt,
      disabled: 0,
      created_by: input.createdBy,
      created_at: now,
      last_used_at: null,
    };
    insertCode.run({
      id: row.id,
      code: row.code,
      note: row.note,
      maxUses: row.max_uses,
      expiresAt: row.expires_at,
      createdBy: row.created_by,
      createdAt: row.created_at,
    });
    created.push(toInviteCode(row, now, []));
  }

  return created;
});

/** 一次把整页的使用流水查出来，避免每行一次查询。 */
const loadUses = (codeIds: string[]) => {
  const map = new Map<string, InviteCodeUse[]>();
  if (codeIds.length === 0) {
    return map;
  }
  const placeholders = codeIds.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT code_id, user_id, email, used_at FROM invite_code_uses
       WHERE code_id IN (${placeholders}) ORDER BY used_at ASC`,
    )
    .all(...codeIds) as { code_id: string; user_id: string | null; email: string; used_at: number }[];
  rows.forEach((row) => {
    const list = map.get(row.code_id) ?? [];
    list.push({ email: row.email, userId: row.user_id, usedAt: row.used_at });
    map.set(row.code_id, list);
  });
  return map;
};

export interface ListInviteCodesQuery {
  status: InviteCodeFilter;
  search?: string;
  page: number;
  pageSize: number;
}

export const listInviteCodes = (query: ListInviteCodesQuery) => {
  const now = Date.now();
  const where: string[] = [];
  const params: Record<string, unknown> = { now };

  if (query.status !== 'all') {
    where.push(`(${STATUS_SQL[query.status]})`);
  }
  if (query.search) {
    // 允许按码或备注搜索。LIKE 的通配符要转义，否则输入 % 会命中全部。
    const escaped = query.search.replace(/[\\%_]/g, (char) => `\\${char}`);
    params.search = `%${escaped}%`;
    where.push("(code LIKE @search ESCAPE '\\' OR note LIKE @search ESCAPE '\\')");
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { total } = db
    .prepare(`SELECT count(*) AS total FROM invite_codes ${clause}`)
    .get(params) as { total: number };

  const rows = db
    .prepare(
      `SELECT * FROM invite_codes ${clause}
       ORDER BY created_at DESC, code ASC
       LIMIT @limit OFFSET @offset`,
    )
    .all({
      ...params,
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    }) as InviteCodeRow[];

  const uses = loadUses(rows.map((row) => row.id));
  return {
    total,
    page: query.page,
    pageSize: query.pageSize,
    items: rows.map((row) => toInviteCode(row, now, uses.get(row.id) ?? [])),
  };
};

export const findInviteCodeById = (id: string) =>
  db.prepare('SELECT * FROM invite_codes WHERE id = ?').get(id) as InviteCodeRow | undefined;

export const toInviteCodeView = (row: InviteCodeRow) => toInviteCode(row, Date.now(), []);

export const setInviteCodeDisabled = (id: string, disabled: boolean) => {
  db.prepare('UPDATE invite_codes SET disabled = ? WHERE id = ?').run(disabled ? 1 : 0, id);
};

export const deleteInviteCode = (id: string) => {
  // invite_code_uses 是 ON DELETE CASCADE，使用流水会一并清掉。
  db.prepare('DELETE FROM invite_codes WHERE id = ?').run(id);
};

/** 后台首页用的可用余量。 */
export const countAvailableInviteCodes = () => {
  const { total } = db
    .prepare(`SELECT count(*) AS total FROM invite_codes WHERE ${STATUS_SQL.available}`)
    .get({ now: Date.now() }) as { total: number };
  return total;
};

const UNUSABLE_MESSAGE: Record<Exclude<InviteCodeStatus, 'available'>, string> = {
  used: '该邀请码的名额已用完',
  expired: '该邀请码已过期',
  disabled: '该邀请码已被停用',
};

/**
 * 不带副作用的预检，用在 bcrypt 之前：
 * 码本来就不对的时候没必要先花上百毫秒算一次口令 hash。
 * 真正的判定仍在 consumeInviteCode 的事务里，这里只是省一次无用功。
 */
export const assertInviteCodeUsable = (raw: string) => {
  const code = normalizeInviteCode(raw);
  if (code.length !== INVITE_CODE_LENGTH) {
    throw badRequest('邀请码格式不正确');
  }
  const row = db.prepare('SELECT * FROM invite_codes WHERE code = ?').get(code) as
    | InviteCodeRow
    | undefined;
  // 区分「不存在」和「已过期 / 已用完」是刻意的：60 bit 的码配合注册限流不存在枚举风险，
  // 而把三种情况混成一句「邀请码无效」会让拿到过期码的人完全不知道该找谁要新的。
  if (!row) {
    throw badRequest('邀请码无效');
  }
  const status = statusOf(row, Date.now());
  if (status !== 'available') {
    throw badRequest(UNUSABLE_MESSAGE[status]);
  }
  return row;
};

/**
 * 占用一个名额。必须在调用方的事务里执行，与 users 的插入同生共死：
 * 否则「码已扣、用户没建」或者「用户已建、码没扣」都会出现，
 * 后者意味着一个一次性邀请码可以被并发注册用掉两次。
 *
 * used_count < max_uses 写在 UPDATE 的 WHERE 里，判断与自增是同一条语句，
 * 不依赖上面那次 SELECT 的结果。
 */
export const consumeInviteCode = (raw: string, now: number) => {
  const code = normalizeInviteCode(raw);
  const row = db.prepare('SELECT * FROM invite_codes WHERE code = ?').get(code) as
    | InviteCodeRow
    | undefined;
  if (!row) {
    throw badRequest('邀请码无效');
  }
  const status = statusOf(row, now);
  if (status !== 'available') {
    throw badRequest(UNUSABLE_MESSAGE[status]);
  }

  const result = db
    .prepare(
      `UPDATE invite_codes SET used_count = used_count + 1, last_used_at = @now
       WHERE id = @id AND disabled = 0 AND used_count < max_uses`,
    )
    .run({ now, id: row.id });
  if (result.changes !== 1) {
    throw badRequest('该邀请码的名额已用完');
  }
  return row;
};

export const recordInviteUse = (
  codeId: string,
  userId: string,
  email: string,
  usedAt: number,
) => {
  db.prepare(
    'INSERT INTO invite_code_uses (id, code_id, user_id, email, used_at) VALUES (?, ?, ?, ?, ?)',
  ).run(uuidv4(), codeId, userId, email, usedAt);
};
