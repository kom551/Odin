import { fileURLToPath } from 'node:url'

/**
 * 加载 apps/api/.env（tsx / node 都不会自动加载）。
 * 已存在的环境变量不会被覆盖；文件不存在时静默忽略。
 */
export function loadEnv(): void {
  const envPath = fileURLToPath(new URL('../.env', import.meta.url))
  try {
    process.loadEnvFile(envPath)
  } catch {
    // .env 不存在时忽略，环境变量可经 shell 注入
  }
}
