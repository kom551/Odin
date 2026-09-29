/* global module, __dirname */
/** PM2 进程管理配置：pnpm --filter @odin/api build 之后使用 */
module.exports = {
  apps: [
    {
      name: 'odin-api',
      cwd: __dirname,
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '300M',
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
