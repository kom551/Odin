import path from 'node:path'

import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'

import { getUploadsDir } from './config'
import { authRoute } from './routes/auth'
import { healthRoute } from './routes/health'
import { uploadsRoute } from './routes/uploads'
import { adminRoute } from './routes/admin'
import { tasksRoute } from './routes/tasks'

export function createApp(): Hono {
  const app = new Hono()

  /** 请求日志：正常请求一行；4xx/5xx 附带响应体（截断）便于排查 */
  app.use('*', async (c, next) => {
    const start = Date.now()
    await next()
    const status = c.res.status
    const ms = Date.now() - start
    if (status >= 400) {
      let detail = ''
      try {
        const body = await c.res.clone().text()
        detail = body ? ` body=${body.slice(0, 500)}` : ''
      } catch {
        detail = ' body=<unreadable>'
      }
      console.warn(`[odin-api] ${c.req.method} ${c.req.path} -> ${status} ${ms}ms${detail}`)
    } else {
      console.log(`[odin-api] ${c.req.method} ${c.req.path} -> ${status} ${ms}ms`)
    }
  })

  app.route('/auth', authRoute)
  app.route('/', healthRoute)
  app.route('/uploads', uploadsRoute)
  app.route('/admin', adminRoute)
  app.route('/', tasksRoute)

  // 静态图片（/uploads/* → data/uploads/*）
  app.use(
    '/uploads/*',
    serveStatic({
      root: path.resolve(getUploadsDir(), '..'),
    }),
  )

  app.notFound((c) =>
    c.json({ error: { message: 'Not Found', type: 'not_found', code: 404 } }, 404),
  )
  app.onError((err, c) => {
    console.error('[odin-api] unhandled error:', err)
    return c.json(
      { error: { message: 'Internal Server Error', type: 'internal_error', code: 500 } },
      500,
    )
  })

  return app
}
