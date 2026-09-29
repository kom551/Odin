import type { AiResultWithMeta, TaskCreateInput } from '@odin/shared'

import request from '@/api/request'
import { storageGet, storageSet } from '@/utils/storage'

const ADMIN_KEY_STORAGE = 'odin-admin-key'

export function getAdminKey(): string {
  return storageGet(ADMIN_KEY_STORAGE)
}

export function setAdminKey(key: string): void {
  storageSet(ADMIN_KEY_STORAGE, key)
}

export function adminHeaders(): Record<string, string> {
  const key = getAdminKey()
  return key ? { 'x-admin-key': key } : {}
}

export type TaskStatus = 'draft' | 'published' | 'archived'
export type SubmissionStatus = 'pending' | 'reviewing' | 'passed' | 'rejected'
export type ReviewType = 'auto' | 'llm'

export interface StageRow {
  id: number
  taskId: number
  order: number
  title: string
  description?: string | null
  reviewType: ReviewType
  reviewPrompt?: string | null
}

export interface TaskRow {
  id: number
  title: string
  description: string
  coverUrl?: string | null
  passCode?: string | null
  status: TaskStatus
  createdBy: string
  createdAt: number
  updatedAt: number
  stageCount?: number
  userCount?: number
  stages?: StageRow[]
}

export interface ProgressRow {
  id: number
  taskId: number
  currentStageOrder: number
  status: 'in_progress' | 'completed'
  completedAt?: number | null
  currentStage?: StageRow | null
}

export interface SubmissionRow {
  id: number
  taskId: number
  stageId: number
  attempt: number
  images: string[]
  status: SubmissionStatus
  aiResult?: AiResultWithMeta | null
  autoRejected: boolean
  reviewedAt?: number | null
  createdAt: number
  stageTitle?: string | null
}

export interface TaskStats {
  task: TaskRow
  stages: Array<{ stageId: number; order: number; title: string; submitted: number; passed: number }>
  completed: { passCode: string | null; completedAt: number | null } | null
}

/** 管理端 */
export function adminCreateTask(input: TaskCreateInput) {
  return request.post<TaskRow>('/admin/tasks', input, { headers: adminHeaders() })
}

export function adminUpdateTask(id: number, input: TaskCreateInput) {
  return request.put<TaskRow>(`/admin/tasks/${id}`, input, { headers: adminHeaders() })
}

export function adminPublishTask(id: number) {
  return request.post<TaskRow>(`/admin/tasks/${id}/publish`, {}, { headers: adminHeaders() })
}

export function adminArchiveTask(id: number) {
  return request.post<TaskRow>(`/admin/tasks/${id}/archive`, {}, { headers: adminHeaders() })
}

export function adminListTasks(status?: TaskStatus) {
  return request.get<TaskRow[]>(
    '/admin/tasks',
    status ? { status } : {},
    { headers: adminHeaders() },
  )
}

export function adminGetTask(id: number) {
  return request.get<TaskRow>(`/admin/tasks/${id}`, {}, { headers: adminHeaders() })
}

export function adminGetTaskStats(id: number) {
  return request.get<TaskStats>(`/admin/tasks/${id}/stats`, {}, { headers: adminHeaders() })
}

export function adminListSubmissions(params: { taskId?: number; status?: SubmissionStatus }) {
  return request.get<SubmissionRow[]>('/admin/submissions', params, { headers: adminHeaders() })
}

export function adminListProgress(params: { taskId?: number }) {
  return request.get<ProgressRow[]>('/admin/progress', params, { headers: adminHeaders() })
}

export function adminResetProgress(id: number) {
  return request.post<ProgressRow>(`/admin/progress/${id}/reset`, {}, { headers: adminHeaders() })
}

/** 用户端 */
export function listTasks() {
  return request.get<TaskRow[]>('/tasks', {}, { noLoading: true })
}

export function getTask(id: number) {
  return request.get<{
    task: TaskRow
    stages: StageRow[]
    progress: ProgressRow | null
    currentStage: StageRow | null
  }>(`/tasks/${id}`)
}

export function uploadImage(file: File) {
  const form = new FormData()
  form.append('file', file)
  return request.post<{ url: string }>('/uploads', form)
}

export function submitStage(taskId: number, stageId: number, body: { images: string[] }) {
  return request.post<{ id: number; status: SubmissionStatus }>(
    `/tasks/${taskId}/stages/${stageId}/submissions`,
    body,
  )
}

export function getSubmission(id: number) {
  return request.get<SubmissionRow>(`/submissions/${id}`)
}

export function getProgress(taskId: number) {
  return request.get<ProgressRow | null>('/progress', { taskId })
}

export function getPasscode(taskId: number) {
  return request.get<{ passCode: string | null; completedAt: number | null }>(
    `/tasks/${taskId}/passcode`,
  )
}
