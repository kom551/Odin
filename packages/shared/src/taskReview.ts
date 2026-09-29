import { z } from 'zod'

export const reviewTypeSchema = z.enum(['auto', 'llm'])

export type ReviewType = z.infer<typeof reviewTypeSchema>

export const stageInputSchema = z
  .object({
    title: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    reviewType: reviewTypeSchema,
    reviewPrompt: z.string().max(2000).optional(),
  })
  .refine((stage) => stage.reviewType !== 'llm' || Boolean(stage.reviewPrompt?.trim()), {
    message: '大模型审核类型必须输入审核提示词',
    path: ['reviewPrompt'],
  })

export type StageInput = z.infer<typeof stageInputSchema>

export const taskCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  coverUrl: z.string().max(500).optional(),
  passCode: z.string().regex(/^\d{6}$/, '通关码必须为 6 位数字'),
  stages: z.array(stageInputSchema).min(1).max(20),
})

export type TaskCreateInput = z.infer<typeof taskCreateSchema>

export const taskStatusSchema = z.enum(['draft', 'published', 'archived'])
export const submissionStatusSchema = z.enum(['pending', 'reviewing', 'passed', 'rejected'])

/** LLM 审核结果（aiResult） */
export const aiResultSchema = z.object({
  passed: z.boolean(),
  summary: z.string(),
  issues: z.array(z.string()).default([]),
  suggestions: z.string().default(''),
})

export type AiResult = z.infer<typeof aiResultSchema>

/** 落库版本：附加原始输出与模型信息，autoRejected 标记自动降级判定 */
export const aiResultWithMetaSchema = aiResultSchema.extend({
  raw: z.string().max(2000).default(''),
  model: z.string().default(''),
  autoRejected: z.boolean().default(false),
})

export type AiResultWithMeta = z.infer<typeof aiResultWithMetaSchema>

export const submissionCreateSchema = z.object({
  images: z.array(z.string().min(1).max(500)).min(1),
})

export type SubmissionCreateInput = z.infer<typeof submissionCreateSchema>

export const adminReviewSchema = z.object({
  passed: z.boolean(),
  reason: z.string().min(1).max(500),
})
