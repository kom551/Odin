<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import { accessCodeLogout } from '@/api/auth'
import { listTasks, type TaskRow } from '@/api/taskReview'

const tasks = ref<TaskRow[]>([])
const loading = ref(true)
const error = ref('')
const router = useRouter()

onMounted(async () => {
  try {
    const res = await listTasks()
    tasks.value = res.data
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
})

async function logout(): Promise<void> {
  await accessCodeLogout()
  await router.replace('/access')
}
</script>

<template>
  <main class="min-h-screen-dvh bg-slate-50">
    <header class="safe-top sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
      <div class="flex items-center justify-between">
        <span class="w-12" />
        <h1 class="text-base font-bold text-ink">任务大厅</h1>
        <button class="shrink-0 text-sm text-slate-500 active:text-brand" @click="logout">退出</button>
      </div>
    </header>

    <p v-if="error" class="mx-4 mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{{ error }}</p>
    <p v-if="loading" class="mt-12 text-center text-sm text-slate-400">加载中...</p>
    <p v-if="!loading && tasks.length === 0" class="mt-12 px-4 text-center text-sm text-slate-400">
      暂无已发布任务
    </p>

    <div class="space-y-3 px-4 py-4">
      <RouterLink
        v-for="task in tasks"
        :key="task.id"
        :to="`/tasks/${task.id}`"
        class="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition active:scale-[0.99]"
      >
        <div class="flex items-start justify-between gap-3">
          <h2 class="text-base font-bold leading-snug text-ink">{{ task.title }}</h2>
          <span class="shrink-0 rounded-full bg-brand-light px-2.5 py-1 text-xs font-semibold text-brand">
            {{ task.stageCount }} 环节
          </span>
        </div>
        <p class="mt-1.5 line-clamp-2 text-sm leading-relaxed text-slate-500">{{ task.description }}</p>
        <div class="mt-2 flex items-center justify-between text-sm">
          <span class="text-slate-400">点击进入，逐环节上传图片</span>
          <span class="font-semibold text-brand">进入 ›</span>
        </div>
      </RouterLink>
    </div>
  </main>
</template>
