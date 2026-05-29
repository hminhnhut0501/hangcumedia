import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false }
});

async function main() {
  const allowlist = (process.env.ADMIN_EMAIL_ALLOWLIST || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (allowlist[0]) {
    const { error } = await supabase.from('admins').upsert({ email: allowlist[0], role: 'admin' }, { onConflict: 'email' });
    if (error) throw error;
  }

  await supabase.from('telegram_groups').upsert([
    { title: 'Backup Group Sample', chat_id: -1001111111111, type: 'backup', is_forum: true },
    { title: 'Main Group Sample', chat_id: -1002222222222, type: 'main', is_forum: true }
  ], { onConflict: 'chat_id' });

  console.log('Seed completed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
