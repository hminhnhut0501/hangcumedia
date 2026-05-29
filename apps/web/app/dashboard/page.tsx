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
      { label: 'Registered Groups', value: counts.groups, tone: 'text-cyan-700' },
      { label: 'Mapped Topics', value: counts.topics, tone: 'text-teal-700' },
      { label: 'Active Campaigns', value: counts.campaigns, tone: 'text-slate-800' },
      { label: 'Pending Queue', value: counts.pending, tone: 'text-amber-700' },
      { label: 'Failed Queue', value: counts.failed, tone: 'text-rose-700' }
    ],
    [counts]
  );

  return (
    <AppShell
      title="Operations Dashboard"
      subtitle="High-level control room for ingestion, campaign planning and queue execution."
      actions={<Link className="btn" href="/campaigns/new">New Campaign</Link>}
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <article key={card.label} className="card">
            <p className="text-xs uppercase tracking-[0.15em] text-slate-500">{card.label}</p>
            <p className={`mt-2 text-3xl font-semibold ${card.tone}`}>{card.value}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="card">
          <h3 className="text-lg font-semibold text-slate-900">Recommended Flow</h3>
          <ol className="mt-3 space-y-2 text-sm text-slate-600">
            <li>1. Connect and register backup/main groups.</li>
            <li>2. Sync or create topics for target forums.</li>
            <li>3. Ingest source content into inbox, then select campaign sources.</li>
            <li>4. Generate queue and monitor pending/failed states.</li>
          </ol>
        </article>

        <article className="card">
          <h3 className="text-lg font-semibold text-slate-900">Quick Actions</h3>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <Link className="btn-secondary" href="/groups">Manage Groups</Link>
            <Link className="btn-secondary" href="/topics">Map Topics</Link>
            <Link className="btn-secondary" href="/inbox">Review Inbox</Link>
            <Link className="btn-secondary" href="/queue">Open Queue Center</Link>
          </div>
        </article>
      </section>
    </AppShell>
  );
}
