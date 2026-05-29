'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

export default function Dashboard() {
  const [counts, setCounts] = useState({ groups: 0, topics: 0, campaigns: 0, pending: 0, failed: 0 });

  useEffect(() => {
    Promise.all([
      supabase.from('telegram_groups').select('id', { count: 'exact', head: true }),
      supabase.from('topics').select('id', { count: 'exact', head: true }),
      supabase.from('campaigns').select('id', { count: 'exact', head: true }),
      supabase.from('queue_items').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('queue_items').select('id', { count: 'exact', head: true }).eq('status', 'failed')
    ]).then(([g, t, c, p, f]) => {
      setCounts({
        groups: g.count || 0,
        topics: t.count || 0,
        campaigns: c.count || 0,
        pending: p.count || 0,
        failed: f.count || 0
      });
    });
  }, []);

  const cards = useMemo(
    () => [
      { label: 'Nhóm đã đăng ký', value: counts.groups, tone: 'text-cyan-300' },
      { label: 'Topic đã ánh xạ', value: counts.topics, tone: 'text-emerald-300' },
      { label: 'Chiến dịch đang chạy', value: counts.campaigns, tone: 'text-slate-100' },
      { label: 'Hàng đợi chờ gửi', value: counts.pending, tone: 'text-amber-300' },
      { label: 'Hàng đợi lỗi', value: counts.failed, tone: 'text-rose-300' }
    ],
    [counts]
  );

  return (
    <AppShell
      title="Bảng điều hành"
      subtitle="Trung tâm theo dõi nạp nội dung, lập chiến dịch và thực thi hàng đợi."
      actions={<Link className="btn" href="/campaigns/new">Tạo chiến dịch</Link>}
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <article key={card.label} className="card">
            <p className="text-xs uppercase tracking-[0.15em] text-slate-400">{card.label}</p>
            <p className={`kpi-value mt-2 text-3xl font-semibold ${card.tone}`}>{card.value}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="card">
          <h3 className="text-lg font-semibold text-slate-100">Luồng vận hành đề xuất</h3>
          <ol className="mt-3 space-y-2 text-sm text-slate-300">
            <li>1. Kết nối bot và đăng ký nhóm backup/main.</li>
            <li>2. Đồng bộ hoặc tạo topic cho nhóm đích.</li>
            <li>3. Nạp nội dung vào hộp nguồn và chọn nguồn cho chiến dịch.</li>
            <li>4. Tạo queue, theo dõi trạng thái chờ/lỗi và xử lý lại khi cần.</li>
          </ol>
        </article>

        <article className="card">
          <h3 className="text-lg font-semibold text-slate-100">Thao tác nhanh</h3>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <Link className="btn-secondary" href="/groups">Quản lý nhóm</Link>
            <Link className="btn-secondary" href="/topics">Ánh xạ topic</Link>
            <Link className="btn-secondary" href="/inbox">Duyệt hộp nguồn</Link>
            <Link className="btn-secondary" href="/queue">Mở trung tâm queue</Link>
          </div>
        </article>
      </section>
    </AppShell>
  );
}
