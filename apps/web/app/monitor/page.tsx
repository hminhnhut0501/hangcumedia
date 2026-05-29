'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { supabase } from '@/lib/supabase';
import { workerPost } from '@/lib/worker';

export default function MonitorPage() {
  const [queue, setQueue] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [failedPage, setFailedPage] = useState(1);
  const [logPage, setLogPage] = useState(1);
  const pageSize = 10;

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
    const [q, l] = await Promise.all([
      supabase.from('queue_items').select('*,campaigns(name,timezone)').order('created_at', { ascending: false }).limit(100),
      supabase.from('send_logs').select('*,campaigns(name,timezone)').order('created_at', { ascending: false }).limit(50)
    ]);
    setQueue(q.data || []);
    setLogs(l.data || []);
  }

  useEffect(() => { load(); }, []);

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

  return (
    <AppShell title="Giám sát vận hành" subtitle="Theo dõi queue và xử lý lỗi nhanh bằng một màn hình." actions={<button className="btn-secondary" onClick={load}>Làm mới</button>}>
      <section className="grid gap-3 md:grid-cols-5">
        {Object.entries(stats).map(([k, v]) => <article key={k} className="card"><p className="text-xs text-zinc-500 uppercase">{k}</p><p className="kpi-value mt-2 text-2xl">{Number(v)}</p></article>)}
      </section>

      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="section-title text-lg font-semibold">Queue lỗi</h3>
          <button className="btn" onClick={async () => {
            for (const item of failed.slice(0, 50)) {
              await workerPost(`/api/queue/${item.id}/retry`, {});
            }
            await load();
          }}>Retry all failed (max 50)</button>
        </div>
        <div className="overflow-auto">
          <table className="table min-w-[900px]"><thead><tr><th>Campaign</th><th>Scheduled</th><th>Error</th><th>Retry</th><th>Action</th></tr></thead>
            <tbody>{failedRows.map((f) => <tr key={f.id}><td>{f.campaigns?.name}</td><td>{formatCampaignTime(f.scheduled_at, f.campaigns?.timezone)}</td><td className="max-w-[350px] truncate">{f.error_message || '-'}</td><td>{f.retry_count}</td><td><button className="btn-secondary" onClick={async () => { await workerPost(`/api/queue/${f.id}/retry`, {}); load(); }}>Retry</button></td></tr>)}</tbody>
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
        <table className="table min-w-[900px]"><thead><tr><th>Time</th><th>Campaign</th><th>Status</th><th>Error</th></tr></thead>
          <tbody>{logRows.map((l) => <tr key={l.id}><td>{formatCampaignTime(l.created_at, l.campaigns?.timezone)}</td><td>{l.campaigns?.name || '-'}</td><td>{l.status}</td><td className="max-w-[350px] truncate">{l.error_message || '-'}</td></tr>)}</tbody>
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
