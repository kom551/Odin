import { Hono } from 'hono'
import { and, count, desc, eq } from 'drizzle-orm'

import { submissionCreateSchema } from '@odin/shared'

import { getDb } from '../db/client'
import { progress, stages, submissions, tasks, uploads } from '../db/schema'
import { userAuth } from '../middlewares/userAuth'
import { enqueueReview } from '../services/reviewQueue'
import { reviewSubmission } from '../services/reviewService'
import { formatZodIssues, openAiError } from './error'

export const tasksRoute = new Hono()

/** 用户端接口统一鉴权：需要先输入访问码登录（静态 /uploads/* 不拦截） */
tasksRoute.use('/tasks', userAuth)
tasksRoute.use('/tasks/*', userAuth)
tasksRoute.use('/submissions/*', userAuth)
tasksRoute.use('/progress', userAuth)

/** 已发布任务列表 */
tasksRoute.get('/tasks', async (c) => {
  const db = getDb()
  const rows = await db.select().from(tasks).where(eq(tasks.status, 'published')).orderBy(desc(tasks.createdAt)).all()
  const data = await Promise.all(
    rows.map(async (task) => ({
      ...toPublicTask(task),
      stageCount: (
        await db.select({ id: stages.id }).from(stages).where(eq(stages.taskId, task.id)).all()
      ).length,
    })),
  )
  return c.json({ status: 200, message: 'ok', data })
})

/** 任务详情 + 我的进度 */
tasksRoute.get('/tasks/:id', async (c) => {
  const taskId = Number(c.req.param('id'))
  const db = getDb()
  const task = await db.select().from(tasks).where(eq(tasks.id, taskId)).get()
  if (!task) return c.json(openAiError('not_found', '任务不存在', 404), 404)
  if (task.status !== 'published') return c.json(openAiError('not_found', '任务不存在', 404), 404)

  const stageRows = await db.select().from(stages).where(eq(stages.taskId, taskId)).orderBy(stages.order).all()
  const myProgress = await db.select().from(progress).where(eq(progress.taskId, taskId)).get()
  const currentStage = myProgress
    ? stageRows.find((stage) => stage.order === myProgress.currentStageOrder) ?? null
    : null
  return c.json({
    status: 200,
    message: 'ok',
    data: { task: toPublicTask(task), stages: stageRows, progress: myProgress, currentStage },
  })
})

/** 提交当前环节图片 */
tasksRoute.post('/tasks/:id/stages/:stageId/submissions', async (c) => {
  const taskId = Number(c.req.param('id'))
  const stageId = Number(c.req.param('stageId'))

  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return c.json(openAiError('invalid_request_error', '请求体不是合法 JSON', 400), 400)
  }
  const parsed = submissionCreateSchema.safeParse(raw)
  if (!parsed.success) {
    return c.json(openAiError('invalid_request_error', formatZodIssues(parsed.error.issues), 400), 400)
  }
  const { images } = parsed.data
  const db = getDb()

  const task = await db.select().from(tasks).where(eq(tasks.id, taskId)).get()
  if (!task || task.status !== 'published') {
    return c.json(openAiError('not_found', '任务不存在或未发布', 404), 404)
  }
  const stage = await db.select().from(stages).where(eq(stages.id, stageId)).get()
  if (!stage || stage.taskId !== taskId) {
    return c.json(openAiError('not_found', '环节不存在', 404), 404)
  }

  // 获取或创建进度
  await db
    .insert(progress)
    .values({
      taskId,
      currentStageOrder: 1,
      status: 'in_progress',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    .onConflictDoNothing()
    .run()
  const row = (await db.select().from(progress).where(eq(progress.taskId, taskId)).get())!

  if (row.status === 'completed') {
    return c.json(openAiError('invalid_state', '任务已通关，无法继续提交', 409), 409)
  }
  if (stage.order !== row.currentStageOrder) {
    return c.json(
      openAiError('invalid_state', `当前应提交第 ${row.currentStageOrder} 环节`, 400),
      400,
    )
  }
  const uploaded = await db.select({ url: uploads.url }).from(uploads).all()
  const knownUrls = new Set(uploaded.map((u) => u.url))
  if (images.some((url) => !knownUrls.has(url))) {
    return c.json(openAiError('invalid_request_error', '包含未上传的图片 URL', 400), 400)
  }

  const attempt =
    ((await db
      .select({ n: count() })
      .from(submissions)
      .where(eq(submissions.stageId, stageId))
      .get())?.n ?? 0) + 1

  const now = Date.now()
  const submissionId = Number(
    (
      await db
        .insert(submissions)
        .values({
          taskId,
          stageId,
          attempt,
          images,
          status: 'reviewing',
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: submissions.id })
        .get()
    ).id,
  )

  enqueueReview(() => reviewSubmission(submissionId))

  return c.json({ status: 200, message: 'ok', data: { id: submissionId, status: 'reviewing' } }, 201)
})

/** 轮询审核结果 */
tasksRoute.get('/submissions/:id', async (c) => {
  const submissionId = Number(c.req.param('id'))
  const db = getDb()
  const row = await db.select().from(submissions).where(eq(submissions.id, submissionId)).get()
  if (!row) return c.json(openAiError('not_found', '提交不存在', 404), 404)
  return c.json({ status: 200, message: 'ok', data: row })
})

/** 任务进度 */
tasksRoute.get('/progress', async (c) => {
  const taskId = Number(c.req.query('taskId') || 0)
  if (!taskId) {
    return c.json(openAiError('invalid_request_error', '缺少 taskId', 400), 400)
  }
  const db = getDb()
  const row = await db.select().from(progress).where(eq(progress.taskId, taskId)).get()
  if (!row) return c.json({ status: 200, message: 'ok', data: null })

  const stage = await db.select().from(stages).where(and(eq(stages.taskId, taskId), eq(stages.order, row.currentStageOrder))).get()
  return c.json({
    status: 200,
    message: 'ok',
    data: {
      ...row,
      currentStage: stage ?? null,
    },
  })
})

/** 通关码 */
tasksRoute.get('/tasks/:id/passcode', async (c) => {
  const taskId = Number(c.req.param('id'))
  const db = getDb()
  const task = await db.select().from(tasks).where(eq(tasks.id, taskId)).get()
  if (!task) return c.json(openAiError('not_found', '任务不存在', 404), 404)
  const row = await db
    .select({ status: progress.status, completedAt: progress.completedAt })
    .from(progress)
    .where(eq(progress.taskId, taskId))
    .get()
  const completed = row?.status === 'completed'
  return c.json({
    status: 200,
    message: 'ok',
    data: {
      passCode: completed ? task.passCode ?? null : null,
      completedAt: completed ? (row?.completedAt ?? null) : null,
    },
  })
})

/** 用户端可见的任务字段（通关码仅通关后经 /tasks/:id/passcode 返回） */
function toPublicTask(task: (typeof tasks.$inferSelect)): Omit<typeof tasks.$inferSelect, 'passCode'> {
  const { id, title, description, coverUrl, status, createdBy, createdAt, updatedAt } = task
  return { id, title, description, coverUrl, status, createdBy, createdAt, updatedAt }
}
