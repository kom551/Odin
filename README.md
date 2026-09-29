# Odin · LLM API Gateway

前后端同构的 LLM 网关项目：Vue 3 + Vite 前端、Hono + Node 后端，通过 pnpm workspace 以 `@odin/shared` 实现类型 / schema / 业务逻辑同构。

## 技术栈

- Monorepo：pnpm workspace（`apps/*` + `packages/*`）
- 前端：Vue 3.5 · Vite 7 · TypeScript · Pinia · Vue Router · Tailwind CSS 3
- 后端：Hono 4 · @hono/node-server · tsx（开发）· tsup（构建）
- 持久化：SQLite（better-sqlite3）+ Drizzle ORM，启动时自动建库迁移
- 业务模块：任务审核系统（发布任务 → 逐环节上传图片 → LLM 视觉审核 → 6 位通关码）
- 同构：`@odin/shared`（zod schema / 模型注册表 / 类型）前后端共用
- 测试：Vitest（前端单测）· 网关冒烟测试（`pnpm smoke`）
- 大模型调用：仅作为后端审核能力（`apps/api/src/services/reviewService.ts`），不对外提供接口

## 目录结构

```text
Odin/
├── apps/
│   ├── api/                 # Hono API
│   │   ├── src/providers/   # OpenAI 兼容适配器（自定义 Base URL / 模型名 / 可选 Key）
│   │   └── src/routes/      # /health /admin/* /tasks/* /uploads/*
│   │   └── test/smoke.mts   # 端到端冒烟测试（本地 mock 上游）
│   └── web/                 # Vue 3 用户端（H5）+ 管理台
│       ├── src/api/request/ # axios 请求层封装
├── packages/
│   └── shared/              # 同构共享包：schema、模型注册表、类型
├── nginx.proxy.conf         # 生产反代配置示例
└── deploy/                  # systemd 服务单元等部署文件
```

## 快速开始

```sh
pnpm install
cp apps/api/.env.example apps/api/.env   # 填入至少一个供应商 Key
pnpm dev
```

SQLite 数据库默认生成在 `apps/api/data/odin.db`，启动时自动应用 `apps/api/drizzle/` 下的迁移；可通过 `DATABASE_PATH` 覆盖路径。

任务审核系统需要配置 `ADMIN_KEY`（管理页鉴权）与自定义大模型（OpenAI 兼容接口）：`LLM_BASE_URL`（必填）+ `LLM_MODEL`（必填），`LLM_API_KEY` 可选。

新增表结构后执行 `pnpm --filter @odin/api db:generate` 生成迁移 SQL。

- 前端：http://localhost:5173 （用户端首页 `/`，管理端 `/father/*`，需先输入访问码登录）
- API：http://localhost:3001
- 健康检查：http://localhost:3001/health

> 大模型调用仅用于任务审核（`reviewService`），不对外暴露接口。

## 自定义大模型接入

审核服务直接调用自定义 OpenAI 兼容接口（`LLM_BASE_URL` / `LLM_MODEL` / `LLM_API_KEY`，见 `apps/api/.env.example`），不依赖任何厂商 SDK 或内置模型列表。上游请求默认超时 60s，可用 `LLM_HTTP_TIMEOUT_MS` 调整，审核失败自动重试（默认 3 次，退避基数 `REVIEW_RETRY_BASE_MS`）。

## 测试

```sh
pnpm type-check   # 全仓类型检查
pnpm smoke        # 网关冒烟（本地 mock 上游，无需真实 Key）
pnpm test:unit    # 前端单测（SSE 解析）
pnpm lint         # 全仓 lint
pnpm build        # 全仓构建
```

## 部署

完整步骤见 **[docs/deployment.md](docs/deployment.md)**：包含 systemd / PM2 进程管理、Nginx + HTTPS、SQLite 备份与恢复、更新回滚、故障排查与上线检查清单。

```sh
pnpm build         # 构建前后端
pnpm start:prod    # 启动 API（node dist/index.js）
```
