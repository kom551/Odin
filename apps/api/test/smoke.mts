import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { createApp } from '../src/app'
import { migrateDatabase } from '../src/db/migrate'

/** 本地 OpenAI 兼容 mock 上游 */
function createMockUpstream(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || !req.url?.includes('/chat/completions')) {
      res.writeHead(404)
      res.end()
      return
    }
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      const parsed = JSON.parse(body) as { stream?: boolean; model?: string }
      if (parsed.model === 'mock-model') {
        // 审核 mock：返回结构化判定 JSON
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify({
            id: 'chatcmpl-mock-vl',
            model: 'mock-model',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: JSON.stringify({
                    passed: true,
                    summary: '图片合格',
                    issues: [],
                    suggestions: '',
                  }),
                },
                finish_reason: 'stop',
              },
            ],
          }),
        )
        return
      }
      res.writeHead(404)
      res.end()
    })
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolve({
        port,
        close: () => new Promise((r) => server.close(() => r())),
      })
    })
  })
}

async function main() {
  process.env.DATABASE_URL = `file:${path.join(os.tmpdir(), `odin-smoke-${Date.now()}.db`)}`
  await migrateDatabase()

  const upstream = await createMockUpstream()
  process.env.LLM_BASE_URL = `http://127.0.0.1:${upstream.port}`
  process.env.LLM_API_KEY = 'test-key'
  process.env.LLM_MODEL = 'mock-model'
  process.env.ADMIN_KEY = 'test-admin-key'
  process.env.REVIEW_RETRY_BASE_MS = '1'

  const app = createApp()
  const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' })
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const { port } = server.address() as AddressInfo
  const base = `http://127.0.0.1:${port}`

  try {
    // 1. health
    const health = await fetch(`${base}/health`)
    assert.equal(health.status, 200)
    const healthBody = (await health.json()) as { status: string }
    assert.equal(healthBody.status, 'ok')
    console.log('[smoke] /health ok')

    // 2. 任务通关全流程
    await runTaskReviewScenario(base)

    console.log('\n[smoke] ALL PASSED ✓')
  } finally {
    server.close()
    await upstream.close()
  }
}

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

async function runTaskReviewScenario(base: string): Promise<void> {
  const admin = { 'content-type': 'application/json', 'x-admin-key': 'test-admin-key' }

  // 访问码登录流程
  const codeCreate = await fetch(`${base}/admin/access-codes`, {
    method: 'POST',
    headers: admin,
    body: JSON.stringify({ code: 'ABC123', remark: '冒烟测试' }),
  })
  assert.equal(codeCreate.status, 201)
  console.log('[smoke] admin create access code ok')

  // 错误访问码 → 401
  const badLogin = await fetch(`${base}/auth/access-code`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'WRONG' }),
  })
  assert.equal(badLogin.status, 401)
  console.log('[smoke] access code login 401 ok')

  // 未登录访问用户接口 → 401
  const noToken = await fetch(`${base}/tasks`)
  assert.equal(noToken.status, 401)
  console.log('[smoke] user auth 401 ok')

  const loginRes = await fetch(`${base}/auth/access-code`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'ABC123' }),
  })
  assert.equal(loginRes.status, 200)
  const { token } = ((await loginRes.json()) as { data: { token: string } }).data
  assert.ok(token.length > 0)
  const user = { 'content-type': 'application/json', Authorization: `Bearer ${token}` }
  console.log('[smoke] access code login ok')

  // 创建任务（2 环节）
  const createRes = await fetch(`${base}/admin/tasks`, {
    method: 'POST',
    headers: admin,
    body: JSON.stringify({
      title: '冒烟任务',
      description: '测试用',
      passCode: '123456',
      stages: [
        { title: '环节一（自动）', reviewType: 'auto' },
        { title: '环节二（LLM）', reviewType: 'llm', reviewPrompt: '图中必须有天空' },
      ],
    }),
  })
  assert.equal(createRes.status, 201)
  const task = (
    (await createRes.json()) as {
      data: { id: number; status: string; stages: Array<{ id: number; order: number }> }
    }
  ).data
  assert.equal(task.stages.length, 2)
  console.log('[smoke] admin create task ok')

  // 未配置审核标准被拒绝
  const badTask = await fetch(`${base}/admin/tasks`, {
    method: 'POST',
    headers: admin,
    body: JSON.stringify({
      title: '坏任务',
      description: 'x',
      stages: [{ title: 's', reviewType: 'llm', reviewPrompt: '' }],
    }),
  })
  assert.equal(badTask.status, 400, '大模型审核类型缺少审核提示词应被拒绝')
  console.log('[smoke] invalid task (llm without prompt) 400 ok')

  // 未带 admin key 被拒绝
  const noKey = await fetch(`${base}/admin/tasks`)
  assert.equal(noKey.status, 403)
  console.log('[smoke] admin auth 403 ok')

  // 发布
  const publishRes = await fetch(`${base}/admin/tasks/${task.id}/publish`, { method: 'POST', headers: admin })
  assert.equal(publishRes.status, 200)
  const publishBody = (await publishRes.json()) as { data: { status: string } }
  assert.equal(publishBody.data.status, 'published')
  console.log('[smoke] publish ok')

  // 上传图片
  const form = new FormData()
  form.append('file', new File([PNG_1PX], 'test.png', { type: 'image/png' }))
  const uploadRes = await fetch(`${base}/uploads`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  assert.equal(uploadRes.status, 200)
  const imageUrl = ((await uploadRes.json()) as { data: { url: string } }).data.url
  assert.ok(imageUrl.startsWith('/uploads/'))
  console.log('[smoke] upload ok')

  // 静态可访问
  const staticRes = await fetch(`${base}${imageUrl}`)
  assert.equal(staticRes.status, 200)
  console.log('[smoke] static image ok')

  // 空图片数组 → 400
  const badCount = await fetch(`${base}/tasks/${task.id}/stages/${task.stages[0]!.id}/submissions`, {
    method: 'POST',
    headers: user,
    body: JSON.stringify({ images: [] }),
  })
  assert.equal(badCount.status, 400)
  console.log('[smoke] empty images 400 ok')

  // 逐环节提交并等待审核
  for (const stage of task.stages) {
    const submitRes = await fetch(`${base}/tasks/${task.id}/stages/${stage.id}/submissions`, {
      method: 'POST',
      headers: user,
      body: JSON.stringify({ images: [imageUrl] }),
    })
    assert.equal(submitRes.status, 201)
    const { id } = ((await submitRes.json()) as { data: { id: number } }).data
    const submission = await waitForVerdict(base, id, user)
    assert.equal(submission.status, 'passed', `环节 ${stage.order} 应通过`)
    assert.equal(submission.aiResult?.passed, true)
    console.log(`[smoke] stage ${stage.order} review passed ok`)
  }

  // 通关码：6 位数字且幂等
  const codeRes = await fetch(`${base}/tasks/${task.id}/passcode`, { headers: user })
  const codeBody = (await codeRes.json()) as {
    data: { passCode: string; completedAt: number }
  }
  const { passCode, completedAt } = codeBody.data
  assert.equal(passCode, '123456')
  assert.ok(completedAt > 0)
  const codeRes2 = await fetch(`${base}/tasks/${task.id}/passcode`, { headers: user })
  const codeBody2 = (await codeRes2.json()) as { data: { passCode: string } }
  assert.equal(codeBody2.data.passCode, passCode)
  console.log(`[smoke] passcode ${passCode} ok`)

  // 通关后禁止再提交
  const locked = await fetch(`${base}/tasks/${task.id}/stages/${task.stages[0]!.id}/submissions`, {
    method: 'POST',
    headers: user,
    body: JSON.stringify({ images: [imageUrl] }),
  })
  assert.equal(locked.status, 409)
  console.log('[smoke] completed lock 409 ok')

  // 管理验收概览
  const statsRes = await fetch(`${base}/admin/tasks/${task.id}/stats`, { headers: admin })
  assert.equal(statsRes.status, 200)
  const stats = (
    (await statsRes.json()) as {
      data: {
        completed: { passCode: string; completedAt: number } | null
        stages: Array<{ passed: number }>
      }
    }
  ).data
  assert.equal(stats.completed?.passCode, passCode)
  assert.equal(stats.stages[0]?.passed, 1)
  console.log('[smoke] admin stats ok')
}

async function waitForVerdict(
  base: string,
  submissionId: number,
  user: Record<string, string>,
): Promise<{ status: string; aiResult?: { passed?: boolean } | null }> {
  for (let i = 0; i < 30; i += 1) {
    const res = await fetch(`${base}/submissions/${submissionId}`, { headers: user })
    const row = (
      (await res.json()) as {
        data: { status: string; aiResult?: { passed?: boolean } | null }
      }
    ).data
    if (row.status === 'passed' || row.status === 'rejected') return row
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('审核超时')
}

main().catch((err) => {
  console.error('[smoke] FAILED:', err)
  process.exitCode = 1
})
