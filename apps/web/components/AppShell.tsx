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
          <aside className="panel-glass hidden min-h-[calc(100vh-2rem)] p-4 lg:block">
            <div className="mb-4 rounded-2xl bg-white/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Executive Ops Studio</p>
              <h2 className="mt-2 text-lg font-semibold text-slate-900">Telegram Admin Console</h2>
              <p className="mt-1 text-xs text-slate-500">Enterprise control with media-ops velocity</p>
            </div>
            <Nav />
          </aside>

          <div className="flex min-w-0 flex-col gap-4">
            <header className="panel-glass p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Operations</p>
                  <h1 className="text-2xl font-semibold text-slate-950">{title}</h1>
                  {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
                </div>
                <div className="flex items-center gap-2">{actions}</div>
              </div>
            </header>

            <main className="space-y-4">{children}</main>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
