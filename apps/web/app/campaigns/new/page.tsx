'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGuard } from '@/components/AuthGuard';
import { Nav } from '@/components/Nav';
import { supabase } from '@/lib/supabase';

export default function CampaignNewPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const router = useRouter();
  const [form, setForm] = useState<any>({
    name: '', source_group_id: '', target_group_id: '', target_topic_id: '', copy_mode: 'copy', media_group_mode: 'keep', batch_size: 1,
    runs_per_day: 1, run_times: '21:00', timezone: 'Asia/Ho_Chi_Minh', random_delay_seconds: 0, status: 'active'
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
    <AuthGuard>
      <main className="container space-y-4">
        <Nav />
        <form className="card grid gap-2 md:grid-cols-2" onSubmit={submit}>
          <input className="input" placeholder="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select className="input" value={form.target_group_id} onChange={(e) => setForm({ ...form, target_group_id: e.target.value })}>{groups.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</select>
          <select className="input" value={form.target_topic_id} onChange={(e) => setForm({ ...form, target_topic_id: e.target.value })}><option value="">General</option>{topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <input className="input" value={form.run_times} onChange={(e) => setForm({ ...form, run_times: e.target.value })} placeholder="09:00,15:00,21:00" />
          <select className="input" value={form.copy_mode} onChange={(e) => setForm({ ...form, copy_mode: e.target.value })}><option value="copy">copy</option><option value="forward">forward</option></select>
          <select className="input" value={form.media_group_mode} onChange={(e) => setForm({ ...form, media_group_mode: e.target.value })}><option value="keep">keep</option><option value="split">split</option></select>
          <input className="input" type="number" value={form.batch_size} onChange={(e) => setForm({ ...form, batch_size: e.target.value })} placeholder="batch_size" />
          <button className="btn">Create campaign</button>
        </form>
      </main>
    </AuthGuard>
  );
}
