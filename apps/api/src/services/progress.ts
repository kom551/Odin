import { eq } from 'drizzle-orm'

import type { AiResultWithMeta } from '@odin/shared'

import { getDb } from '../db/client'
import { progress, stages, submissions } from '../db/schema'

export interface Verdict {
  passed: boolean
  aiResult: AiResultWithMeta
}

/**
 * 落库审核结论（唯一状态迁移点）：
 * - 更新 submission 状态与 aiResult
 * - 通过时推进进度；末环节通过 → completed
 */
export async function applyVerdict(submissionId: number, verdict: Verdict): Promise<void> {
  const db = getDb()
  await db.transaction(async (tx) => {
    const submission = await tx
      .select()
      .from(submissions)
      .where(eq(submissions.id, submissionId))
      .get()
    if (!submission) return

    const now = Date.now()
    await tx
      .update(submissions)
      .set({
        status: verdict.passed ? 'passed' : 'rejected',
        aiResult: verdict.aiResult,
        autoRejected: verdict.aiResult.autoRejected ?? false,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(eq(submissions.id, submissionId))
      .run()

    if (!verdict.passed) return

    const stage = await tx.select().from(stages).where(eq(stages.id, submission.stageId)).get()
    if (!stage) return

    const row = await tx
      .select()
      .from(progress)
      .where(eq(progress.taskId, submission.taskId))
      .get()
    if (!row || row.status === 'completed') return

    const stageCount = (
      await tx
        .select({ id: stages.id })
        .from(stages)
        .where(eq(stages.taskId, submission.taskId))
        .all()
    ).length

    if (stage.order < stageCount) {
      await tx
        .update(progress)
        .set({ currentStageOrder: stage.order + 1, updatedAt: now })
        .where(eq(progress.id, row.id))
        .run()
      return
    }

    await tx
      .update(progress)
      .set({
        status: 'completed',
        currentStageOrder: stageCount,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(progress.id, row.id))
      .run()
  })
}

/** 重置超限进度（管理端）：重新开始 */
export async function resetProgress(progressId: number): Promise<void> {
  const db = getDb()
  const now = Date.now()
  await db
    .update(progress)
    .set({
      status: 'in_progress',
      currentStageOrder: 1,
      completedAt: null,
      updatedAt: now,
    })
    .where(eq(progress.id, progressId))
    .run()
}
