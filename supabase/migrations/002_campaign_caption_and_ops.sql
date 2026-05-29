-- Caption options for campaign-level copy behavior
alter table campaigns
  add column if not exists caption_mode text not null default 'original',
  add column if not exists custom_caption text;

alter table campaigns
  add constraint campaigns_caption_mode_check check (caption_mode in ('original', 'custom'));
