<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'

import {
  adminCreateAccessCode,
  adminListAccessCodes,
  adminUpdateAccessCode,
  type AccessCodeRow,
} from '@/api/accessCodes'

const rows = ref<AccessCodeRow[]>([])
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const form = reactive({
  code: '',
  remark: '',
})

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const res = await adminListAccessCodes()
    rows.value = res.data
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function create(): Promise<void> {
  saving.value = true
  error.value = ''
  try {
    await adminCreateAccessCode({
      code: form.code.trim() || undefined,
      remark: form.remark.trim() || undefined,
    })
    form.code = ''
    form.remark = ''
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}

async function toggle(row: AccessCodeRow): Promise<void> {
  error.value = ''
  try {
    await adminUpdateAccessCode(row.id, {
      status: row.status === 'active' ? 'disabled' : 'active',
    })
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function copyCode(code: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(code)
  } catch {
    // 剪贴板不可用时忽略
  }
}
</script>

<template>
  <main class="mx-auto min-h-screen max-w-3xl px-6 py-10">
    <div class="flex items-center justify-between">
      <div>
        <RouterLink to="/father/tasks" class="text-sm text-slate-500 hover:text-brand">← 返回任务管理</RouterLink>
        <h1 class="mt-2 text-2xl font-bold text-ink">管理页面 · 访问码管理</h1>
      </div>
    </div>

    <p class="mt-2 text-sm text-slate-500">
      访问码用于客户端登录：用户打开客户端时需先输入有效访问码，才能进入任务。
    </p>

    <p v-if="error" class="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{{ error }}</p>

    <!-- 创建 -->
    <section class="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
      <h2 class="font-bold text-ink">新建访问码</h2>
      <div class="mt-3 flex flex-wrap items-center gap-3">
        <input
          v-model="form.code"
          placeholder="自定义访问码（留空自动生成 6 位）"
          maxlength="32"
          class="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
        <input
          v-model="form.remark"
          placeholder="备注（如：第一批用户）"
          maxlength="100"
          class="w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
        <button
          class="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          :disabled="saving"
          @click="create"
        >
          {{ saving ? '创建中...' : '创建' }}
        </button>
      </div>
    </section>

    <!-- 列表 -->
    <p v-if="loading" class="mt-8 text-sm text-slate-400">加载中...</p>
    <div class="mt-6 space-y-3">
      <div v-for="row in rows" :key="row.id" class="rounded-xl border border-slate-200 bg-white p-5">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <span class="font-mono text-lg font-bold text-brand">{{ row.code }}</span>
            <span
              class="rounded-full px-2 py-0.5 text-xs font-semibold"
              :class="row.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'"
            >
              {{ row.status === 'active' ? '启用中' : '已停用' }}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <button class="rounded-lg bg-slate-100 px-3 py-1 text-xs text-slate-600 hover:bg-slate-200" @click="copyCode(row.code)">
              复制
            </button>
            <button
              class="rounded-lg px-3 py-1 text-xs text-white"
              :class="row.status === 'active' ? 'bg-slate-500 hover:bg-slate-600' : 'bg-emerald-600 hover:bg-emerald-700'"
              @click="toggle(row)"
            >
              {{ row.status === 'active' ? '停用' : '启用' }}
            </button>
          </div>
        </div>
        <p class="mt-1 text-sm text-slate-500">{{ row.remark || '（无备注）' }}</p>
        <p class="mt-1 text-xs text-slate-400">创建于 {{ new Date(row.createdAt).toLocaleString() }}</p>
      </div>
      <p v-if="!loading && rows.length === 0" class="mt-6 text-sm text-slate-400">暂无访问码，请先创建。</p>
    </div>
  </main>
</template>
