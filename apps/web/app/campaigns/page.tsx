'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AuthGuard } from '@/components/AuthGuard';
import { Nav } from '@/components/Nav';
import { supabase } from '@/lib/supabase';
import { workerPost } from '@/lib/worker';

export default function CampaignsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const load = async () => {
    const { data } = await supabase.from('campaigns').select('*,telegram_groups!campaigns_target_group_id_fkey(title)').order('created_at', { ascending: false });
    setRows(data || []);
  };
  useEffect(() => { load(); }, []);

  return (
    <AuthGuard>
      <main className="container space-y-4">
        <Nav />
        <div className="flex gap-2">
          <Link className="btn" href="/campaigns/new">New Campaign</Link>
        </div>
        <section className="card">
          <table className="table"><thead><tr><th>name</th><th>target group</th><th>times</th><th>batch</th><th>status</th><th>actions</th></tr></thead>
            <tbody>
              {rows.map((r) => <tr key={r.id}><td><Link href={`/campaigns/${r.id}`}>{r.name}</Link></td><td>{r.telegram_groups?.title}</td><td>{(r.run_times || []).join(', ')}</td><td>{r.batch_size}</td><td>{r.status}</td><td className="flex gap-2"><button className="btn-secondary" onClick={async () => { await workerPost(`/api/campaigns/${r.id}/pause`, {}); load(); }}>Pause</button><button className="btn-secondary" onClick={async () => { await workerPost(`/api/campaigns/${r.id}/resume`, {}); load(); }}>Resume</button></td></tr>)}
            </tbody>
          </table>
        </section>
      </main>
    </AuthGuard>
  );
}
