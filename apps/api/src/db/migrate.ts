import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { migrate } from 'drizzle-orm/libsql/migrator'

import { getDb } from './client'

/**
 * 定位 drizzle/ 迁移目录。运行环境不同导致 cwd / 打包位置不同，按候选顺序探测：
 * - Vercel 函数 cwd ≈ 仓库根 → apps/api/drizzle
 * - systemd/pm2（WorkingDirectory=apps/api）→ apps/api/drizzle
 * - 源码运行（tsx，src/db/migrate.ts）→ apps/api/drizzle
 * - tsup 打包产物（dist/index.js）→ apps/api/drizzle
 */
function resolveMigrationsFolder(): string {
  const candidates = [
    path.resolve(process.cwd(), 'apps/api/drizzle'),
    path.resolve(process.cwd(), 'drizzle'),
    fileURLToPath(new URL('../../drizzle', import.meta.url)),
    fileURLToPath(new URL('../drizzle', import.meta.url)),
  ]
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!
}

/** 启动时应用 drizzle/ 目录下的 SQL 迁移（幂等） */
export async function migrateDatabase(): Promise<void> {
  await migrate(getDb(), {
    migrationsFolder: resolveMigrationsFolder(),
  })
}
