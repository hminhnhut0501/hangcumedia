create table if not exists backfill_jobs (
  id uuid primary key default gen_random_uuid(),
  created_by_admin_id uuid references admins(id) on delete set null,
  source_group_id uuid not null references telegram_groups(id) on delete cascade,
  source_chat_id bigint not null,
  source_thread_id bigint,
  from_message_id bigint not null,
  to_message_id bigint not null,
  create_link_only boolean not null default true,
  status text not null default 'pending',
  total_estimated int not null default 0,
  processed_count int not null default 0,
  imported_ready_count int not null default 0,
  imported_link_only_count int not null default 0,
  skipped_count int not null default 0,
  error_count int not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists backfill_checkpoints (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references backfill_jobs(id) on delete cascade,
  last_scanned_message_id bigint not null,
  processed_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_backfill_jobs_status_created on backfill_jobs(status, created_at desc);
create index if not exists idx_backfill_checkpoint_job_created on backfill_checkpoints(job_id, created_at desc);

create trigger set_backfill_jobs_updated_at
before update on backfill_jobs
for each row
execute function set_updated_at();

alter table backfill_jobs enable row level security;
alter table backfill_checkpoints enable row level security;

create policy "admins can manage backfill_jobs"
on backfill_jobs for all to authenticated using (true) with check (true);

create policy "admins can manage backfill_checkpoints"
on backfill_checkpoints for all to authenticated using (true) with check (true);
