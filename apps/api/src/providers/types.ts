import type { ChatChunk, ChatMessage } from '@odin/shared'

export interface ProviderChatRequest {
  model: string
  messages: ChatMessage[]
  stream: boolean
  temperature?: number
  maxTokens?: number
  topP?: number
}

/** 供应商适配器：统一产出 OpenAI 兼容 chunk 流 */
export interface ChatProvider {
  id: string
  chat(request: ProviderChatRequest): AsyncIterable<ChatChunk>
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}
