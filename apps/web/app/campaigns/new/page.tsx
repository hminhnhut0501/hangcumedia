'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

export default function CampaignNewPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const router = useRouter();
  const [form, setForm] = useState<any>({
    name: '',
    source_group_id: '',
    target_group_id: '',
    target_topic_id: '',
    copy_mode: 'copy',
    media_group_mode: 'keep',
    batch_size: 1,
    runs_per_day: 1,
    run_times: '09:00,15:00,21:00',
    timezone: 'Asia/Ho_Chi_Minh',
    random_delay_seconds: 0,
    status: 'active'
  });

  useEffect(() => {
    Promise.all([
      supabase.from('telegram_groups').select('*').order('title'),
      supabase.from('topics').select('*').order('name')
    ]).then(([g, t]) => {
      setGroups(g.data || []);
      setTopics(t.data || []);
      if (g.data?.[0]) setForm((f: any) => ({ ...f, target_group_id: g.data[0].id }));
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...form,
      source_group_id: form.source_group_id || null,
      target_topic_id: form.target_topic_id || null,
      run_times: form.run_times.split(',').map((s: string) => s.trim()).filter(Boolean),
      batch_size: Number(form.batch_size),
      runs_per_day: Number(form.runs_per_day),
      random_delay_seconds: Number(form.random_delay_seconds)
    };
    const { data } = await supabase.from('campaigns').insert(payload).select('*').single();
    router.push(`/campaigns/${data.id}`);
  }

  return (
    <AppShell
      title="Campaign Builder"
      subtitle="Define routing, delivery behavior, and schedule in a single structured setup flow."
    >
      <form className="card fade-up grid gap-3 md:grid-cols-2" onSubmit={submit}>
        <input className="input" placeholder="Campaign name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <select className="input" value={form.source_group_id} onChange={(e) => setForm({ ...form, source_group_id: e.target.value })}>
          <option value="">Source group (optional)</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
        </select>

        <select className="input" value={form.target_group_id} onChange={(e) => setForm({ ...form, target_group_id: e.target.value })}>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
        </select>
        <select className="input" value={form.target_topic_id} onChange={(e) => setForm({ ...form, target_topic_id: e.target.value })}>
          <option value="">General chat (no topic)</option>
          {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        <select className="input" value={form.copy_mode} onChange={(e) => setForm({ ...form, copy_mode: e.target.value })}>
          <option value="copy">copy (hide source)</option>
          <option value="forward">forward (keep source)</option>
        </select>
        <select className="input" value={form.media_group_mode} onChange={(e) => setForm({ ...form, media_group_mode: e.target.value })}>
          <option value="keep">keep album grouping</option>
          <option value="split">split into single items</option>
        </select>

        <input className="input" type="number" min={1} value={form.batch_size} onChange={(e) => setForm({ ...form, batch_size: e.target.value })} placeholder="Batch size" />
        <input className="input" type="number" min={1} value={form.runs_per_day} onChange={(e) => setForm({ ...form, runs_per_day: e.target.value })} placeholder="Runs per day" />

        <input className="input" value={form.run_times} onChange={(e) => setForm({ ...form, run_times: e.target.value })} placeholder="09:00,15:00,21:00" />
        <input className="input" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} placeholder="Timezone" />

        <input className="input" type="number" min={0} value={form.random_delay_seconds} onChange={(e) => setForm({ ...form, random_delay_seconds: e.target.value })} placeholder="Random delay seconds" />
        <button className="btn">Create Campaign</button>
      </form>
    </AppShell>
  );
}
