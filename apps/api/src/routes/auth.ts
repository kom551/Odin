import { randomBytes } from 'node:crypto'

import { Hono } from 'hono'
import type { Context } from 'hono'
import { eq } from 'drizzle-orm'

import { accessCodeLoginSchema } from '@odin/shared'

import { getDb } from '../db/client'
import { accessCodes, deviceTokens } from '../db/schema'
import { formatZodIssues, openAiError } from './error'

const DEFAULT_TTL_DAYS = 30

function tokenTtlMs(): number {
  const value = Number(process.env.ACCESS_TOKEN_TTL_DAYS || DEFAULT_TTL_DAYS)
  const days = Number.isFinite(value) && value > 0 ? value : DEFAULT_TTL_DAYS
  return days * 24 * 60 * 60 * 1000
}

function bearerToken(c: Context): string {
  const header = c.req.header('authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

export const authRoute = new Hono()

/** 访问码登录：校验访问码 → 签发设备令牌 */
authRoute.post('/access-code', async (c) => {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return c.json(openAiError('invalid_request_error', '请求体不是合法 JSON', 400), 400)
  }
  const parsed = accessCodeLoginSchema.safeParse(raw)
  if (!parsed.success) {
    return c.json(openAiError('invalid_request_error', formatZodIssues(parsed.error.issues), 400), 400)
  }

  const db = getDb()
  const code = await db.select().from(accessCodes).where(eq(accessCodes.code, parsed.data.code)).get()
  if (!code || code.status !== 'active') {
    return c.json(openAiError('invalid_access_code', '访问码无效或已停用', 401), 401)
  }

  const now = Date.now()
  const expiresAt = now + tokenTtlMs()
  const token = randomBytes(32).toString('hex')
  await db
    .insert(deviceTokens)
    .values({ token, accessCodeId: code.id, expiresAt, createdAt: now })
    .run()

  return c.json({ status: 200, message: 'ok', data: { token, expiresAt } })
})

/** 退出登录：吊销当前令牌 */
authRoute.post('/logout', async (c) => {
  const token = bearerToken(c)
  if (token) {
    const db = getDb()
    await db.delete(deviceTokens).where(eq(deviceTokens.token, token)).run()
  }
  return c.json({ status: 200, message: 'ok', data: null })
})
