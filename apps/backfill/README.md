# Backfill Worker (Telethon)

Worker này dùng Telegram user client (Telethon) để đọc lịch sử cũ và hydrate `source_messages` thành `ready`.

## Env bắt buộc

- `TELETHON_API_ID`
- `TELETHON_API_HASH`
- `TELETHON_SESSION_STRING`
- `SUPABASE_URL` (ví dụ `https://xxx.supabase.co`)
- `SUPABASE_SERVICE_ROLE_KEY`
- `BACKFILL_POLL_SECONDS` (optional, default `10`)

## Chạy local

```bash
cd apps/backfill
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

## Ghi chú

- Chỉ đọc job `backfill_jobs.status='running'`.
- Job dùng checkpoint ở `backfill_checkpoints`.
- Nếu đọc được message thật: upsert `source_messages` với `status='ready'`.
- Nếu không đọc được và `create_link_only=true`: tạo `link_only`.
