import request from '@/api/request'
import { clearAccessToken } from '@/api/token'

/** 访问码登录：成功后将 token 写入 localStorage */
export async function accessCodeLogin(code: string): Promise<{ token: string; expiresAt: number }> {
  const res = await request.post<{ token: string; expiresAt: number }>('/auth/access-code', { code })
  return res.data
}

/** 退出登录：吊销本地令牌（服务端同步吊销，失败不阻塞） */
export async function accessCodeLogout(): Promise<void> {
  try {
    await request.post('/auth/logout')
  } catch {
    // 忽略：本地令牌照常清除
  }
  clearAccessToken()
}
