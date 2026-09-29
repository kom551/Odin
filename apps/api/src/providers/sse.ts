import { ProviderError } from './types'

/** 校验上游响应，非 2xx 时抛出带上游错误信息的 ProviderError */
export async function ensureOk(res: Response, context: string): Promise<void> {
  if (res.ok) return
  let message = `HTTP ${res.status}`
  try {
    const body = (await res.json()) as {
      error?: { message?: string }
      message?: string
    }
    message = body?.error?.message || body?.message || message
  } catch {
    // 忽略解析失败，保留默认 message
  }
  throw new ProviderError(`[${context}] ${message}`, res.status)
}

/**
 * 解析上游 SSE 流：逐条产出 `data:` 负载。
 * `[DONE]` 原样产出字符串，其余负载解析为 JSON。
 */
export async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string | Record<string, unknown>> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''
      for (const part of parts) {
        const line = part.split('\n').find((l) => l.startsWith('data:'))
        if (!line) continue
        const payload = line.slice(5).trim()
        if (!payload) continue
        if (payload === '[DONE]') {
          yield '[DONE]'
          continue
        }
        try {
          yield JSON.parse(payload) as Record<string, unknown>
        } catch {
          // 忽略无法解析的行
        }
      }
    }
    // flush 残余数据
    if (buffer.trim()) {
      const line = buffer.split('\n').find((l) => l.startsWith('data:'))
      if (line) {
        const payload = line.slice(5).trim()
        if (payload && payload !== '[DONE]') {
          try {
            yield JSON.parse(payload) as Record<string, unknown>
          } catch {
            // ignore
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
