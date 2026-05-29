import { DateTime } from 'luxon';
import { supabase } from './db.js';
import { bot } from './bot.js';
import { copyMessage, forwardMessage } from './telegram.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function generateQueueForCampaign(campaignId?: string) {
  const now = DateTime.now();
  let query = supabase.from('campaigns').select('*').eq('status', 'active');
  if (campaignId) query = query.eq('id', campaignId);
  const { data: campaigns, error } = await query;
  if (error || !campaigns) throw error;

  for (const campaign of campaigns) {
    const runTimes: string[] = campaign.run_times ?? ['21:00'];
    const { data: sources } = await supabase
      .from('campaign_sources')
      .select('sort_order, source_messages(*)')
      .eq('campaign_id', campaign.id)
      .order('sort_order', { ascending: true });

    if (!sources?.length) continue;

    for (const time of runTimes) {
      const [h, m] = time.split(':').map(Number);
      const scheduledAt = now.set({ hour: h, minute: m, second: 0, millisecond: 0 }).toUTC().toISO();
      const { data: existed } = await supabase
        .from('queue_items')
        .select('id')
        .eq('campaign_id', campaign.id)
        .eq('scheduled_at', scheduledAt!)
        .limit(1);
      if (existed && existed.length > 0) continue;

      const batch = sources.slice(0, campaign.batch_size);
      const rows = batch.map((item: any) => ({
        campaign_id: campaign.id,
        source_message_id: item.source_messages.id,
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
      if (!targetChatId) continue;

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

      if (rows.length) await supabase.from('queue_items').insert(rows);
    }
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
