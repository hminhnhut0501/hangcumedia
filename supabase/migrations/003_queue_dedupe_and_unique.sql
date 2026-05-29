-- Remove duplicate queue items created by concurrent generation.
with ranked as (
  select id,
         row_number() over (
           partition by campaign_id, scheduled_at, source_message_id
           order by created_at asc, id asc
         ) as rn
  from queue_items
)
delete from queue_items q
using ranked r
where q.id = r.id
  and r.rn > 1;

-- Enforce idempotency for future queue generation.
alter table queue_items
  add constraint queue_items_campaign_schedule_source_unique
  unique (campaign_id, scheduled_at, source_message_id);
