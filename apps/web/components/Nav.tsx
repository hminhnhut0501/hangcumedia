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
              ? 'border-zinc-500 bg-zinc-900 shadow-sm'
              : 'border-zinc-800 bg-zinc-950/70 hover:border-zinc-600 hover:bg-zinc-900/80'
          }`}
        >
          <p className="text-sm font-semibold text-zinc-100">{link.label}</p>
          <p className="text-xs text-zinc-400">{link.hint}</p>
        </Link>
      ))}
    </nav>
  );
}
