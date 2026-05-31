import type { Express, Request, Response, NextFunction } from 'express';
import { env } from './config.js';
import { bot } from './bot.js';
import { createForumTopic, getChat, getChatAdministrators } from './telegram.js';
import { supabase } from './db.js';
import { parseTelegramLink } from './linkParser.js';
import { generateQueueForCampaign } from './queue.js';
import { reconcileAllBackupSources, reconcileSourceByChatId } from './reconcile.js';

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const secret = req.header('x-admin-secret');
  if (!secret || secret !== env.ADMIN_API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

export function registerRoutes(app: Express) {
  async function runCampaignPreflight(campaignId: string) {
    const issues: string[] = [];
    const warnings: string[] = [];

    const { data: campaign } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();
    if (!campaign) throw new Error('campaign not found');

    const { data: targetGroup } = await supabase
      .from('telegram_groups')
      .select('*')
      .eq('id', campaign.target_group_id)
      .single();
    if (!targetGroup?.chat_id) {
      issues.push('Nhóm đích chưa có chat_id hợp lệ.');
    } else {
      try {
        await getChat(bot, Number(targetGroup.chat_id));
        const admins = await getChatAdministrators(bot, Number(targetGroup.chat_id));
        const botAdmin = admins.some((a: any) => a.user?.is_bot);
        if (!botAdmin) warnings.push('Bot chưa có admin trong nhóm đích. Có thể gửi được nhưng dễ thiếu quyền topic.');
      } catch (err: any) {
        issues.push(`Bot không truy cập được nhóm đích (${targetGroup.chat_id}): ${err?.message || 'unknown'}`);
      }
    }

    const { data: rows } = await supabase
      .from('campaign_sources')
      .select('source_messages(status)')
      .eq('campaign_id', campaignId);
    const totalSources = rows?.length || 0;
    const linkOnlyCount = (rows || []).filter((r: any) => r.source_messages?.status === 'link_only').length;
    const readyCount = totalSources - linkOnlyCount;

    if (totalSources === 0) {
      issues.push('Campaign chưa có source message.');
    } else if (readyCount === 0) {
      warnings.push('Toàn bộ source hiện là link_only. Có thể gặp lỗi "message to copy not found".');
    } else if (linkOnlyCount > 0) {
      warnings.push(`Có ${linkOnlyCount}/${totalSources} source là link_only. Nên forward bài gốc cho bot để tăng tỷ lệ gửi thành công.`);
    }

    return {
      ok: issues.length === 0,
      issues,
      warnings,
      stats: { total_sources: totalSources, ready_sources: readyCount, link_only_sources: linkOnlyCount }
    };
  }

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'worker' });
  });

  app.get('/api/runtime/status', requireAdmin, async (_req, res) => {
    const [cursors, jobs, waitingCampaigns] = await Promise.all([
      supabase.from('source_cursors').select('*').order('updated_at', { ascending: false }).limit(50),
      supabase.from('ingest_jobs').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('campaigns').select('id,name,source_state,last_exhausted_at,status').order('updated_at', { ascending: false }).limit(50)
    ]);
    res.json({
      ok: true,
      cursors: cursors.data || [],
      ingest_jobs: jobs.data || [],
      campaigns: waitingCampaigns.data || []
    });
  });

  app.get('/api/analytics/summary/:range', requireAdmin, async (req, res) => {
    const range = req.params.range === '7d' ? '7d' : '24h';
    const fromIso = range === '7d'
      ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [{ data: sendLogs }, { data: queueItems }, { data: campaigns }] = await Promise.all([
      supabase.from('send_logs').select('status,action,created_at,error_message').gte('created_at', fromIso),
      supabase.from('queue_items').select('status,created_at').gte('created_at', fromIso),
      supabase.from('campaigns').select('id,name,status,source_state')
    ]);

    const sendStats = { sent: 0, failed: 0, skipped: 0, auto_pause: 0 };
    for (const row of sendLogs || []) {
      if (row.action === 'auto_pause') sendStats.auto_pause += 1;
      if (row.status === 'sent') sendStats.sent += 1;
      if (row.status === 'failed') sendStats.failed += 1;
      if (row.status === 'skipped') sendStats.skipped += 1;
    }

    const queueStats = { pending: 0, processing: 0, sent: 0, failed: 0, skipped: 0 };
    for (const row of queueItems || []) {
      const key = String(row.status || '');
      if (key in queueStats) (queueStats as any)[key] += 1;
    }

    const topErrorsMap = new Map<string, number>();
    for (const row of sendLogs || []) {
      if (row.status !== 'failed') continue;
      const key = String(row.error_message || 'Unknown error').slice(0, 140);
      topErrorsMap.set(key, (topErrorsMap.get(key) || 0) + 1);
    }
    const top_errors = Array.from(topErrorsMap.entries())
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    res.json({
      ok: true,
      range,
      from: fromIso,
      send: sendStats,
      queue: queueStats,
      campaigns: campaigns || [],
      top_errors
    });
  });

  app.get('/api/telegram/webhook-info', requireAdmin, async (_req, res) => {
    try {
      const info = await bot.telegram.getWebhookInfo();
      res.json({ ok: true, info });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err?.message || 'getWebhookInfo failed' });
    }
  });

  app.post('/telegram/webhook/:secret', async (req, res) => {
    if (req.params.secret !== env.TELEGRAM_WEBHOOK_SECRET) return res.status(401).json({ error: 'invalid secret' });
    await bot.handleUpdate(req.body);
    res.json({ ok: true });
  });

  app.post('/api/topics/create', requireAdmin, async (req, res) => {
    const { groupId, name } = req.body;
    const { data: group } = await supabase.from('telegram_groups').select('*').eq('id', groupId).single();
    if (!group) return res.status(404).json({ error: 'group not found' });

    const topic = await createForumTopic(bot, group.chat_id, name);
    const { data, error } = await supabase
      .from('topics')
      .insert({ group_id: groupId, name, message_thread_id: topic.message_thread_id, created_by_bot: true })
      .select('*')
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ topic: data });
  });

  app.post('/api/topics/sync', requireAdmin, async (req, res) => {
    const { chatId } = req.body;
    const chat = await getChat(bot, Number(chatId));
    const admins = await getChatAdministrators(bot, Number(chatId));
    res.json({ chat, admins_count: admins.length });
  });

  app.post('/api/import/link', requireAdmin, async (req, res) => {
    const { link } = req.body;
    const parsed = parseTelegramLink(link);
    if (!parsed) return res.status(400).json({ error: 'invalid link' });

    if (parsed.kind === 'private_c' && parsed.chatId) {
      const { data: found } = await supabase
        .from('source_messages')
        .select('*')
        .eq('source_chat_id', parsed.chatId)
        .eq('source_message_id', parsed.messageId)
        .maybeSingle();

      if (found) return res.json({ status: 'ready', message: found });

      const { data } = await supabase
        .from('source_messages')
        .insert({
          source_chat_id: parsed.chatId,
          source_message_id: parsed.messageId,
          source_message_thread_id: parsed.possibleThreadId ?? null,
          media_type: 'unknown',
          text: parsed.raw,
          imported_by: 'link_import',
          status: 'link_only'
        })
        .select('*')
        .single();

      return res.json({
        status: 'link_only',
        message: data,
        warning: 'Bot chưa có metadata bài này. Hãy forward bài này cho bot hoặc đảm bảo bot đã ở group backup trước khi bài được đăng.'
      });
    }

    res.status(400).json({ error: 'public username links are parsed but not resolvable in MVP' });
  });

  app.post('/api/import/range', requireAdmin, async (req, res) => {
    const chatId = Number(req.body?.chat_id);
    const fromId = Number(req.body?.from_message_id);
    const toId = Number(req.body?.to_message_id);

    if (!Number.isFinite(chatId) || !Number.isFinite(fromId) || !Number.isFinite(toId)) {
      return res.status(400).json({ error: 'chat_id/from_message_id/to_message_id must be numbers' });
    }

    const start = Math.min(fromId, toId);
    const end = Math.max(fromId, toId);
    const total = end - start + 1;
    const maxRange = 500;
    if (total > maxRange) {
      return res.status(400).json({ error: `Range too large. Max ${maxRange} IDs per request.` });
    }

    let existedReady = 0;
    let existedLinkOnly = 0;
    let createdLinkOnly = 0;
    const checkpoints: Array<{ processed: number; total: number; percent: number }> = [];

    for (let i = 0; i < total; i++) {
      const messageId = start + i;
      const { data: found } = await supabase
        .from('source_messages')
        .select('id,status')
        .eq('source_chat_id', chatId)
        .eq('source_message_id', messageId)
        .maybeSingle();

      if (found) {
        if (found.status === 'link_only') existedLinkOnly += 1;
        else existedReady += 1;
      } else {
        const { error } = await supabase.from('source_messages').insert({
          source_chat_id: chatId,
          source_message_id: messageId,
          media_type: 'unknown',
          imported_by: 'range_import',
          status: 'link_only',
          text: `range_import:${chatId}:${messageId}`
        });
        if (!error) createdLinkOnly += 1;
      }

      const processed = i + 1;
      if (processed % 50 === 0 || processed === total) {
        checkpoints.push({
          processed,
          total,
          percent: Math.round((processed / total) * 100)
        });
      }
    }

    await supabase
      .from('source_cursors')
      .upsert({
        source_chat_id: chatId,
        last_seen_message_id: end,
        last_reconciled_at: new Date().toISOString()
      }, { onConflict: 'source_chat_id' });

    res.json({
      ok: true,
      range: { chat_id: chatId, from_message_id: start, to_message_id: end, total },
      summary: {
        existed_ready: existedReady,
        existed_link_only: existedLinkOnly,
        created_link_only: createdLinkOnly
      },
      checkpoints
    });
  });

  app.post('/api/import/reconcile', requireAdmin, async (req, res) => {
    const chatIdRaw = req.body?.chat_id;
    if (chatIdRaw !== undefined && chatIdRaw !== null && String(chatIdRaw).length > 0) {
      const chatId = Number(chatIdRaw);
      if (!Number.isFinite(chatId)) return res.status(400).json({ ok: false, error: 'chat_id must be a number' });
      const { data: sourceGroup } = await supabase
        .from('telegram_groups')
        .select('id')
        .eq('chat_id', chatId)
        .eq('type', 'backup')
        .maybeSingle();
      const one = await reconcileSourceByChatId(chatId, sourceGroup?.id ?? null);
      return res.json({ ok: true, mode: 'single', result: one });
    }

    const all = await reconcileAllBackupSources();
    res.json({ ok: true, mode: 'all', results: all });
  });

  app.post('/api/backfill/jobs/create', requireAdmin, async (req, res) => {
    const sourceGroupId = String(req.body?.source_group_id || '');
    const fromId = Number(req.body?.from_message_id);
    const toId = Number(req.body?.to_message_id);
    const sourceThreadId = req.body?.source_thread_id === null || req.body?.source_thread_id === undefined
      ? null
      : Number(req.body?.source_thread_id);
    const createLinkOnly = req.body?.create_link_only !== false;

    if (!sourceGroupId) return res.status(400).json({ ok: false, error: 'source_group_id is required' });
    if (!Number.isFinite(fromId) || !Number.isFinite(toId)) {
      return res.status(400).json({ ok: false, error: 'from_message_id/to_message_id must be numbers' });
    }

    const { data: sourceGroup } = await supabase
      .from('telegram_groups')
      .select('id,chat_id,type')
      .eq('id', sourceGroupId)
      .single();
    if (!sourceGroup || sourceGroup.type !== 'backup') {
      return res.status(400).json({ ok: false, error: 'source_group_id must be an active backup group' });
    }

    const start = Math.min(fromId, toId);
    const end = Math.max(fromId, toId);
    const total = end - start + 1;

    const { data: job, error } = await supabase
      .from('backfill_jobs')
      .insert({
        source_group_id: sourceGroup.id,
        source_chat_id: sourceGroup.chat_id,
        source_thread_id: Number.isFinite(sourceThreadId as number) ? sourceThreadId : null,
        from_message_id: start,
        to_message_id: end,
        create_link_only: createLinkOnly,
        total_estimated: total,
        status: 'pending'
      })
      .select('*')
      .single();
    if (error) return res.status(400).json({ ok: false, error: error.message });
    res.json({ ok: true, job });
  });

  app.get('/api/backfill/jobs', requireAdmin, async (_req, res) => {
    const { data, error } = await supabase
      .from('backfill_jobs')
      .select('*,telegram_groups(title)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return res.status(400).json({ ok: false, error: error.message });
    res.json({ ok: true, jobs: data || [] });
  });

  app.get('/api/backfill/jobs/:id', requireAdmin, async (req, res) => {
    const { data: job, error } = await supabase
      .from('backfill_jobs')
      .select('*,telegram_groups(title)')
      .eq('id', req.params.id)
      .single();
    if (error || !job) return res.status(404).json({ ok: false, error: 'job not found' });
    const { data: checkpoints } = await supabase
      .from('backfill_checkpoints')
      .select('*')
      .eq('job_id', req.params.id)
      .order('created_at', { ascending: false })
      .limit(20);
    res.json({ ok: true, job, checkpoints: checkpoints || [] });
  });

  app.post('/api/backfill/jobs/:id/start', requireAdmin, async (req, res) => {
    const { data: job } = await supabase.from('backfill_jobs').select('*').eq('id', req.params.id).single();
    if (!job) return res.status(404).json({ ok: false, error: 'job not found' });
    if (job.status === 'done') return res.status(400).json({ ok: false, error: 'job already done' });
    await supabase
      .from('backfill_jobs')
      .update({ status: 'running', started_at: job.started_at || new Date().toISOString(), last_error: null })
      .eq('id', req.params.id);
    res.json({ ok: true });
  });

  app.post('/api/backfill/jobs/:id/pause', requireAdmin, async (req, res) => {
    await supabase
      .from('backfill_jobs')
      .update({ status: 'paused' })
      .eq('id', req.params.id)
      .eq('status', 'running');
    res.json({ ok: true });
  });

  app.post('/api/backfill/jobs/:id/cancel', requireAdmin, async (req, res) => {
    await supabase
      .from('backfill_jobs')
      .update({ status: 'cancelled', finished_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .in('status', ['pending', 'running', 'paused', 'failed']);
    res.json({ ok: true });
  });

  app.post('/api/queue/generate', requireAdmin, async (req, res) => {
    const summary = await generateQueueForCampaign(req.body?.campaignId);
    res.json({ ok: true, summary });
  });

  app.post('/api/campaigns/:id/preflight', requireAdmin, async (req, res) => {
    try {
      const result = await runCampaignPreflight(req.params.id);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err?.message || 'Preflight failed' });
    }
  });

  app.post('/api/campaigns/preflight-all', requireAdmin, async (_req, res) => {
    try {
      const { data: campaigns } = await supabase
        .from('campaigns')
        .select('id,name,status')
        .neq('status', 'archived')
        .order('created_at', { ascending: false });
      const results = [];
      for (const campaign of campaigns || []) {
        const pf = await runCampaignPreflight(campaign.id);
        results.push({
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          ...pf
        });
      }
      const failed = results.filter((r: any) => !r.ok).length;
      const warned = results.filter((r: any) => r.ok && (r.warnings?.length || 0) > 0).length;
      res.json({
        ok: true,
        summary: {
          total: results.length,
          failed,
          warned,
          healthy: results.length - failed - warned
        },
        results
      });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err?.message || 'preflight-all failed' });
    }
  });

  app.post('/api/queue/:id/retry', requireAdmin, async (req, res) => {
    await supabase
      .from('queue_items')
      .update({ status: 'pending', error_message: null, locked_at: null })
      .eq('id', req.params.id);
    res.json({ ok: true });
  });

  app.post('/api/queue/:id/skip', requireAdmin, async (req, res) => {
    await supabase
      .from('queue_items')
      .update({ status: 'skipped', locked_at: null, error_message: null })
      .eq('id', req.params.id);
    res.json({ ok: true });
  });

  app.post('/api/queue/:id/cancel', requireAdmin, async (req, res) => {
    await supabase
      .from('queue_items')
      .delete()
      .eq('id', req.params.id)
      .eq('status', 'pending');
    res.json({ ok: true });
  });

  app.post('/api/queue/:id/send-now', requireAdmin, async (req, res) => {
    await supabase
      .from('queue_items')
      .update({ status: 'pending', scheduled_at: new Date().toISOString(), locked_at: null, error_message: null })
      .eq('id', req.params.id);
    res.json({ ok: true });
  });

  app.post('/api/queue/cleanup', requireAdmin, async (req, res) => {
    const keepDays = Math.max(1, Number(req.body?.keepDays || 7));
    const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from('queue_items')
      .delete()
      .in('status', ['sent', 'skipped'])
      .lt('created_at', cutoff);
    if (error) return res.status(400).json({ ok: false, error: error.message });
    res.json({ ok: true, keepDays });
  });

  app.post('/api/logs/cleanup', requireAdmin, async (req, res) => {
    const keepDays = Math.max(1, Number(req.body?.keepDays || 7));
    const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from('send_logs')
      .delete()
      .lt('created_at', cutoff);
    if (error) return res.status(400).json({ ok: false, error: error.message });
    res.json({ ok: true, keepDays });
  });

  app.post('/api/campaigns/:id/pause', requireAdmin, async (req, res) => {
    const { data, error } = await supabase
      .from('campaigns')
      .update({ status: 'paused' })
      .eq('id', req.params.id)
      .select('id,status');
    if (error) return res.status(400).json({ ok: false, error: error.message });
    if (!data || data.length === 0) return res.status(404).json({ ok: false, error: 'Campaign not found or not updated' });
    res.json({ ok: true, campaign: data[0] });
  });

  app.post('/api/campaigns/:id/resume', requireAdmin, async (req, res) => {
    const { data, error } = await supabase
      .from('campaigns')
      .update({ status: 'active' })
      .eq('id', req.params.id)
      .select('id,status');
    if (error) return res.status(400).json({ ok: false, error: error.message });
    if (!data || data.length === 0) return res.status(404).json({ ok: false, error: 'Campaign not found or not updated' });
    res.json({ ok: true, campaign: data[0] });
  });

  async function deleteCampaignInternal(campaignId: string, res: Response) {
    const { data: found, error: findError } = await supabase
      .from('campaigns')
      .select('id')
      .eq('id', campaignId)
      .maybeSingle();
    if (findError) return res.status(400).json({ ok: false, error: findError.message });
    if (!found) return res.status(404).json({ ok: false, error: 'Campaign not found' });

    const deleteErrors: string[] = [];

    // Defensive delete for old schemas that may miss ON DELETE CASCADE.
    const [e1, e2, e3] = await Promise.all([
      supabase.from('campaign_sources').delete().eq('campaign_id', campaignId),
      supabase.from('queue_items').delete().eq('campaign_id', campaignId),
      supabase.from('send_logs').update({ campaign_id: null }).eq('campaign_id', campaignId)
    ]);
    if (e1.error) deleteErrors.push(`campaign_sources: ${e1.error.message}`);
    if (e2.error) deleteErrors.push(`queue_items: ${e2.error.message}`);
    if (e3.error) deleteErrors.push(`send_logs: ${e3.error.message}`);
    if (deleteErrors.length > 0) {
      return res.status(400).json({ ok: false, error: `Failed cleanup before delete: ${deleteErrors.join(' | ')}` });
    }

    const { data, error } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', campaignId)
      .select('id');
    if (error) return res.status(400).json({ ok: false, error: error.message });
    if (!data || data.length === 0) return res.status(409).json({ ok: false, error: 'Delete did not affect any rows' });
    res.json({ ok: true, deleted_id: data[0].id });
  }

  app.delete('/api/campaigns/:id', requireAdmin, async (req, res) => {
    return deleteCampaignInternal(req.params.id, res);
  });

  // POST alias to avoid proxies/environments that mishandle DELETE.
  app.post('/api/campaigns/:id/delete', requireAdmin, async (req, res) => {
    return deleteCampaignInternal(req.params.id, res);
  });
}
