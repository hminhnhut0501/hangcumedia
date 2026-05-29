'use client';

import { useEffect, useState } from 'react';
import { AuthGuard } from '@/components/AuthGuard';
import { Nav } from '@/components/Nav';
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

  useEffect(() => { load(); }, []);

  async function createTopic(e: React.FormEvent) {
    e.preventDefault();
    await workerPost('/api/topics/create', { groupId, name });
    setName('');
    load();
  }

  return (
    <AuthGuard>
      <main className="container space-y-4">
        <Nav />
        <form className="card grid gap-2 md:grid-cols-3" onSubmit={createTopic}>
          <select className="input" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
          <input className="input" placeholder="Topic name" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn">Create Topic by Bot</button>
        </form>
        <section className="card">
          <table className="table"><thead><tr><th>name</th><th>group</th><th>thread_id</th></tr></thead>
            <tbody>{topics.map((t) => <tr key={t.id}><td>{t.name}</td><td>{t.telegram_groups?.title}</td><td>{t.message_thread_id}</td></tr>)}</tbody>
          </table>
        </section>
      </main>
    </AuthGuard>
  );
}
