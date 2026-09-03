import config from '../config.js';
import db from '../db.js';

/**
 * 「按图搜索」的每日额度：用量计数与按用户的上限覆盖。
 *
 * 单独成模块而不是塞进 tasks/：识别接口（普通用户鉴权）和管理后台（管理会话）都要用它，
 * 两侧的鉴权模型完全不同，能共享的只有这层不带权限判断的数据操作。参照 invites/store.ts。
 *
 * 之所以落库而不是继续用 express-rate-limit 的内存计数：额度直接对应真金白银的
 * 大模型调用，进程一重启就把当天额度重新发一轮，这个漏洞对「默认每人每天 1 次」尤其致命。
 */

/** 管理员能设置的单用户上限。给一个明确的天花板，避免手滑输入一个大数把额度敞开。 */
export const DAILY_LIMIT_MAX = 500;

/** 清理多少天以前的用量流水。留几天是为了排查「我昨天明明没用几次」这类问题。 */
const USAGE_RETENTION_DAYS = 30;

export interface ImageSearchQuota {
  /** 当天可用次数上限。 */
  limit: number;
  /** 当天已用次数。 */
  used: number;
  /** 当天还剩几次。 */
  remaining: number;
  /** true 表示这个用户有管理员单独分配的上限，false 表示跟随全局默认值。 */
  custom: boolean;
}

/**
 * 当天的日期键（YYYY-MM-DD）。
 *
 * 刻意不用 `toLocaleDateString` 之类依赖运行环境时区的写法：容器的 TZ 是什么
 * 不该影响额度什么时候刷新，偏移量统一由配置给出。
 */
export const dayKey = (now = Date.now()) =>
  new Date(now + config.zhipu.dayOffsetMinutes * 60 * 1000).toISOString().slice(0, 10);

/** NULL（没有单独分配）时回落到全局默认值。 */
const resolveLimit = (raw: number | null | undefined) =>
  raw === null || raw === undefined ? config.zhipu.dailyLimit : raw;

const toQuota = (rawLimit: number | null, used: number): ImageSearchQuota => {
  const limit = resolveLimit(rawLimit);
  return {
    limit,
    used,
    // 管理员把上限下调到低于已用次数时，剩余次数不能是负数。
    remaining: Math.max(0, limit - used),
    custom: rawLimit !== null,
  };
};

const selectQuotaStmt = db.prepare(
  `SELECT
     u.image_search_daily_limit AS raw_limit,
     (SELECT count FROM image_search_usage s WHERE s.user_id = u.id AND s.day = @day) AS used
   FROM users u
   WHERE u.id = @userId`,
);

export const getImageSearchQuota = (userId: string, now = Date.now()) => {
  const row = selectQuotaStmt.get({ userId, day: dayKey(now) }) as
    | { raw_limit: number | null; used: number | null }
    | undefined;
  if (!row) {
    return undefined;
  }
  return toQuota(row.raw_limit, row.used ?? 0);
};

/**
 * 一次把整页用户的用量查出来，避免管理后台列表每行一次查询。
 * 返回 userId -> 已用次数；没有记录的用户不会出现在 Map 里。
 */
export const loadImageSearchUsage = (userIds: string[], now = Date.now()) => {
  const map = new Map<string, number>();
  if (userIds.length === 0) {
    return map;
  }
  const placeholders = userIds.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT user_id, count FROM image_search_usage
       WHERE day = ? AND user_id IN (${placeholders})`,
    )
    .all(dayKey(now), ...userIds) as { user_id: string; count: number }[];
  rows.forEach((row) => map.set(row.user_id, row.count));
  return map;
};

/** 供列表复用：已知 raw_limit 和已用次数时直接组装视图，不再查库。 */
export const buildImageSearchQuota = toQuota;

const consumeStmt = db.prepare(
  `INSERT INTO image_search_usage (user_id, day, count, updated_at)
   VALUES (@userId, @day, 1, @now)
   ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1, updated_at = @now
   WHERE count < @limit`,
);

export interface ConsumeResult {
  ok: boolean;
  limit: number;
  used: number;
  remaining: number;
}

/**
 * 占用一次额度。
 *
 * 判断与自增是同一条 SQL：`WHERE count < @limit` 写在 ON CONFLICT 的 UPDATE 上，
 * 不依赖先 SELECT 再 UPDATE 的两步逻辑，因此并发请求不会双花同一个名额。
 * 首次插入（当天还没有行）时 count 直接是 1，所以上限为 0 的情况必须提前挡掉。
 */
export const consumeImageSearchQuota = (userId: string, now = Date.now()): ConsumeResult => {
  const current = getImageSearchQuota(userId, now);
  // 用户不存在时按 0 额度处理；调用方在 requireAuth 之后，正常不会走到。
  const limit = current?.limit ?? 0;
  const used = current?.used ?? 0;
  if (limit <= 0 || used >= limit) {
    return { ok: false, limit, used, remaining: 0 };
  }

  const result = consumeStmt.run({ userId, day: dayKey(now), now, limit });
  if (result.changes === 0) {
    // 并发下被别的请求抢走了最后一个名额。
    return { ok: false, limit, used: limit, remaining: 0 };
  }
  const nextUsed = used + 1;
  return { ok: true, limit, used: nextUsed, remaining: Math.max(0, limit - nextUsed) };
};

/**
 * 设置某个用户的每日上限。传 null 表示清除单独分配、回到全局默认值。
 * 只改上限，不动已用次数——管理员想让人立刻恢复可用，应该用 resetImageSearchUsage。
 */
export const setImageSearchDailyLimit = (userId: string, limit: number | null) => {
  db.prepare(
    'UPDATE users SET image_search_daily_limit = ?, image_search_limit_updated_at = ? WHERE id = ?',
  ).run(limit, Date.now(), userId);
};

/** 清空某个用户当天的已用次数。用于管理员手动放行。 */
export const resetImageSearchUsage = (userId: string, now = Date.now()) => {
  const result = db
    .prepare('DELETE FROM image_search_usage WHERE user_id = ? AND day = ?')
    .run(userId, dayKey(now));
  return result.changes;
};

/** 后台概览用：今天全站一共调用了多少次。 */
export const countImageSearchToday = (now = Date.now()) => {
  const row = db
    .prepare('SELECT coalesce(sum(count), 0) AS total FROM image_search_usage WHERE day = ?')
    .get(dayKey(now)) as { total: number };
  return row.total;
};

export const pruneImageSearchUsage = () => {
  const cutoff = dayKey(Date.now() - USAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  db.prepare('DELETE FROM image_search_usage WHERE day < ?').run(cutoff);
};

export const startImageSearchUsageCleanup = () => {
  pruneImageSearchUsage();
  const timer = setInterval(pruneImageSearchUsage, 24 * 60 * 60 * 1000);
  timer.unref();
  return () => clearInterval(timer);
};
