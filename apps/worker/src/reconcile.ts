import { DateTime } from 'luxon';
import { supabase } from './db.js';
import { logger } from './logger.js';

const DEFAULT_MAX_SCAN = 500;

function normalizeRange(from: number, to: number, maxScan = DEFAULT_MAX_SCAN) {
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  const total = end - start + 1;
  return {
    start,
    end,
    total,
    cappedEnd: total > maxScan ? start + maxScan - 1 : end
  };
}

async function ensureCursor(sourceGroupId: string | null, chatId: number, initialLastSeen = 0) {
  const { data: existing } = await supabase
    .from('source_cursors')
    .select('*')
    .eq('source_chat_id', chatId)
    .maybeSingle();
  if (existing) return existing;

  const { data: inserted, error } = await supabase
    .from('source_cursors')
    .insert({
      source_group_id: sourceGroupId,
      source_chat_id: chatId,
      last_seen_message_id: initialLastSeen,
      last_reconciled_at: DateTime.now().toISO()
    })
    .select('*')
    .single();
  if (error) throw error;
  return inserted;
}

export async function reconcileSourceByChatId(chatId: number, sourceGroupId: string | null, maxScan = DEFAULT_MAX_SCAN) {
  const summary = {
    source_chat_id: chatId,
    scanned_from: 0,
    scanned_to: 0,
    scanned_count: 0,
    created_link_only: 0,
    found_ready: 0,
    notes: ''
  };

  const { data: newest } = await supabase
    .from('source_messages')
    .select('source_message_id')
    .eq('source_chat_id', chatId)
    .order('source_message_id', { ascending: false })
    .limit(1)
    .maybeSingle();

  const maxKnown = Number(newest?.source_message_id || 0);
  const cursor = await ensureCursor(sourceGroupId, chatId, maxKnown);
  const lastSeen = Number(cursor?.last_seen_message_id || 0);

  if (maxKnown <= 0 || maxKnown <= lastSeen) {
    summary.notes = maxKnown <= 0 ? 'no_source_messages_yet' : 'no_new_messages_since_cursor';
    await supabase.from('source_cursors').update({
      source_group_id: sourceGroupId,
      last_reconciled_at: DateTime.now().toISO()
    }).eq('source_chat_id', chatId);
    await supabase.from('ingest_jobs').insert({
      job_type: 'hourly_reconcile',
      source_chat_id: chatId,
      source_group_id: sourceGroupId,
      status: 'ok',
      notes: summary.notes
    });
    return summary;
  }

  const { start, cappedEnd } = normalizeRange(lastSeen + 1, maxKnown, maxScan);
  summary.scanned_from = start;
  summary.scanned_to = cappedEnd;
  summary.scanned_count = cappedEnd - start + 1;

  const { data: existing } = await supabase
    .from('source_messages')
    .select('source_message_id,status')
    .eq('source_chat_id', chatId)
    .gte('source_message_id', start)
    .lte('source_message_id', cappedEnd);

  const existingMap = new Map<number, string>();
  for (const row of existing || []) existingMap.set(Number(row.source_message_id), String(row.status || 'ready'));

  const inserts: any[] = [];
  for (let id = start; id <= cappedEnd; id += 1) {
    const status = existingMap.get(id);
    if (!status) {
      inserts.push({
        source_chat_id: chatId,
        source_message_id: id,
        media_type: 'unknown',
        imported_by: 'hourly_reconcile',
        status: 'link_only',
        text: `hourly_reconcile:${chatId}:${id}`
      });
    } else if (status !== 'link_only') {
      summary.found_ready += 1;
    }
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from('source_messages').insert(inserts);
    if (error) throw error;
    summary.created_link_only = inserts.length;
  }

  await supabase.from('source_cursors').update({
    source_group_id: sourceGroupId,
    last_seen_message_id: cappedEnd,
    last_reconciled_at: DateTime.now().toISO()
  }).eq('source_chat_id', chatId);

  await supabase.from('ingest_jobs').insert({
    job_type: 'hourly_reconcile',
    source_chat_id: chatId,
    source_group_id: sourceGroupId,
    status: 'ok',
    scanned_from: summary.scanned_from,
    scanned_to: summary.scanned_to,
    scanned_count: summary.scanned_count,
    created_link_only: summary.created_link_only,
    found_ready: summary.found_ready
  });

  return summary;
}

export async function reconcileAllBackupSources(maxScan = DEFAULT_MAX_SCAN) {
  const { data: groups } = await supabase
    .from('telegram_groups')
    .select('id,chat_id,title')
    .eq('type', 'backup')
    .eq('is_active', true);
  const results: any[] = [];
  for (const group of groups || []) {
    try {
      const one = await reconcileSourceByChatId(Number(group.chat_id), group.id, maxScan);
      results.push({ title: group.title, ...one, ok: true });
    } catch (err: any) {
      logger.error('reconcile source failed', { chat_id: group.chat_id, error: err?.message });
      await supabase.from('ingest_jobs').insert({
        job_type: 'hourly_reconcile',
        source_chat_id: Number(group.chat_id),
        source_group_id: group.id,
        status: 'failed',
        notes: err?.message || 'unknown error'
      });
      results.push({ title: group.title, source_chat_id: Number(group.chat_id), ok: false, error: err?.message || 'unknown' });
    }
  }
  return results;
}
