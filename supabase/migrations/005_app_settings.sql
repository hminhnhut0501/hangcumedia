create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

create or replace function set_app_settings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_app_settings_updated_at on app_settings;
create trigger trg_app_settings_updated_at
before update on app_settings
for each row
execute function set_app_settings_updated_at();

alter table app_settings enable row level security;

create policy "admins can manage app_settings"
on app_settings for all to authenticated using (true) with check (true);

insert into app_settings (key, value, description)
values
  ('global_run_times', to_jsonb(array['09:00','15:00','21:00']::text[]), 'Khung giờ toàn hệ thống theo HH:mm'),
  ('max_late_seconds', to_jsonb(900), 'Quá số giây này thì bỏ qua slot trễ'),
  ('reconcile_interval_minutes', to_jsonb(60), 'Chu kỳ reconcile nguồn')
on conflict (key) do nothing;
