'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { SkeletonTable } from '@/components/SkeletonTable';
import { supabase } from '@/lib/supabase';
import { workerPost } from '@/lib/worker';

export default function QueuePage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

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
  const statusBadge = (s: string) => {
    if (s === 'sent') return 'badge badge-ok';
    if (s === 'failed') return 'badge badge-err';
    if (s === 'pending' || s === 'processing') return 'badge badge-warn';
    return 'badge badge-neutral';
  };

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('queue_items')
      .select('*,campaigns(name,timezone),source_messages(source_chat_id,source_message_id)')
      .order('created_at', { ascending: false })
      .limit(300);
    setRows(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const stats = useMemo(() => rows.reduce((acc, row) => {
    acc.total += 1; acc[row.status] = (acc[row.status] || 0) + 1; return acc;
  }, { total: 0, pending: 0, processing: 0, sent: 0, failed: 0, skipped: 0 } as Record<string, number>), [rows]);
  const filtered = useMemo(() => rows.filter((r) => status === 'all' ? true : r.status === status), [rows, status]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);
  useEffect(() => { setPage(1); }, [status, pageSize]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  return (
    <AppShell
      title="Hàng đợi gửi"
      subtitle="Theo dõi tiến độ thực thi queue và xử lý lại các item thất bại."
      actions={<div className="flex gap-2">
        <button className="btn-secondary" onClick={load}>{loading ? 'Đang tải...' : 'Làm mới'}</button>
        <button className="btn-secondary" onClick={async () => {
          await workerPost('/api/queue/cleanup', { keepDays: 7 });
          await load();
        }}>Dọn sent/skipped &gt;7d</button>
      </div>}
    >
      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Object.entries(stats).map(([k, v]) => <article key={k} className="card"><p className="text-xs text-zinc-500 uppercase">{k}</p><p className="kpi-value mt-2 text-2xl">{Number(v)}</p></article>)}
      </section>

      <section className="card grid gap-3 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm text-zinc-300">Lọc trạng thái</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Tất cả</option><option value="pending">pending</option><option value="processing">processing</option><option value="sent">sent</option><option value="failed">failed</option><option value="skipped">skipped</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-300">Số dòng/trang</label>
          <select className="input" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            <option value={20}>20</option><option value={50}>50</option><option value={100}>100</option>
          </select>
        </div>
      </section>

      <section className="card overflow-auto">
        {loading ? <SkeletonTable rows={5} cols={6} /> : null}
        {!loading && filtered.length === 0 ? <div className="empty-state">Không có item phù hợp bộ lọc.</div> : null}
        {!loading && filtered.length > 0 ? (
          <table className="table min-w-[980px]">
            <thead><tr><th>Chiến dịch</th><th>ID chi tiết</th><th>Lịch gửi</th><th>Trạng thái</th><th>Retry</th><th>Lỗi</th><th>Thao tác</th></tr></thead>
            <tbody>{pageRows.map((row) => <tr key={row.id}><td>{row.campaigns?.name}</td><td className="text-xs text-zinc-400">
              <div>queue: {row.id}</div>
              <div>msg: {row.source_messages?.source_chat_id || '-'}/{row.source_messages?.source_message_id || '-'}</div>
              <div>target: {row.target_chat_id}{row.target_message_thread_id ? `/${row.target_message_thread_id}` : ''}</div>
            </td><td>{formatCampaignTime(row.scheduled_at, row.campaigns?.timezone)}</td><td><span className={statusBadge(row.status)}>{row.status}</span></td><td>{row.retry_count}</td><td className="max-w-[360px] truncate">{row.error_message || '-'}</td><td className="flex gap-2">
              <button className="btn-secondary" onClick={async () => { await workerPost(`/api/queue/${row.id}/retry`, {}); load(); }}>Thử lại</button>
              <button className="btn-secondary" onClick={async () => { await workerPost(`/api/queue/${row.id}/send-now`, {}); load(); }}>Gửi ngay</button>
              <button className="btn-secondary" onClick={async () => { await workerPost(`/api/queue/${row.id}/skip`, {}); load(); }}>Bỏ qua</button>
              <button className="btn-secondary" onClick={async () => { await workerPost(`/api/queue/${row.id}/cancel`, {}); load(); }}>Hủy</button>
            </td></tr>)}</tbody>
          </table>
        ) : null}
        {!loading && filtered.length > 0 ? (
          <div className="mt-3 flex items-center justify-between text-sm text-zinc-400">
            <p>Trang {page}/{totalPages} - {filtered.length} bản ghi</p>
            <div className="flex gap-2">
              <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Trước</button>
              <button className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Sau</button>
            </div>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
