'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { SkeletonTable } from '@/components/SkeletonTable';
import { supabase } from '@/lib/supabase';

export default function LogsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('send_logs').select('*,campaigns(name)').order('created_at', { ascending: false }).limit(400);
    setRows(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  const filtered = useMemo(() => rows.filter((r) => status === 'all' ? true : r.status === status), [rows, status]);

  return (
    <AppShell title="Nhật ký gửi" subtitle="Theo dõi lịch sử gửi, lỗi API Telegram và kết quả retry." actions={<button className="btn-secondary" onClick={load}>{loading ? 'Đang tải...' : 'Làm mới'}</button>}>
      <section className="card grid gap-3 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm text-zinc-300">Lọc theo trạng thái</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Tất cả trạng thái</option><option value="sent">sent</option><option value="failed">failed</option>
          </select>
          <p className="mt-1 text-xs text-zinc-500">Giúp bạn chỉ xem log thành công hoặc log lỗi.</p>
        </div>
      </section>
      <section className="card overflow-auto">
        {loading ? <SkeletonTable rows={5} cols={5} /> : null}
        {!loading && filtered.length === 0 ? <div className="empty-state">Chưa có log nào.</div> : null}
        {!loading && filtered.length > 0 ? (
          <table className="table min-w-[900px]"><thead><tr><th>Thời gian</th><th>Chiến dịch</th><th>Action</th><th>Status</th><th>Error</th></tr></thead>
            <tbody>{filtered.map((r) => <tr key={r.id}><td>{new Date(r.created_at).toLocaleString()}</td><td>{r.campaigns?.name || '-'}</td><td>{r.action}</td><td>{r.status}</td><td className="max-w-[420px] truncate">{r.error_message || '-'}</td></tr>)}</tbody>
          </table>
        ) : null}
      </section>
    </AppShell>
  );
}
