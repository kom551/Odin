import path from 'node:path'
import { mkdirSync } from 'node:fs'

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'

import * as schema from './schema'

export function getDatabasePath(): string {
  const explicit = process.env.DATABASE_PATH?.trim()
  if (explicit) return path.resolve(explicit)
  return path.resolve(process.cwd(), 'data/odin.db')
}

let raw: Database.Database | null = null
let db: ReturnType<typeof drizzle<typeof schema>> | null = null

/** 打开（或复用）SQLite 连接，启用 WAL 与外键约束 */
export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (db) return db
  const databasePath = getDatabasePath()
  mkdirSync(path.dirname(databasePath), { recursive: true })
  raw = new Database(databasePath)
  raw.pragma('journal_mode = WAL')
  raw.pragma('foreign_keys = ON')
  db = drizzle(raw, { schema })
  return db
}

export function closeDb(): void {
  if (raw) {
    raw.close()
    raw = null
    db = null
  }
}
