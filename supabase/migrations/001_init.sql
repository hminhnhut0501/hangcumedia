create extension if not exists pgcrypto;

create type group_type as enum ('backup', 'main', 'admin');
create type media_type as enum ('text', 'photo', 'video', 'document', 'animation', 'audio', 'voice', 'unknown');
create type copy_mode as enum ('copy', 'forward');
create type media_group_mode as enum ('keep', 'split');
create type campaign_status as enum ('active', 'paused', 'archived');
create type queue_status as enum ('pending', 'processing', 'sent', 'failed', 'skipped');

create table admins (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  telegram_user_id bigint unique,
  role text not null default 'admin',
  created_at timestamptz not null default now()
);

create table telegram_groups (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  chat_id bigint not null unique,
  username text,
  type group_type not null,
  is_forum boolean not null default false,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table topics (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references telegram_groups(id) on delete cascade,
  name text not null,
  message_thread_id bigint not null,
  source_topic_key text,
  is_active boolean not null default true,
  created_by_bot boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(group_id, message_thread_id)
);

create table source_messages (
  id uuid primary key default gen_random_uuid(),
  source_chat_id bigint not null,
  source_message_id bigint not null,
  source_message_thread_id bigint,
  source_topic_name text,
  media_group_id text,
  media_type media_type not null default 'unknown',
  caption text,
  text text,
  raw_payload jsonb,
  imported_by text default 'bot',
  is_album_head boolean not null default false,
  album_item_count int not null default 1,
  status text not null default 'ready',
  created_at timestamptz not null default now(),
  unique(source_chat_id, source_message_id)
);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_group_id uuid references telegram_groups(id),
  target_group_id uuid not null references telegram_groups(id),
  target_topic_id uuid references topics(id),
  copy_mode copy_mode not null default 'copy',
  media_group_mode media_group_mode not null default 'keep',
  batch_size int not null default 1 check (batch_size > 0),
  runs_per_day int not null default 1 check (runs_per_day > 0),
  run_times text[] not null default array['21:00'],
  timezone text not null default 'Asia/Ho_Chi_Minh',
  random_delay_seconds int not null default 0,
  status campaign_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table campaign_sources (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  source_message_id uuid not null references source_messages(id) on delete cascade,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique(campaign_id, source_message_id)
);

create table queue_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  source_message_id uuid not null references source_messages(id),
  scheduled_at timestamptz not null,
  status queue_status not null default 'pending',
  locked_at timestamptz,
  sent_at timestamptz,
  target_chat_id bigint not null,
  target_message_thread_id bigint,
  result_payload jsonb,
  error_message text,
  retry_count int not null default 0,
  created_at timestamptz not null default now()
);

create table send_logs (
  id uuid primary key default gen_random_uuid(),
  queue_item_id uuid references queue_items(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete set null,
  source_message_id uuid references source_messages(id) on delete set null,
  action text not null,
  status text not null,
  request_payload jsonb,
  response_payload jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_telegram_groups_updated_at
before update on telegram_groups
for each row execute function set_updated_at();

create trigger set_topics_updated_at
before update on topics
for each row execute function set_updated_at();

create trigger set_campaigns_updated_at
before update on campaigns
for each row execute function set_updated_at();

alter table telegram_groups enable row level security;
alter table topics enable row level security;
alter table source_messages enable row level security;
alter table campaigns enable row level security;
alter table campaign_sources enable row level security;
alter table queue_items enable row level security;
alter table send_logs enable row level security;
alter table admins enable row level security;

create policy "admins can manage telegram_groups"
on telegram_groups for all to authenticated using (true) with check (true);
create policy "admins can manage topics"
on topics for all to authenticated using (true) with check (true);
create policy "admins can manage source_messages"
on source_messages for all to authenticated using (true) with check (true);
create policy "admins can manage campaigns"
on campaigns for all to authenticated using (true) with check (true);
create policy "admins can manage campaign_sources"
on campaign_sources for all to authenticated using (true) with check (true);
create policy "admins can manage queue_items"
on queue_items for all to authenticated using (true) with check (true);
create policy "admins can read send_logs"
on send_logs for select to authenticated using (true);
create policy "admins can manage admins"
on admins for all to authenticated using (true) with check (true);
