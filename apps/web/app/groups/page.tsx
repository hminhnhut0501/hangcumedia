'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

type Group = any;

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ title: '', chat_id: '', type: 'backup', is_forum: false, notes: '' });

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('telegram_groups').select('*').order('created_at', { ascending: false });
    setGroups(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setNotice('');

    const { error } = await supabase.from('telegram_groups').insert({
      title: form.title,
      chat_id: Number(form.chat_id),
      type: form.type,
      is_forum: form.is_forum,
      notes: form.notes || null
    });

    setSaving(false);

    if (error) {
      setNotice(`Lỗi: ${error.message}`);
      return;
    }

    setNotice('Đã thêm nhóm thành công.');
    setForm({ title: '', chat_id: '', type: 'backup', is_forum: false, notes: '' });
    load();
  }

  return (
    <AppShell
      title="Quản lý nhóm"
      subtitle="Đăng ký nhóm backup/main/admin và chuẩn hóa thông tin routing."
      actions={<button className="btn-secondary" onClick={load}>{loading ? 'Đang tải...' : 'Làm mới'}</button>}
    >
      <form className="card fade-up stagger-1 space-y-3" onSubmit={createGroup}>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Tên nhóm</label>
            <input className="input" placeholder="Ví dụ: Backup Video 1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Chat ID</label>
            <input className="input" placeholder="-100..." value={form.chat_id} onChange={(e) => setForm({ ...form, chat_id: e.target.value })} required />
            <p className="mt-1 text-xs text-zinc-500">Chat ID thường bắt đầu bằng `-100` với group/supergroup.</p>
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Loại nhóm</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="backup">backup</option>
              <option value="main">main</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Ghi chú</label>
            <input className="input" placeholder="Ghi chú nội bộ (tuỳ chọn)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="text-sm text-zinc-300">
            <input type="checkbox" checked={form.is_forum} onChange={(e) => setForm({ ...form, is_forum: e.target.checked })} className="mr-2" />
            Đây là nhóm forum (có topic)
          </label>
          <button className="btn" disabled={saving}>{saving ? 'Đang thêm...' : 'Thêm nhóm'}</button>
        </div>

        {notice ? <p className="text-sm text-zinc-300">{notice}</p> : null}
      </form>

      <section className="card fade-up stagger-2 overflow-auto">
        {loading ? <p className="text-sm text-zinc-400">Đang tải danh sách nhóm...</p> : null}
        {!loading && groups.length === 0 ? (
          <div className="empty-state">Chưa có nhóm nào. Hãy thêm nhóm đầu tiên ở form phía trên.</div>
        ) : null}
        {!loading && groups.length > 0 ? (
          <table className="table min-w-[860px]">
            <thead>
              <tr><th>Tên</th><th>Chat ID</th><th>Loại</th><th>Forum</th><th>Kích hoạt</th><th>Ghi chú</th></tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <td className="font-semibold text-zinc-100">{g.title}</td>
                  <td>{g.chat_id}</td>
                  <td>{g.type}</td>
                  <td>{String(g.is_forum)}</td>
                  <td>{String(g.is_active)}</td>
                  <td>{g.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>
    </AppShell>
  );
}
