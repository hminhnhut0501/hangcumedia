'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { supabase } from '@/lib/supabase';
import { workerGet, workerPost } from '@/lib/worker';

export default function BackfillPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({
    source_group_id: '',
    from_message_id: '',
    to_message_id: '',
    source_thread_id: '',
    create_link_only: true
  });

  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === form.source_group_id),
    [groups, form.source_group_id]
  );

  async function load() {
    const [groupRes, jobRes] = await Promise.all([
      supabase.from('telegram_groups').select('*').eq('type', 'backup').eq('is_active', true).order('title'),
      workerGet('/api/backfill/jobs')
    ]);
    setGroups(groupRes.data || []);
    setJobs(jobRes.jobs || []);
    if (!form.source_group_id && (groupRes.data || []).length > 0) {
      setForm((prev) => ({ ...prev, source_group_id: groupRes.data![0].id }));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createJob() {
    setLoading(true);
    setNotice('');
    try {
      const fromId = Number(form.from_message_id);
      const toId = Number(form.to_message_id);
      if (!form.source_group_id) throw new Error('Chọn nhóm nguồn backup');
      if (!Number.isFinite(fromId) || !Number.isFinite(toId)) throw new Error('from/to message id phải là số');

      const created = await workerPost('/api/backfill/jobs/create', {
        source_group_id: form.source_group_id,
        from_message_id: fromId,
        to_message_id: toId,
        source_thread_id: form.source_thread_id ? Number(form.source_thread_id) : null,
        create_link_only: form.create_link_only
      });
      setNotice(`Đã tạo job ${created.job.id}.`);
      await load();
    } catch (err: any) {
      setNotice(`Lỗi tạo job: ${err?.message || 'unknown'}`);
    } finally {
      setLoading(false);
    }
  }

  const statusClass = (status: string) => {
    if (status === 'done') return 'badge badge-ok';
    if (status === 'running') return 'badge badge-warn';
    if (status === 'failed' || status === 'cancelled') return 'badge badge-err';
    return 'badge badge-neutral';
  };

  return (
    <AppShell
      title="Backfill lịch sử"
      subtitle="Tạo job import lịch sử theo range message_id để bù dữ liệu cũ."
      actions={<button className="btn-secondary" onClick={load}>Làm mới</button>}
    >
      <section className="card space-y-3">
        <h3 className="section-title text-lg font-semibold">Tạo backfill job</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Nhóm nguồn (backup)</label>
            <select className="input" value={form.source_group_id} onChange={(e) => setForm({ ...form, source_group_id: e.target.value })}>
              <option value="">Chọn nhóm</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
            <p className="mt-1 text-xs text-zinc-500">Chat ID: {selectedGroup?.chat_id || '-'}</p>
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Topic thread ID (optional)</label>
            <input className="input" value={form.source_thread_id} onChange={(e) => setForm({ ...form, source_thread_id: e.target.value })} placeholder="Ví dụ 1234" />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-300">From message ID</label>
            <input className="input" value={form.from_message_id} onChange={(e) => setForm({ ...form, from_message_id: e.target.value })} placeholder="1000" />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-300">To message ID</label>
            <input className="input" value={form.to_message_id} onChange={(e) => setForm({ ...form, to_message_id: e.target.value })} placeholder="2000" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={form.create_link_only} onChange={(e) => setForm({ ...form, create_link_only: e.target.checked })} />
          Tạo `link_only` cho message chưa có metadata thật
        </label>
        <div className="flex justify-end">
          <button className="btn" onClick={createJob} disabled={loading}>{loading ? 'Đang tạo...' : 'Tạo job'}</button>
        </div>
        {notice ? <p className="notice text-sm">{notice}</p> : null}
      </section>

      <section className="card overflow-auto">
        <h3 className="section-title mb-3 text-lg font-semibold">Danh sách job</h3>
        <table className="table min-w-[1100px]">
          <thead>
            <tr>
              <th>Job</th>
              <th>Nhóm</th>
              <th>Range</th>
              <th>Tiến độ</th>
              <th>Imported</th>
              <th>Status</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j: any) => (
              <tr key={j.id}>
                <td className="text-xs text-zinc-400">{j.id}</td>
                <td>{j.telegram_groups?.title || j.source_group_id}</td>
                <td>{j.from_message_id} → {j.to_message_id}</td>
                <td>{j.processed_count}/{j.total_estimated}</td>
                <td>ready:{j.imported_ready_count} link_only:{j.imported_link_only_count}</td>
                <td><span className={statusClass(j.status)}>{j.status}</span></td>
                <td className="flex gap-2 py-2">
                  <button className="btn-secondary" onClick={async () => { await workerPost(`/api/backfill/jobs/${j.id}/start`, {}); await load(); }}>Start</button>
                  <button className="btn-secondary" onClick={async () => { await workerPost(`/api/backfill/jobs/${j.id}/pause`, {}); await load(); }}>Pause</button>
                  <button className="btn-danger" onClick={async () => { await workerPost(`/api/backfill/jobs/${j.id}/cancel`, {}); await load(); }}>Cancel</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
