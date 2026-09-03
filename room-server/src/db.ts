import fs from 'fs';
import path from 'path';

import Database from 'better-sqlite3';

import config from './config.js';

const dir = path.dirname(config.dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(config.dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    nickname TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
  );

  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

  -- 用户界面偏好（当前地图、楼层、各图层开关等）。
  -- 整体读写、只属于单个用户、不需要按字段查询，所以用单行 JSON 而不是 key-value 多行：
  -- 读写各一条 SQL，将来新增偏好项也不用改表。
  -- version 同时用于乐观锁（多设备并发写）和 payload 结构版本迁移。
  CREATE TABLE IF NOT EXISTS user_preferences (
    user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    payload    TEXT NOT NULL,
    version    INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
  );

  -- 注册邀请码，由管理后台生成与维护。
  -- 明文存储而不是存 hash：管理员必须能把码原样再看一遍、再发给别人，
  -- 这一点和用户口令的取舍正好相反。它也不是长期凭证，用完即失效。
  --
  -- 用 used_count / max_uses 而不是布尔 used 字段，是为了同时表达
  -- 「一次性邀请」和「一个码开放 N 个名额」两种用法。
  CREATE TABLE IF NOT EXISTS invite_codes (
    id           TEXT PRIMARY KEY,
    code         TEXT NOT NULL,
    -- 管理员写给自己看的备注，例如「给某个小队」。
    note         TEXT,
    max_uses     INTEGER NOT NULL DEFAULT 1,
    used_count   INTEGER NOT NULL DEFAULT 0,
    -- NULL 表示不过期。
    expires_at   INTEGER,
    -- 手动停用。与「用完」「过期」区分开，管理员才能临时冻结再放开。
    disabled     INTEGER NOT NULL DEFAULT 0,
    created_by   TEXT NOT NULL,
    created_at   INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    last_used_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_invite_codes_created ON invite_codes(created_at);

  -- 邀请码的使用流水，用于回答「这个码是谁用掉的」。
  -- user_id 用 SET NULL：管理后台删除用户是硬删除，但那条使用记录仍应留在审计里。
  CREATE TABLE IF NOT EXISTS invite_code_uses (
    id       TEXT PRIMARY KEY,
    code_id  TEXT NOT NULL REFERENCES invite_codes(id) ON DELETE CASCADE,
    user_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
    -- 冗余存一份注册时的邮箱，用户被删掉之后记录依然可读。
    email    TEXT NOT NULL,
    used_at  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_invite_code_uses_code ON invite_code_uses(code_id);

  -- 任务页「按图搜索」的每日用量。这一项直接花大模型额度，所以必须落库：
  -- 原先用内存限流器计数，room-server 一重启额度就白送一轮。
  --
  -- day 存 'YYYY-MM-DD' 字符串而不是时间戳区间：额度是「按自然日」发的，
  -- 存日期字符串可以让「取今天的用量」退化成一次主键命中，也便于人工排查。
  -- 具体按哪个时区切日由 config.zhipu.dayOffsetMinutes 决定。
  CREATE TABLE IF NOT EXISTS image_search_usage (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day        TEXT NOT NULL,
    count      INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    PRIMARY KEY (user_id, day)
  );

  -- 按 day 清理历史行时用。
  CREATE INDEX IF NOT EXISTS idx_image_search_usage_day ON image_search_usage(day);
`);

const ensureColumn = (table: string, column: string, definition: string) => {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
};

// 轮转宽限期需要知道旧 token 是什么时候、因为什么原因被撤销的。
// 只有 'rotated' 才享受宽限期；主动登出 / 检测到重放时必须立即失效。
ensureColumn('refresh_tokens', 'revoked_at', 'INTEGER');
ensureColumn('refresh_tokens', 'revoke_reason', 'TEXT');
// 同一次登录轮转出来的所有 token 属于同一个 family。
// 登出或检测到重放时按 family 整体失效，既能立刻生效，也不会波及其他设备的登录态。
ensureColumn('refresh_tokens', 'family_id', 'TEXT');
ensureColumn('refresh_tokens', 'created_at', 'INTEGER NOT NULL DEFAULT 0');
db.exec('UPDATE refresh_tokens SET family_id = id WHERE family_id IS NULL');

// 账号状态，由管理后台维护。'active' | 'disabled'。
// 存量用户默认 active，所以加字段对现有部署无感。
ensureColumn('users', 'status', "TEXT NOT NULL DEFAULT 'active'");
ensureColumn('users', 'status_updated_at', 'INTEGER');

// 「按图搜索」的每日额度上限，由管理后台按用户分配。
// NULL 表示沿用全局默认值（config.zhipu.dailyLimit），而不是「额度为 0」——
// 存量用户和新注册用户都是 NULL，所以调整全局默认值对他们立刻生效。
ensureColumn('users', 'image_search_daily_limit', 'INTEGER');
ensureColumn('users', 'image_search_limit_updated_at', 'INTEGER');

// 唯一索引对历史数据可能失败（例如旧库里已存在大小写不同的重复邮箱），
// 这种情况下只告警，不阻塞服务启动。
const ensureIndex = (sql: string, hint: string) => {
  try {
    db.exec(sql);
  } catch (err) {
    console.warn(`[db] 创建索引失败（${hint}）：`, (err as Error).message);
  }
};

// 邮箱大小写不敏感唯一：原来的 `email TEXT UNIQUE` 无法阻止 Foo@x.com 与 foo@x.com 重复注册。
ensureIndex(
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(lower(email))',
  '存在重复邮箱',
);
ensureIndex(
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash)',
  '存在重复的 refresh token',
);
ensureIndex(
  'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id)',
  'family 索引',
);
// 邀请码全局唯一，注册时按 code 精确命中。
ensureIndex(
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code)',
  '存在重复邀请码',
);

export default db;
