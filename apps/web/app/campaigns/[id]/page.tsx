'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AuthGuard } from '@/components/AuthGuard';
import { Nav } from '@/components/Nav';
import { supabase } from '@/lib/supabase';
import { workerPost } from '@/lib/worker';

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [campaign, setCampaign] = useState<any>(null);
  const [sources, setSources] = useState<any[]>([]);
  const [allMsgs, setAllMsgs] = useState<any[]>([]);
  const [selected, setSelected] = useState('');

  async function load() {
    const [c, s, m] = await Promise.all([
      supabase.from('campaigns').select('*').eq('id', id).single(),
      supabase.from('campaign_sources').select('*,source_messages(*)').eq('campaign_id', id).order('sort_order'),
      supabase.from('source_messages').select('*').order('created_at', { ascending: false }).limit(200)
    ]);
    setCampaign(c.data);
    setSources(s.data || []);
    setAllMsgs(m.data || []);
  }

  useEffect(() => { if (id) load(); }, [id]);

  async function addSource() {
    if (!selected) return;
    await supabase.from('campaign_sources').insert({ campaign_id: id, source_message_id: selected, sort_order: sources.length });
    setSelected('');
    load();
  }

  return (
    <AuthGuard>
      <main className="container space-y-4">
        <Nav />
        <section className="card">
          <h1 className="text-xl font-semibold">{campaign?.name}</h1>
          <div className="mt-3 flex gap-2">
            <button className="btn" onClick={async () => { await workerPost('/api/queue/generate', { campaignId: id }); }}>Generate Queue</button>
          </div>
        </section>
        <section className="card">
          <h2 className="font-semibold">Add source message</h2>
          <div className="mt-2 flex gap-2">
            <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">Select source message</option>
              {allMsgs.map((m) => <option key={m.id} value={m.id}>{m.source_chat_id}/{m.source_message_id} - {m.media_type}</option>)}
            </select>
            <button className="btn" onClick={addSource}>Add</button>
          </div>
          <table className="table mt-3"><thead><tr><th>order</th><th>source</th><th>type</th><th>album</th><th></th></tr></thead>
            <tbody>{sources.map((s) => <tr key={s.id}><td>{s.sort_order}</td><td>{s.source_messages.source_chat_id}/{s.source_messages.source_message_id}</td><td>{s.source_messages.media_type}</td><td>{s.source_messages.media_group_id || '-'}</td><td><button className="btn-secondary" onClick={async () => { await supabase.from('campaign_sources').delete().eq('id', s.id); load(); }}>Remove</button></td></tr>)}</tbody>
          </table>
        </section>
      </main>
    </AuthGuard>
  );
}
