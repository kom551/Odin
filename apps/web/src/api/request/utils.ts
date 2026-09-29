import type { ApiResponse, HttpError, HttpResponse, RequestConfig } from './type'

let loadingCount = 0

/** 接口失败时抛出的错误：message 为可展示给用户的文案 */
export class ApiRequestError extends Error {
  readonly errorStatus?: number

  constructor(message: string, errorStatus?: number) {
    super(message)
    this.name = 'ApiRequestError'
    this.errorStatus = errorStatus
  }
}

export function startLoading(_text?: string): void {
  loadingCount += 1
}

export function stopLoading(): void {
  loadingCount = Math.max(0, loadingCount - 1)
}

export function pickExtendOption(config: RequestConfig): {
  noLoading: boolean
  noMessage: boolean
  loadingText: string
} {
  return {
    noLoading: config.noLoading ?? false,
    noMessage: config.noMessage ?? false,
    loadingText: config.loadingText ?? '加载中...',
  }
}

export function normalizeApiSuccess<T>(response: HttpResponse<T>, _noMessage = false): ApiResponse<T> {
  const body = response.data as { message?: string; data?: T; desc?: string }
  return {
    status: response.status,
    message: body.message ?? '',
    data: (body.data ?? (body as unknown as T)) as T,
    desc: body.desc,
  }
}

export function normalizeApiError<T>(error: HttpError<T>, _noMessage = false): ApiResponse<T> {
  const response = error.response
  const data = response?.data as
    | { error?: { message?: string }; message?: string; desc?: string }
    | undefined
  const message = data?.error?.message || data?.message || error.message || '请求失败'
  // 失败必须抛错，调用方才能进入 catch 展示错误；否则 data 为 null 会在
  // 例如 res.data.url 处触发 “null is not an object” 崩溃。
  throw new ApiRequestError(message, response?.status)
}
