import { Telegraf } from 'telegraf';
import { env } from './config.js';
import { importMessage } from './importer.js';
import { supabase } from './db.js';
import { handleAlbumMessage } from './album.js';

export const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

async function isTelegramAdminUser(telegramUserId?: number): Promise<boolean> {
  if (!telegramUserId) return false;
  const { data } = await supabase
    .from('admins')
    .select('id')
    .eq('telegram_user_id', telegramUserId)
    .maybeSingle();
  return !!data;
}

bot.start(async (ctx) => ctx.reply('Bot is running. Use /id to inspect chat metadata.'));

bot.command('id', async (ctx) => {
  const msg = ctx.message as any;
  await ctx.reply(`chat_id: ${ctx.chat.id}\nmessage_thread_id: ${msg?.message_thread_id ?? 'none'}`);
});

bot.command('register_group', async (ctx) => {
  const chat: any = ctx.chat;
  const payload = {
    title: (chat.title ?? `${chat.first_name ?? ''} ${chat.last_name ?? ''}`.trim()) || 'Unknown',
    chat_id: chat.id,
    username: chat.username ?? null,
    type: 'backup',
    is_forum: !!chat.is_forum,
    is_active: true
  };

  const { error } = await supabase.from('telegram_groups').upsert(payload, { onConflict: 'chat_id' });
  if (error) {
    await ctx.reply(`register failed: ${error.message}`);
    return;
  }
  await ctx.reply('Group registered/updated.');
});

bot.command('scan', async (ctx) => {
  const replyTo = (ctx.message as any)?.reply_to_message;
  if (!replyTo) {
    await ctx.reply('Reply to a message and run /scan.');
    return;
  }
  await importMessage(replyTo, 'scan_command');
  if (replyTo.media_group_id) handleAlbumMessage(replyTo.chat.id, replyTo.media_group_id);
  await ctx.reply('Imported replied message.');
});

bot.on('message', async (ctx) => {
  const msg: any = ctx.message;

  const { data: group } = await supabase
    .from('telegram_groups')
    .select('type')
    .eq('chat_id', ctx.chat.id)
    .maybeSingle();

  const isBackupGroup = group?.type === 'backup';
  const isPrivateAdminForward = ctx.chat.type === 'private' && !!msg.forward_origin;
  const fromUserId = (ctx.from as any)?.id as number | undefined;
  const isAdminPrivateForward = isPrivateAdminForward && await isTelegramAdminUser(fromUserId);

  if (isPrivateAdminForward && !isAdminPrivateForward) {
    await ctx.reply('Bạn không có quyền import nội dung. Vui lòng liên hệ quản trị viên.');
    return;
  }

  if (isBackupGroup || isAdminPrivateForward) {
    await importMessage(msg, isBackupGroup ? 'backup_group' : 'forward_admin');
    if (msg.media_group_id) handleAlbumMessage(msg.chat.id, msg.media_group_id);
  }
});
