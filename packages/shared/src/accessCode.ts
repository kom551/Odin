import { z } from 'zod'

/** 客户端访问码登录 */
export const accessCodeLoginSchema = z.object({
  code: z.string().trim().min(1).max(32),
})

export type AccessCodeLoginInput = z.infer<typeof accessCodeLoginSchema>

/** 访问码状态 */
export const accessCodeStatusSchema = z.enum(['active', 'disabled'])
export type AccessCodeStatus = z.infer<typeof accessCodeStatusSchema>

/** 管理端创建访问码：code 留空则自动生成 */
export const accessCodeInputSchema = z.object({
  code: z.string().trim().min(4).max(32).optional(),
  remark: z.string().trim().max(100).optional(),
})

export type AccessCodeInput = z.infer<typeof accessCodeInputSchema>

/** 管理端更新访问码 */
export const accessCodeUpdateSchema = z.object({
  status: accessCodeStatusSchema.optional(),
  remark: z.string().trim().max(100).optional(),
})

export type AccessCodeUpdate = z.infer<typeof accessCodeUpdateSchema>
