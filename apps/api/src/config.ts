import path from 'node:path'

export interface ApiConfig {
  host: string
  port: number
}

export function loadConfig(): ApiConfig {
  return {
    host: process.env.HOST || '0.0.0.0',
    port: Number(process.env.PORT || 3001),
  }
}

/** 图片上传根目录（默认 <cwd>/data/uploads，静态挂载在 /uploads/*） */
export function getUploadsDir(): string {
  const explicit = process.env.UPLOAD_DIR?.trim()
  if (explicit) return path.resolve(explicit)
  // Vercel 函数文件系统只读：默认落到 /tmp（临时，仅适合演示/无状态场景）
  const fallback = process.env.VERCEL ? '/tmp/uploads' : path.join(process.cwd(), 'data/uploads')
  return path.resolve(fallback)
}
