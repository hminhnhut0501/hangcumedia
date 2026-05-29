'use client';

import { useEffect, useState } from 'react';
import { AuthGuard } from '@/components/AuthGuard';
import { Nav } from '@/components/Nav';
import { supabase } from '@/lib/supabase';

type Group = any;

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [form, setForm] = useState({ title: '', chat_id: '', type: 'backup', is_forum: false });

  async function load() {
    const { data } = await supabase.from('telegram_groups').select('*').order('created_at', { ascending: false });
    setGroups(data || []);
  }

  useEffect(() => { load(); }, []);

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    await supabase.from('telegram_groups').insert({
      title: form.title,
      chat_id: Number(form.chat_id),
      type: form.type,
      is_forum: form.is_forum
    });
    setForm({ title: '', chat_id: '', type: 'backup', is_forum: false });
    load();
  }

  return (
    <AuthGuard>
      <main className="container space-y-4">
        <Nav />
        <form className="card grid gap-2 md:grid-cols-5" onSubmit={createGroup}>
          <input className="input" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input className="input" placeholder="Chat ID" value={form.chat_id} onChange={(e) => setForm({ ...form, chat_id: e.target.value })} />
          <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="backup">backup</option><option value="main">main</option><option value="admin">admin</option>
          </select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_forum} onChange={(e) => setForm({ ...form, is_forum: e.target.checked })} />is_forum</label>
          <button className="btn">Add Group</button>
        </form>
        <section className="card">
          <table className="table">
            <thead><tr><th>title</th><th>chat_id</th><th>type</th><th>forum</th><th>active</th></tr></thead>
            <tbody>{groups.map((g) => <tr key={g.id}><td>{g.title}</td><td>{g.chat_id}</td><td>{g.type}</td><td>{String(g.is_forum)}</td><td>{String(g.is_active)}</td></tr>)}</tbody>
          </table>
        </section>
      </main>
    </AuthGuard>
  );
}
