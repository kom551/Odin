<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <main class="flex min-h-screen-dvh flex-col items-center px-4 py-10">
    <p class="mb-3 rounded-full bg-brand-light px-4 py-1 text-xs font-semibold text-brand">管理页面</p>
    <h1 class="text-center text-3xl font-extrabold tracking-tight text-ink">Odin <span class="text-brand">管理台</span></h1>
    <p class="mt-2 text-sm text-slate-500">管理地址请自行保密，勿对外传播。</p>

    <div class="mt-8 grid w-full max-w-md gap-3">
      <RouterLink
        to="/father/tasks"
        class="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition active:scale-[0.99]"
      >
        <div class="text-2xl">🛠️</div>
        <div>
          <div class="font-bold text-ink">任务管理</div>
          <div class="mt-0.5 text-xs text-slate-500">发布任务、编辑草稿、验收通关</div>
        </div>
      </RouterLink>

      <RouterLink
        to="/father/access-codes"
        class="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition active:scale-[0.99]"
      >
        <div class="text-2xl">🎫</div>
        <div>
          <div class="font-bold text-ink">访问码管理</div>
          <div class="mt-0.5 text-xs text-slate-500">创建/停用客户端登录访问码</div>
        </div>
      </RouterLink>
    </div>
  </main>
</template>
