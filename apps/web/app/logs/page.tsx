'use client';

import { useEffect, useState } from 'react';
import { AuthGuard } from '@/components/AuthGuard';
import { Nav } from '@/components/Nav';
import { supabase } from '@/lib/supabase';

export default function LogsPage() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    supabase.from('send_logs').select('*,campaigns(name)').order('created_at', { ascending: false }).limit(200).then(({ data }) => setRows(data || []));
  }, []);

  return (
    <AuthGuard>
      <main className="container space-y-4">
        <Nav />
        <section className="card overflow-auto">
          <table className="table"><thead><tr><th>time</th><th>campaign</th><th>action</th><th>status</th><th>error</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.id}><td>{r.created_at}</td><td>{r.campaigns?.name}</td><td>{r.action}</td><td>{r.status}</td><td>{r.error_message || '-'}</td></tr>)}</tbody>
          </table>
        </section>
      </main>
    </AuthGuard>
  );
}
