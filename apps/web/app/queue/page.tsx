'use client';

import { useEffect, useState } from 'react';
import { AuthGuard } from '@/components/AuthGuard';
import { Nav } from '@/components/Nav';
import { supabase } from '@/lib/supabase';
import { workerPost } from '@/lib/worker';

export default function QueuePage() {
  const [rows, setRows] = useState<any[]>([]);
  async function load() {
    const { data } = await supabase.from('queue_items').select('*,campaigns(name)').order('created_at', { ascending: false }).limit(200);
    setRows(data || []);
  }
  useEffect(() => { load(); }, []);

  return (
    <AuthGuard>
      <main className="container space-y-4">
        <Nav />
        <section className="card overflow-auto">
          <table className="table"><thead><tr><th>campaign</th><th>scheduled</th><th>status</th><th>retry</th><th>error</th><th>actions</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.id}><td>{r.campaigns?.name}</td><td>{r.scheduled_at}</td><td>{r.status}</td><td>{r.retry_count}</td><td>{r.error_message || '-'}</td><td><button className="btn-secondary" onClick={async () => { await workerPost(`/api/queue/${r.id}/retry`, {}); load(); }}>Retry</button></td></tr>)}</tbody>
          </table>
        </section>
      </main>
    </AuthGuard>
  );
}
