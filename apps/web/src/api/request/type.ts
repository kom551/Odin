import type { AxiosError, AxiosRequestConfig, AxiosResponse, Method } from 'axios'

/** 统一响应包裹：兼容 { status, message, data } 与 OpenAI 风格原始 JSON */
export interface ApiResponse<T = unknown> {
  status: number | boolean
  message: string
  data: T
  desc?: string
  errorStatus?: number
}

export interface RequestExtendOption {
  noLoading?: boolean
  noMessage?: boolean
  loadingText?: string
}

export interface RequestConfig<T = unknown> extends AxiosRequestConfig<T>, RequestExtendOption {
  baseURL?: string
  url?: string
  method?: Method
}

export type HttpResponse<T = unknown> = AxiosResponse<ApiResponse<T>>
export type HttpError<T = unknown> = AxiosError<ApiResponse<T>>

export interface Requester {
  <T = unknown>(config: RequestConfig): Promise<ApiResponse<T>>
  get<T = unknown>(
    url: string,
    params?: Record<string, unknown>,
    config?: RequestConfig,
  ): Promise<ApiResponse<T>>
  post<T = unknown>(url: string, data?: unknown, config?: RequestConfig): Promise<ApiResponse<T>>
  put<T = unknown>(url: string, data?: unknown, config?: RequestConfig): Promise<ApiResponse<T>>
  delete<T = unknown>(url: string, data?: unknown, config?: RequestConfig): Promise<ApiResponse<T>>
}
