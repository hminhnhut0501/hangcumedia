'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { SkeletonTable } from '@/components/SkeletonTable';
import { supabase } from '@/lib/supabase';

type Group = any;

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
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

  function startEdit(group: any) {
    setEditingId(group.id);
    setEditForm({
      title: group.title,
      type: group.type,
      is_forum: group.is_forum,
      is_active: group.is_active,
      notes: group.notes || ''
    });
  }

  async function saveEdit(id: string) {
    const { error } = await supabase
      .from('telegram_groups')
      .update({
        title: editForm.title,
        type: editForm.type,
        is_forum: !!editForm.is_forum,
        is_active: !!editForm.is_active,
        notes: editForm.notes || null
      })
      .eq('id', id);
    if (error) {
      setNotice(`Lỗi cập nhật: ${error.message}`);
      return;
    }
    setEditingId(null);
    setNotice('Đã cập nhật nhóm.');
    load();
  }

  async function deleteGroup(id: string) {
    if (!confirm('Xóa nhóm này?')) return;
    const { error } = await supabase.from('telegram_groups').delete().eq('id', id);
    if (error) {
      setNotice(`Lỗi xóa: ${error.message}`);
      return;
    }
    setNotice('Đã xóa nhóm.');
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
        {loading ? <SkeletonTable rows={4} cols={6} /> : null}
        {!loading && groups.length === 0 ? (
          <div className="empty-state">Chưa có nhóm nào. Hãy thêm nhóm đầu tiên ở form phía trên.</div>
        ) : null}
        {!loading && groups.length > 0 ? (
          <table className="table min-w-[860px]">
            <thead>
              <tr><th>Tên</th><th>Chat ID</th><th>Loại</th><th>Forum</th><th>Kích hoạt</th><th>Ghi chú</th><th>Thao tác</th></tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <td className="font-semibold text-zinc-100">
                    {editingId === g.id ? <input className="input" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} /> : g.title}
                  </td>
                  <td>{g.chat_id}</td>
                  <td>
                    {editingId === g.id ? (
                      <select className="input" value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}>
                        <option value="backup">backup</option>
                        <option value="main">main</option>
                        <option value="admin">admin</option>
                      </select>
                    ) : g.type}
                  </td>
                  <td>
                    {editingId === g.id ? <input type="checkbox" checked={!!editForm.is_forum} onChange={(e) => setEditForm({ ...editForm, is_forum: e.target.checked })} /> : String(g.is_forum)}
                  </td>
                  <td>
                    {editingId === g.id ? <input type="checkbox" checked={!!editForm.is_active} onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })} /> : String(g.is_active)}
                  </td>
                  <td>
                    {editingId === g.id ? <input className="input" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} /> : (g.notes || '-')}
                  </td>
                  <td className="flex gap-2">
                    {editingId === g.id ? (
                      <>
                        <button className="btn-secondary" onClick={() => saveEdit(g.id)}>Lưu</button>
                        <button className="btn-secondary" onClick={() => setEditingId(null)}>Hủy</button>
                      </>
                    ) : (
                      <>
                        <button className="btn-secondary" onClick={() => startEdit(g)}>Sửa</button>
                        <button className="btn-secondary" onClick={() => deleteGroup(g.id)}>Xóa</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>
    </AppShell>
  );
}
