'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
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
      supabase.from('source_messages').select('*').order('created_at', { ascending: false }).limit(300)
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
    <AppShell
      title={campaign?.name || 'Chi tiết chiến dịch'}
      subtitle="Thêm nguồn nội dung, quản lý thứ tự và generate queue cho chiến dịch này."
      actions={<button className="btn" onClick={async () => { await workerPost('/api/queue/generate', { campaignId: id }); }}>Generate Queue</button>}
    >
      <section className="card fade-up">
        <div className="grid gap-3 md:grid-cols-3">
          <p><span className="text-zinc-400">Chế độ:</span> {campaign?.copy_mode}/{campaign?.media_group_mode}</p>
          <p><span className="text-zinc-400">Batch:</span> {campaign?.batch_size}</p>
          <p><span className="text-zinc-400">Khung giờ:</span> {(campaign?.run_times || []).join(', ')}</p>
        </div>
      </section>

      <section className="card fade-up">
        <h2 className="text-lg font-semibold text-zinc-100">Thêm source message</h2>
        <div className="mt-3 space-y-2">
          <label className="block text-sm text-zinc-300">Nguồn cần thêm</label>
          <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Chọn source message</option>
            {allMsgs.map((m) => <option key={m.id} value={m.id}>{m.source_chat_id}/{m.source_message_id} - {m.media_type}</option>)}
          </select>
          <p className="text-xs text-zinc-500">Chọn message từ inbox để đưa vào danh sách phát của campaign.</p>
          <div className="flex justify-end"><button className="btn" onClick={addSource}>Thêm source</button></div>
        </div>
      </section>

      <section className="card fade-up overflow-auto">
        <table className="table min-w-[860px]">
          <thead><tr><th>Thứ tự</th><th>Source</th><th>Loại</th><th>Album</th><th>Thao tác</th></tr></thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id}>
                <td>{s.sort_order}</td>
                <td>{s.source_messages.source_chat_id}/{s.source_messages.source_message_id}</td>
                <td>{s.source_messages.media_type}</td>
                <td>{s.source_messages.media_group_id || '-'}</td>
                <td><button className="btn-secondary" onClick={async () => { await supabase.from('campaign_sources').delete().eq('id', s.id); load(); }}>Xóa</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
