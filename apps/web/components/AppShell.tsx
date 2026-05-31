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
        <div className="mx-auto grid min-h-screen max-w-[1560px] grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[280px_1fr]">
          <aside className="panel hidden min-h-[calc(100vh-2rem)] p-4 lg:flex lg:flex-col">
            <div className="mb-4 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-600 to-cyan-400 text-sm font-black text-white shadow-lg shadow-sky-900/40">TS</div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.28em] text-sky-300/80">Telegram Ops</p>
                  <h2 className="section-title text-xl text-slate-50">Tele Scheduler OS</h2>
                </div>
              </div>
            </div>
            <Nav />
            <div className="mt-auto rounded-xl border border-slate-700/60 bg-slate-900/50 p-3 text-xs text-slate-400">
              Focus mode: Campaign routing by <span className="font-semibold text-sky-300">target group/topic</span>
            </div>
          </aside>

          <div className="flex min-w-0 flex-col gap-4">
            <header className="panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Control Center</p>
                  <h1 className="section-title text-2xl text-slate-50">{title}</h1>
                  {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
                </div>
                <div className="flex items-center gap-2">{actions}</div>
              </div>

              <div className="mt-4 lg:hidden">
                <Nav />
              </div>
            </header>

            <main className="space-y-4 pb-6">{children}</main>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
