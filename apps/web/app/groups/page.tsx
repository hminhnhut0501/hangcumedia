'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

type Group = any;

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [form, setForm] = useState({ title: '', chat_id: '', type: 'backup', is_forum: false, notes: '' });

  async function load() {
    const { data } = await supabase.from('telegram_groups').select('*').order('created_at', { ascending: false });
    setGroups(data || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    await supabase.from('telegram_groups').insert({
      title: form.title,
      chat_id: Number(form.chat_id),
      type: form.type,
      is_forum: form.is_forum,
      notes: form.notes || null
    });
    setForm({ title: '', chat_id: '', type: 'backup', is_forum: false, notes: '' });
    load();
  }

  return (
    <AppShell
      title="Group Registry"
      subtitle="Register backup/main/admin groups, classify forum mode, and keep your routing map clean."
      actions={<button className="btn-secondary" onClick={load}>Refresh</button>}
    >
      <form className="card fade-up grid gap-3 md:grid-cols-2 xl:grid-cols-5" onSubmit={createGroup}>
        <input className="input" placeholder="Group title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <input className="input" placeholder="Chat ID (-100...)" value={form.chat_id} onChange={(e) => setForm({ ...form, chat_id: e.target.value })} />
        <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          <option value="backup">backup</option>
          <option value="main">main</option>
          <option value="admin">admin</option>
        </select>
        <input className="input" placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <div className="flex items-center justify-between gap-3">
          <label className="text-sm text-slate-300">
            <input type="checkbox" checked={form.is_forum} onChange={(e) => setForm({ ...form, is_forum: e.target.checked })} className="mr-2" />
            forum group
          </label>
          <button className="btn">Add Group</button>
        </div>
      </form>

      <section className="card fade-up overflow-auto">
        <table className="table min-w-[860px]">
          <thead>
            <tr><th>Title</th><th>Chat ID</th><th>Type</th><th>Forum</th><th>Active</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id}>
                <td className="font-semibold text-slate-100">{g.title}</td>
                <td>{g.chat_id}</td>
                <td>{g.type}</td>
                <td>{String(g.is_forum)}</td>
                <td>{String(g.is_active)}</td>
                <td>{g.notes || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
