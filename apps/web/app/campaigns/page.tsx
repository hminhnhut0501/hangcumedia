'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { SkeletonTable } from '@/components/SkeletonTable';
import { supabase } from '@/lib/supabase';
import { workerDelete, workerPost } from '@/lib/worker';

function statusClass(status: string) {
  if (status === 'active') return 'badge badge-ok';
  if (status === 'paused') return 'badge badge-warn';
  return 'badge badge-neutral';
}

export default function CampaignsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('campaigns').select('*,telegram_groups!campaigns_target_group_id_fkey(title)').order('created_at', { ascending: false });
    setRows(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <AppShell
      title="Chiến dịch"
      subtitle="Quản lý lịch gửi, sửa cấu hình, tạm dừng/tiếp tục và xóa chiến dịch."
      actions={<Link className="btn" href="/campaigns/new">Tạo chiến dịch</Link>}
    >
      <section className="card overflow-auto">
        {loading ? <SkeletonTable rows={5} cols={7} /> : null}
        {!loading && rows.length === 0 ? <div className="empty-state">Chưa có chiến dịch nào. Hãy tạo chiến dịch đầu tiên.</div> : null}
        {!loading && rows.length > 0 ? (
          <table className="table min-w-[980px]">
            <thead><tr><th>Tên</th><th>Nhóm đích</th><th>Khung giờ</th><th>Batch</th><th>Chế độ</th><th>Trạng thái</th><th>Nguồn</th><th>Thao tác</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td><Link className="font-semibold text-zinc-100 hover:underline" href={`/campaigns/${row.id}`}>{row.name}</Link></td>
                  <td>{row.telegram_groups?.title || '-'}</td><td>{(row.run_times || []).join(', ')}</td><td>{row.batch_size}</td><td>{row.copy_mode}/{row.media_group_mode}</td>
                  <td><span className={statusClass(row.status)}>{row.status}</span></td>
                  <td>
                    <span className={row.source_state === 'waiting_for_source' ? 'badge badge-warn' : 'badge badge-ok'}>
                      {row.source_state || 'ready'}
                    </span>
                  </td>
                  <td className="flex gap-2 py-2">
                    <Link className="btn-secondary" href={`/campaigns/${row.id}`}>Sửa</Link>
                    <button className="btn-secondary" onClick={async () => { await workerPost(`/api/campaigns/${row.id}/pause`, {}); load(); }}>Tạm dừng</button>
                    <button className="btn-success" onClick={async () => { await workerPost(`/api/campaigns/${row.id}/resume`, {}); load(); }}>Tiếp tục</button>
                    <button className="btn-danger" onClick={async () => {
                      if (!confirm('Xóa chiến dịch này?')) return;
                      await workerDelete(`/api/campaigns/${row.id}`);
                      load();
                    }}>Xóa</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>
    </AppShell>
  );
}
