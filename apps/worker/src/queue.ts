import { DateTime } from 'luxon';
import { supabase } from './db.js';
import { bot } from './bot.js';
import { copyMessage, forwardMessage } from './telegram.js';
import { env } from './config.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let isGeneratingQueue = false;

function parseRunTimes(input: string[]): string[] {
  return input
    .map((t) => String(t || '').trim())
    .filter((t) => /^\d{2}:\d{2}$/.test(t));
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

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

async function syncCampaignSourcesFromGroup(campaign: any) {
  if (!campaign.source_group_id) return 0;

  const { data: sourceGroup } = await supabase
    .from('telegram_groups')
    .select('chat_id')
    .eq('id', campaign.source_group_id)
    .single();
  const sourceChatId = sourceGroup?.chat_id;
  if (!sourceChatId) return 0;

  const { data: existingRows } = await supabase
    .from('campaign_sources')
    .select('source_message_id,sort_order')
    .eq('campaign_id', campaign.id)
    .order('sort_order', { ascending: true });
  const existingSet = new Set((existingRows || []).map((r: any) => String(r.source_message_id)));
  let nextSortOrder = (existingRows?.length || 0) > 0
    ? Number(existingRows![existingRows!.length - 1].sort_order || 0) + 1
    : 0;

  const { data: pool } = await supabase
    .from('source_messages')
    .select('id,created_at,source_message_id,status')
    .eq('source_chat_id', sourceChatId)
    .neq('status', 'link_only')
    // Fetch newest first to avoid missing recent items when table grows.
    .order('source_message_id', { ascending: false })
    .limit(2000);
  if (!pool?.length) return 0;

  const missing = pool
    .filter((msg: any) => !existingSet.has(String(msg.id)))
    .sort((a: any, b: any) => Number(a.source_message_id) - Number(b.source_message_id));
  if (!missing.length) return 0;

  const rows = missing.map((msg: any) => ({
    campaign_id: campaign.id,
    source_message_id: msg.id,
    sort_order: nextSortOrder++
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
    sources_synced: 0,
    skipped_no_sources: 0,
    skipped_no_target_group: 0,
    skipped_existing_slot: 0,
    skipped_past_slot: 0,
    skipped_locked: 0,
    skipped_exhausted_today: 0,
    exhausted_campaigns: 0
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
      const synced = await syncCampaignSourcesFromGroup(campaign);
      summary.sources_synced += synced;
      if (synced > 0) {
        await supabase
          .from('campaigns')
          .update({ source_state: 'ready' })
          .eq('id', campaign.id);
      }
      const globalRunTimes = env.GLOBAL_RUN_TIMES
        ? parseRunTimes(env.GLOBAL_RUN_TIMES.split(','))
        : [];
      const rawRunTimes: string[] = globalRunTimes.length > 0
        ? globalRunTimes
        : (campaign.run_times ?? ['21:00']);
      const runTimes = parseRunTimes(rawRunTimes);
      const effectiveRunTimes = runTimes.length ? runTimes : ['21:00'];
      const computedRunsPerDay = effectiveRunTimes.length;
      if ((campaign.runs_per_day || 0) !== computedRunsPerDay) {
        await supabase
          .from('campaigns')
          .update({ runs_per_day: computedRunsPerDay })
          .eq('id', campaign.id);
      }
      const tz = campaign.timezone || 'Asia/Ho_Chi_Minh';
      const todayInCampaignTz = DateTime.now().setZone(tz);
      const dayStartUtc = todayInCampaignTz.startOf('day').toUTC().toISO();
      const dayEndUtc = todayInCampaignTz.endOf('day').toUTC().toISO();

      const { data: sources } = await supabase
        .from('campaign_sources')
        .select('sort_order, source_messages(*)')
        .eq('campaign_id', campaign.id)
        .order('sort_order', { ascending: true });

      if (!sources?.length) {
        summary.skipped_no_sources += 1;
        await supabase
          .from('campaigns')
          .update({ source_state: 'waiting_for_source', last_exhausted_at: DateTime.now().toISO() })
          .eq('id', campaign.id);
        continue;
      }

      // Global non-repeat policy:
      // a source message is queued only once for this campaign across its lifetime.
      const usedAllSourceIds = new Set<string>();
      const { data: usedAllRows } = await supabase
        .from('queue_items')
        .select('source_message_id')
        .eq('campaign_id', campaign.id)
        .in('status', ['pending', 'processing', 'sent']);
      for (const row of usedAllRows || []) usedAllSourceIds.add(String(row.source_message_id));

      const sourceIdSet = new Set<string>();
      for (const item of sources || []) {
        const src = Array.isArray(item?.source_messages) ? item.source_messages[0] : item?.source_messages;
        if (src?.id) sourceIdSet.add(String(src.id));
      }
      const totalConfigured = sourceIdSet.size;
      const totalUsed = Array.from(sourceIdSet).filter((id) => usedAllSourceIds.has(id)).length;
      if (totalConfigured > 0 && totalUsed >= totalConfigured) {
        summary.exhausted_campaigns += 1;
        await supabase
          .from('campaigns')
          .update({ source_state: 'waiting_for_source', last_exhausted_at: DateTime.now().toISO() })
          .eq('id', campaign.id);
        await supabase.from('send_logs').insert({
          campaign_id: campaign.id,
          action: 'generate',
          status: 'exhausted',
          error_message: 'Campaign đã hết source chưa dùng. Hãy thêm source mới vào campaign.'
        });
        continue;
      }
      await supabase
        .from('campaigns')
        .update({ source_state: 'ready' })
        .eq('id', campaign.id);

      // Prevent repeating the same source message within the same campaign day.
      const usedTodaySourceIds = new Set<string>();
      if (dayStartUtc && dayEndUtc) {
        const { data: usedToday } = await supabase
          .from('queue_items')
          .select('source_message_id')
          .eq('campaign_id', campaign.id)
          .gte('scheduled_at', dayStartUtc)
          .lte('scheduled_at', dayEndUtc);
        for (const row of usedToday || []) usedTodaySourceIds.add(String(row.source_message_id));
      }

      for (const time of effectiveRunTimes) {
        summary.slots_checked += 1;
        const [h, m] = time.split(':').map(Number);
        const baseInCampaignTz = DateTime.now().setZone(tz);
        const scheduledLocal = baseInCampaignTz.set({ hour: h, minute: m, second: 0, millisecond: 0 });
        const scheduledAt = scheduledLocal.toUTC().toISO();
        if (!scheduledAt) continue;
        const nowInCampaignTz = DateTime.now().setZone(tz);
        if (scheduledLocal < nowInCampaignTz.minus({ seconds: env.MAX_LATE_SECONDS })) {
          summary.skipped_past_slot += 1;
          continue;
        }
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

        const normalized = (sources || []).map((item: any) => ({
          sort_order: item.sort_order ?? 0,
          source: item.source_messages
        })).filter((x: any) => Boolean(x.source));

        let picked: any[] = [];

        if (campaign.media_group_mode === 'keep') {
        const albumSeen = new Set<string>();
        const units: Array<{ key: string; sort_order: number; rows: any[] }> = [];
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

          units.push({ key, sort_order: row.sort_order, rows });
        }
        units.sort((a, b) => a.sort_order - b.sort_order);
        picked = shuffle(units).slice(0, campaign.batch_size).map((u) => u.rows[0]);
        } else {
        const sortable = [...normalized].sort((a, b) => a.sort_order - b.sort_order);
        picked = shuffle(sortable).slice(0, campaign.batch_size).map((x) => x.source);
        }

        // No repeat within same day: only pick messages that have not been used today.
        picked = picked
          .filter((source: any) => !usedTodaySourceIds.has(String(source.id)))
          .filter((source: any) => !usedAllSourceIds.has(String(source.id)));
        if (picked.length === 0) {
          summary.skipped_exhausted_today += 1;
          continue;
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
          for (const source of picked) {
            usedTodaySourceIds.add(String(source.id));
            usedAllSourceIds.add(String(source.id));
          }
        }
      }
    }
    return summary;
  } finally {
    isGeneratingQueue = false;
  }
}

async function markFailed(itemId: string, errorMessage: string, retryCount: number, retryAfterSeconds?: number, forceNoRetry = false) {
  const shouldRetry = !forceNoRetry && retryCount < 3;
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

    const scheduledAt = DateTime.fromISO(item.scheduled_at);
    const lateSeconds = Math.floor(DateTime.now().diff(scheduledAt, 'seconds').seconds);
    if (lateSeconds > env.MAX_LATE_SECONDS) {
      await supabase
        .from('queue_items')
        .update({
          status: 'skipped',
          locked_at: null,
          error_message: `Skipped late item (+${lateSeconds}s > ${env.MAX_LATE_SECONDS}s)`
        })
        .eq('id', item.id);
      await supabase.from('send_logs').insert({
        queue_item_id: item.id,
        campaign_id: item.campaign_id,
        source_message_id: item.source_message_id,
        action: 'send',
        status: 'skipped',
        error_message: `Skipped because item is too late (+${lateSeconds}s)`
      });
      continue;
    }

    try {
      const campaign: any = item.campaigns;
      const source: any = item.source_messages;
      const mode = campaign.copy_mode;
      const captionMode = campaign.caption_mode || 'original';
      const customCaption = campaign.custom_caption || null;

      const sentRefs: any[] = [];
      const sendOne = async (message: any) => {
        if (mode === 'forward') {
          const result = await forwardMessage(bot, {
            targetChatId: item.target_chat_id,
            sourceChatId: message.source_chat_id,
            sourceMessageId: message.source_message_id,
            targetThreadId: item.target_message_thread_id
          });
          sentRefs.push({
            source_chat_id: message.source_chat_id,
            source_message_id: message.source_message_id,
            telegram_result: result
          });
          return result;
        }
        const result = await copyMessage(bot, {
          targetChatId: item.target_chat_id,
          sourceChatId: message.source_chat_id,
          sourceMessageId: message.source_message_id,
          targetThreadId: item.target_message_thread_id,
          caption: captionMode === 'custom' && customCaption ? customCaption : message.caption
        });
        sentRefs.push({
          source_chat_id: message.source_chat_id,
          source_message_id: message.source_message_id,
          telegram_result: result
        });
        return result;
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
        .update({
          status: 'sent',
          sent_at: DateTime.now().toISO(),
          locked_at: null,
          error_message: null,
          result_payload: {
            sent_count: sentRefs.length,
            refs: sentRefs
          }
        })
        .eq('id', item.id);

      await supabase.from('send_logs').insert({
        queue_item_id: item.id,
        campaign_id: item.campaign_id,
        source_message_id: item.source_message_id,
        action: 'send',
        status: 'sent'
      });
    } catch (err: any) {
      const telegramCode = Number(err?.response?.error_code);
      const retryAfter = Number(err?.response?.parameters?.retry_after);
      const forceNoRetry = telegramCode === 400;
      await markFailed(
        item.id,
        err?.message ?? 'Unknown error',
        item.retry_count,
        Number.isFinite(retryAfter) ? retryAfter : undefined,
        forceNoRetry
      );
      await supabase
        .from('queue_items')
        .update({
          result_payload: {
            telegram_error_code: telegramCode || null,
            telegram_response: err?.response ?? null,
            no_retry: forceNoRetry
          }
        })
        .eq('id', item.id);
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
