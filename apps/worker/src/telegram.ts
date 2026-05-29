import type { Telegraf } from 'telegraf';

export async function copyMessage(bot: Telegraf, params: {
  targetChatId: number;
  sourceChatId: number;
  sourceMessageId: number;
  targetThreadId?: number | null;
  caption?: string | null;
}) {
  return bot.telegram.copyMessage(
    params.targetChatId,
    params.sourceChatId,
    params.sourceMessageId,
    {
      message_thread_id: params.targetThreadId ?? undefined,
      caption: params.caption ?? undefined,
      parse_mode: undefined
    }
  );
}

export async function forwardMessage(bot: Telegraf, params: {
  targetChatId: number;
  sourceChatId: number;
  sourceMessageId: number;
  targetThreadId?: number | null;
}) {
  return bot.telegram.forwardMessage(
    params.targetChatId,
    params.sourceChatId,
    params.sourceMessageId,
    { message_thread_id: params.targetThreadId ?? undefined }
  );
}

export async function createForumTopic(bot: Telegraf, chatId: number, name: string) {
  return bot.telegram.createForumTopic(chatId, name);
}

export async function getChat(bot: Telegraf, chatId: number) {
  return bot.telegram.getChat(chatId);
}

export async function getChatAdministrators(bot: Telegraf, chatId: number) {
  return bot.telegram.getChatAdministrators(chatId);
}
