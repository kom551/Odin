import type { Context, Next } from 'hono'
import { eq } from 'drizzle-orm'

import { getDb } from '../db/client'
import { deviceTokens } from '../db/schema'
import { openAiError } from '../routes/error'

/** 客户端访问鉴权：Authorization: Bearer <token>（或 x-access-token） */
export async function userAuth(c: Context, next: Next): Promise<Response | void> {
  const header = c.req.header('authorization') ?? ''
  const token = header.startsWith('Bearer ')
    ? header.slice(7).trim()
    : (c.req.header('x-access-token') ?? '').trim()
  if (!token) {
    return c.json(openAiError('unauthorized', '请先输入访问码登录', 401), 401)
  }

  const db = getDb()
  const row = db.select().from(deviceTokens).where(eq(deviceTokens.token, token)).get()
  if (!row || row.expiresAt <= Date.now()) {
    return c.json(openAiError('unauthorized', '登录已过期，请重新输入访问码', 401), 401)
  }

  db.update(deviceTokens)
    .set({ lastUsedAt: Date.now() })
    .where(eq(deviceTokens.id, row.id))
    .run()
  return next()
}
