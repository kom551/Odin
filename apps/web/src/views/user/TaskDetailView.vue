<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import {
  getPasscode,
  getSubmission,
  getTask,
  submitStage,
  uploadImage,
  type ProgressRow,
  type StageRow,
  type SubmissionRow,
} from '@/api/taskReview'

const props = defineProps<{ id: string }>()

const taskId = computed(() => Number(props.id))
const loading = ref(true)
const error = ref('')
const task = ref<{
  task: { id: number; title: string; description: string }
  stages: StageRow[]
  progress: ProgressRow | null
  currentStage: StageRow | null
} | null>(null)

interface PendingImage {
  file: File
  url: string
}

/** 超过该大小（1MB）的图片先压缩再上传，避免手机相机照片触发网关上/下限流 */
const COMPRESS_THRESHOLD = 1024 * 1024
const MAX_EDGE = 1920
const JPEG_QUALITY = 0.85

/** 图片压缩：缩小到 MAX_EDGE 内并转 JPEG；任何失败都回退为原文件 */
async function compressForUpload(file: File): Promise<File> {
  if (file.size <= COMPRESS_THRESHOLD) return file
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return file
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.(png|webp)$/i, '.jpg'), {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    })
  } catch {
    return file
  }
}

const pendingImages = ref<PendingImage[]>([])
const submittedImages = ref<string[]>([])
const submittedStageId = ref<number | null>(null)
const submitting = ref(false)
const polling = ref(false)
const lastVerdict = ref<SubmissionRow | null>(null)
const passcode = ref<{ passCode: string | null; completedAt: number | null } | null>(null)
const viewer = ref<{ images: string[]; index: number } | null>(null)

const stageCount = computed(() => task.value?.stages.length ?? 0)
const currentOrder = computed(() => task.value?.progress?.currentStageOrder ?? 1)
const completed = computed(() => task.value?.progress?.status === 'completed')
/** 当前要提交的环节：已有进度取进度环节，否则从第 1 环节开始 */
const activeStage = computed(() => task.value?.currentStage ?? task.value?.stages[0] ?? null)
/** 已提交图片：优先用本次提交记录，兜底用审核结果中的图片 */
const displaySubmittedImages = computed<string[]>(() => {
  if (submittedImages.value.length > 0) return submittedImages.value
  return lastVerdict.value?.images ?? []
})

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const res = await getTask(taskId.value)
    task.value = res.data
    if (res.data.progress?.status === 'completed') {
      const code = await getPasscode(taskId.value)
      passcode.value = code.data
    } else {
      passcode.value = null
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

onMounted(load)

onBeforeUnmount(() => {
  pendingImages.value.forEach((item) => URL.revokeObjectURL(item.url))
})

/** 追加选择图片（可多次选择，数量不限），按 名称+大小+修改时间 去重 */
async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  const seen = new Set(
    pendingImages.value.map((item) => `${item.file.name}|${item.file.size}|${item.file.lastModified}`),
  )
  for (const file of files) {
    const key = `${file.name}|${file.size}|${file.lastModified}`
    if (seen.has(key)) continue
    seen.add(key)
    const compressed = await compressForUpload(file)
    pendingImages.value.push({ file: compressed, url: URL.createObjectURL(compressed) })
  }
  input.value = ''
}

/** 删除一张已选图片（提交前） */
function removePendingImage(index: number): void {
  const [removed] = pendingImages.value.splice(index, 1)
  if (removed) URL.revokeObjectURL(removed.url)
}

function clearPendingImages(): void {
  pendingImages.value.forEach((item) => URL.revokeObjectURL(item.url))
  pendingImages.value = []
}

async function submit(): Promise<void> {
  const stage = activeStage.value
  if (!stage || submitting.value || polling.value) return
  if (pendingImages.value.length < 1) {
    error.value = '请至少上传一张图片'
    return
  }

  submitting.value = true
  error.value = ''
  try {
    const urls: string[] = []
    for (const item of pendingImages.value) {
      const up = await uploadImage(item.file)
      const url = up.data?.url
      if (!url) throw new Error(up.message || '图片上传失败，请重试')
      urls.push(url)
    }
    const sub = await submitStage(taskId.value, stage.id, { images: urls })
    submittedStageId.value = stage.id
    const detail = await getSubmission(sub.data.id)
    submittedImages.value = detail.data.images
    clearPendingImages()
    await pollSubmission(sub.data.id)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    submitting.value = false
  }
}

async function pollSubmission(id: number): Promise<void> {
  polling.value = true
  try {
    for (let i = 0; i < 40; i += 1) {
      await new Promise((r) => setTimeout(r, 1500))
      const res = await getSubmission(id)
      if (res.data.status === 'passed' || res.data.status === 'rejected') {
        lastVerdict.value = res.data
        await load()
        return
      }
    }
    error.value = '审核超时，请稍后刷新查看'
  } finally {
    polling.value = false
  }
}

/** 全屏查看图片 */
function openViewer(images: string[], index: number): void {
  viewer.value = { images, index }
}

function closeViewer(): void {
  viewer.value = null
}

function viewerPrev(): void {
  if (!viewer.value) return
  viewer.value = {
    ...viewer.value,
    index: (viewer.value.index - 1 + viewer.value.images.length) % viewer.value.images.length,
  }
}

function viewerNext(): void {
  if (!viewer.value) return
  viewer.value = {
    ...viewer.value,
    index: (viewer.value.index + 1) % viewer.value.images.length,
  }
}
</script>

<template>
  <main class="min-h-screen-dvh bg-slate-50 pb-36">
    <!-- 顶部栏 -->
    <header class="safe-top sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
      <div class="flex items-center justify-between">
        <RouterLink to="/" class="flex shrink-0 items-center gap-0.5 text-sm text-slate-500 active:text-brand">
          <span class="text-xl leading-none">‹</span> 任务大厅
        </RouterLink>
        <h1 class="min-w-0 truncate px-2 text-center text-base font-bold text-ink">
          {{ task?.task.title ?? '任务详情' }}
        </h1>
        <span class="w-16 shrink-0" />
      </div>
    </header>

    <p v-if="error" class="mx-4 mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{{ error }}</p>
    <p v-if="loading" class="mt-12 text-center text-sm text-slate-400">加载中...</p>

    <!-- 通关完成流程 -->
    <template v-if="task && completed">
      <div class="flex flex-col items-center px-6 pt-10 text-center">
        <div class="text-6xl">🎉</div>
        <h2 class="mt-4 text-2xl font-extrabold text-ink">恭喜通关！</h2>
        <p class="mt-2 text-sm text-slate-500">你已完成「{{ task.task.title }}」全部 {{ stageCount }} 个环节</p>

        <div class="mt-8 w-full rounded-2xl border-2 border-brand bg-brand-light p-8">
          <p class="text-sm font-semibold text-brand">通关信息</p>
          <p class="mt-3 font-mono text-5xl font-extrabold tracking-[0.4em] text-brand-dark">
            {{ passcode?.passCode ?? '······' }}
          </p>
          <p v-if="passcode?.completedAt" class="mt-4 text-xs text-slate-500">
            完成时间：{{ new Date(passcode.completedAt).toLocaleString() }}
          </p>
        </div>

        <div class="mt-8 w-full space-y-2">
          <div
            v-for="stage in task.stages"
            :key="stage.id"
            class="flex items-center gap-3 rounded-xl bg-white px-4 py-3 text-left"
          >
            <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-600">✓</span>
            <span class="text-sm font-medium text-ink">{{ stage.order }}. {{ stage.title }}</span>
          </div>
        </div>

        <RouterLink
          to="/"
          class="mt-10 w-full rounded-xl bg-brand py-3.5 text-center text-sm font-semibold text-white active:bg-brand-dark"
        >
          返回任务大厅
        </RouterLink>
      </div>
    </template>

    <!-- 进行中流程 -->
    <template v-else-if="task">
      <div class="space-y-4 px-4 pt-4">
        <!-- 任务说明 -->
        <section class="rounded-2xl border border-slate-200 bg-white p-4">
          <p class="text-sm leading-relaxed text-slate-600">{{ task.task.description }}</p>
        </section>

        <!-- 环节进度 -->
        <section class="rounded-2xl border border-slate-200 bg-white p-4">
          <div class="flex items-center justify-between text-sm">
            <span class="font-bold text-ink">任务进度</span>
            <span class="text-slate-400">{{ currentOrder }} / {{ stageCount }} 环节</span>
          </div>
          <div class="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              class="h-full rounded-full bg-brand transition-all"
              :style="{ width: (Math.min(currentOrder, stageCount) / Math.max(stageCount, 1)) * 100 + '%' }"
            />
          </div>
          <div class="mt-3 flex items-center gap-2">
            <div
              v-for="stage in task.stages"
              :key="stage.id"
              class="flex flex-1 flex-col items-center gap-1"
            >
              <span
                class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                :class="
                  stage.order < currentOrder
                    ? 'bg-emerald-100 text-emerald-600'
                    : stage.order === currentOrder
                      ? 'bg-brand text-white'
                      : 'bg-slate-100 text-slate-400'
                "
              >
                {{ stage.order < currentOrder ? '✓' : stage.order }}
              </span>
              <span
                class="w-full truncate text-center text-xs"
                :class="stage.order === currentOrder ? 'font-semibold text-brand' : 'text-slate-400'"
              >
                {{ stage.title }}
              </span>
            </div>
          </div>
        </section>

        <!-- 当前环节内容 -->
        <section v-if="activeStage" class="rounded-2xl border border-brand bg-white p-4">
          <p class="text-xs font-semibold uppercase tracking-wide text-brand">当前环节 {{ currentOrder }}</p>
          <h2 class="mt-1 text-lg font-bold text-ink">{{ activeStage.title }}</h2>
          <p v-if="activeStage.description" class="mt-1.5 text-sm leading-relaxed text-slate-600">
            {{ activeStage.description }}
          </p>

          <!-- 已选图片：提交前可删除 -->
          <div v-if="pendingImages.length > 0" class="mt-4">
            <div class="flex items-center justify-between">
              <p class="text-sm font-semibold text-ink">已选图片（{{ pendingImages.length }} 张）</p>
              <span class="text-xs text-slate-400">可继续添加，数量不限</span>
            </div>
            <div class="mt-2 grid grid-cols-3 gap-2">
              <div
                v-for="(item, index) in pendingImages"
                :key="item.url"
                class="relative aspect-square overflow-hidden rounded-xl border border-slate-200"
              >
                <img :src="item.url" :alt="`待上传图片 ${index + 1}`" class="h-full w-full object-cover" />
                <button
                  type="button"
                  class="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-sm leading-none text-white active:bg-black/80"
                  aria-label="删除这张图片"
                  @click="removePendingImage(index)"
                >
                  ×
                </button>
                <span
                  class="absolute bottom-1 left-1 rounded bg-black/50 px-1.5 text-[10px] font-semibold text-white"
                >
                  {{ index + 1 }}
                </span>
              </div>
            </div>
          </div>

          <!-- 已提交图片：可查看大图 -->
          <div
            v-if="displaySubmittedImages.length > 0 && activeStage?.id === submittedStageId"
            class="mt-4"
          >
            <div class="flex items-center justify-between">
              <p class="text-sm font-semibold text-ink">已提交图片（{{ displaySubmittedImages.length }} 张）</p>
              <span class="text-xs text-slate-400">点击查看大图</span>
            </div>
            <div class="mt-2 grid grid-cols-3 gap-2">
              <button
                v-for="(img, index) in displaySubmittedImages"
                :key="img"
                type="button"
                class="relative block aspect-square overflow-hidden rounded-xl border border-slate-200 active:opacity-80"
                @click="openViewer(displaySubmittedImages, index)"
              >
                <img :src="img" :alt="`已提交图片 ${index + 1}`" class="h-full w-full object-cover" />
              </button>
            </div>
          </div>

          <div
            v-if="lastVerdict"
            class="mt-4 rounded-xl px-4 py-3 text-sm"
            :class="lastVerdict.status === 'passed' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'"
          >
            <p class="font-semibold">
              {{ lastVerdict.status === 'passed' ? '✅ 审核通过' : '❌ 未通过' }}（第 {{ lastVerdict.attempt }} 次尝试）
            </p>
            <p class="mt-1">{{ lastVerdict.aiResult?.summary }}</p>
            <ul v-if="lastVerdict.aiResult?.issues?.length" class="mt-1 list-disc pl-5">
              <li v-for="issue in lastVerdict.aiResult.issues" :key="issue">{{ issue }}</li>
            </ul>
            <p v-if="lastVerdict.status === 'passed'" class="mt-2 text-xs text-slate-500">
              正在进入下一环节…
            </p>
          </div>
        </section>
      </div>
    </template>

    <!-- 底部提交栏 -->
    <div
      v-if="task && !completed && activeStage"
      class="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur"
    >
      <div class="flex items-stretch gap-3">
        <label
          class="flex flex-1 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 px-2 py-2 text-sm text-slate-500 active:border-brand active:text-brand"
        >
          📷 选择图片
          <span class="mt-0.5 text-xs">
            {{ pendingImages.length > 0 ? '已选 ' + pendingImages.length + ' 张，继续添加' : '可多选，数量不限' }}
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            class="hidden"
            @change="onFileChange"
          />
        </label>
        <button
          class="h-14 flex-1 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition active:bg-brand-dark disabled:opacity-50"
          :disabled="submitting || polling || pendingImages.length < 1"
          @click="submit"
        >
          {{ polling ? '审核中...' : submitting ? '上传中...' : '提交审核' }}
        </button>
      </div>
    </div>

    <!-- 全屏图片查看器 -->
    <div v-if="viewer" class="fixed inset-0 z-50 flex flex-col bg-black">
      <div class="flex items-center justify-between px-4 py-3 text-white">
        <span class="text-sm">{{ viewer.index + 1 }} / {{ viewer.images.length }}</span>
        <button
          type="button"
          class="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg leading-none"
          aria-label="关闭"
          @click="closeViewer"
        >
          ✕
        </button>
      </div>
      <div class="relative flex-1 overflow-auto">
        <div class="flex min-h-full w-full">
          <img
            v-if="viewer.images[viewer.index]"
            :src="viewer.images[viewer.index]"
            :alt="`图片 ${viewer.index + 1}`"
            class="m-auto block max-w-none"
            @click.stop="closeViewer"
          />
        </div>
        <button
          v-if="viewer.images.length > 1"
          type="button"
          class="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-xl text-white"
          aria-label="上一张"
          @click.stop="viewerPrev"
        >
          ‹
        </button>
        <button
          v-if="viewer.images.length > 1"
          type="button"
          class="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-xl text-white"
          aria-label="下一张"
          @click.stop="viewerNext"
        >
          ›
        </button>
      </div>
      <p class="pb-[calc(1rem+env(safe-area-inset-bottom))] pt-1 text-center text-xs text-slate-400">
        点击图片关闭 · 左右按钮切换
      </p>
    </div>
  </main>
</template>
