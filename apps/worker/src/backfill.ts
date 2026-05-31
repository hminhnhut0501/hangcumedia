import { DateTime } from 'luxon';
import { supabase } from './db.js';
import { logger } from './logger.js';

const CHUNK_SIZE = 100;
let isBackfillTickRunning = false;

function normalizeRange(fromId: number, toId: number) {
  const start = Math.min(fromId, toId);
  const end = Math.max(fromId, toId);
  return { start, end, total: end - start + 1 };
}

export async function processBackfillTick() {
  if (isBackfillTickRunning) return;
  isBackfillTickRunning = true;
  try {
    const { data: jobs } = await supabase
      .from('backfill_jobs')
      .select('*')
      .in('status', ['running'])
      .order('created_at', { ascending: true })
      .limit(1);
    const job = jobs?.[0];
    if (!job) return;

    const { start, end } = normalizeRange(Number(job.from_message_id), Number(job.to_message_id));

    const { data: cp } = await supabase
      .from('backfill_checkpoints')
      .select('*')
      .eq('job_id', job.id)
      .order('created_at', { ascending: false })
      .limit(1);
    const lastScanned = Number(cp?.[0]?.last_scanned_message_id ?? (start - 1));
    const chunkFrom = lastScanned + 1;
    if (chunkFrom > end) {
      await supabase
        .from('backfill_jobs')
        .update({
          status: 'done',
          finished_at: DateTime.now().toISO()
        })
        .eq('id', job.id);
      return;
    }

    const chunkTo = Math.min(chunkFrom + CHUNK_SIZE - 1, end);
    let processed = 0;
    let readyCount = 0;
    let linkOnlyCreated = 0;
    let skipped = 0;

    const { data: existing } = await supabase
      .from('source_messages')
      .select('source_message_id,status')
      .eq('source_chat_id', job.source_chat_id)
      .gte('source_message_id', chunkFrom)
      .lte('source_message_id', chunkTo);
    const existingMap = new Map<number, string>();
    for (const row of existing || []) existingMap.set(Number(row.source_message_id), String(row.status || 'ready'));

    const inserts: any[] = [];
    for (let id = chunkFrom; id <= chunkTo; id += 1) {
      processed += 1;
      const status = existingMap.get(id);
      if (status) {
        if (status !== 'link_only') readyCount += 1;
        continue;
      }
      if (!job.create_link_only) {
        skipped += 1;
        continue;
      }
      inserts.push({
        source_chat_id: job.source_chat_id,
        source_message_id: id,
        source_message_thread_id: job.source_thread_id ?? null,
        media_type: 'unknown',
        imported_by: 'backfill_job',
        status: 'link_only',
        text: `backfill_job:${job.id}:${job.source_chat_id}:${id}`
      });
    }

    if (inserts.length) {
      const { error } = await supabase.from('source_messages').insert(inserts);
      if (error) throw error;
      linkOnlyCreated = inserts.length;
    }

    await supabase.from('backfill_checkpoints').insert({
      job_id: job.id,
      last_scanned_message_id: chunkTo,
      processed_count: Number(job.processed_count || 0) + processed
    });

    await supabase
      .from('backfill_jobs')
      .update({
        processed_count: Number(job.processed_count || 0) + processed,
        imported_ready_count: Number(job.imported_ready_count || 0) + readyCount,
        imported_link_only_count: Number(job.imported_link_only_count || 0) + linkOnlyCreated,
        skipped_count: Number(job.skipped_count || 0) + skipped
      })
      .eq('id', job.id);

    if (chunkTo >= end) {
      await supabase
        .from('backfill_jobs')
        .update({
          status: 'done',
          finished_at: DateTime.now().toISO()
        })
        .eq('id', job.id);
    }
  } catch (err: any) {
    logger.error('processBackfillTick failed', err?.message || err);
    const { data: jobs } = await supabase
      .from('backfill_jobs')
      .select('id')
      .in('status', ['running'])
      .order('created_at', { ascending: true })
      .limit(1);
    const active = jobs?.[0];
    if (active?.id) {
      await supabase
        .from('backfill_jobs')
        .update({
          status: 'failed',
          error_count: 1,
          last_error: err?.message || 'unknown error'
        })
        .eq('id', active.id);
    }
  } finally {
    isBackfillTickRunning = false;
  }
}
