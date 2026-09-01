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

export default db;
