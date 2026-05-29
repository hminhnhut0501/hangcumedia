'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  '/dashboard',
  '/groups',
  '/topics',
  '/inbox',
  '/campaigns',
  '/queue',
  '/logs',
  '/settings'
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="mb-4 flex flex-wrap gap-2">
      {links.map((link) => (
        <Link
          key={link}
          href={link}
          className={`rounded-full px-3 py-1 text-sm ${pathname.startsWith(link) ? 'bg-ink text-white' : 'bg-white border border-stone-300'}`}
        >
          {link.replace('/', '') || 'home'}
        </Link>
      ))}
    </nav>
  );
}
