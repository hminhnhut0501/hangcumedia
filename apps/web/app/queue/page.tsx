'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { supabase } from '@/lib/supabase';
import { workerPost } from '@/lib/worker';

export default function QueuePage() {
  const [rows, setRows] = useState<any[]>([]);

  async function load() {
    const { data } = await supabase
      .from('queue_items')
      .select('*,campaigns(name)')
      .order('created_at', { ascending: false })
      .limit(300);
    setRows(data || []);
  }

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.total += 1;
        acc[row.status] = (acc[row.status] || 0) + 1;
        return acc;
      },
      { total: 0, pending: 0, processing: 0, sent: 0, failed: 0, skipped: 0 } as Record<string, number>
    );
  }, [rows]);

  return (
    <AppShell
      title="Queue Command Center"
      subtitle="Track due items, recover failed deliveries and keep campaign execution stable."
      actions={<button className="btn-secondary" onClick={load}>Refresh</button>}
    >
      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Object.entries(stats).map(([k, v]) => (
          <article key={k} className="card p-4">
            <p className="text-xs uppercase tracking-[0.15em] text-slate-500">{k}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{Number(v)}</p>
          </article>
        ))}
      </section>

      <section className="card overflow-auto">
        <table className="table min-w-[980px]">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Scheduled</th>
              <th>Status</th>
              <th>Retry</th>
              <th>Error</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.campaigns?.name}</td>
                <td>{new Date(row.scheduled_at).toLocaleString()}</td>
                <td>{row.status}</td>
                <td>{row.retry_count}</td>
                <td className="max-w-[360px] truncate">{row.error_message || '-'}</td>
                <td>
                  <button
                    className="btn-secondary"
                    onClick={async () => {
                      await workerPost(`/api/queue/${row.id}/retry`, {});
                      load();
                    }}
                  >
                    Retry
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
