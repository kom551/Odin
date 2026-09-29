import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { Hono } from 'hono'
import { fileTypeFromBuffer } from 'file-type'

import { getUploadsDir } from '../config'
import { getDb } from '../db/client'
import { uploads } from '../db/schema'
import { userAuth } from '../middlewares/userAuth'
import { openAiError } from './error'

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
/** 手机相机原图可达数 MB，放宽到 15MB（前端已压缩，正常远小于此值） */
const MAX_SIZE = 15 * 1024 * 1024

export const uploadsRoute = new Hono()

/** 上传仅客户端使用：需要登录令牌（静态图片 GET 不受限） */
uploadsRoute.use('*', (c, next) => {
  if (c.req.method !== 'POST') return next()
  return userAuth(c, next)
})

uploadsRoute.post('/', async (c) => {
  const body = await c.req.parseBody()
  const file = body['file']
  if (!(file instanceof File)) {
    return c.json(openAiError('invalid_request_error', '缺少 file 字段（multipart/form-data）', 400), 400)
  }
  if (file.size === 0) {
    return c.json(openAiError('invalid_request_error', '文件为空', 400), 400)
  }
  if (file.size > MAX_SIZE) {
    return c.json(openAiError('invalid_request_error', '图片不能超过 15MB', 400), 400)
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const type = await fileTypeFromBuffer(buffer)
  if (!type || !ALLOWED_MIME.has(type.mime)) {
    return c.json(openAiError('invalid_request_error', '仅支持 jpg/png/webp 图片', 400), 400)
  }

  const now = new Date()
  const y = String(now.getFullYear())
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const filename = `${randomUUID()}.${type.ext}`
  const rel = path.join(y, m, filename)
  const dir = path.join(getUploadsDir(), y, m)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, filename), buffer)

  const url = `/uploads/${rel}`
  getDb()
    .insert(uploads)
    .values({
      url,
      path: rel,
      mime: type.mime,
      size: buffer.length,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      uploadedBy: 'client',
      createdAt: Date.now(),
    })
    .run()

  return c.json({ status: 200, message: 'ok', data: { url } })
})
