import { serve } from '@hono/node-server'
import { createApp } from './app'
import { loadConfig } from './config'
import { closeDb, getDatabaseUrl } from './db/client'
import { migrateDatabase } from './db/migrate'
import { loadEnv } from './env'

loadEnv()
const config = loadConfig()
const app = createApp()

if (!process.env.ADMIN_KEY) {
  console.warn('[odin-api] 警告：未配置 ADMIN_KEY，管理页面接口将返回 403（请在 apps/api/.env 中设置）')
}

await migrateDatabase()
console.log(`[odin-api] database ready: ${getDatabaseUrl()}`)

const server = serve(
  { fetch: app.fetch, port: config.port, hostname: config.host },
  (info) => {
    console.log(`[odin-api] listening on http://${config.host}:${info.port}`)
  },
)

/** 优雅退出：停止接收新请求 → 关闭数据库 → 退出 */
function shutdown(signal: string): void {
  console.log(`[odin-api] 收到 ${signal}，正在优雅退出...`)
  server.close(() => {
    closeDb()
    process.exit(0)
  })
  // 兜底：10s 内未完成则强制退出
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
