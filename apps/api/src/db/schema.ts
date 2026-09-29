import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

/** API Key 管理：只存 SHA-256 哈希，不存明文 */
export const apiKeys = sqliteTable(
  'api_keys',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    keyHash: text('key_hash').notNull(),
    status: text('status', { enum: ['active', 'disabled', 'expired'] })
      .notNull()
      .default('active'),
    expiresAt: integer('expires_at'),
    lastUsedAt: integer('last_used_at'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [uniqueIndex('api_keys_key_hash_unique').on(table.keyHash)],
)

/** 对话会话：messages 以 JSON 存储，完整保留上下文 */
export const chatSessions = sqliteTable(
  'chat_sessions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    apiKeyId: integer('api_key_id').references(() => apiKeys.id, { onDelete: 'cascade' }),
    model: text('model').notNull(),
    messages: text('messages', { mode: 'json' }).notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('chat_sessions_api_key_id_idx').on(table.apiKeyId)],
)

/** 用量/计费流水：每次请求一条，按 model + 日期聚合出报表 */
export const usageEvents = sqliteTable(
  'usage_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    apiKeyId: integer('api_key_id').references(() => apiKeys.id, { onDelete: 'set null' }),
    model: text('model').notNull(),
    provider: text('provider').notNull(),
    promptTokens: integer('prompt_tokens').notNull().default(0),
    completionTokens: integer('completion_tokens').notNull().default(0),
    totalTokens: integer('total_tokens').notNull().default(0),
    cost: real('cost').notNull().default(0),
    stream: integer('stream', { mode: 'boolean' }).notNull().default(false),
    status: text('status', { enum: ['success', 'error'] }).notNull().default('success'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('usage_events_api_key_id_idx').on(table.apiKeyId),
    index('usage_events_created_at_idx').on(table.createdAt),
  ],
)

/** 任务：一个通关活动，由若干环节组成 */
export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  description: text('description').notNull(),
  coverUrl: text('cover_url'),
  /** 通关码：6 位数字，创建任务时由管理员输入 */
  passCode: text('pass_code'),
  status: text('status', { enum: ['draft', 'published', 'archived'] })
    .notNull()
    .default('draft'),
  createdBy: text('created_by').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

/** 客户端访问码（方案 B：门禁登录） */
export const accessCodes = sqliteTable(
  'access_codes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    code: text('code').notNull(),
    remark: text('remark'),
    status: text('status', { enum: ['active', 'disabled'] })
      .notNull()
      .default('active'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [uniqueIndex('access_codes_code_unique').on(table.code)],
)

/** 客户端设备令牌：访问码登录后签发 */
export const deviceTokens = sqliteTable(
  'device_tokens',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    token: text('token').notNull(),
    accessCodeId: integer('access_code_id').references(() => accessCodes.id, {
      onDelete: 'cascade',
    }),
    expiresAt: integer('expires_at').notNull(),
    lastUsedAt: integer('last_used_at'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [uniqueIndex('device_tokens_token_unique').on(table.token)],
)

/** 环节：任务内的有序步骤 */
export const stages = sqliteTable(
  'stages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    taskId: integer('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    order: integer('order').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    reviewType: text('review_type', { enum: ['auto', 'llm'] }).notNull(),
    reviewPrompt: text('review_prompt'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [uniqueIndex('stages_task_id_order_unique').on(table.taskId, table.order)],
)

/** 提交：用户对某一环节的一次上传 + 审核记录 */
export const submissions = sqliteTable(
  'submissions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    taskId: integer('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    stageId: integer('stage_id')
      .notNull()
      .references(() => stages.id, { onDelete: 'cascade' }),
    attempt: integer('attempt').notNull(),
    images: text('images', { mode: 'json' }).notNull(),
    status: text('status', { enum: ['pending', 'reviewing', 'passed', 'rejected'] })
      .notNull()
      .default('pending'),
    aiResult: text('ai_result', { mode: 'json' }),
    autoRejected: integer('auto_rejected', { mode: 'boolean' }).notNull().default(false),
    reviewedAt: integer('reviewed_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('submissions_stage_idx').on(table.stageId),
    index('submissions_status_idx').on(table.status),
    index('submissions_created_at_idx').on(table.createdAt),
  ],
)

/** 进度：用户对任务的整体完成情况 */
export const progress = sqliteTable(
  'progress',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    taskId: integer('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    currentStageOrder: integer('current_stage_order').notNull().default(1),
    status: text('status', { enum: ['in_progress', 'completed'] })
      .notNull()
      .default('in_progress'),
    completedAt: integer('completed_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('progress_task_unique').on(table.taskId),
  ],
)

/** 图片上传记录（审计用） */
export const uploads = sqliteTable('uploads', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  url: text('url').notNull(),
  path: text('path').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  sha256: text('sha256').notNull(),
  uploadedBy: text('uploaded_by').notNull(),
  createdAt: integer('created_at').notNull(),
})

export type ApiKey = typeof apiKeys.$inferSelect
export type NewApiKey = typeof apiKeys.$inferInsert
export type ChatSession = typeof chatSessions.$inferSelect
export type NewChatSession = typeof chatSessions.$inferInsert
export type UsageEvent = typeof usageEvents.$inferSelect
export type NewUsageEvent = typeof usageEvents.$inferInsert
export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert
export type AccessCode = typeof accessCodes.$inferSelect
export type NewAccessCode = typeof accessCodes.$inferInsert
export type DeviceToken = typeof deviceTokens.$inferSelect
export type NewDeviceToken = typeof deviceTokens.$inferInsert
export type Stage = typeof stages.$inferSelect
export type NewStage = typeof stages.$inferInsert
export type Submission = typeof submissions.$inferSelect
export type NewSubmission = typeof submissions.$inferInsert
export type Progress = typeof progress.$inferSelect
export type NewProgress = typeof progress.$inferInsert
export type Upload = typeof uploads.$inferSelect
export type NewUpload = typeof uploads.$inferInsert
