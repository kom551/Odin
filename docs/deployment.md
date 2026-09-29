# Odin 生产部署指南

本文档描述把 Odin（Vue 前端 + Hono API + SQLite）部署到公共网络并提供对外服务的完整流程。
假设使用一台 Ubuntu/Debian 服务器，前端由 Nginx 托管，API 由 systemd 或 PM2 托管，全部通过 HTTPS 对外提供。

## 1. 架构

```text
用户手机浏览器
      │ HTTPS (443)
      ▼
   Nginx
   ├── /         → apps/web/dist（静态资源，Vue Router history 模式）
   └── /api/*    → 反代到 127.0.0.1:3001（Node API，去 /api 前缀）
                          │
                          ▼
                     Node API (apps/api)
                     ├── SQLite: apps/api/data/odin.db
                     └── 图片:   apps/api/data/uploads/（/uploads/* 由 API 静态托管）
```

- 前端构建产物在 `apps/web/dist`。
- API 服务 `apps/api`，默认端口 `3001`，监听 `0.0.0.0`（生产只暴露给本机 Nginx）。
- 上传图片由 API 的 `/uploads/*` 直接静态托管，URL 存 SQLite。
- 数据库默认本地 SQLite（`apps/api/data/odin.db`）；生产也可改用 Turso 托管库（见下文 `DATABASE_URL`）。

## 2. 前置要求

- Node.js **>= 22.12**（建议 22 LTS，与 CI/开发一致）。
- pnpm **>= 9**（本项目锁 `pnpm@11.23.0`）。
- 数据库使用 libSQL：本地 `file:` 模式依赖 `@libsql/client` 自带的预编译二进制；远程 Turso 为纯 HTTP，无原生编译要求。
- Nginx、可选 certbot（HTTPS 证书）。

## 3. 目录与文件说明

| 文件 | 用途 |
| --- | --- |
| `nginx.proxy.conf` | Nginx 站点配置示例（/ 静态 + /api 反代 + SSE 参数） |
| `apps/api/ecosystem.config.cjs` | PM2 进程配置 |
| `deploy/odin-api.service` | systemd 服务单元（推荐） |
| `apps/api/.env` | API 全部运行配置（密钥、端口、模型等） |
| `apps/api/drizzle/` | SQLite 迁移 SQL，API 启动时自动执行 |

## 4. 首次部署步骤

```sh
# 1) 安装依赖（服务器上有编译工具链，或提前在本机构建再上传）
pnpm install
pnpm build        # 生成 apps/web/dist 与 apps/api/dist

# 2) 配置 API 环境
cp apps/api/.env.example apps/api/.env
vim apps/api/.env
```

`apps/api/.env` 必填项：

| 变量 | 说明 |
| --- | --- |
| `ADMIN_KEY` | 管理端鉴权密钥（**必须改为强随机值**，如 `openssl rand -hex 24`） |
| `LLM_BASE_URL` | 自定义大模型 Base URL（OpenAI 兼容 chat/completions 接口，必填） |
| `LLM_MODEL` | 自定义大模型名称（必填） |
| `LLM_API_KEY` | API Key（可选；自建服务无需鉴权时可留空） |
| `DATABASE_URL` | 数据库连接串：本地 `file:<path>`（默认 `file:data/odin.db`），远程 Turso `libsql://<db>.turso.io` |
| `DATABASE_AUTH_TOKEN` | Turso 访问令牌（仅远程库需要） |
| `UPLOAD_DIR` | 图片上传根目录（本地兜底），默认 `<cwd>/data/uploads`；Vercel 上用 Blob |
| `LLM_HTTP_TIMEOUT_MS` | 上游 LLM 请求超时（毫秒，默认 60000） |

> 数据库与上传目录建议放独立数据盘（如 `/var/lib/odin`）：本地部署用 `DATABASE_URL=file:/var/lib/odin/odin.db`，图片用 `UPLOAD_DIR=/var/lib/odin/uploads` 指向那里，便于备份。

## 5. 启动 API（进程管理）

### 方式 A：systemd（推荐）

```sh
# 假设部署到 /opt/odin，创建运行用户
sudo useradd --system --home /opt/odin --shell /usr/sbin/nologin odin
sudo chown -R odin:odin /opt/odin

sudo cp deploy/odin-api.service /etc/systemd/system/odin-api.service
sudo vim /etc/systemd/system/odin-api.service   # 修改 WorkingDirectory 与 User

sudo systemctl daemon-reload
sudo systemctl enable --now odin-api
systemctl status odin-api                        # 健康检查
curl http://127.0.0.1:3001/health                # 应返回 {"status":"ok"}
```

常用命令：`sudo systemctl restart odin-api`、`journalctl -u odin-api -f`。

### 方式 B：PM2

```sh
pnpm --filter @odin/api build
pm2 start apps/api/ecosystem.config.cjs
pm2 save && pm2 startup   # 开机自启
pm2 logs odin-api
```

> API 已内置 SIGTERM/SIGINT 优雅退出（停止接收请求 → 关闭 SQLite → 退出）。

## 6. Nginx + HTTPS

基于 `nginx.proxy.conf` 补全：

```nginx
server {
    listen 80;
    server_name odin.example.com;
    return 301 https://$host$request_uri;   # HTTP 强制跳转 HTTPS
}

server {
    listen 443 ssl http2;
    server_name odin.example.com;

    ssl_certificate     /etc/letsencrypt/live/odin.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/odin.example.com/privkey.pem;

    root /opt/odin/apps/web/dist;
    index index.html;

    # 安全头
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    server_tokens off;

    # API 网关：去掉 /api 前缀转发到 Node
    location /api/ {
        rewrite ^/api/(.*)$ /$1 break;
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }

    # 上传图片：由 Node 静态托管（data/uploads），转发到 API
    location /uploads/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_read_timeout 60s;
    }

    location / { try_files $uri $uri/ /index.html; }
}
```

申请/续期证书（certbot）：

```sh
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d odin.example.com
sudo certbot renew --dry-run
```

> 前端生产环境通过同域 `/api` 访问后端（`apps/web/.env.production` 的 `VITE_API_BASE=/api`），无需跨域。

## 7. 数据备份（SQLite）

SQLite 单文件 + WAL，备份需用官方 `.backup`（避免复制到不一致状态），建议 cron 每日备份：

```sh
# /etc/cron.d/odin-backup
15 3 * * * odin sqlite3 /opt/odin/apps/api/data/odin.db ".backup '/var/backups/odin/odin-$(date +\%F).db'" && find /var/backups/odin -name '*.db' -mtime +30 -delete
```

- 同时备份上传目录：`rsync -a /opt/odin/apps/api/data/uploads/ /var/backups/odin/uploads/`
- 恢复：停止 API → 用备份文件替换 `odin.db`（并删除同名 `-wal`/`-shm`）→ 启动 API。

## 8. 更新与回滚

```sh
# 更新
git pull            # 或替换代码目录
pnpm install
pnpm build
sudo systemctl restart odin-api    # 或 pm2 restart odin-api
sudo nginx -t && sudo systemctl reload nginx

# 回滚：保留上一版 dist 与代码目录，直接切回旧目录重启即可；数据库结构变更请先备份
```

> API 启动时自动执行 `drizzle/` 下未应用的迁移。**升级前务必先备份数据库**。

## 9. 运维与故障排查

- 健康检查：`curl http://127.0.0.1:3001/health`
- 日志：systemd `journalctl -u odin-api -f`；PM2 `pm2 logs odin-api`
- 端口占用：`lsof -i :3001`
- 前端白屏并报 `Failed to load module script ... server responded with a MIME type of "text/html"`：说明浏览器请求的 `.js` 资源（通常是 `/assets/*.js`）在服务器上不存在，SPA 兜底返回了 `index.html`。按顺序排查：
  1. Nginx `root` 是否指向真实的 `apps/web/dist`（示例里的 `/path/to/apps/web/dist` 是占位符，必须修改）；
  2. 服务器上的 `dist` 是否为最新完整构建：本地重新 `pnpm --filter @odin/web build` 后整体同步 `apps/web/dist`（只传 `index.html` 不传 `assets/` 是最常见原因）；
  3. 站点若挂在子路径（如 `https://host/web/`），需设 `VITE_APP_BASE_PATH=/web/` 并重新构建，否则 `/assets/...` 绝对路径在服务器根上不存在；
  4. 用浏览器直接打开本地 `dist/index.html`（`file://` 协议）也会报同样错误，应通过 Nginx 或 `pnpm --filter @odin/web preview` 托管；
  5. 检查当前 `dist/index.html` 引用的 hash 文件与 `dist/assets/` 实际文件是否一一对应；缺文件时 Nginx 会回退到 `index.html`（`try_files $uri $uri/ /index.html;`）。新版 `nginx.proxy.conf` 已对 `/assets/` 增加 `try_files $uri =404;`，缺失资源会变成明确的 404，便于定位。

- `@libsql/client` 本地 `file:` 库打不开：确认 Node >= 20 且预编译二进制可用（远程 Turso 不受影响）。
- 管理端 403：确认 `ADMIN_KEY` 已配置且与服务端一致，修改后重启。
- 审核任务卡在 `reviewing`：审核队列在进程内，**服务重启不会自动恢复**。可让用户重新提交该环节；如需清理历史脏数据，停止 API 后执行：
  ```sql
  UPDATE submissions SET status='rejected', auto_rejected=1, reviewed_at=NULL
  WHERE status='reviewing';
  ```
  然后启动 API。
- 磁盘水位：上传目录 `data/uploads` 只增不减，建议定期清理与任务无关的孤儿图片，并监控磁盘。

## 10. 上线前检查清单

- [ ] `ADMIN_KEY` 为强随机值，未泄露
- [ ] `.env` 未入库（已被 `.gitignore` 排除）
- [ ] 只开放 80/443，API 端口 3001 不对外
- [ ] HTTPS 证书有效，HTTP 强制跳转
- [ ] 每日数据库 + 上传目录备份已配置并演练过恢复
- [ ] 重启 API 后审核卡住的处理流程已确认
- [ ] 磁盘、内存、日志轮转监控已就绪

## 11. Vercel 部署（可选，services 模式）

仓库根目录的 `vercel.json` 把一个 Vercel 项目拆成两个 service：`api`（Hono）与 `web`（Vite 静态站），由顶层 rewrites 路由：

- `/api/(.*)` → `api` service；`/uploads/(.*)` → `api` service；`/(.*)` → `web` service。
- Vercel 会把原始路径原样转发给服务（不剥 `/api` 前缀），因此 API 在 `apps/api/src/app.ts` 同时注册了带 `/api` 前缀的路由；本地 vite proxy / nginx 仍走无前缀路由，互不影响。
- `web` service 内配置了 SPA rewrite（`/(.*)` → `/index.html`），保证 Vue Router history 模式深链可直达。
- 两个 service 之间没有服务端调用（前端是浏览器直连公开 `/api`），因此没有声明 bindings。

Vercel 项目需配置的环境变量（Dashboard → Project → Settings → Environment Variables）：

| 变量 | 说明 |
| --- | --- |
| `ADMIN_KEY` | 管理端鉴权密钥（必填，强随机值） |
| `LLM_BASE_URL` | 自定义大模型 Base URL（OpenAI 兼容，必填） |
| `LLM_MODEL` | 模型名（必填） |
| `LLM_API_KEY` | 可选；自建服务无需鉴权时可留空 |
| `DATABASE_URL` | 持久化数据库（推荐 Turso）：`libsql://<db>.turso.io`（必填，否则数据落在临时 `/tmp`） |
| `DATABASE_AUTH_TOKEN` | Turso 访问令牌 |

图片存储：在 Vercel 上连接 **Vercel Blob** 存储（Storage 面板添加，会自动注入 `BLOB_READ_WRITE_TOKEN`），上传即写入 Blob 并返回公开 URL，前端直接渲染；未配置时回退本地目录（Vercel 上为临时 `/tmp`，仅演示）。

本地联调：安装 Vercel CLI 后在仓库根目录运行 `vercel dev`，会同时启动两个 service 并注入绑定变量；API 本地直跑用 `pnpm dev`（默认 `file:data/odin.db`）。

> **剩余限制**：
> 1. 审核队列是进程内后台任务，serverless 返回响应后不保证执行完成，生产需改用 Vercel Queues / Cron 或独立 worker；
> 2. LLM 审核最长约 60s×3 次重试，可给 api service 配置 `functions` 的 `maxDuration` 调大（如 300s+）；
> 3. Vercel 上 Hono 的 `serveStatic()` 不生效，旧数据中相对 `/uploads/*` 的图片地址不会显示（新上传走 Blob 不受影响）。
