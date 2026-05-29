'use client';

import { useEffect, useState } from 'react';
import { AuthGuard } from '@/components/AuthGuard';
import { Nav } from '@/components/Nav';
import { supabase } from '@/lib/supabase';

export default function InboxPage() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    supabase.from('source_messages').select('*').order('created_at', { ascending: false }).limit(200).then(({ data }) => setRows(data || []));
  }, []);

  return (
    <AuthGuard>
      <main className="container space-y-4">
        <Nav />
        <section className="card overflow-auto">
          <table className="table">
            <thead><tr><th>chat</th><th>msg</th><th>thread</th><th>album</th><th>type</th><th>caption/text</th><th>count</th><th>imported_by</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.id}><td>{r.source_chat_id}</td><td>{r.source_message_id}</td><td>{r.source_message_thread_id || '-'}</td><td>{r.media_group_id || '-'}</td><td>{r.media_type}</td><td>{(r.caption || r.text || '').slice(0, 80)}</td><td>{r.album_item_count}</td><td>{r.imported_by}</td></tr>)}</tbody>
          </table>
        </section>
      </main>
    </AuthGuard>
  );
}
