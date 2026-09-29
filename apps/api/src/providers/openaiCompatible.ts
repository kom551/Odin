import type { ChatChunk, ChatMessage } from '@odin/shared'
import { fetchWithTimeout } from './http'
import { ensureOk, parseSseStream } from './sse'
import type { ChatProvider, ProviderChatRequest } from './types'
import { ProviderError } from './types'

interface OpenAiCompatibleOptions {
  apiKey: string
  baseUrl: string
}

/** OpenAI 兼容协议适配器：任意符合 OpenAI chat/completions 接口的自定义服务 */
export function createOpenAICompatibleProvider({
  apiKey,
  baseUrl,
}: OpenAiCompatibleOptions): ChatProvider {
  return {
    id: 'custom',
    async *chat(request: ProviderChatRequest): AsyncGenerator<ChatChunk> {
      const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`
      const bodyMessages: ChatMessage[] = request.messages.map((message) => ({ ...message }))
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: request.model,
          messages: bodyMessages,
          stream: request.stream,
          temperature: request.temperature,
          top_p: request.topP,
          max_tokens: request.maxTokens,
          ...(request.stream ? { stream_options: { include_usage: true } } : {}),
        }),
      })
      await ensureOk(response, 'llm')

      if (!request.stream) {
        const data = (await response.json()) as {
          id?: string
          model?: string
          choices?: Array<{
            message?: { content?: string }
            finish_reason?: string | null
          }>
          usage?: {
            prompt_tokens?: number
            completion_tokens?: number
            total_tokens?: number
          }
        }
        const choice = data.choices?.[0]
        yield {
          id: data.id ?? `chatcmpl-${Date.now()}`,
          model: data.model ?? request.model,
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: choice?.message?.content ?? '' },
              finish_reason: choice?.finish_reason ?? 'stop',
            },
          ],
          usage: data.usage
            ? {
                prompt_tokens: data.usage.prompt_tokens,
                completion_tokens: data.usage.completion_tokens,
                total_tokens: data.usage.total_tokens,
              }
            : undefined,
        }
        return
      }

      if (!response.body) throw new ProviderError('llm 上游未返回响应体')

      for await (const raw of parseSseStream(response.body)) {
        if (raw === '[DONE]') continue
        const data = raw as {
          id?: string
          model?: string
          choices?: Array<{
            delta?: { role?: string; content?: string; reasoning_content?: string }
            finish_reason?: string | null
          }>
          usage?: {
            prompt_tokens?: number
            completion_tokens?: number
            total_tokens?: number
          }
        }
        const delta = data.choices?.[0]?.delta ?? {}
        yield {
          id: data.id ?? `chatcmpl-${Date.now()}`,
          model: data.model ?? request.model,
          choices: [
            {
              index: 0,
              delta: {
                role: delta.role,
                content: delta.content,
                reasoning_content: delta.reasoning_content,
              },
              finish_reason: data.choices?.[0]?.finish_reason ?? null,
            },
          ],
          usage: data.usage
            ? {
                prompt_tokens: data.usage.prompt_tokens,
                completion_tokens: data.usage.completion_tokens,
                total_tokens: data.usage.total_tokens,
              }
            : undefined,
        }
      }
    },
  }
}
