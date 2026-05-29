'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/dashboard', label: 'Tổng quan', hint: 'Điều hành tổng thể' },
  { href: '/groups', label: 'Nhóm', hint: 'Kênh & Diễn đàn' },
  { href: '/topics', label: 'Chủ đề', hint: 'Ánh xạ thread' },
  { href: '/inbox', label: 'Hộp nguồn', hint: 'Nạp nội dung' },
  { href: '/campaigns', label: 'Chiến dịch', hint: 'Kịch bản phân phối' },
  { href: '/queue', label: 'Hàng đợi', hint: 'Lịch thực thi' },
  { href: '/logs', label: 'Nhật ký', hint: 'Theo dõi & kiểm toán' },
  { href: '/settings', label: 'Cài đặt', hint: 'Hệ thống & truy cập' }
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="space-y-1">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`group block rounded-xl border p-3 transition ${
            pathname.startsWith(link.href)
              ? 'border-cyan-400/70 bg-cyan-400/10 shadow-sm'
              : 'border-slate-600 bg-slate-900/50 hover:border-cyan-400/60 hover:bg-slate-900/80'
          }`}
        >
          <p className="text-sm font-semibold text-slate-100">{link.label}</p>
          <p className="text-xs text-slate-400">{link.hint}</p>
        </Link>
      ))}
    </nav>
  );
}
