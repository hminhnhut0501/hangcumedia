'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  WandSparkles,
  Activity,
  Settings,
  Megaphone,
  Users,
  Hash,
  Inbox,
  ListChecks,
  ScrollText,
  Database,
  Shield
} from 'lucide-react';

const sections = [
  {
    label: 'Điều hướng',
    items: [
      { href: '/dashboard', label: 'Tổng quan', hint: 'System snapshot', Icon: LayoutDashboard },
      { href: '/setup', label: 'Setup nhanh', hint: 'Source -> Target -> Launch', Icon: WandSparkles },
      { href: '/monitor', label: 'Giám sát', hint: 'Health, preflight, analytics', Icon: Activity }
    ]
  },
  {
    label: 'Dữ liệu',
    items: [
      { href: '/groups', label: 'Nhóm', hint: 'Source/Target groups', Icon: Users },
      { href: '/topics', label: 'Chủ đề', hint: 'Target topic registry', Icon: Hash },
      { href: '/inbox', label: 'Hộp nguồn', hint: 'Imported messages', Icon: Inbox },
      { href: '/backfill', label: 'Backfill', hint: 'Historical hydrate jobs', Icon: Database }
    ]
  },
  {
    label: 'Phân phối',
    items: [
      { href: '/campaigns', label: 'Chiến dịch', hint: 'Target group/topic routing', Icon: Megaphone },
      { href: '/queue', label: 'Hàng đợi', hint: 'Execution queue', Icon: ListChecks },
      { href: '/logs', label: 'Nhật ký', hint: 'Delivery traces', Icon: ScrollText }
    ]
  },
  {
    label: 'Hệ thống',
    items: [
      { href: '/admins', label: 'Admin', hint: 'Private bot access', Icon: Shield },
      { href: '/settings', label: 'Cài đặt', hint: 'Runtime controls', Icon: Settings }
    ]
  }
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="space-y-4 overflow-y-auto pr-1">
      {sections.map((section) => (
        <div key={section.label}>
          <p className="px-3 pb-1 text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-500">{section.label}</p>
          <div className="space-y-1.5">
            {section.items.map((link) => {
              const active = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${
                    active
                      ? 'border border-sky-500/30 bg-sky-500/12 text-slate-50'
                      : 'border border-transparent text-slate-400 hover:border-slate-700/60 hover:bg-slate-900/55 hover:text-slate-200'
                  }`}
                >
                  <span className={`rounded-lg border p-1.5 transition ${
                    active
                      ? 'border-sky-400/40 bg-sky-500/20 text-sky-200'
                      : 'border-slate-700/60 bg-slate-900/70 text-slate-500 group-hover:text-slate-300'
                  }`}>
                    <link.Icon size={14} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{link.label}</p>
                    <p className="truncate text-[11px] text-slate-500">{link.hint}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
