'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { supabase } from '@/lib/supabase';
import { workerPost } from '@/lib/worker';

function statusClass(status: string) {
  if (status === 'active') return 'bg-emerald-400/20 text-emerald-300';
  if (status === 'paused') return 'bg-amber-400/20 text-amber-300';
  return 'bg-slate-400/20 text-slate-300';
}

export default function CampaignsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const load = async () => {
    const { data } = await supabase
      .from('campaigns')
      .select('*,telegram_groups!campaigns_target_group_id_fkey(title)')
      .order('created_at', { ascending: false });
    setRows(data || []);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <AppShell
      title="Điều phối chiến dịch"
      subtitle="Lập lịch gửi, chọn topic đích và kiểm soát chế độ copy/forward cho từng chiến dịch."
      actions={<Link className="btn" href="/campaigns/new">Tạo chiến dịch</Link>}
    >
      <section className="card overflow-auto">
        <table className="table min-w-[900px]">
          <thead>
            <tr>
              <th>Tên</th>
              <th>Nhóm đích</th>
              <th>Khung giờ</th>
              <th>Batch</th>
              <th>Chế độ</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link className="font-semibold text-cyan-300 hover:underline" href={`/campaigns/${row.id}`}>
                    {row.name}
                  </Link>
                </td>
                <td>{row.telegram_groups?.title || '-'}</td>
                <td>{(row.run_times || []).join(', ')}</td>
                <td>{row.batch_size}</td>
                <td>{row.copy_mode}/{row.media_group_mode}</td>
                <td>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(row.status)}`}>
                    {row.status}
                  </span>
                </td>
                <td className="flex gap-2 py-2">
                  <button className="btn-secondary" onClick={async () => { await workerPost(`/api/campaigns/${row.id}/pause`, {}); load(); }}>Tạm dừng</button>
                  <button className="btn-secondary" onClick={async () => { await workerPost(`/api/campaigns/${row.id}/resume`, {}); load(); }}>Tiếp tục</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
