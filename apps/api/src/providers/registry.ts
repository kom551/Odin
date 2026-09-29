import { createOpenAICompatibleProvider } from './openaiCompatible'
import type { ChatProvider } from './types'

/** 自定义 LLM（OpenAI 兼容接口）是否已配置完整 */
export function isLlmConfigured(): boolean {
  return Boolean(process.env.LLM_BASE_URL?.trim() && process.env.LLM_MODEL?.trim())
}

/** 创建自定义 OpenAI 兼容适配器；未配置 Base URL 返回 null */
export function createProvider(): ChatProvider | null {
  const baseUrl = process.env.LLM_BASE_URL?.trim()
  if (!baseUrl) return null
  return createOpenAICompatibleProvider({
    apiKey: process.env.LLM_API_KEY?.trim() ?? '',
    baseUrl,
  })
}
