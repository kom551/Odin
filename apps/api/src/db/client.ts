import { createClient } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'

import * as schema from './schema'

/**
 * 数据库连接串（libSQL / Turso）：
 * - 本地默认 `file:data/odin.db`（相对进程 cwd）
 * - 兼容旧变量 DATABASE_PATH（视为本地文件路径）
 * - Vercel 上未配置时退化为 /tmp 临时库（仅演示，生产必须配置 Turso DATABASE_URL）
 */
export function getDatabaseUrl(): string {
  const legacy = process.env.DATABASE_PATH?.trim()
  const url = process.env.DATABASE_URL?.trim() || (legacy ? `file:${legacy}` : '')
  if (url) return url
  return process.env.VERCEL ? 'file:/tmp/odin.db' : 'file:data/odin.db'
}

let db: LibSQLDatabase<typeof schema> | null = null

/** 打开（或复用）libSQL 连接。查询为异步 API，调用处需 await。 */
export function getDb(): LibSQLDatabase<typeof schema> {
  if (db) return db
  const url = getDatabaseUrl()
  const client = createClient({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN?.trim() || undefined,
  })
  // 本地文件库启用外键约束；远程 Turso 默认开启，且执行 PRAGMA 会报错，这里静默忽略
  if (url.startsWith('file:')) {
    void client.execute('PRAGMA foreign_keys = ON').catch(() => undefined)
  }
  db = drizzle(client, { schema })
  return db
}

/** libSQL 客户端无同步 close 语义；本地/远程均由服务端管理连接，保留空实现以兼容调用方 */
export function closeDb(): void {
  db = null
}
