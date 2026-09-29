import axios from 'axios'
import type { AxiosInstance } from 'axios'

import { clearAccessToken, getAccessToken } from '@/api/token'

const baseURL = import.meta.env.VITE_API_BASE || '/api'

export const service: AxiosInstance = axios.create({
  baseURL,
  timeout: 300_000,
  withCredentials: false,
})

service.interceptors.request.use((config) => {
  config.baseURL = import.meta.env.VITE_API_BASE || '/api'
  const token = getAccessToken()
  if (token) {
    config.headers = config.headers ?? {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

service.interceptors.response.use(
  (response) => response,
  (error) => {
    // 客户端令牌失效：清除并回到访问码页（管理端 403，不受影响）
    const url = error.config?.url ?? ''
    if (error.response?.status === 401 && !url.startsWith('/auth/')) {
      clearAccessToken()
      if (!window.location.pathname.startsWith('/access')) {
        window.location.assign('/access')
      }
    }
    return Promise.reject(error)
  },
)
