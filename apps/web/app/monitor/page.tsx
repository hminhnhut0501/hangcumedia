'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { supabase } from '@/lib/supabase';
import { workerGet, workerPost } from '@/lib/worker';
import { appToast } from '@/lib/toast';

export default function MonitorPage() {
  const [queue, setQueue] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [failedPage, setFailedPage] = useState(1);
  const [logPage, setLogPage] = useState(1);
  const [runtime, setRuntime] = useState<any>(null);
  const [webhookInfo, setWebhookInfo] = useState<any>(null);
  const [preflightAll, setPreflightAll] = useState<any>(null);
  const [analyticsRange, setAnalyticsRange] = useState<'24h' | '7d'>('24h');
  const [analytics, setAnalytics] = useState<any>(null);
  const pageSize = 10;
  const statusBadge = (s: string) => {
    if (s === 'sent') return 'badge badge-ok';
    if (s === 'failed') return 'badge badge-err';
    if (s === 'pending' || s === 'processing') return 'badge badge-warn';
    return 'badge badge-neutral';
  };

  const formatCampaignTime = (iso: string, timezone?: string) => {
    const tz = timezone || 'Asia/Ho_Chi_Minh';
    try {
      return `${new Intl.DateTimeFormat('vi-VN', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).format(new Date(iso))} (${tz})`;
    } catch {
      return new Date(iso).toLocaleString();
    }
  };

  async function load() {
    const [q, l, rt, wh, an] = await Promise.all([
      supabase.from('queue_items').select('*,campaigns(name,timezone),source_messages(source_chat_id,source_message_id)').order('created_at', { ascending: false }).limit(100),
      supabase.from('send_logs').select('*,campaigns(name,timezone),source_messages(source_chat_id,source_message_id)').order('created_at', { ascending: false }).limit(50),
      workerGet('/api/runtime/status'),
      workerGet('/api/telegram/webhook-info'),
      workerGet(`/api/analytics/summary/${analyticsRange}`)
    ]);
    setQueue(q.data || []);
    setLogs(l.data || []);
    setRuntime(rt);
    setWebhookInfo(wh?.info || null);
    setAnalytics(an);
  }

  async function runPreflightAll() {
    const result = await workerPost('/api/campaigns/preflight-all', {});
    setPreflightAll(result);
  }

  useEffect(() => { load(); }, [analyticsRange]);

  const stats = useMemo(() => {
    const acc: any = { pending: 0, processing: 0, sent: 0, failed: 0, skipped: 0 };
    for (const q of queue) acc[q.status] = (acc[q.status] || 0) + 1;
    return acc;
  }, [queue]);

  const failed = queue.filter((q) => q.status === 'failed');
  const failedPages = Math.max(1, Math.ceil(failed.length / pageSize));
  const failedRows = failed.slice((failedPage - 1) * pageSize, failedPage * pageSize);
  const logPages = Math.max(1, Math.ceil(logs.length / pageSize));
  const logRows = logs.slice((logPage - 1) * pageSize, logPage * pageSize);

  const health = useMemo(() => {
    const pendingWebhook = Number(webhookInfo?.pending_update_count || 0);
    const failedCount = Number(stats.failed || 0);
    const autoPause = Number(analytics?.send?.auto_pause || 0);
    if (pendingWebhook > 50 || failedCount > 20) return { level: 'err', text: 'Critical: queue/webhook đang bất ổn' };
    if (pendingWebhook > 0 || failedCount > 0 || autoPause > 0) return { level: 'warn', text: 'Warning: có lỗi cần theo dõi' };
    return { level: 'ok', text: 'Healthy: hệ thống đang ổn định' };
  }, [webhookInfo, stats, analytics]);

  return (
    <AppShell title="Giám sát vận hành" subtitle="Theo dõi queue và xử lý lỗi nhanh bằng một màn hình." actions={<button className="btn-secondary" onClick={load}>Làm mới</button>}>
      <section className={`sticky top-3 z-20 rounded-xl border px-3 py-2 text-sm ${
        health.level === 'ok'
          ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200'
          : health.level === 'warn'
            ? 'border-amber-300/40 bg-amber-400/10 text-amber-200'
            : 'border-rose-300/40 bg-rose-400/10 text-rose-200'
      }`}>
        {health.text}
      </section>
      <section className="grid gap-3 md:grid-cols-3">
        <article className="card">
          <p className="text-xs uppercase text-zinc-500">Webhook URL</p>
          <p className="mt-2 truncate text-sm text-zinc-200">{webhookInfo?.url || '-'}</p>
        </article>
        <article className="card">
          <p className="text-xs uppercase text-zinc-500">Pending Update</p>
          <p className="kpi-value mt-2 text-2xl">{Number(webhookInfo?.pending_update_count || 0)}</p>
        </article>
        <article className="card">
          <p className="text-xs uppercase text-zinc-500">Last Error</p>
          <p className="mt-2 text-sm text-rose-300">{webhookInfo?.last_error_message || '-'}</p>
          <div className="mt-2 flex justify-end">
            <button className="btn" onClick={async () => { await workerPost('/api/import/reconcile', {}); appToast('Đã chạy reconcile', 'success'); await load(); }}>Reconcile now</button>
          </div>
        </article>
      </section>

      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="section-title text-lg font-semibold">Analytics</h3>
          <div className="flex gap-2">
            <button className={`btn-secondary ${analyticsRange === '24h' ? 'ring-1 ring-cyan-300/60' : ''}`} onClick={() => setAnalyticsRange('24h')}>24h</button>
            <button className={`btn-secondary ${analyticsRange === '7d' ? 'ring-1 ring-cyan-300/60' : ''}`} onClick={() => setAnalyticsRange('7d')}>7d</button>
          </div>
        </div>
        {analytics ? (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-4">
              <article className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-xs text-zinc-500">SEND OK</p><p className="mt-2 text-2xl font-semibold text-emerald-300">{analytics.send?.sent || 0}</p></article>
              <article className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-xs text-zinc-500">SEND FAIL</p><p className="mt-2 text-2xl font-semibold text-rose-300">{analytics.send?.failed || 0}</p></article>
              <article className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-xs text-zinc-500">AUTO PAUSE</p><p className="mt-2 text-2xl font-semibold text-amber-300">{analytics.send?.auto_pause || 0}</p></article>
              <article className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-xs text-zinc-500">QUEUE PENDING</p><p className="mt-2 text-2xl font-semibold">{analytics.queue?.pending || 0}</p></article>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-zinc-200">Top lỗi</p>
              <div className="space-y-1 text-sm text-zinc-300">
                {(analytics.top_errors || []).map((e: any, idx: number) => (
                  <p key={`err-${idx}`}>#{idx + 1} ({e.count}) {e.error}</p>
                ))}
              </div>
            </div>
          </div>
        ) : <p className="text-sm text-zinc-400">Đang tải analytics...</p>}
      </section>

      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="section-title text-lg font-semibold">Preflight toàn bộ campaign</h3>
          <button className="btn-secondary" onClick={async () => { await runPreflightAll(); appToast('Đã chạy preflight all', 'success'); }}>Run preflight all</button>
        </div>
        {preflightAll?.summary ? (
          <div className="grid gap-3 md:grid-cols-4">
            <article className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-xs text-zinc-500">TOTAL</p><p className="mt-2 text-2xl font-semibold">{preflightAll.summary.total}</p></article>
            <article className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-xs text-zinc-500">HEALTHY</p><p className="mt-2 text-2xl font-semibold text-emerald-300">{preflightAll.summary.healthy}</p></article>
            <article className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-xs text-zinc-500">WARNED</p><p className="mt-2 text-2xl font-semibold text-amber-300">{preflightAll.summary.warned}</p></article>
            <article className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-xs text-zinc-500">FAILED</p><p className="mt-2 text-2xl font-semibold text-rose-300">{preflightAll.summary.failed}</p></article>
          </div>
        ) : (
          <p className="text-sm text-zinc-400">Bấm "Run preflight all" để kiểm tra quyền nhóm đích và trạng thái nguồn trước giờ gửi.</p>
        )}
      </section>

      <section className="grid gap-3 md:grid-cols-5">
        {Object.entries(stats).map(([k, v]) => <article key={k} className="card"><p className="text-xs text-zinc-500 uppercase">{k}</p><p className="kpi-value mt-2 text-2xl">{Number(v)}</p></article>)}
      </section>

      <section className="card overflow-auto">
        <h3 className="section-title mb-3 text-lg font-semibold">Campaign source state</h3>
        <table className="table min-w-[760px]">
          <thead><tr><th>Campaign</th><th>Status</th><th>Source state</th><th>Exhausted at</th></tr></thead>
          <tbody>
            {(runtime?.campaigns || []).map((c: any) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.status}</td>
                <td>{c.source_state}</td>
                <td>{c.last_exhausted_at ? new Date(c.last_exhausted_at).toLocaleString('vi-VN') : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="section-title text-lg font-semibold">Queue lỗi</h3>
          <button className="btn" onClick={async () => {
            if (!confirm('Retry tối đa 50 queue lỗi gần nhất?')) return;
            for (const item of failed.slice(0, 50)) {
              await workerPost(`/api/queue/${item.id}/retry`, {});
            }
            appToast('Đã retry các queue lỗi', 'success');
            await load();
          }}>Retry all failed (max 50)</button>
        </div>
        <div className="overflow-auto">
          <table className="table min-w-[1000px]"><thead><tr><th>Campaign</th><th>ID chi tiết</th><th>Scheduled</th><th>Status</th><th>Error</th><th>Retry</th><th>Action</th></tr></thead>
            <tbody>{failedRows.map((f) => <tr key={f.id}><td>{f.campaigns?.name}</td><td className="text-xs text-zinc-400"><div>queue: {f.id}</div><div>msg: {f.source_messages?.source_chat_id || '-'}/{f.source_messages?.source_message_id || '-'}</div></td><td>{formatCampaignTime(f.scheduled_at, f.campaigns?.timezone)}</td><td><span className={statusBadge(f.status)}>{f.status}</span></td><td className="max-w-[350px] truncate">{f.error_message || '-'}</td><td>{f.retry_count}</td><td><button className="btn-secondary" onClick={async () => { await workerPost(`/api/queue/${f.id}/retry`, {}); appToast('Đã retry queue', 'success'); load(); }}>Retry</button></td></tr>)}</tbody>
          </table>
        </div>
        {failed.length > 0 ? (
          <div className="mt-3 flex items-center justify-between text-sm text-zinc-400">
            <p>Queue lỗi: {failed.length} bản ghi</p>
            <div className="flex gap-2">
              <button className="btn-secondary" disabled={failedPage <= 1} onClick={() => setFailedPage((p) => Math.max(1, p - 1))}>Trước</button>
              <span className="px-2 py-1">Trang {failedPage}/{failedPages}</span>
              <button className="btn-secondary" disabled={failedPage >= failedPages} onClick={() => setFailedPage((p) => Math.min(failedPages, p + 1))}>Sau</button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="card overflow-auto">
        <h3 className="section-title mb-3 text-lg font-semibold">Log gần nhất</h3>
        <table className="table min-w-[1000px]"><thead><tr><th>Time</th><th>Campaign</th><th>ID chi tiết</th><th>Status</th><th>Error</th></tr></thead>
          <tbody>{logRows.map((l) => <tr key={l.id}><td>{formatCampaignTime(l.created_at, l.campaigns?.timezone)}</td><td>{l.campaigns?.name || '-'}</td><td className="text-xs text-zinc-400"><div>log: {l.id}</div><div>queue: {l.queue_item_id || '-'}</div><div>msg: {l.source_messages?.source_chat_id || '-'}/{l.source_messages?.source_message_id || '-'}</div><div>tg_code: {l.response_payload?.error_code || '-'}</div></td><td><span className={statusBadge(l.status)}>{l.status}</span></td><td className="max-w-[350px] truncate">{l.error_message || '-'}</td></tr>)}</tbody>
        </table>
        {logs.length > 0 ? (
          <div className="mt-3 flex items-center justify-between text-sm text-zinc-400">
            <p>Log: {logs.length} bản ghi gần nhất</p>
            <div className="flex gap-2">
              <button className="btn-secondary" disabled={logPage <= 1} onClick={() => setLogPage((p) => Math.max(1, p - 1))}>Trước</button>
              <span className="px-2 py-1">Trang {logPage}/{logPages}</span>
              <button className="btn-secondary" disabled={logPage >= logPages} onClick={() => setLogPage((p) => Math.min(logPages, p + 1))}>Sau</button>
            </div>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
