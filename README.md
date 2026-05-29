# Telegram Content Scheduler + Topic Mapper

Hệ thống quản trị gửi nội dung Telegram theo lịch, hỗ trợ mapping topic, campaign, queue và logs.

## 1) Tổng quan kiến trúc

Monorepo gồm:
- `apps/web`: Admin UI (Next.js)
- `apps/worker`: Bot Telegram + API nội bộ + scheduler (Express + Telegraf)
- `packages/shared`: types/utils dùng chung
- `supabase/migrations/001_init.sql`: schema database + RLS

Luồng chính:
1. Bot nhận nội dung từ nhóm backup hoặc admin forward.
2. Worker lưu metadata vào `source_messages` (không lưu file video trên server).
3. Admin tạo campaign + queue từ web.
4. Scheduler tự gửi theo lịch vào đúng group/topic.
5. Logs ghi trạng thái gửi `sent/failed/retry`.

---

## 2) Yêu cầu trước khi chạy

- Node.js `20+`
- pnpm `10+` (hoặc dùng `npx pnpm@10`)
- 1 project Supabase
- 1 Telegram bot token (tạo qua BotFather)

---

## 3) Cấu hình môi trường (.env)

Tạo file:

```bash
cp .env.example .env
```

Điền các biến:

### Telegram
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `PUBLIC_WORKER_URL`

### Supabase public (cho web)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Supabase server-side (cho worker)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### App
- `ADMIN_EMAIL_ALLOWLIST`
- `NEXT_PUBLIC_ADMIN_EMAIL_ALLOWLIST`
- `ADMIN_API_SECRET`
- `WORKER_URL` (set trong Vercel server env để web proxy gọi worker)
- `APP_TIMEZONE=Asia/Ho_Chi_Minh`
- `SCHEDULER_TICK_SECONDS=30`

### Lưu ý bảo mật
- Không đưa `SUPABASE_SERVICE_ROLE_KEY` ra frontend.
- `SERVICE_ROLE_KEY` chỉ dùng ở worker.
- `ANON_KEY` dùng cho web.
- Không expose `ADMIN_API_SECRET` ra browser; web gọi worker qua API proxy server-side.

---

## 4) Cài dependencies

Nếu bạn có pnpm global:

```bash
pnpm install
```

Nếu chưa có pnpm global:

```bash
npx pnpm@10 install
```

---

## 5) Setup database Supabase

1. Vào Supabase -> SQL Editor.
2. Chạy file:
- `supabase/migrations/001_init.sql`

File này tạo:
- Enum types
- Các bảng: `telegram_groups`, `topics`, `source_messages`, `campaigns`, `campaign_sources`, `queue_items`, `send_logs`, ...
- RLS policy MVP

---

## 6) Seed dữ liệu mẫu (tùy chọn)

```bash
npx tsx scripts/seed.ts
```

Seed sẽ tạo:
- admin mẫu theo allowlist
- 1 backup group mẫu
- 1 main group mẫu

---

## 7) Chạy local

Terminal 1 (worker):

```bash
npx pnpm@10 dev:worker
```

Terminal 2 (web):

```bash
npx pnpm@10 dev:web
```

Địa chỉ:
- Web: `http://localhost:3000`
- Worker health: `http://localhost:4000/health`

---

## 8) Luồng setup từ đầu (khuyến nghị)

### Bước 1: Tạo user admin
- Supabase -> Authentication -> Users -> Add user.
- Email phải nằm trong `ADMIN_EMAIL_ALLOWLIST`.

### Bước 2: Đăng nhập web
- Mở `/login`.
- Đăng nhập bằng user đã tạo.

### Bước 3: Khai báo nhóm Telegram
Có 2 cách:
1. Tại web `/groups` thêm thủ công `title/chat_id/type`.
2. Trong Telegram chat với bot dùng `/register_group`.

Khuyến nghị:
- Nhóm backup: type `backup`
- Nhóm đích: type `main`

### Bước 4: Thêm bot vào nhóm backup
- Cấp quyền đọc/sendt phù hợp.
- Gửi thử text/video/album trong backup group.
- Kiểm tra `/inbox` đã có record `source_messages`.

### Bước 5: Tạo topic đích
- Vào `/topics`.
- Chọn group main (forum).
- Tạo topic bằng nút `Tạo topic`.

### Bước 6: Tạo campaign
- Vào `/campaigns/new`.
- Cấu hình: target group, target topic, copy/forward, keep/split album, batch, run_times.

### Bước 7: Gắn source cho campaign
- Vào `/campaigns/[id]`.
- Add source message từ inbox.

### Bước 8: Generate queue
- Trong campaign detail bấm `Generate Queue`.

### Bước 9: Theo dõi gửi tự động
- `/queue`: xem pending/processing/sent/failed.
- `/logs`: xem chi tiết lỗi, retry.

---

## 9) Hướng dẫn sử dụng theo từng màn hình

## `/dashboard`
- Xem KPI tổng: groups, topics, campaigns, queue pending/failed.
- Dùng quick links để đi nhanh tới các module chính.

## `/groups`
- Tạo/sửa danh sách nhóm nguồn và nhóm đích.
- Trường bắt buộc:
  - `Tên nhóm`
  - `Chat ID` (thường bắt đầu `-100`)
  - `Loại nhóm` (`backup/main/admin`)

## `/topics`
- Tạo topic trong group main/forum qua bot.
- Bot phải có quyền admin để tạo topic.

## `/inbox`
- Xem nội dung bot đã import.
- Lọc theo media type, tìm theo chat/message/caption.
- Dùng danh sách này làm nguồn cho campaign.

## `/campaigns`
- Xem toàn bộ chiến dịch.
- Tạm dừng/tiếp tục chiến dịch.

## `/campaigns/new`
- Tạo chiến dịch mới với cấu hình lịch gửi.

## `/campaigns/[id]`
- Add/remove source message.
- Generate queue cho campaign.

## `/queue`
- Theo dõi hàng đợi gửi.
- Retry item lỗi.

## `/logs`
- Theo dõi lịch sử gửi.
- Lọc theo status `sent/failed`.

## `/settings`
- Checklist vận hành và biến môi trường.

---

## 10) Các command Telegram bot

- `/start`: xác nhận bot đang chạy
- `/id`: xem `chat_id`, `message_thread_id`
- `/register_group`: đăng ký group hiện tại vào DB
- `/scan`: reply vào message rồi chạy lệnh để import message đó

Bot tự import khi:
- Message mới trong group có `type=backup`
- Admin forward message riêng cho bot

---

## 11) Worker API nội bộ

- `GET /health`
- `POST /telegram/webhook/:secret`
- `POST /api/topics/create`
- `POST /api/topics/sync`
- `POST /api/import/link`
- `POST /api/queue/generate`
- `POST /api/queue/:id/retry`
- `POST /api/campaigns/:id/pause`
- `POST /api/campaigns/:id/resume`

Route `/api/*` cần header:
- `x-admin-secret: <ADMIN_API_SECRET>`

Ghi chú: Header này chỉ do web server proxy hoặc backend nội bộ gửi, không gửi từ frontend/browser.

---

## 12) Deploy production

## 12.1 GitHub

```bash
git init
git add .
git commit -m "feat: telegram scheduler"
git branch -M main
git remote add origin <repo-url>
git push -u origin main
```

## 12.2 Supabase
1. Tạo project.
2. Chạy migration SQL `001_init.sql`.
3. Bật Email Auth provider.
4. Tạo user admin.

## 12.3 Render (worker)
Repo đã có `render.yaml`.

1. Render -> New -> Blueprint.
2. Chọn repo.
3. Điền env đầy đủ cho worker:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `PUBLIC_WORKER_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_API_SECRET`
- `APP_TIMEZONE`
- `SCHEDULER_TICK_SECONDS`
4. Kiểm tra `https://<render-service>/health`.

## 12.4 Vercel (web)
1. Import repo.
2. Root Directory: `apps/web`.
3. Env vars:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_ADMIN_EMAIL_ALLOWLIST`
- `WORKER_URL`
- `ADMIN_API_SECRET`
4. Deploy.

---

## 13) Troubleshooting nhanh

### 1) Vercel báo `No Output Directory named public`
- Xóa `Output Directory` custom.
- Để mặc định Next.js.

### 2) Web bị 404 trên Vercel
- Kiểm tra `Root Directory` là `apps/web`.

### 3) Worker không lên health
- Kiểm tra env bắt buộc (bot token, supabase keys, webhook url).
- Xem log Render để biết thiếu biến nào.

### 4) Không thấy data trong inbox
- Bot chưa ở backup group hoặc chưa có quyền phù hợp.
- Group chưa set type=`backup`.

### 5) Queue không gửi
- Kiểm tra campaign đang `active`.
- Có queue item `pending` chưa.
- Worker có đang chạy scheduler không.

---

## 14) Scripts hữu ích

Tại root:

```bash
npx pnpm@10 dev:web
npx pnpm@10 dev:worker
npx pnpm@10 typecheck
npx pnpm@10 build
```

---

## 15) Ghi chú phạm vi MVP

Có trong bản hiện tại:
- Copy/forward theo `chat_id/message_id`
- Album keep/split cơ bản
- Queue + retry + logs

Chưa làm trong MVP:
- Download/upload video file
- Crawl lịch sử cũ bằng userbot/MTProto
- Multi-tenant phức tạp
- Billing/subscription
