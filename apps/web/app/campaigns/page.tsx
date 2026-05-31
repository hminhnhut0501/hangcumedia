'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { SkeletonTable } from '@/components/SkeletonTable';
import { supabase } from '@/lib/supabase';
import { workerDelete, workerPost } from '@/lib/worker';
import { appToast } from '@/lib/toast';

function statusClass(status: string) {
  if (status === 'active') return 'badge badge-ok';
  if (status === 'paused') return 'badge badge-warn';
  return 'badge badge-neutral';
}

export default function CampaignsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState({
    target_group_id: '',
    target_topic_id: '',
    status: 'all'
  });

  const load = async () => {
    setLoading(true);
    const [c, g, t] = await Promise.all([
      supabase.from('campaigns').select('*').order('created_at', { ascending: false }),
      supabase.from('telegram_groups').select('id,title').order('title'),
      supabase.from('topics').select('id,name,group_id').order('name')
    ]);
    setRows(c.data || []);
    setGroups(g.data || []);
    setTopics(t.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const groupMap = useMemo(() => new Map(groups.map((g: any) => [g.id, g.title])), [groups]);
  const topicMap = useMemo(() => new Map(topics.map((t: any) => [t.id, t])), [topics]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (filter.target_group_id && row.target_group_id !== filter.target_group_id) return false;
      if (filter.target_topic_id && (row.target_topic_id || '') !== filter.target_topic_id) return false;
      if (filter.status !== 'all' && row.status !== filter.status) return false;
      return true;
    });
  }, [rows, filter]);

  const summary = useMemo(() => {
    const s = { total: filtered.length, active: 0, paused: 0, waiting: 0 };
    for (const row of filtered) {
      if (row.status === 'active') s.active += 1;
      if (row.status === 'paused') s.paused += 1;
      if (row.source_state === 'waiting_for_source') s.waiting += 1;
    }
    return s;
  }, [filtered]);

  const topicsOfSelectedGroup = filter.target_group_id
    ? topics.filter((t: any) => t.group_id === filter.target_group_id)
    : topics;

  return (
    <AppShell
      title="Campaign Routing Control"
      subtitle="Tập trung quản lý chiến dịch theo group đích và topic đích, tối ưu routing trước khi gửi."
      actions={<Link className="btn" href="/campaigns/new">Tạo chiến dịch</Link>}
    >
      <section className="grid gap-3 md:grid-cols-4">
        <article className="card"><p className="text-xs uppercase text-slate-500">Total</p><p className="mt-2 text-3xl font-black text-slate-100">{summary.total}</p></article>
        <article className="card"><p className="text-xs uppercase text-slate-500">Active</p><p className="mt-2 text-3xl font-black text-emerald-300">{summary.active}</p></article>
        <article className="card"><p className="text-xs uppercase text-slate-500">Paused</p><p className="mt-2 text-3xl font-black text-amber-300">{summary.paused}</p></article>
        <article className="card"><p className="text-xs uppercase text-slate-500">Waiting Source</p><p className="mt-2 text-3xl font-black text-rose-300">{summary.waiting}</p></article>
      </section>

      <section className="card">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Filter target group</label>
            <select className="input" value={filter.target_group_id} onChange={(e) => setFilter((f) => ({ ...f, target_group_id: e.target.value, target_topic_id: '' }))}>
              <option value="">Tất cả nhóm đích</option>
              {groups.map((g: any) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Filter target topic</label>
            <select className="input" value={filter.target_topic_id} onChange={(e) => setFilter((f) => ({ ...f, target_topic_id: e.target.value }))}>
              <option value="">Tất cả topic đích</option>
              {topicsOfSelectedGroup.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Filter status</label>
            <select className="input" value={filter.status} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}>
              <option value="all">Tất cả trạng thái</option>
              <option value="active">active</option>
              <option value="paused">paused</option>
              <option value="archived">archived</option>
            </select>
          </div>
        </div>
      </section>

      <section className="card overflow-auto">
        {loading ? <SkeletonTable rows={5} cols={9} /> : null}
        {!loading && filtered.length === 0 ? <div className="empty-state">Không có campaign khớp bộ lọc hiện tại.</div> : null}
        {!loading && filtered.length > 0 ? (
          <table className="table min-w-[1100px]">
            <thead><tr><th>Campaign</th><th>Target Group</th><th>Target Topic</th><th>Khung giờ</th><th>Batch</th><th>Mode</th><th>Status</th><th>Source</th><th>Thao tác</th></tr></thead>
            <tbody>
              {filtered.map((row) => {
                const topic = row.target_topic_id ? topicMap.get(row.target_topic_id) : null;
                return (
                  <tr key={row.id}>
                    <td>
                      <Link className="font-semibold text-slate-100 hover:underline" href={`/campaigns/${row.id}`}>{row.name}</Link>
                      <div className="text-xs text-slate-500">{row.timezone}</div>
                    </td>
                    <td>{groupMap.get(row.target_group_id) || '-'}</td>
                    <td>{topic?.name || 'General chat'}</td>
                    <td>{(row.run_times || []).join(', ')}</td>
                    <td>{row.batch_size}</td>
                    <td>{row.copy_mode}/{row.media_group_mode}</td>
                    <td><span className={statusClass(row.status)}>{row.status}</span></td>
                    <td>
                      <span className={row.source_state === 'waiting_for_source' ? 'badge badge-warn' : 'badge badge-ok'}>
                        {row.source_state || 'ready'}
                      </span>
                    </td>
                    <td className="flex gap-2 py-2">
                      <Link className="btn-secondary" href={`/campaigns/${row.id}`}>Mở</Link>
                      <button className="btn-secondary" onClick={async () => { await workerPost(`/api/campaigns/${row.id}/pause`, {}); appToast('Đã tạm dừng campaign', 'info'); load(); }}>Pause</button>
                      <button className="btn-success" onClick={async () => { await workerPost(`/api/campaigns/${row.id}/resume`, {}); appToast('Đã tiếp tục campaign', 'success'); load(); }}>Resume</button>
                      <button className="btn-danger" onClick={async () => {
                        if (!confirm('Xóa campaign này?')) return;
                        try {
                          try {
                            await workerDelete(`/api/campaigns/${row.id}`);
                          } catch (err: any) {
                            // Fallback: if worker points to wrong project/env, still remove in the web Supabase project.
                            const { error } = await supabase.from('campaigns').delete().eq('id', row.id);
                            if (error) {
                              throw new Error(`Worker delete failed: ${String(err?.message || err)} | Web delete failed: ${error.message}`);
                            }
                          }
                          setRows((prev) => prev.filter((r) => r.id !== row.id));
                          appToast('Đã xóa campaign', 'info');
                          load();
                        } catch (err: any) {
                          appToast(`Xóa campaign thất bại: ${err?.message || 'unknown error'}`, 'error');
                        }
                      }}>Xóa</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </section>
    </AppShell>
  );
}
