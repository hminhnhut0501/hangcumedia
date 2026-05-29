'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

export default function LogsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [status, setStatus] = useState('all');

  async function load() {
    const { data } = await supabase.from('send_logs').select('*,campaigns(name)').order('created_at', { ascending: false }).limit(400);
    setRows(data || []);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => rows.filter((r) => status === 'all' ? true : r.status === status), [rows, status]);

  return (
    <AppShell
      title="Delivery Logs"
      subtitle="Observe delivery outcomes, inspect errors, and validate execution history across campaigns."
      actions={<button className="btn-secondary" onClick={load}>Refresh</button>}
    >
      <section className="card fade-up grid gap-3 md:grid-cols-3">
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All status</option>
          <option value="sent">sent</option>
          <option value="failed">failed</option>
        </select>
      </section>

      <section className="card fade-up overflow-auto">
        <table className="table min-w-[900px]">
          <thead><tr><th>Time</th><th>Campaign</th><th>Action</th><th>Status</th><th>Error</th></tr></thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.created_at).toLocaleString()}</td>
                <td>{r.campaigns?.name || '-'}</td>
                <td>{r.action}</td>
                <td>{r.status}</td>
                <td className="max-w-[420px] truncate">{r.error_message || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
