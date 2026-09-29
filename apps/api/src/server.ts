import { createApp } from './app'
import { migrateDatabase } from './db/migrate'

/**
 * Vercel（Hono 框架预设）部署入口：必须默认导出 Hono app。
 * 本地开发/生产仍使用 src/index.ts（node-server 常驻进程）。
 * 冷启动时执行幂等迁移；生产数据库由 DATABASE_URL（Turso）提供。
 */
await migrateDatabase()

export default createApp()
