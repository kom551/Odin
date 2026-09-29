import path from 'node:path'

import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

import { getDb } from './client'

/** 启动时应用 drizzle/ 目录下的 SQL 迁移（幂等） */
export function migrateDatabase(): void {
  migrate(getDb(), {
    migrationsFolder: path.resolve(process.cwd(), 'drizzle'),
  })
}
