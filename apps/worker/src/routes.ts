import type { Express, Request, Response, NextFunction } from 'express';
import { env } from './config.js';
import { bot } from './bot.js';
import { createForumTopic, getChat, getChatAdministrators } from './telegram.js';
import { supabase } from './db.js';
import { parseTelegramLink } from './linkParser.js';
import { generateQueueForCampaign } from './queue.js';

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const secret = req.header('x-admin-secret');
  if (!secret || secret !== env.ADMIN_API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

export function registerRoutes(app: Express) {
  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'worker' });
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

  app.post('/api/queue/generate', requireAdmin, async (req, res) => {
    await generateQueueForCampaign(req.body?.campaignId);
    res.json({ ok: true });
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

  app.post('/api/campaigns/:id/pause', requireAdmin, async (req, res) => {
    await supabase.from('campaigns').update({ status: 'paused' }).eq('id', req.params.id);
    res.json({ ok: true });
  });

  app.post('/api/campaigns/:id/resume', requireAdmin, async (req, res) => {
    await supabase.from('campaigns').update({ status: 'active' }).eq('id', req.params.id);
    res.json({ ok: true });
  });

  app.delete('/api/campaigns/:id', requireAdmin, async (req, res) => {
    await supabase.from('campaigns').delete().eq('id', req.params.id);
    res.json({ ok: true });
  });
}
