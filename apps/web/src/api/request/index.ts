import { service } from './base'
import type { ApiResponse, HttpError, RequestConfig, Requester } from './type'
import {
  normalizeApiError,
  normalizeApiSuccess,
  pickExtendOption,
  startLoading,
  stopLoading,
} from './utils'

const request: Requester = async function <T = unknown>(
  option: RequestConfig = {},
): Promise<ApiResponse<T>> {
  const config: RequestConfig = { ...option }
  const extend = pickExtendOption(config)
  if (!extend.noLoading) startLoading(extend.loadingText)
  try {
    const response = await service(config)
    return normalizeApiSuccess<T>(response, extend.noMessage)
  } catch (error) {
    return normalizeApiError<T>(error as HttpError<T>, extend.noMessage)
  } finally {
    if (!extend.noLoading) stopLoading()
  }
}

request.get = function <T = unknown>(
  url: string,
  params: Record<string, unknown> = {},
  option: RequestConfig = {},
): Promise<ApiResponse<T>> {
  return request<T>({ ...option, url, method: 'GET', params })
}

request.post = function <T = unknown>(
  url: string,
  data: unknown = {},
  option: RequestConfig = {},
): Promise<ApiResponse<T>> {
  return request<T>({ ...option, url, method: 'POST', data })
}

request.put = function <T = unknown>(
  url: string,
  data: unknown = {},
  option: RequestConfig = {},
): Promise<ApiResponse<T>> {
  return request<T>({ ...option, url, method: 'PUT', data })
}

request.delete = function <T = unknown>(
  url: string,
  data: unknown = {},
  option: RequestConfig = {},
): Promise<ApiResponse<T>> {
  return request<T>({ ...option, url, method: 'DELETE', data })
}

export default request
