import { randomInt } from 'node:crypto'

import { Hono } from 'hono'
import type { Context, Next } from 'hono'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { and, desc, eq } from 'drizzle-orm'

import { accessCodeInputSchema, accessCodeUpdateSchema, taskCreateSchema } from '@odin/shared'

import { getDb } from '../db/client'
import { accessCodes, progress, stages, submissions, tasks } from '../db/schema'
import * as schema from '../db/schema'
import { resetProgress } from '../services/progress'
import { formatZodIssues, openAiError } from './error'

export const adminRoute = new Hono()

type Db = LibSQLDatabase<typeof schema>

async function adminAuth(c: Context, next: Next): Promise<Response | void> {
  const key = process.env.ADMIN_KEY
  if (!key) {
    console.warn(`[odin-api] admin 拒绝：未配置 ADMIN_KEY（path=${c.req.path}）`)
    return c.json(
      openAiError(
        'admin_not_configured',
        '管理端未配置 ADMIN_KEY：请在 apps/api/.env 中设置 ADMIN_KEY 后重启服务',
        403,
      ),
      403,
    )
  }
  const received = c.req.header('x-admin-key')
  if (received !== key) {
    console.warn(
      `[odin-api] admin 拒绝：x-admin-key 不匹配（path=${c.req.path}, received=${received ? `present(${received.length} chars)` : 'missing'}）`,
    )
    return c.json(openAiError('unauthorized', 'x-admin-key 无效：请确认管理页面输入的密钥与 ADMIN_KEY 一致', 403), 403)
  }
  return next()
}

adminRoute.use('*', adminAuth)

/** 创建任务（含环节） */
adminRoute.post('/tasks', async (c) => {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return c.json(openAiError('invalid_request_error', '请求体不是合法 JSON', 400), 400)
  }
  const parsed = taskCreateSchema.safeParse(raw)
  if (!parsed.success) {
    return c.json(
      openAiError('invalid_request_error', formatZodIssues(parsed.error.issues), 400),
      400,
    )
  }
  const input = parsed.data
  const now = Date.now()
  const db = getDb()
  const taskId = Number(
    (
      await db
        .insert(tasks)
        .values({
          title: input.title,
          description: input.description,
          coverUrl: input.coverUrl ?? null,
          passCode: input.passCode,
          status: 'draft',
          createdBy: 'admin',
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: tasks.id })
        .get()
    ).id,
  )
  await insertStages(taskId, input.stages)
  const task = await getTaskDetail(taskId)
  return c.json({ status: 200, message: 'ok', data: task }, 201)
})

/** 编辑草稿（整体覆盖，仅 draft 允许） */
adminRoute.put('/tasks/:id', async (c) => {
  const taskId = Number(c.req.param('id'))
  const db = getDb()
  const existing = await db.select().from(tasks).where(eq(tasks.id, taskId)).get()
  if (!existing) return c.json(openAiError('not_found', '任务不存在', 404), 404)
  if (existing.status !== 'draft') {
    return c.json(openAiError('invalid_state', '仅草稿状态可编辑', 400), 400)
  }

  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return c.json(openAiError('invalid_request_error', '请求体不是合法 JSON', 400), 400)
  }
  const parsed = taskCreateSchema.safeParse(raw)
  if (!parsed.success) {
    return c.json(
      openAiError('invalid_request_error', formatZodIssues(parsed.error.issues), 400),
      400,
    )
  }
  const input = parsed.data
  const now = Date.now()
  await db.transaction(async (tx) => {
    await tx
      .update(tasks)
      .set({
        title: input.title,
        description: input.description,
        coverUrl: input.coverUrl ?? null,
        passCode: input.passCode,
        updatedAt: now,
      })
      .where(eq(tasks.id, taskId))
      .run()
    await tx.delete(stages).where(eq(stages.taskId, taskId)).run()
    for (let i = 0; i < input.stages.length; i += 1) {
      await insertStageTx(tx, taskId, i + 1, input.stages[i]!)
    }
  })
  return c.json({ status: 200, message: 'ok', data: await getTaskDetail(taskId) })
})

adminRoute.post('/tasks/:id/publish', async (c) => {
  const taskId = Number(c.req.param('id'))
  const db = getDb()
  const existing = await db.select().from(tasks).where(eq(tasks.id, taskId)).get()
  if (!existing) return c.json(openAiError('not_found', '任务不存在', 404), 404)
  if (existing.status !== 'draft') {
    return c.json(openAiError('invalid_state', '仅草稿可发布', 400), 400)
  }
  const stageCount = (await db.select({ id: stages.id }).from(stages).where(eq(stages.taskId, taskId)).all()).length
  if (stageCount === 0) return c.json(openAiError('invalid_state', '任务至少需要一个环节', 400), 400)
  await db
    .update(tasks)
    .set({ status: 'published', updatedAt: Date.now() })
    .where(eq(tasks.id, taskId))
    .run()
  return c.json({ status: 200, message: 'ok', data: await getTaskDetail(taskId) })
})

adminRoute.post('/tasks/:id/archive', async (c) => {
  const taskId = Number(c.req.param('id'))
  const db = getDb()
  const existing = await db.select().from(tasks).where(eq(tasks.id, taskId)).get()
  if (!existing) return c.json(openAiError('not_found', '任务不存在', 404), 404)
  await db
    .update(tasks)
    .set({ status: 'archived', updatedAt: Date.now() })
    .where(eq(tasks.id, taskId))
    .run()
  return c.json({ status: 200, message: 'ok', data: await getTaskDetail(taskId) })
})

adminRoute.get('/tasks', async (c) => {
  const status = c.req.query('status')
  const db = getDb()
  const rows = status
    ? await db.select().from(tasks).where(eq(tasks.status, status as 'draft' | 'published' | 'archived')).orderBy(desc(tasks.createdAt)).all()
    : await db.select().from(tasks).orderBy(desc(tasks.createdAt)).all()
  const data = await Promise.all(
    rows.map(async (task) => ({
      ...task,
      stageCount: (await db.select({ id: stages.id }).from(stages).where(eq(stages.taskId, task.id)).all()).length,
      userCount: (await db.select({ id: progress.id }).from(progress).where(eq(progress.taskId, task.id)).all()).length,
    })),
  )
  return c.json({ status: 200, message: 'ok', data })
})

adminRoute.get('/tasks/:id', async (c) => {
  const data = await getTaskDetail(Number(c.req.param('id')))
  if (!data) return c.json(openAiError('not_found', '任务不存在', 404), 404)
  return c.json({ status: 200, message: 'ok', data })
})

/** 验收概览：环节统计 + 通关用户 */
adminRoute.get('/tasks/:id/stats', async (c) => {
  const taskId = Number(c.req.param('id'))
  const db = getDb()
  const task = await db.select().from(tasks).where(eq(tasks.id, taskId)).get()
  if (!task) return c.json(openAiError('not_found', '任务不存在', 404), 404)

  const stageRows = await db.select().from(stages).where(eq(stages.taskId, taskId)).orderBy(stages.order).all()
  const stageStats = await Promise.all(
    stageRows.map(async (stage) => {
      const all = (await db.select({ id: submissions.id }).from(submissions).where(eq(submissions.stageId, stage.id)).all()).length
      const passed = (
        await db
          .select({ id: submissions.id })
          .from(submissions)
          .where(and(eq(submissions.stageId, stage.id), eq(submissions.status, 'passed')))
          .all()
      ).length
      return { stageId: stage.id, order: stage.order, title: stage.title, submitted: all, passed }
    }),
  )

  const completed = await db
    .select({ completedAt: progress.completedAt })
    .from(progress)
    .where(and(eq(progress.taskId, taskId), eq(progress.status, 'completed')))
    .get()

  return c.json({
    status: 200,
    message: 'ok',
    data: {
      task,
      stages: stageStats,
      completed: completed ? { passCode: task.passCode ?? null, completedAt: completed.completedAt } : null,
    },
  })
})

adminRoute.get('/submissions', async (c) => {
  const taskId = c.req.query('taskId')
  const status = c.req.query('status')
  const db = getDb()
  const conditions = []
  if (taskId) conditions.push(eq(submissions.taskId, Number(taskId)))
  if (status) conditions.push(eq(submissions.status, status as 'pending' | 'reviewing' | 'passed' | 'rejected'))
  const rows = conditions.length
    ? await db.select().from(submissions).where(and(...conditions)).orderBy(desc(submissions.createdAt)).all()
    : await db.select().from(submissions).orderBy(desc(submissions.createdAt)).all()
  const stageMap = new Map(
    (await db.select().from(stages).all()).map((s) => [s.id, s]),
  )
  const data = rows.map((row) => ({
    ...row,
    stageTitle: stageMap.get(row.stageId)?.title ?? null,
  }))
  return c.json({ status: 200, message: 'ok', data })
})

adminRoute.get('/progress', async (c) => {
  const taskId = c.req.query('taskId')
  const db = getDb()
  const conditions = []
  if (taskId) conditions.push(eq(progress.taskId, Number(taskId)))
  const rows = conditions.length
    ? await db.select().from(progress).where(and(...conditions)).orderBy(desc(progress.updatedAt)).all()
    : await db.select().from(progress).orderBy(desc(progress.updatedAt)).all()
  return c.json({ status: 200, message: 'ok', data: rows })
})

adminRoute.post('/progress/:id/reset', async (c) => {
  const progressId = Number(c.req.param('id'))
  const db = getDb()
  const row = await db.select().from(progress).where(eq(progress.id, progressId)).get()
  if (!row) return c.json(openAiError('not_found', '进度不存在', 404), 404)
  await resetProgress(progressId)
  return c.json({ status: 200, message: 'ok', data: await getProgressDetail(progressId) })
})

const ACCESS_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateAccessCode(): string {
  let code = ''
  for (let i = 0; i < 6; i += 1) {
    code += ACCESS_CODE_ALPHABET[randomInt(ACCESS_CODE_ALPHABET.length)]
  }
  return code
}

/** 访问码列表 */
adminRoute.get('/access-codes', async (c) => {
  const db = getDb()
  const rows = await db.select().from(accessCodes).orderBy(desc(accessCodes.createdAt)).all()
  return c.json({ status: 200, message: 'ok', data: rows })
})

/** 创建访问码：code 留空自动生成 6 位 */
adminRoute.post('/access-codes', async (c) => {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return c.json(openAiError('invalid_request_error', '请求体不是合法 JSON', 400), 400)
  }
  const parsed = accessCodeInputSchema.safeParse(raw)
  if (!parsed.success) {
    return c.json(openAiError('invalid_request_error', formatZodIssues(parsed.error.issues), 400), 400)
  }

  const db = getDb()
  const code = parsed.data.code?.toUpperCase() || generateAccessCode()
  const dup = await db.select({ id: accessCodes.id }).from(accessCodes).where(eq(accessCodes.code, code)).get()
  if (dup) {
    return c.json(openAiError('invalid_request_error', '访问码已存在，请更换或留空自动生成', 400), 400)
  }

  const now = Date.now()
  const id = Number(
    (
      await db
        .insert(accessCodes)
        .values({
          code,
          remark: parsed.data.remark ?? null,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: accessCodes.id })
        .get()
    ).id,
  )
  const row = await db.select().from(accessCodes).where(eq(accessCodes.id, id)).get()
  return c.json({ status: 200, message: 'ok', data: row }, 201)
})

/** 更新访问码：停用/启用、改备注 */
adminRoute.put('/access-codes/:id', async (c) => {
  const accessCodeId = Number(c.req.param('id'))
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return c.json(openAiError('invalid_request_error', '请求体不是合法 JSON', 400), 400)
  }
  const parsed = accessCodeUpdateSchema.safeParse(raw)
  if (!parsed.success) {
    return c.json(openAiError('invalid_request_error', formatZodIssues(parsed.error.issues), 400), 400)
  }

  const db = getDb()
  const existing = await db.select().from(accessCodes).where(eq(accessCodes.id, accessCodeId)).get()
  if (!existing) return c.json(openAiError('not_found', '访问码不存在', 404), 404)

  await db
    .update(accessCodes)
    .set({
      status: parsed.data.status ?? existing.status,
      remark: parsed.data.remark !== undefined ? (parsed.data.remark || null) : existing.remark,
      updatedAt: Date.now(),
    })
    .where(eq(accessCodes.id, accessCodeId))
    .run()

  const row = await db.select().from(accessCodes).where(eq(accessCodes.id, accessCodeId)).get()
  return c.json({ status: 200, message: 'ok', data: row })
})

async function insertStages(
  taskId: number,
  stageInputs: Array<{
    title: string
    description?: string
    reviewType: 'auto' | 'llm'
    reviewPrompt?: string
  }>,
): Promise<void> {
  const db = getDb()
  await db.transaction(async (tx) => {
    for (let i = 0; i < stageInputs.length; i += 1) {
      await insertStageTx(tx, taskId, i + 1, stageInputs[i]!)
    }
  })
}

type StageTx = Parameters<Parameters<Db['transaction']>[0]>[0]

async function insertStageTx(
  tx: StageTx,
  taskId: number,
  order: number,
  stage: {
    title: string
    description?: string
    reviewType: 'auto' | 'llm'
    reviewPrompt?: string
  },
): Promise<void> {
  await tx
    .insert(stages)
    .values({
      taskId,
      order,
      title: stage.title,
      description: stage.description ?? null,
      reviewType: stage.reviewType,
      reviewPrompt: stage.reviewPrompt ?? null,
      createdAt: Date.now(),
    })
    .run()
}

async function getTaskDetail(taskId: number): Promise<(typeof tasks.$inferSelect & { stages: unknown[] }) | null> {
  const db = getDb()
  const task = await db.select().from(tasks).where(eq(tasks.id, taskId)).get()
  if (!task) return null
  const stageRows = await db.select().from(stages).where(eq(stages.taskId, taskId)).orderBy(stages.order).all()
  return { ...task, stages: stageRows }
}

async function getProgressDetail(progressId: number): Promise<unknown> {
  const db = getDb()
  return db.select().from(progress).where(eq(progress.id, progressId)).get()
}
