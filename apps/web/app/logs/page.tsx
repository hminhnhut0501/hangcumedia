'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { SkeletonTable } from '@/components/SkeletonTable';
import { supabase } from '@/lib/supabase';
import { workerPost } from '@/lib/worker';

export default function LogsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('send_logs').select('*,campaigns(name)').order('created_at', { ascending: false }).limit(400);
    setRows(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  const filtered = useMemo(() => rows.filter((r) => status === 'all' ? true : r.status === status), [rows, status]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);
  useEffect(() => { setPage(1); }, [status, pageSize]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  return (
    <AppShell title="Nhật ký gửi" subtitle="Theo dõi lịch sử gửi, lỗi API Telegram và kết quả retry." actions={<div className="flex gap-2">
      <button className="btn-secondary" onClick={load}>{loading ? 'Đang tải...' : 'Làm mới'}</button>
      <button className="btn-secondary" onClick={async () => { await workerPost('/api/logs/cleanup', { keepDays: 7 }); await load(); }}>Dọn log &gt;7d</button>
    </div>}>
      <section className="card grid gap-3 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm text-zinc-300">Lọc theo trạng thái</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Tất cả trạng thái</option><option value="sent">sent</option><option value="failed">failed</option>
          </select>
          <p className="mt-1 text-xs text-zinc-500">Giúp bạn chỉ xem log thành công hoặc log lỗi.</p>
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-300">Số dòng/trang</label>
          <select className="input" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            <option value={20}>20</option><option value={50}>50</option><option value={100}>100</option>
          </select>
        </div>
      </section>
      <section className="card overflow-auto">
        {loading ? <SkeletonTable rows={5} cols={5} /> : null}
        {!loading && filtered.length === 0 ? <div className="empty-state">Chưa có log nào.</div> : null}
        {!loading && filtered.length > 0 ? (
          <table className="table min-w-[1100px]"><thead><tr><th>Thời gian</th><th>Chiến dịch</th><th>ID chi tiết</th><th>Action</th><th>Status</th><th>Error</th></tr></thead>
            <tbody>{pageRows.map((r) => <tr key={r.id}><td>{new Date(r.created_at).toLocaleString()}</td><td>{r.campaigns?.name || '-'}</td><td className="text-xs text-zinc-400">
              <div>log: {r.id}</div>
              <div>queue: {r.queue_item_id || '-'}</div>
              <div>source: {r.source_message_id || '-'}</div>
              <div>tg_code: {r.response_payload?.error_code || '-'}</div>
            </td><td>{r.action}</td><td><span className={statusBadge(r.status)}>{r.status}</span></td><td className="max-w-[420px] truncate">{r.error_message || '-'}</td></tr>)}</tbody>
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
  const statusBadge = (s: string) => {
    if (s === 'sent') return 'badge badge-ok';
    if (s === 'failed') return 'badge badge-err';
    return 'badge badge-neutral';
  };
