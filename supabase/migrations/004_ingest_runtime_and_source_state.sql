create table if not exists source_cursors (
  id uuid primary key default gen_random_uuid(),
  source_group_id uuid references telegram_groups(id) on delete cascade,
  source_chat_id bigint not null unique,
  source_message_thread_id bigint,
  last_seen_message_id bigint not null default 0,
  last_reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ingest_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null default 'hourly_reconcile',
  source_chat_id bigint,
  source_group_id uuid references telegram_groups(id) on delete set null,
  status text not null default 'ok',
  scanned_from bigint,
  scanned_to bigint,
  scanned_count int not null default 0,
  created_link_only int not null default 0,
  found_ready int not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

alter table campaigns
  add column if not exists source_state text not null default 'ready',
  add column if not exists last_exhausted_at timestamptz;

create index if not exists idx_source_messages_chat_msg on source_messages(source_chat_id, source_message_id);
create index if not exists idx_source_cursors_chat on source_cursors(source_chat_id);
create index if not exists idx_ingest_jobs_created_at on ingest_jobs(created_at desc);

create trigger set_source_cursors_updated_at
before update on source_cursors
for each row
execute function set_updated_at();

alter table source_cursors enable row level security;
alter table ingest_jobs enable row level security;

create policy "admins can manage source_cursors"
on source_cursors for all to authenticated using (true) with check (true);

create policy "admins can manage ingest_jobs"
on ingest_jobs for all to authenticated using (true) with check (true);
