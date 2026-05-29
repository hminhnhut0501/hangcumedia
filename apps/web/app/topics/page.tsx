'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { supabase } from '@/lib/supabase';
import { workerPost } from '@/lib/worker';

export default function TopicsPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [groupId, setGroupId] = useState('');
  const [name, setName] = useState('');

  async function load() {
    const [g, t] = await Promise.all([
      supabase.from('telegram_groups').select('*').eq('type', 'main'),
      supabase.from('topics').select('*,telegram_groups(title)').order('created_at', { ascending: false })
    ]);
    setGroups(g.data || []);
    setTopics(t.data || []);
    if (!groupId && g.data?.[0]?.id) setGroupId(g.data[0].id);
  }

  useEffect(() => {
    load();
  }, []);

  async function createTopic(e: React.FormEvent) {
    e.preventDefault();
    if (!groupId || !name) return;
    await workerPost('/api/topics/create', { groupId, name });
    setName('');
    load();
  }

  return (
    <AppShell
      title="Topic Mapper"
      subtitle="Create and map target forum threads for precise delivery routing."
      actions={<button className="btn-secondary" onClick={load}>Refresh</button>}
    >
      <form className="card fade-up grid gap-3 md:grid-cols-4" onSubmit={createTopic}>
        <select className="input" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          <option value="">Select target group</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
        </select>
        <input className="input md:col-span-2" placeholder="New topic name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn">Create via Bot</button>
      </form>

      <section className="card fade-up overflow-auto">
        <table className="table min-w-[820px]">
          <thead><tr><th>Topic</th><th>Group</th><th>Thread ID</th><th>Created By Bot</th><th>Active</th></tr></thead>
          <tbody>
            {topics.map((t) => (
              <tr key={t.id}>
                <td className="font-semibold text-slate-100">{t.name}</td>
                <td>{t.telegram_groups?.title}</td>
                <td>{t.message_thread_id}</td>
                <td>{String(t.created_by_bot)}</td>
                <td>{String(t.is_active)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
