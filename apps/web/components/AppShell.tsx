'use client';

import type { ReactNode } from 'react';
import { AuthGuard } from '@/components/AuthGuard';
import { Nav } from '@/components/Nav';

export function AppShell({ title, subtitle, actions, children }: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="app-bg min-h-screen">
        <div className="mx-auto grid min-h-screen max-w-[1400px] grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[260px_1fr]">
          <aside className="panel hidden min-h-[calc(100vh-2rem)] p-4 lg:block">
            <div className="mb-4 rounded-xl bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Executive Ops</p>
              <h2 className="mt-2 section-title text-lg font-bold text-zinc-100">Telegram Studio</h2>
              <p className="mt-1 text-xs text-zinc-500">UI v3 Hybrid</p>
            </div>
            <Nav />
          </aside>

          <div className="flex min-w-0 flex-col gap-4">
            <header className="panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Vận hành</p>
                  <h1 className="section-title text-2xl font-bold text-zinc-100">{title}</h1>
                  {subtitle ? <p className="mt-1 text-sm text-zinc-400">{subtitle}</p> : null}
                </div>
                <div className="flex items-center gap-2">{actions}</div>
              </div>

              <div className="mt-4 lg:hidden">
                <Nav />
              </div>
            </header>

            <main className="space-y-4">{children}</main>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
