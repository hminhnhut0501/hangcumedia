'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Shield,
  WandSparkles,
  Activity,
  Settings
} from 'lucide-react';

const links = [
  { href: '/dashboard', label: 'Tổng quan', hint: 'Điều hành tổng thể', Icon: LayoutDashboard },
  { href: '/setup', label: 'Setup nhanh', hint: 'Nguồn -> Đích -> Chạy', Icon: WandSparkles },
  { href: '/monitor', label: 'Giám sát', hint: 'Queue + logs nhanh', Icon: Activity },
  { href: '/admins', label: 'Admin', hint: 'Quyền bot riêng tư', Icon: Shield },
  { href: '/settings', label: 'Cài đặt', hint: 'Hệ thống', Icon: Settings }
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="space-y-1.5">
      {links.map((link) => {
        const active = pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${
              active
                ? 'bg-gradient-to-r from-cyan-300/20 to-violet-300/20 text-zinc-50 shadow-[0_8px_18px_rgba(36,77,122,0.35)]'
                : 'text-zinc-400 hover:bg-white/6 hover:text-zinc-200'
            }`}
          >
            <span className={`rounded-lg border p-1.5 transition ${
              active
                ? 'border-cyan-200/50 bg-cyan-100/15 text-cyan-100'
                : 'border-white/10 bg-white/[0.03] text-zinc-400 group-hover:border-cyan-200/35 group-hover:text-cyan-100'
            }`}>
              <link.Icon size={14} />
            </span>
            <div>
              <p className="text-sm font-semibold">{link.label}</p>
              <p className="text-[11px] text-zinc-500">{link.hint}</p>
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
