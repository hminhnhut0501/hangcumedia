'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

export default function AdminsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ email: '', telegram_user_id: '' });

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('admins').select('*').order('created_at', { ascending: false });
    setRows(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function addAdmin(e: React.FormEvent) {
    e.preventDefault();
    setNotice('');
    const payload = {
      email: form.email || null,
      telegram_user_id: form.telegram_user_id ? Number(form.telegram_user_id) : null,
      role: 'admin'
    };
    const { error } = await supabase.from('admins').insert(payload);
    if (error) {
      setNotice(`Lỗi: ${error.message}`);
      return;
    }
    setNotice('Đã thêm admin.');
    setForm({ email: '', telegram_user_id: '' });
    load();
  }

  async function removeAdmin(id: string) {
    if (!confirm('Xóa admin này?')) return;
    const { error } = await supabase.from('admins').delete().eq('id', id);
    if (error) {
      setNotice(`Lỗi: ${error.message}`);
      return;
    }
    setNotice('Đã xóa admin.');
    load();
  }

  return (
    <AppShell title="Quản lý admin" subtitle="Quản lý email và Telegram User ID có quyền quản trị bot/private import.">
      <form className="card space-y-3" onSubmit={addAdmin}>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Email admin</label>
            <input className="input" placeholder="admin@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Telegram User ID</label>
            <input className="input" placeholder="123456789" value={form.telegram_user_id} onChange={(e) => setForm({ ...form, telegram_user_id: e.target.value })} />
            <p className="mt-1 text-xs text-zinc-500">ID user Telegram dùng để giới hạn private forward chỉ cho admin.</p>
          </div>
        </div>
        <div className="flex justify-end"><button className="btn">Thêm admin</button></div>
        {notice ? <p className="text-sm text-zinc-300">{notice}</p> : null}
      </form>

      <section className="card overflow-auto">
        {loading ? <p className="text-sm text-zinc-400">Đang tải admin...</p> : null}
        {!loading && rows.length === 0 ? <div className="empty-state">Chưa có admin nào.</div> : null}
        {!loading && rows.length > 0 ? (
          <table className="table min-w-[860px]">
            <thead><tr><th>Email</th><th>Telegram User ID</th><th>Role</th><th>Created</th><th>Thao tác</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.email || '-'}</td>
                  <td>{r.telegram_user_id || '-'}</td>
                  <td>{r.role}</td>
                  <td>{new Date(r.created_at).toLocaleString()}</td>
                  <td><button className="btn-secondary" onClick={() => removeAdmin(r.id)}>Xóa</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>
    </AppShell>
  );
}
