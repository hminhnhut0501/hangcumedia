'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { SkeletonTable } from '@/components/SkeletonTable';
import { supabase } from '@/lib/supabase';
import { workerPost } from '@/lib/worker';

export default function TopicsPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [groupId, setGroupId] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  async function load() {
    setLoading(true);
    const [g, t] = await Promise.all([
      supabase.from('telegram_groups').select('*').eq('type', 'main'),
      supabase.from('topics').select('*,telegram_groups(title)').order('created_at', { ascending: false })
    ]);
    setGroups(g.data || []);
    setTopics(t.data || []);
    if (!groupId && g.data?.[0]?.id) setGroupId(g.data[0].id);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function createTopic(e: React.FormEvent) {
    e.preventDefault();
    if (!groupId || !name) return;
    setSaving(true);
    setNotice('');
    try {
      await workerPost('/api/topics/create', { groupId, name });
      setNotice('Đã tạo topic thành công.');
      setName('');
      load();
    } catch (err: any) {
      setNotice(`Lỗi: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      title="Quản lý chủ đề"
      subtitle="Tạo topic mới bằng bot và theo dõi mapping topic theo từng nhóm đích."
      actions={<button className="btn-secondary" onClick={load}>{loading ? 'Đang tải...' : 'Làm mới'}</button>}
    >
      <form className="card fade-up space-y-3" onSubmit={createTopic}>
        <div className="grid gap-3 md:grid-cols-3">
          <select className="input" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">Chọn nhóm đích</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
          <input className="input md:col-span-2" placeholder="Tên topic mới" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-zinc-500">Bot phải có quyền admin trong nhóm forum để tạo topic.</p>
          <button className="btn" disabled={saving}>{saving ? 'Đang tạo...' : 'Tạo topic'}</button>
        </div>
        {notice ? <p className="text-sm text-zinc-300">{notice}</p> : null}
      </form>

      <section className="card fade-up overflow-auto">
        {loading ? <SkeletonTable rows={4} cols={5} /> : null}
        {!loading && topics.length === 0 ? <div className="empty-state">Chưa có topic nào được lưu.</div> : null}
        {!loading && topics.length > 0 ? (
          <table className="table min-w-[820px]">
            <thead><tr><th>Tên topic</th><th>Nhóm</th><th>Thread ID</th><th>Tạo bởi bot</th><th>Kích hoạt</th></tr></thead>
            <tbody>
              {topics.map((t) => (
                <tr key={t.id}>
                  <td className="font-semibold text-zinc-100">{t.name}</td>
                  <td>{t.telegram_groups?.title}</td>
                  <td>{t.message_thread_id}</td>
                  <td>{String(t.created_by_bot)}</td>
                  <td>{String(t.is_active)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>
    </AppShell>
  );
}
