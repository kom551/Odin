/**
 * 安全访问 localStorage 的封装。
 * 部分手机浏览器（iOS Safari「阻止所有 Cookie」、无痕模式、某些微信 WebView）
 * 访问 localStorage 会抛 SecurityError，直接调用会导致应用白屏。
 * 这里统一 try/catch，并在 localStorage 不可用时回退到内存存储。
 */

const memory = new Map<string, string>()

function resolveStorage(): Storage | null {
  try {
    const key = '__odin_storage_probe__'
    window.localStorage.setItem(key, '1')
    window.localStorage.removeItem(key)
    return window.localStorage
  } catch {
    return null
  }
}

const storage = resolveStorage()

export function storageGet(key: string): string {
  if (storage) {
    try {
      return storage.getItem(key) ?? ''
    } catch {
      return memory.get(key) ?? ''
    }
  }
  return memory.get(key) ?? ''
}

export function storageSet(key: string, value: string): void {
  if (storage) {
    try {
      storage.setItem(key, value)
      return
    } catch {
      // 写入失败回退内存
    }
  }
  memory.set(key, value)
}

export function storageRemove(key: string): void {
  if (storage) {
    try {
      storage.removeItem(key)
      return
    } catch {
      // 忽略
    }
  }
  memory.delete(key)
}
