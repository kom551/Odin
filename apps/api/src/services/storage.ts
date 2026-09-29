import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { put } from '@vercel/blob'
import { eq } from 'drizzle-orm'

import { getUploadsDir } from '../config'
import { getDb } from '../db/client'
import { uploads } from '../db/schema'

export interface SavedImage {
  /** 客户端可见的图片 URL：Vercel Blob 为完整 https URL，本地为相对 /uploads/... */
  url: string
  /** 存储路径（Blob 为 pathname，本地为相对目录） */
  path: string
}

/**
 * 保存图片：
 * - 配置了 BLOB_READ_WRITE_TOKEN（Vercel Blob 存储）→ 写入 Blob，返回公开 URL
 * - 否则写本地 data/uploads（开发 / nginx 部署），保持原有行为
 */
export async function saveImage(buffer: Buffer, ext: string): Promise<SavedImage> {
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    const filename = `${randomUUID()}.${ext}`
    const blob = await put(filename, buffer, { access: 'public' })
    return { url: blob.url, path: blob.pathname }
  }

  const now = new Date()
  const y = String(now.getFullYear())
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const filename = `${randomUUID()}.${ext}`
  const rel = path.join(y, m, filename)
  const dir = path.join(getUploadsDir(), y, m)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, filename), buffer)
  return { url: `/uploads/${rel}`, path: rel }
}

export function sha256Of(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

/**
 * 读取图片为 data URI（审核时喂给多模态模型）：
 * - https URL（Vercel Blob）→ 直接 fetch
 * - 相对 /uploads/... → 本地文件（开发 / nginx 部署）
 */
export async function loadImageDataUri(url: string): Promise<string | null> {
  if (/^https?:\/\//i.test(url)) {
    try {
      const res = await fetch(url)
      if (!res.ok) return null
      const buffer = Buffer.from(await res.arrayBuffer())
      const type = res.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream'
      return `data:${type};base64,${buffer.toString('base64')}`
    } catch {
      return null
    }
  }

  const db = getDb()
  const row = await db.select().from(uploads).where(eq(uploads.url, url)).get()
  if (!row) return null
  try {
    const buffer = readFileSync(path.join(getUploadsDir(), row.path))
    return `data:${row.mime};base64,${buffer.toString('base64')}`
  } catch {
    return null
  }
}
