'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/dashboard', label: 'Dashboard', hint: 'Overview' },
  { href: '/groups', label: 'Groups', hint: 'Channels & Forums' },
  { href: '/topics', label: 'Topics', hint: 'Thread Mapping' },
  { href: '/inbox', label: 'Inbox', hint: 'Source Intake' },
  { href: '/campaigns', label: 'Campaigns', hint: 'Delivery Playbooks' },
  { href: '/queue', label: 'Queue', hint: 'Execution Timeline' },
  { href: '/logs', label: 'Logs', hint: 'Audit Trail' },
  { href: '/settings', label: 'Settings', hint: 'System & Access' }
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
              ? 'border-cyan-300 bg-cyan-50 shadow-sm'
              : 'border-slate-200 bg-white/80 hover:border-slate-300 hover:bg-white'
          }`}
        >
          <p className="text-sm font-semibold text-slate-900">{link.label}</p>
          <p className="text-xs text-slate-500">{link.hint}</p>
        </Link>
      ))}
    </nav>
  );
}
