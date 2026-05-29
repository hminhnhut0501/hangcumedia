# Telegram Content Scheduler + Topic Mapper (MVP)

Monorepo gồm:
- `apps/web`: Next.js Admin CP
- `apps/worker`: Express + Telegraf bot + queue processor
- `packages/shared`: types/utils dùng chung
- `supabase/migrations/001_init.sql`: DB schema + RLS

## 1) Prerequisites

- Node.js 20+
- pnpm 9+
- Supabase project
- Telegram bot token (BotFather)

## 2) Setup

```bash
cp .env.example .env
pnpm install
```

Fill `.env`:
- Worker cần: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PUBLIC_WORKER_URL`, `ADMIN_API_SECRET`
- Web cần:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_ADMIN_EMAIL_ALLOWLIST`, `NEXT_PUBLIC_WORKER_URL`, `NEXT_PUBLIC_ADMIN_API_SECRET`

Lưu ý bảo mật production: không expose `ADMIN_API_SECRET` ra frontend. MVP hiện tại dùng trực tiếp để đơn giản hóa flow test local.

## 3) Run migration

Chạy SQL trong Supabase SQL editor:
- `supabase/migrations/001_init.sql`

## 4) Seed data

```bash
pnpm tsx scripts/seed.ts
```

## 5) Run local

Terminal 1:
```bash
pnpm dev:worker
```

Terminal 2:
```bash
pnpm dev:web
```

Web: `http://localhost:3000`
Worker health: `http://localhost:4000/health`

## 6) Worker API

- `GET /health`
- `POST /telegram/webhook/:secret`
- `POST /api/topics/create`
- `POST /api/topics/sync`
- `POST /api/import/link`
- `POST /api/queue/generate`
- `POST /api/queue/:id/retry`
- `POST /api/campaigns/:id/pause`
- `POST /api/campaigns/:id/resume`

Gắn header `x-admin-secret: <ADMIN_API_SECRET>` cho `/api/*`.

## 7) MVP workflow

1. Login web admin (`/login`).
2. Add backup/main groups (`/groups`) hoặc dùng bot `/register_group`.
3. Add bot vào backup group, gửi message/video/album để importer ghi `source_messages`.
4. Xem inbox (`/inbox`).
5. Tạo topic (`/topics`) bằng bot API.
6. Tạo campaign (`/campaigns/new`) + add source (`/campaigns/[id]`).
7. Generate queue.
8. Scheduler worker tự gửi khi đến `scheduled_at`.
9. Theo dõi `/queue` và `/logs`, retry item failed.

## 8) Deploy notes

- Web deploy Vercel.
- Worker deploy Render Web Service.
- Supabase giữ vai trò single source of truth.
- Với Render free tier có thể sleep, nên lịch gửi có thể trễ.

## 9) Deploy từng nền tảng

### 9.1 GitHub

```bash
git init
git add .
git commit -m "feat: telegram content scheduler mvp"
git branch -M main
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```

### 9.2 Supabase

1. Tạo project mới trên Supabase.
2. Vào SQL Editor, chạy file `supabase/migrations/001_init.sql`.
3. Vào Project Settings -> API, copy:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL` (chính là project URL)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Vào Authentication -> Providers, bật Email provider.
5. Tạo user admin (email/password) trong Authentication -> Users.

### 9.3 Render (worker)

Repo đã có sẵn `render.yaml`.

1. Render Dashboard -> New + -> Blueprint.
2. Chọn repo GitHub này, Render sẽ đọc `render.yaml`.
3. Điền env vars cho service `tele-send-worker`:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `PUBLIC_WORKER_URL` (URL service Render, ví dụ `https://tele-send-worker.onrender.com`)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_API_SECRET`
- `APP_TIMEZONE=Asia/Ho_Chi_Minh`
- `SCHEDULER_TICK_SECONDS=30`
4. Deploy và kiểm tra health: `https://<render-service>/health`.

### 9.4 Vercel (web admin)

1. Vercel Dashboard -> Add New Project -> import cùng repo.
2. Vì monorepo, đặt Root Directory là `apps/web`.
3. Build command: để mặc định (Vercel tự nhận Next.js).
4. Thêm Environment Variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_ADMIN_EMAIL_ALLOWLIST`
- `NEXT_PUBLIC_WORKER_URL` (URL Render worker)
- `NEXT_PUBLIC_ADMIN_API_SECRET` (MVP only)
5. Deploy.

### 9.5 Telegram webhook production

Worker tự gọi `setWebhook` lúc start:

`<PUBLIC_WORKER_URL>/telegram/webhook/<TELEGRAM_WEBHOOK_SECRET>`

Chỉ cần đảm bảo `PUBLIC_WORKER_URL` đúng domain Render và bot token hợp lệ.
