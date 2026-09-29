<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'

import {
  adminArchiveTask,
  adminCreateTask,
  adminGetTask,
  adminListTasks,
  adminPublishTask,
  adminUpdateTask,
  getAdminKey,
  setAdminKey,
  type TaskRow,
} from '@/api/taskReview'

const adminKey = ref(getAdminKey())
const tasks = ref<TaskRow[]>([])
const loading = ref(true)
const error = ref('')
const saving = ref(false)
const showCreate = ref(false)
const editingId = ref<number | null>(null)

const form = reactive({
  title: '',
  description: '',
  passCode: '',
  stages: [] as Array<{
    title: string
    reviewType: 'auto' | 'llm'
    reviewPrompt: string
  }>,
})

function saveKey(): void {
  setAdminKey(adminKey.value.trim())
  void load()
}

function addStage(): void {
  form.stages.push({
    title: '',
    reviewType: 'auto',
    reviewPrompt: '',
  })
}

function removeStage(index: number): void {
  form.stages.splice(index, 1)
}

function resetForm(): void {
  form.title = ''
  form.description = ''
  form.passCode = ''
  form.stages = []
}

function toggleCreate(): void {
  if (showCreate.value) {
    showCreate.value = false
    editingId.value = null
    resetForm()
    return
  }
  editingId.value = null
  resetForm()
  showCreate.value = true
}

async function openEdit(taskId: number): Promise<void> {
  saving.value = true
  error.value = ''
  try {
    const res = await adminGetTask(taskId)
    const task = res.data
    form.title = task.title
    form.description = task.description
    form.passCode = task.passCode ?? ''
    form.stages = (task.stages ?? []).map((stage) => ({
      title: stage.title,
      reviewType: stage.reviewType,
      reviewPrompt: stage.reviewPrompt ?? '',
    }))
    editingId.value = taskId
    showCreate.value = true
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}

async function saveTask(): Promise<void> {
  if (!form.title.trim() || form.stages.length === 0) {
    error.value = '请填写标题并至少添加一个环节'
    return
  }
  if (!/^\d{6}$/.test(form.passCode.trim())) {
    error.value = '通关码必须为 6 位数字'
    return
  }
  saving.value = true
  error.value = ''
  try {
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      passCode: form.passCode.trim(),
      stages: form.stages.map((stage) => ({
        title: stage.title.trim(),
        reviewType: stage.reviewType,
        reviewPrompt: stage.reviewPrompt.trim() || undefined,
      })),
    }
    if (editingId.value !== null) {
      await adminUpdateTask(editingId.value, payload)
    } else {
      await adminCreateTask(payload)
    }
    resetForm()
    editingId.value = null
    showCreate.value = false
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const res = await adminListTasks()
    tasks.value = res.data
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <main class="mx-auto min-h-screen max-w-4xl px-6 py-10">
    <div class="flex items-center justify-between">
      <div>
        <RouterLink to="/father" class="text-sm text-slate-500 hover:text-brand">← 返回管理首页</RouterLink>
        <h1 class="mt-2 text-2xl font-bold text-ink">管理页面 · 任务管理</h1>
      </div>
      <div class="flex items-center gap-3">
        <RouterLink to="/father/access-codes" class="text-sm text-slate-500 hover:text-brand">访问码管理 →</RouterLink>
        <RouterLink to="/" class="text-sm text-slate-500 hover:text-brand">用户端 →</RouterLink>
      </div>
    </div>

    <div class="mt-4 flex items-center gap-2">
      <input
        v-model="adminKey"
        type="password"
        placeholder="ADMIN_KEY"
        class="w-48 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
      />
      <button class="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-200" @click="saveKey">
        保存
      </button>
      <button class="ml-auto rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark" @click="toggleCreate">
        {{ showCreate ? '收起' : '新建任务' }}
      </button>
    </div>

    <p v-if="error" class="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{{ error }}</p>

    <!-- 新建任务 -->
    <section v-if="showCreate" class="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
      <div class="flex items-center justify-between">
        <h2 class="font-bold text-ink">{{ editingId !== null ? '编辑任务' : '新建任务' }}</h2>
        <span v-if="editingId !== null" class="text-xs text-slate-400">正在编辑草稿 #{{ editingId }}</span>
      </div>
      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <input v-model="form.title" placeholder="任务标题" class="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none" />
        <input v-model="form.passCode" placeholder="通关码（6 位数字）" maxlength="6" class="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none" />
      </div>
      <textarea v-model="form.description" rows="2" placeholder="任务说明" class="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none" />
      <div class="mt-5 space-y-4">
        <div v-for="(stage, index) in form.stages" :key="index" class="rounded-xl border border-slate-200 p-4">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold text-ink">环节 {{ index + 1 }}</h3>
            <button class="text-xs text-red-500 hover:underline" @click="removeStage(index)">删除</button>
          </div>
          <div class="mt-2 grid gap-2 sm:grid-cols-2">
            <input v-model="stage.title" placeholder="环节标题" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <select v-model="stage.reviewType" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="auto">上传图片即可（自动通过）</option>
              <option value="llm">大模型审核</option>
            </select>
          </div>
          <textarea
            v-if="stage.reviewType === 'llm'"
            v-model="stage.reviewPrompt"
            rows="2"
            placeholder="审核提示词（大模型审核类型必填）"
            class="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button class="rounded-lg border border-dashed border-slate-300 px-4 py-2 text-sm text-slate-500 hover:border-brand hover:text-brand" @click="addStage">
          + 添加环节
        </button>
      </div>

      <button class="mt-5 rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50" :disabled="saving" @click="saveTask">
        {{ saving ? (editingId !== null ? '保存中...' : '创建中...') : editingId !== null ? '保存修改' : '创建任务（草稿）' }}
      </button>
    </section>

    <!-- 任务列表 -->
    <p v-if="loading" class="mt-8 text-sm text-slate-400">加载中...</p>
    <div class="mt-6 space-y-3">
      <div v-for="task in tasks" :key="task.id" class="rounded-xl border border-slate-200 bg-white p-5">
        <div class="flex items-center justify-between">
          <div>
            <span class="mr-2 rounded-full px-2 py-0.5 text-xs font-semibold" :class="task.status === 'published' ? 'bg-emerald-100 text-emerald-700' : task.status === 'draft' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'">
              {{ task.status }}
            </span>
            <RouterLink :to="`/father/tasks/${task.id}`" class="font-bold text-ink hover:text-brand">{{ task.title }}</RouterLink>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-slate-400">{{ task.stageCount }} 环节 · {{ task.userCount }} 人参与</span>
            <button v-if="task.status === 'draft'" class="rounded-lg bg-slate-100 px-3 py-1 text-xs text-slate-600 hover:bg-slate-200" @click="openEdit(task.id)">
              编辑
            </button>
            <button v-if="task.status === 'draft'" class="rounded-lg bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-700" @click="adminPublishTask(task.id).then(load)">
              发布
            </button>
            <button v-if="task.status === 'published'" class="rounded-lg bg-slate-500 px-3 py-1 text-xs text-white hover:bg-slate-600" @click="adminArchiveTask(task.id).then(load)">
              归档
            </button>
          </div>
        </div>
        <p v-if="task.passCode" class="mt-1 font-mono text-sm text-brand">通关码：{{ task.passCode }}</p>
        <p class="mt-2 line-clamp-2 text-sm text-slate-500">{{ task.description }}</p>
      </div>
    </div>
  </main>
</template>
