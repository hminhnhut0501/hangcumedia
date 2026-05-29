import { supabase } from './db.js';

const timers = new Map<string, NodeJS.Timeout>();

export function handleAlbumMessage(sourceChatId: number, mediaGroupId: string) {
  const key = `${sourceChatId}:${mediaGroupId}`;
  const prev = timers.get(key);
  if (prev) clearTimeout(prev);

  const timer = setTimeout(async () => {
    const { data, error } = await supabase
      .from('source_messages')
      .select('id,source_message_id')
      .eq('source_chat_id', sourceChatId)
      .eq('media_group_id', mediaGroupId)
      .order('source_message_id', { ascending: true });

    if (error || !data || data.length === 0) return;

    const headId = data[0].id;
    const count = data.length;

    await supabase
      .from('source_messages')
      .update({ is_album_head: false, album_item_count: count })
      .eq('source_chat_id', sourceChatId)
      .eq('media_group_id', mediaGroupId);

    await supabase.from('source_messages').update({ is_album_head: true }).eq('id', headId);
    timers.delete(key);
  }, 2000);

  timers.set(key, timer);
}
