<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import {
  adminGetTaskStats,
  adminListProgress,
  adminListSubmissions,
  adminResetProgress,
  type ProgressRow,
  type SubmissionRow,
  type TaskStats,
} from '@/api/taskReview'

const props = defineProps<{ id: string }>()

const taskId = computed(() => Number(props.id))
const stats = ref<TaskStats | null>(null)
const submissions = ref<SubmissionRow[]>([])
const progressRows = ref<ProgressRow[]>([])
const loading = ref(true)
const error = ref('')

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [statsRes, subsRes, progRes] = await Promise.all([
      adminGetTaskStats(taskId.value),
      adminListSubmissions({ taskId: taskId.value }),
      adminListProgress({ taskId: taskId.value }),
    ])
    stats.value = statsRes.data
    submissions.value = subsRes.data
    progressRows.value = progRes.data
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
    <RouterLink to="/father/tasks" class="text-sm text-slate-500 hover:text-brand">← 返回任务管理</RouterLink>
    <p v-if="error" class="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{{ error }}</p>
    <p v-if="loading" class="mt-6 text-sm text-slate-400">加载中...</p>

    <template v-if="stats">
      <h1 class="mt-3 text-2xl font-bold text-ink">{{ stats.task.title }}</h1>
      <p v-if="stats.task.passCode" class="mt-1 font-mono text-lg font-bold text-brand">通关码：{{ stats.task.passCode }}</p>
      <p class="mt-1 text-sm text-slate-500">{{ stats.task.description }}</p>

      <!-- 通关情况 -->
      <section class="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 class="font-bold text-ink">通关情况</h2>
        <div v-if="!stats.completed" class="mt-2 text-sm text-slate-400">暂无通关</div>
        <div v-else class="mt-3 rounded-xl border border-slate-100 px-4 py-3 text-sm">
          <div class="flex items-center justify-between">
            <span class="text-slate-500">通关码</span>
            <span class="font-mono text-lg font-bold text-brand">{{ stats.completed.passCode }}</span>
          </div>
          <div class="mt-1 flex items-center justify-between">
            <span class="text-slate-500">完成时间</span>
            <span class="text-slate-600">{{ stats.completed.completedAt ? new Date(stats.completed.completedAt).toLocaleString() : '-' }}</span>
          </div>
        </div>
      </section>

      <!-- 环节统计 -->
      <section class="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 class="font-bold text-ink">环节统计</h2>
        <table class="mt-3 w-full text-sm">
          <thead>
            <tr class="text-left text-slate-400">
              <th class="py-1">环节</th>
              <th class="py-1">提交数</th>
              <th class="py-1">通过数</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="stage in stats.stages" :key="stage.stageId" class="border-t border-slate-100">
              <td class="py-2">{{ stage.order }}. {{ stage.title }}</td>
              <td class="py-2">{{ stage.submitted }}</td>
              <td class="py-2 text-emerald-600">{{ stage.passed }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- 任务进度 -->
      <section class="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 class="font-bold text-ink">任务进度</h2>
        <div class="mt-3 space-y-2">
          <div v-for="row in progressRows" :key="row.id" class="flex items-center justify-between rounded-lg border border-slate-100 px-4 py-2 text-sm">
            <div>
              <span class="rounded-full px-2 py-0.5 text-xs" :class="row.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'">
                {{ row.status }}（当前环节 {{ row.currentStageOrder }}）
              </span>
            </div>
            <button v-if="row.status === 'in_progress'" class="rounded-lg bg-red-50 px-3 py-1 text-xs text-red-600 hover:bg-red-100" @click="adminResetProgress(row.id).then(load)">
              重置进度
            </button>
          </div>
        </div>
      </section>

      <!-- 提交记录 -->
      <section class="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 class="font-bold text-ink">提交记录</h2>
        <div class="mt-3 space-y-2">
          <div v-for="sub in submissions" :key="sub.id" class="rounded-lg border border-slate-100 px-4 py-3 text-sm">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-slate-400">{{ sub.stageTitle }} · 第 {{ sub.attempt }} 次尝试</span>
              <span class="rounded-full px-2 py-0.5 text-xs" :class="sub.status === 'passed' ? 'bg-emerald-100 text-emerald-700' : sub.status === 'rejected' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'">
                {{ sub.status }}{{ sub.autoRejected ? '（自动降级）' : '' }}
              </span>
            </div>
            <p v-if="sub.aiResult" class="mt-1 text-xs text-slate-500">
              {{ sub.aiResult.summary }}
              <span v-if="sub.aiResult.issues?.length"> · issues: {{ sub.aiResult.issues.join('；') }}</span>
            </p>
            <div v-if="sub.images?.length" class="mt-1 flex gap-2">
              <img v-for="img in sub.images" :key="img" :src="img" class="h-16 w-16 rounded object-cover" alt="提交图片" />
            </div>
          </div>
        </div>
      </section>
    </template>
  </main>
</template>
