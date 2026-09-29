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
  return path.resolve(process.env.UPLOAD_DIR?.trim() || path.join(process.cwd(), 'data/uploads'))
}
