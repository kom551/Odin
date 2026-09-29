import { z } from 'zod'

/** OpenAI 兼容对话消息 */
export const chatContentPartSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    text: z.string(),
  }),
  z.object({
    type: z.literal('image_url'),
    image_url: z.object({
      url: z.string(),
    }),
  }),
])

export type ChatContentPart = z.infer<typeof chatContentPartSchema>

export const chatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.union([z.string(), z.array(chatContentPartSchema)]),
  name: z.string().optional(),
})

export type ChatMessage = z.infer<typeof chatMessageSchema>

/** OpenAI 兼容流式 chunk（SSE data 负载） */
export const chatChunkSchema = z.object({
  id: z.string(),
  model: z.string(),
  choices: z
    .array(
      z.object({
        index: z.number().default(0),
        delta: z
          .object({
            role: z.string().optional(),
            content: z.string().optional(),
            reasoning_content: z.string().optional(),
          })
          .default({}),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .default([]),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      total_tokens: z.number().optional(),
    })
    .optional(),
})

export type ChatChunk = z.infer<typeof chatChunkSchema>

/** OpenAI 兼容错误负载 */
export const openAiErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string().optional(),
    code: z.union([z.string(), z.number()]).optional(),
  }),
})

export type OpenAiError = z.infer<typeof openAiErrorSchema>
