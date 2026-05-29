import { DateTime } from 'luxon';
import { supabase } from './db.js';
import { bot } from './bot.js';
import { copyMessage, forwardMessage } from './telegram.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let isGeneratingQueue = false;

async function seedCampaignSourcesIfEmpty(campaign: any) {
  const { data: existing } = await supabase
    .from('campaign_sources')
    .select('id')
    .eq('campaign_id', campaign.id)
    .limit(1);
  if (existing && existing.length > 0) return 0;
  if (!campaign.source_group_id) return 0;

  const { data: sourceGroup } = await supabase
    .from('telegram_groups')
    .select('chat_id')
    .eq('id', campaign.source_group_id)
    .single();
  const sourceChatId = sourceGroup?.chat_id;
  if (!sourceChatId) return 0;

  const { data: pool } = await supabase
    .from('source_messages')
    .select('id,status,created_at')
    .eq('source_chat_id', sourceChatId)
    .neq('status', 'link_only')
    .order('created_at', { ascending: false })
    .limit(500);

  if (!pool?.length) return 0;

  const rows = pool.map((item: any, idx: number) => ({
    campaign_id: campaign.id,
    source_message_id: item.id,
    sort_order: idx
  }));
  const { error } = await supabase.from('campaign_sources').insert(rows);
  if (error) throw error;
  return rows.length;
}

export async function generateQueueForCampaign(campaignId?: string) {
  const summary = {
    campaigns_processed: 0,
    slots_checked: 0,
    items_created: 0,
    sources_seeded: 0,
    skipped_no_sources: 0,
    skipped_no_target_group: 0,
    skipped_existing_slot: 0,
    skipped_locked: 0
  };

  if (isGeneratingQueue) {
    summary.skipped_locked = 1;
    return summary;
  }
  isGeneratingQueue = true;

  try {
    let query = supabase.from('campaigns').select('*').eq('status', 'active');
    if (campaignId) query = query.eq('id', campaignId);
    const { data: campaigns, error } = await query;
    if (error || !campaigns) throw error;

    for (const campaign of campaigns) {
      summary.campaigns_processed += 1;
      summary.sources_seeded += await seedCampaignSourcesIfEmpty(campaign);
      const runTimes: string[] = campaign.run_times ?? ['21:00'];

      const { data: sources } = await supabase
        .from('campaign_sources')
        .select('sort_order, source_messages(*)')
        .eq('campaign_id', campaign.id)
        .order('sort_order', { ascending: true });

      if (!sources?.length) {
        summary.skipped_no_sources += 1;
        continue;
      }

      for (const time of runTimes) {
        summary.slots_checked += 1;
        const [h, m] = time.split(':').map(Number);
        const tz = campaign.timezone || 'Asia/Ho_Chi_Minh';
        const baseInCampaignTz = DateTime.now().setZone(tz);
        const scheduledLocal = baseInCampaignTz.set({ hour: h, minute: m, second: 0, millisecond: 0 });
        const scheduledAt = scheduledLocal.toUTC().toISO();
        if (!scheduledAt) continue;
        const { data: existed } = await supabase
          .from('queue_items')
          .select('id')
          .eq('campaign_id', campaign.id)
          .eq('scheduled_at', scheduledAt!)
          .limit(1);
        if (existed && existed.length > 0) {
          summary.skipped_existing_slot += 1;
          continue;
        }

        const queueCounts = new Map<string, number>();
        const { data: existingUsage } = await supabase
          .from('queue_items')
          .select('source_message_id')
          .eq('campaign_id', campaign.id);
        for (const row of existingUsage || []) {
          const key = row.source_message_id as string;
          queueCounts.set(key, (queueCounts.get(key) || 0) + 1);
        }

        const normalized = (sources || []).map((item: any) => ({
          sort_order: item.sort_order ?? 0,
          source: item.source_messages
        })).filter((x: any) => Boolean(x.source));

        let picked: any[] = [];

        if (campaign.media_group_mode === 'keep') {
        const albumSeen = new Set<string>();
        const units: Array<{ key: string; sort_order: number; rows: any[]; score: number }> = [];
        for (const row of normalized) {
          const src = row.source;
          const key = src.media_group_id
            ? `${src.source_chat_id}:${src.media_group_id}`
            : `single:${src.id}`;
          if (albumSeen.has(key)) continue;
          albumSeen.add(key);

          let rows = [src];
          if (src.media_group_id) {
            const { data: albumRows } = await supabase
              .from('source_messages')
              .select('*')
              .eq('source_chat_id', src.source_chat_id)
              .eq('media_group_id', src.media_group_id)
              .order('source_message_id', { ascending: true });
            rows = albumRows?.length ? albumRows : [src];
          }

          const score = rows.reduce((acc, r) => acc + (queueCounts.get(r.id) || 0), 0);
          units.push({ key, sort_order: row.sort_order, rows, score });
        }

        units.sort((a, b) => a.score - b.score || a.sort_order - b.sort_order);
        picked = units.slice(0, campaign.batch_size).map((u) => u.rows[0]);
        } else {
        const sortable = normalized.map((row) => ({
          ...row,
          score: queueCounts.get(row.source.id) || 0
        }));
        sortable.sort((a, b) => a.score - b.score || a.sort_order - b.sort_order);
        picked = sortable.slice(0, campaign.batch_size).map((x) => x.source);
        }

        const rows = picked.map((source: any) => ({
          campaign_id: campaign.id,
          source_message_id: source.id,
          scheduled_at: scheduledAt,
          target_chat_id: campaign.target_group_id ? campaign.target_group_id : 0,
          target_message_thread_id: null
        }));

      // Resolve target chat/thread from referenced records.
        const { data: targetGroup } = await supabase
          .from('telegram_groups')
          .select('chat_id')
          .eq('id', campaign.target_group_id)
          .single();
        const targetChatId = targetGroup?.chat_id;
        if (!targetChatId) {
          summary.skipped_no_target_group += 1;
          continue;
        }

        if (campaign.target_topic_id) {
          const { data: topic } = await supabase
            .from('topics')
            .select('message_thread_id')
            .eq('id', campaign.target_topic_id)
            .single();
          for (const r of rows) {
            r.target_chat_id = targetChatId;
            r.target_message_thread_id = topic?.message_thread_id ?? null;
          }
        } else {
          for (const r of rows) r.target_chat_id = targetChatId;
        }

        if (rows.length) {
          const { data: insertedRows, error: insertError } = await supabase
            .from('queue_items')
            .upsert(rows, { onConflict: 'campaign_id,scheduled_at,source_message_id', ignoreDuplicates: true })
            .select('id');
          if (insertError) throw insertError;
          summary.items_created += insertedRows?.length || 0;
        }
      }
    }
    return summary;
  } finally {
    isGeneratingQueue = false;
  }
}

async function markFailed(itemId: string, errorMessage: string, retryCount: number, retryAfterSeconds?: number) {
  const shouldRetry = retryCount < 3;
  if (shouldRetry) {
    const delaySeconds = retryAfterSeconds ?? 300;
    await supabase
      .from('queue_items')
      .update({
        status: 'pending',
        retry_count: retryCount + 1,
        error_message: errorMessage,
        scheduled_at: DateTime.now().plus({ seconds: delaySeconds }).toISO()
      })
      .eq('id', itemId);
  } else {
    await supabase
      .from('queue_items')
      .update({ status: 'failed', retry_count: retryCount + 1, error_message: errorMessage })
      .eq('id', itemId);
  }
}

export async function processDueQueueItems() {
  await supabase
    .from('queue_items')
    .update({ status: 'pending', locked_at: null })
    .eq('status', 'processing')
    .lt('locked_at', DateTime.now().minus({ minutes: 15 }).toISO());

  const { data: dueItems } = await supabase
    .from('queue_items')
    .select('*, campaigns(*), source_messages(*)')
    .eq('status', 'pending')
    .lte('scheduled_at', DateTime.now().toISO())
    .order('scheduled_at', { ascending: true })
    .limit(10);

  for (const item of dueItems ?? []) {
    const { data: locked } = await supabase
      .from('queue_items')
      .update({ status: 'processing', locked_at: DateTime.now().toISO() })
      .eq('id', item.id)
      .eq('status', 'pending')
      .select('*')
      .single();

    if (!locked) continue;

    try {
      const campaign: any = item.campaigns;
      const source: any = item.source_messages;
      const mode = campaign.copy_mode;
      const captionMode = campaign.caption_mode || 'original';
      const customCaption = campaign.custom_caption || null;

      const sendOne = async (message: any) => {
        if (mode === 'forward') {
          return forwardMessage(bot, {
            targetChatId: item.target_chat_id,
            sourceChatId: message.source_chat_id,
            sourceMessageId: message.source_message_id,
            targetThreadId: item.target_message_thread_id
          });
        }
        return copyMessage(bot, {
          targetChatId: item.target_chat_id,
          sourceChatId: message.source_chat_id,
          sourceMessageId: message.source_message_id,
          targetThreadId: item.target_message_thread_id,
          caption: captionMode === 'custom' && customCaption ? customCaption : message.caption
        });
      };

      if (campaign.media_group_mode === 'keep' && source.media_group_id) {
        const { data: albumItems } = await supabase
          .from('source_messages')
          .select('*')
          .eq('source_chat_id', source.source_chat_id)
          .eq('media_group_id', source.media_group_id)
          .order('source_message_id', { ascending: true });

        for (const albumItem of albumItems ?? []) {
          await sendOne(albumItem);
          await sleep(700);
        }
      } else {
        await sendOne(source);
      }

      await supabase
        .from('queue_items')
        .update({ status: 'sent', sent_at: DateTime.now().toISO(), locked_at: null, error_message: null })
        .eq('id', item.id);

      await supabase.from('send_logs').insert({
        queue_item_id: item.id,
        campaign_id: item.campaign_id,
        source_message_id: item.source_message_id,
        action: 'send',
        status: 'sent'
      });
    } catch (err: any) {
      const retryAfter = Number(err?.response?.parameters?.retry_after);
      await markFailed(item.id, err?.message ?? 'Unknown error', item.retry_count, Number.isFinite(retryAfter) ? retryAfter : undefined);
      await supabase.from('send_logs').insert({
        queue_item_id: item.id,
        campaign_id: item.campaign_id,
        source_message_id: item.source_message_id,
        action: 'send',
        status: 'failed',
        error_message: err?.message ?? 'Unknown error',
        response_payload: err?.response ?? null
      });
    }
  }
}
