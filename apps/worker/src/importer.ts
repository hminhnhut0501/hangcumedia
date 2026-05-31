import { supabase } from './db.js';

function detectMediaType(msg: any): string {
  if (msg.video) return 'video';
  if (msg.photo) return 'photo';
  if (msg.document) return 'document';
  if (msg.animation) return 'animation';
  if (msg.audio) return 'audio';
  if (msg.voice) return 'voice';
  if (msg.text) return 'text';
  return 'unknown';
}

export async function importMessage(msg: any, importedBy = 'bot') {
  const payload = {
    source_chat_id: msg.chat.id,
    source_message_id: msg.message_id,
    source_message_thread_id: msg.message_thread_id ?? null,
    media_group_id: msg.media_group_id ?? null,
    media_type: detectMediaType(msg),
    caption: msg.caption ?? null,
    text: msg.text ?? null,
    raw_payload: msg,
    imported_by: importedBy,
    status: 'ready'
  };

  const { error } = await supabase
    .from('source_messages')
    .upsert(payload, { onConflict: 'source_chat_id,source_message_id' });

  if (error) throw error;

  await supabase
    .from('source_cursors')
    .upsert({
      source_chat_id: msg.chat.id,
      last_seen_message_id: msg.message_id,
      last_reconciled_at: new Date().toISOString()
    }, { onConflict: 'source_chat_id' });
}
