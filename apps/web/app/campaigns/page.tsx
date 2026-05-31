'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { SkeletonTable } from '@/components/SkeletonTable';
import { supabase } from '@/lib/supabase';
import { workerPost } from '@/lib/worker';
import { appToast } from '@/lib/toast';

type Campaign = any;
type Group = { id: string; title: string };
type Topic = { id: string; name: string; group_id: string };

function statusClass(status: string) {
  if (status === 'active') return 'badge badge-ok';
  if (status === 'paused') return 'badge badge-warn';
  return 'badge badge-neutral';
}

function sourceClass(sourceState: string) {
  if (sourceState === 'waiting_for_source') return 'badge badge-warn';
  if (sourceState === 'error') return 'badge badge-err';
  return 'badge badge-ok';
}

export default function CampaignsPage() {
  const [rows, setRows] = useState<Campaign[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerGroupId, setDrawerGroupId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [topicFilter, setTopicFilter] = useState('all');

  const load = async () => {
    setLoading(true);
    const [c, g, t] = await Promise.all([
      supabase.from('campaigns').select('*').order('created_at', { ascending: false }),
      supabase.from('telegram_groups').select('id,title').eq('type', 'main').order('title'),
      supabase.from('topics').select('id,name,group_id').order('name')
    ]);
    setRows(c.data || []);
    setGroups(g.data || []);
    setTopics(t.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const campaignsByGroup = useMemo(() => {
    const map = new Map<string, Campaign[]>();
    for (const row of rows) {
      if (!map.has(row.target_group_id)) map.set(row.target_group_id, []);
      map.get(row.target_group_id)!.push(row);
    }
    return map;
  }, [rows]);

  const topicsByGroup = useMemo(() => {
    const map = new Map<string, Topic[]>();
    for (const t of topics) {
      if (!map.has(t.group_id)) map.set(t.group_id, []);
      map.get(t.group_id)!.push(t);
    }
    return map;
  }, [topics]);

  const summary = useMemo(() => {
    const s = { total: rows.length, active: 0, paused: 0, waiting: 0 };
    for (const row of rows) {
      if (row.status === 'active') s.active += 1;
      if (row.status === 'paused') s.paused += 1;
      if (row.source_state === 'waiting_for_source') s.waiting += 1;
    }
    return s;
  }, [rows]);

  const groupCards = useMemo(() => {
    return groups.map((group) => {
      const list = campaignsByGroup.get(group.id) || [];
      const active = list.filter((x) => x.status === 'active').length;
      const paused = list.filter((x) => x.status === 'paused').length;
      const waiting = list.filter((x) => x.source_state === 'waiting_for_source').length;
      const topicCount = (topicsByGroup.get(group.id) || []).length;
      return { group, list, active, paused, waiting, topicCount };
    });
  }, [groups, campaignsByGroup, topicsByGroup]);

  const drawerGroup = drawerGroupId ? groups.find((g) => g.id === drawerGroupId) || null : null;
  const drawerCampaignsRaw = drawerGroup ? (campaignsByGroup.get(drawerGroup.id) || []) : [];
  const drawerTopicsRaw = drawerGroup ? (topicsByGroup.get(drawerGroup.id) || []) : [];

  const drawerCampaigns = useMemo(() => {
    return drawerCampaignsRaw.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (topicFilter === 'general') return !row.target_topic_id;
      if (topicFilter !== 'all' && topicFilter !== 'general' && row.target_topic_id !== topicFilter) return false;
      return true;
    });
  }, [drawerCampaignsRaw, statusFilter, topicFilter]);

  const topicLanes = useMemo(() => {
    const lanes: Array<{ key: string; label: string; campaigns: Campaign[]; waiting: number }> = [];
    const general = drawerCampaigns.filter((row) => !row.target_topic_id);
    lanes.push({
      key: 'general',
      label: 'General chat (không topic)',
      campaigns: general,
      waiting: general.filter((x) => x.source_state === 'waiting_for_source').length
    });

    for (const topic of drawerTopicsRaw) {
      const list = drawerCampaigns.filter((row) => row.target_topic_id === topic.id);
      lanes.push({
        key: topic.id,
        label: topic.name,
        campaigns: list,
        waiting: list.filter((x) => x.source_state === 'waiting_for_source').length
      });
    }

    return lanes.filter((lane) => lane.campaigns.length > 0 || topicFilter === 'all');
  }, [drawerCampaigns, drawerTopicsRaw, topicFilter]);

  async function setCampaignStatus(row: Campaign, nextStatus: 'active' | 'paused') {
    try {
      const { data: localData, error: localError } = await supabase
        .from('campaigns')
        .update({ status: nextStatus })
        .eq('id', row.id)
        .select('id,status');
      if (localError) throw localError;
      if (!localData || localData.length === 0) throw new Error('Campaign không tồn tại trong Supabase hiện tại của web.');

      try {
        await workerPost(`/api/campaigns/${row.id}/${nextStatus === 'paused' ? 'pause' : 'resume'}`, {});
      } catch (workerErr: any) {
        console.warn('worker status update failed, kept local update', workerErr);
      }
      setRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, status: nextStatus } : x)));
      appToast(nextStatus === 'paused' ? 'Đã tạm dừng campaign' : 'Đã tiếp tục campaign', 'success');
      load();
    } catch (err: any) {
      appToast(`Cập nhật trạng thái thất bại: ${err?.message || 'unknown error'}`, 'error');
    }
  }

  async function deleteCampaign(row: Campaign) {
    if (!confirm('Xóa campaign này?')) return;
    try {
      // Local Supabase is the UI source of truth.
      const [r1, r2, r3] = await Promise.all([
        supabase.from('campaign_sources').delete().eq('campaign_id', row.id),
        supabase.from('queue_items').delete().eq('campaign_id', row.id),
        supabase.from('send_logs').update({ campaign_id: null }).eq('campaign_id', row.id)
      ]);
      const cleanupErrors = [r1.error, r2.error, r3.error].filter(Boolean).map((e: any) => e.message);
      if (cleanupErrors.length > 0) {
        throw new Error(`Cleanup failed: ${cleanupErrors.join(' | ')}`);
      }
      const { data: localDeleted, error: localDeleteError } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', row.id)
        .select('id');
      if (localDeleteError) throw localDeleteError;
      if (!localDeleted || localDeleted.length === 0) throw new Error('Campaign không tồn tại trong Supabase hiện tại của web.');

      try {
        await workerPost(`/api/campaigns/${row.id}/delete`, {});
      } catch (workerErr: any) {
        console.warn('worker delete failed, kept local delete', workerErr);
      }
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      appToast('Đã xóa campaign', 'info');
      load();
    } catch (err: any) {
      appToast(`Xóa campaign thất bại: ${err?.message || 'unknown error'}`, 'error');
    }
  }

  async function bulkStatusUpdate(campaignIds: string[], mode: 'pause' | 'resume') {
    if (campaignIds.length === 0) {
      appToast('Không có campaign để thao tác', 'info');
      return;
    }
    try {
      for (const id of campaignIds) {
        const { data, error } = await supabase
          .from('campaigns')
          .update({ status: mode === 'pause' ? 'paused' : 'active' })
          .eq('id', id)
          .select('id,status');
        if (error) throw error;
        if (!data || data.length === 0) throw new Error(`Campaign ${id} không tồn tại trong Supabase hiện tại của web.`);
      }

      await Promise.all(
        campaignIds.map(async (id) => {
          try {
            await workerPost(`/api/campaigns/${id}/${mode === 'pause' ? 'pause' : 'resume'}`, {});
          } catch (_err: any) {
            // Ignore worker failure if local update already committed.
          }
        })
      );
      setRows((prev) => prev.map((x) => (
        campaignIds.includes(x.id) ? { ...x, status: mode === 'pause' ? 'paused' : 'active' } : x
      )));
      appToast(mode === 'pause' ? 'Đã tạm dừng theo ngữ cảnh' : 'Đã tiếp tục theo ngữ cảnh', 'success');
      load();
    } catch (err: any) {
      appToast(`Bulk ${mode} lỗi: ${err?.message || 'unknown'}`, 'error');
    }
  }

  return (
    <AppShell
      title="Campaign Hub v2"
      subtitle="Quản lý theo nhóm đích trước, sau đó drill-down theo topic để thao tác nhanh và trực quan."
      actions={<Link className="btn" href="/campaigns/new">Tạo chiến dịch</Link>}
    >
      <section className="grid gap-3 md:grid-cols-4">
        <article className="card"><p className="text-xs uppercase text-slate-500">Total</p><p className="mt-2 text-3xl font-black text-slate-100">{summary.total}</p></article>
        <article className="card"><p className="text-xs uppercase text-slate-500">Active</p><p className="mt-2 text-3xl font-black text-emerald-300">{summary.active}</p></article>
        <article className="card"><p className="text-xs uppercase text-slate-500">Paused</p><p className="mt-2 text-3xl font-black text-amber-300">{summary.paused}</p></article>
        <article className="card"><p className="text-xs uppercase text-slate-500">Waiting Source</p><p className="mt-2 text-3xl font-black text-rose-300">{summary.waiting}</p></article>
      </section>

      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Target Groups</h2>
            <p className="text-sm text-slate-400">Chọn một nhóm đích để mở drawer quản lý toàn bộ topic của nhóm đó.</p>
          </div>
          <button className="btn-secondary" onClick={load}>Làm mới</button>
        </div>

        {loading ? <SkeletonTable rows={4} cols={4} /> : null}
        {!loading && groupCards.length === 0 ? <div className="empty-state">Chưa có nhóm đích main nào.</div> : null}

        {!loading && groupCards.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {groupCards.map(({ group, list, active, paused, waiting, topicCount }) => (
              <button
                key={group.id}
                className="rounded-2xl border border-slate-700/70 bg-slate-900/45 p-4 text-left transition hover:border-sky-400/60 hover:bg-sky-500/10"
                onClick={() => {
                  setDrawerGroupId(group.id);
                  setStatusFilter('all');
                  setTopicFilter('all');
                }}
              >
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-100">{group.title}</h3>
                  <span className="badge badge-neutral">{topicCount} topic</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-300">active: {active}</div>
                  <div className="rounded-xl bg-amber-500/10 p-2 text-amber-300">paused: {paused}</div>
                  <div className="rounded-xl bg-rose-500/10 p-2 text-rose-300">waiting: {waiting}</div>
                </div>
                <p className="mt-2 text-xs text-slate-400">{list.length} campaign • Nhấn để mở topic drawer</p>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {drawerGroup ? (
        <>
          <div className="fixed inset-0 z-40 bg-slate-950/65 backdrop-blur-[2px]" onClick={() => setDrawerGroupId(null)} />
          <aside className="fixed right-0 top-0 z-50 h-screen w-full max-w-[980px] overflow-y-auto border-l border-slate-700/80 bg-slate-950/95 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Target Group Drawer</p>
                <h2 className="text-2xl font-bold text-slate-100">{drawerGroup.title}</h2>
                <p className="text-sm text-slate-400">Quản lý campaign theo từng topic của nhóm đích này.</p>
              </div>
              <button className="btn-secondary" onClick={() => setDrawerGroupId(null)}>Đóng</button>
            </div>

            <section className="card mb-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Filter status</label>
                  <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="all">Tất cả</option>
                    <option value="active">active</option>
                    <option value="paused">paused</option>
                    <option value="archived">archived</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Filter topic</label>
                  <select className="input" value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)}>
                    <option value="all">Tất cả topic</option>
                    <option value="general">General chat</option>
                    {drawerTopicsRaw.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    className="btn-secondary w-full"
                    onClick={() => bulkStatusUpdate(drawerCampaigns.map((x) => x.id), 'pause')}
                  >
                    Pause all (filtered)
                  </button>
                </div>
                <div className="flex items-end">
                  <button
                    className="btn-success w-full"
                    onClick={() => bulkStatusUpdate(drawerCampaigns.map((x) => x.id), 'resume')}
                  >
                    Resume all (filtered)
                  </button>
                </div>
              </div>
            </section>

            <div className="space-y-4">
              {topicLanes.map((lane) => (
                <section key={lane.key} className="card">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-100">{lane.label}</h3>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                        <span>{lane.campaigns.length} campaign</span>
                        <span>•</span>
                        <span className={lane.waiting > 0 ? 'text-amber-300' : 'text-emerald-300'}>
                          {lane.waiting > 0 ? `${lane.waiting} waiting source` : 'source ready'}
                        </span>
                      </div>
                    </div>
                    <Link
                      className="btn"
                      href={`/campaigns/new?target_group_id=${drawerGroup.id}${lane.key !== 'general' ? `&target_topic_id=${lane.key}` : ''}`}
                    >
                      + Campaign trong topic này
                    </Link>
                  </div>

                  {lane.campaigns.length === 0 ? <div className="empty-state">Chưa có campaign trong topic này.</div> : null}
                  {lane.campaigns.length > 0 ? (
                    <div className="space-y-2">
                      {lane.campaigns.map((row) => (
                        <div key={row.id} className="rounded-xl border border-slate-700/70 bg-slate-900/35 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <Link className="font-semibold text-slate-100 hover:underline" href={`/campaigns/${row.id}`}>{row.name}</Link>
                              <p className="text-xs text-slate-400">
                                {row.copy_mode}/{row.media_group_mode} • batch {row.batch_size} • {(row.run_times || []).join(', ')} • {row.timezone}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={statusClass(row.status)}>{row.status}</span>
                              <span className={sourceClass(row.source_state || 'ready')}>{row.source_state || 'ready'}</span>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Link className="btn-secondary" href={`/campaigns/${row.id}`}>Mở</Link>
                            <button className="btn-secondary" onClick={() => setCampaignStatus(row, 'paused')}>Pause</button>
                            <button className="btn-success" onClick={() => setCampaignStatus(row, 'active')}>Resume</button>
                            <button className="btn-danger" onClick={() => deleteCampaign(row)}>Xóa</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
              ))}
            </div>
          </aside>
        </>
      ) : null}
    </AppShell>
  );
}
