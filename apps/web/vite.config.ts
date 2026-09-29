import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import legacy from '@vitejs/plugin-legacy'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const basePath = env.VITE_APP_BASE_PATH || env.VITE_PUBLIC_PATH || '/'
  const devPort = Number(env.VITE_DEV_PORT || 5173)
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3001'

  return {
    base: basePath,
    plugins: [
      vue(),
      // 兼容微信内置 WebView（iOS WKWebView / Android X5 内核）等旧浏览器：
      // 语法降级到 ES2015，并对现代 bundle 注入 core-js 运行时 polyfill，
      // 另产出一份 SystemJS 版 legacy chunk 兜底不支持 <script type="module"> 的环境。
      legacy({
        targets: [
          'defaults',
          'not IE 11',
          'iOS >= 10',
          'Android >= 5',
          'Chrome >= 57',
          'Safari >= 10',
        ],
        modernPolyfills: true,
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      open: false,
      host: env.VITE_DEV_HOST || 'localhost',
      port: Number.isFinite(devPort) ? devPort : 5173,
      strictPort: String(env.VITE_STRICT_PORT || 'false') === 'true',
      proxy: {
        // 与 nginx.proxy.conf 保持一致：/api 前缀转发到网关并去掉前缀
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
    build: {
      sourcemap: mode !== 'production',
    },
  }
})
