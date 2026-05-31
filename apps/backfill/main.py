import asyncio
import os
from datetime import datetime, timezone

import httpx
from dotenv import load_dotenv
from telethon import TelegramClient
from telethon.sessions import StringSession

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
API_ID = int(os.getenv("TELETHON_API_ID", "0"))
API_HASH = os.getenv("TELETHON_API_HASH", "")
SESSION_STRING = os.getenv("TELETHON_SESSION_STRING", "")
POLL_SECONDS = int(os.getenv("BACKFILL_POLL_SECONDS", "10"))
CHUNK_SIZE = 50
PORT = int(os.getenv("PORT", "10000"))

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY or not API_ID or not API_HASH or not SESSION_STRING:
  raise RuntimeError("Missing required env for backfill worker")

HEADERS = {
  "apikey": SUPABASE_SERVICE_ROLE_KEY,
  "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
  "Content-Type": "application/json",
  "Prefer": "return=representation",
}

def now_iso():
  return datetime.now(timezone.utc).isoformat()


async def supa_get(path: str, params=None):
  async with httpx.AsyncClient(timeout=30) as http:
    resp = await http.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=HEADERS, params=params or {})
    resp.raise_for_status()
    return resp.json()


async def supa_post(path: str, data, extra_headers=None):
  headers = dict(HEADERS)
  if extra_headers:
    headers.update(extra_headers)
  async with httpx.AsyncClient(timeout=30) as http:
    resp = await http.post(f"{SUPABASE_URL}/rest/v1/{path}", headers=headers, json=data)
    resp.raise_for_status()
    if resp.text:
      return resp.json()
    return None


async def supa_patch(path: str, data, params=None):
  async with httpx.AsyncClient(timeout=30) as http:
    resp = await http.patch(f"{SUPABASE_URL}/rest/v1/{path}", headers=HEADERS, params=params or {}, json=data)
    resp.raise_for_status()
    if resp.text:
      return resp.json()
    return None


def detect_media_type(msg):
  if getattr(msg, "video", None):
    return "video"
  if getattr(msg, "photo", None):
    return "photo"
  if getattr(msg, "document", None):
    return "document"
  if getattr(msg, "gif", None):
    return "animation"
  if getattr(msg, "audio", None):
    return "audio"
  if getattr(msg, "voice", None):
    return "voice"
  if getattr(msg, "message", None):
    return "text"
  return "unknown"


async def fetch_running_job():
  rows = await supa_get("backfill_jobs", {
    "status": "eq.running",
    "order": "created_at.asc",
    "limit": "1",
  })
  return rows[0] if rows else None


async def fetch_last_checkpoint(job_id: str):
  rows = await supa_get("backfill_checkpoints", {
    "job_id": f"eq.{job_id}",
    "order": "created_at.desc",
    "limit": "1",
  })
  return rows[0] if rows else None


async def process_job(client: TelegramClient, job):
  start = min(int(job["from_message_id"]), int(job["to_message_id"]))
  end = max(int(job["from_message_id"]), int(job["to_message_id"]))
  cp = await fetch_last_checkpoint(job["id"])
  last_scanned = int(cp["last_scanned_message_id"]) if cp else start - 1
  chunk_from = last_scanned + 1
  if chunk_from > end:
    await supa_patch("backfill_jobs", {
      "status": "done",
      "finished_at": now_iso(),
    }, params={"id": f"eq.{job['id']}"})
    return

  chunk_to = min(chunk_from + CHUNK_SIZE - 1, end)
  ids = list(range(chunk_from, chunk_to + 1))
  tg_messages = await client.get_messages(int(job["source_chat_id"]), ids=ids)
  if not isinstance(tg_messages, list):
    tg_messages = [tg_messages]

  imported_ready = 0
  imported_link_only = 0
  skipped = 0
  processed = 0

  upserts = []
  missing_ids = set(ids)
  for msg in tg_messages:
    processed += 1
    if not msg:
      continue
    message_id = int(msg.id)
    missing_ids.discard(message_id)
    upserts.append({
      "source_chat_id": int(job["source_chat_id"]),
      "source_message_id": message_id,
      "source_message_thread_id": getattr(msg, "reply_to_top_id", None),
      "media_group_id": str(getattr(msg, "grouped_id", "")) if getattr(msg, "grouped_id", None) else None,
      "media_type": detect_media_type(msg),
      "caption": getattr(msg, "text", None) if detect_media_type(msg) != "text" else None,
      "text": getattr(msg, "text", None),
      "raw_payload": msg.to_dict(),
      "imported_by": "telethon_backfill",
      "status": "ready",
    })
    imported_ready += 1

  if upserts:
    await supa_post(
      "source_messages?on_conflict=source_chat_id,source_message_id",
      upserts,
      {"Prefer": "resolution=merge-duplicates,return=representation"},
    )

  if job.get("create_link_only", True):
    link_rows = []
    for mid in sorted(list(missing_ids)):
      link_rows.append({
        "source_chat_id": int(job["source_chat_id"]),
        "source_message_id": int(mid),
        "media_type": "unknown",
        "text": f"telethon_backfill_missing:{job['id']}:{mid}",
        "imported_by": "telethon_backfill",
        "status": "link_only",
      })
    if link_rows:
      await supa_post(
        "source_messages?on_conflict=source_chat_id,source_message_id",
        link_rows,
        {"Prefer": "resolution=merge-duplicates,return=representation"},
      )
      imported_link_only += len(link_rows)
  else:
    skipped += len(missing_ids)

  await supa_post("backfill_checkpoints", {
    "job_id": job["id"],
    "last_scanned_message_id": chunk_to,
    "processed_count": int(job.get("processed_count", 0)) + len(ids),
  })

  await supa_patch("backfill_jobs", {
    "processed_count": int(job.get("processed_count", 0)) + len(ids),
    "imported_ready_count": int(job.get("imported_ready_count", 0)) + imported_ready,
    "imported_link_only_count": int(job.get("imported_link_only_count", 0)) + imported_link_only,
    "skipped_count": int(job.get("skipped_count", 0)) + skipped,
    "started_at": job.get("started_at") or now_iso(),
    "updated_at": now_iso(),
  }, params={"id": f"eq.{job['id']}"})

  if chunk_to >= end:
    await supa_patch("backfill_jobs", {
      "status": "done",
      "finished_at": now_iso(),
    }, params={"id": f"eq.{job['id']}"})


async def loop_forever():
  client = TelegramClient(StringSession(SESSION_STRING), API_ID, API_HASH)
  await client.start()
  while True:
    try:
      job = await fetch_running_job()
      if job:
        await process_job(client, job)
      else:
        await asyncio.sleep(POLL_SECONDS)
    except Exception as err:
      print("backfill loop error:", str(err))
      await asyncio.sleep(POLL_SECONDS)


async def health_handler(reader, writer):
  try:
    req = await reader.read(1024)
    line = req.splitlines()[0].decode("utf-8", "ignore") if req else ""
    path = "/"
    if line.startswith("GET "):
      parts = line.split(" ")
      if len(parts) >= 2:
        path = parts[1]
    if path in ("/health", "/"):
      body = b'{"ok":true,"service":"backfill"}'
      writer.write(
        b"HTTP/1.1 200 OK\r\n"
        b"Content-Type: application/json\r\n"
        + f"Content-Length: {len(body)}\r\n".encode()
        + b"Connection: close\r\n\r\n"
        + body
      )
    else:
      body = b'{"ok":false,"error":"not_found"}'
      writer.write(
        b"HTTP/1.1 404 Not Found\r\n"
        b"Content-Type: application/json\r\n"
        + f"Content-Length: {len(body)}\r\n".encode()
        + b"Connection: close\r\n\r\n"
        + body
      )
    await writer.drain()
  finally:
    writer.close()
    await writer.wait_closed()


async def start_health_server():
  server = await asyncio.start_server(health_handler, host="0.0.0.0", port=PORT)
  print(f"health server listening on :{PORT}")
  async with server:
    await server.serve_forever()


async def main():
  await asyncio.gather(
    loop_forever(),
    start_health_server()
  )


if __name__ == "__main__":
  asyncio.run(main())
