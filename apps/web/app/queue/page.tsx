'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { SkeletonTable } from '@/components/SkeletonTable';
import { supabase } from '@/lib/supabase';
import { workerPost } from '@/lib/worker';

export default function QueuePage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('queue_items').select('*,campaigns(name)').order('created_at', { ascending: false }).limit(300);
    setRows(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const stats = useMemo(() => rows.reduce((acc, row) => {
    acc.total += 1; acc[row.status] = (acc[row.status] || 0) + 1; return acc;
  }, { total: 0, pending: 0, processing: 0, sent: 0, failed: 0, skipped: 0 } as Record<string, number>), [rows]);

  return (
    <AppShell
      title="Hàng đợi gửi"
      subtitle="Theo dõi tiến độ thực thi queue và xử lý lại các item thất bại."
      actions={<button className="btn-secondary" onClick={load}>{loading ? 'Đang tải...' : 'Làm mới'}</button>}
    >
      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Object.entries(stats).map(([k, v]) => <article key={k} className="card"><p className="text-xs text-zinc-500 uppercase">{k}</p><p className="kpi-value mt-2 text-2xl">{Number(v)}</p></article>)}
      </section>

      <section className="card overflow-auto">
        {loading ? <SkeletonTable rows={5} cols={6} /> : null}
        {!loading && rows.length === 0 ? <div className="empty-state">Chưa có item queue nào.</div> : null}
        {!loading && rows.length > 0 ? (
          <table className="table min-w-[980px]">
            <thead><tr><th>Chiến dịch</th><th>Lịch gửi</th><th>Trạng thái</th><th>Retry</th><th>Lỗi</th><th>Thao tác</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id}><td>{row.campaigns?.name}</td><td>{new Date(row.scheduled_at).toLocaleString()}</td><td>{row.status}</td><td>{row.retry_count}</td><td className="max-w-[360px] truncate">{row.error_message || '-'}</td><td className="flex gap-2">
              <button className="btn-secondary" onClick={async () => { await workerPost(`/api/queue/${row.id}/retry`, {}); load(); }}>Thử lại</button>
              <button className="btn-secondary" onClick={async () => { await workerPost(`/api/queue/${row.id}/send-now`, {}); load(); }}>Gửi ngay</button>
              <button className="btn-secondary" onClick={async () => { await workerPost(`/api/queue/${row.id}/skip`, {}); load(); }}>Bỏ qua</button>
              <button className="btn-secondary" onClick={async () => { await workerPost(`/api/queue/${row.id}/cancel`, {}); load(); }}>Hủy</button>
            </td></tr>)}</tbody>
          </table>
        ) : null}
      </section>
    </AppShell>
  );
}
