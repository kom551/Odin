<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { accessCodeLogin } from '@/api/auth'
import { setAccessToken } from '@/api/token'

const router = useRouter()
const route = useRoute()
const code = ref('')
const loading = ref(false)
const error = ref('')

async function submit(): Promise<void> {
  const value = code.value.trim()
  if (!value) {
    error.value = '请输入访问码'
    return
  }
  loading.value = true
  error.value = ''
  try {
    const { token } = await accessCodeLogin(value)
    setAccessToken(token)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await router.replace(redirect)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="flex min-h-screen-dvh flex-col items-center justify-center bg-slate-50 px-6">
    <div class="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div class="text-center">
        <div class="text-5xl">🎫</div>
        <h1 class="mt-3 text-xl font-extrabold text-ink">输入访问码</h1>
        <p class="mt-1 text-sm text-slate-500">请输入管理端发放的访问码以进入任务</p>
      </div>

      <input
        v-model="code"
        placeholder="访问码"
        maxlength="32"
        class="mt-5 w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-lg tracking-[0.3em] focus:border-brand focus:outline-none"
        @keyup.enter="submit"
      />
      <p v-if="error" class="mt-3 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600">{{ error }}</p>
      <button
        class="mt-4 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white active:bg-brand-dark disabled:opacity-50"
        :disabled="loading"
        @click="submit"
      >
        {{ loading ? '验证中...' : '进入' }}
      </button>
    </div>
  </main>
</template>
