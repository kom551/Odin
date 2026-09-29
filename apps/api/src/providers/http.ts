/** 上游 LLM HTTP 请求工具：统一超时控制（默认 60s，可用 LLM_HTTP_TIMEOUT_MS 覆盖） */
export function httpTimeoutMs(): number {
  const value = Number(process.env.LLM_HTTP_TIMEOUT_MS || 60_000)
  return Number.isFinite(value) && value > 0 ? value : 60_000
}

export async function fetchWithTimeout(url: string | URL, init: RequestInit = {}): Promise<Response> {
  const { signal, ...rest } = init
  const timeout = AbortSignal.timeout(httpTimeoutMs())
  return fetch(url, { ...rest, signal: signal ?? timeout })
}
