'use client';

import { AppShell } from '@/components/AppShell';

export default function SettingsPage() {
  return (
    <AppShell
      title="System Settings"
      subtitle="Environment checklist and operational guardrails for secure long-term scaling."
    >
      <section className="card fade-up space-y-3">
        <h2 className="text-lg font-semibold text-slate-100">Deployment checklist</h2>
        <ul className="space-y-2 text-sm text-slate-300">
          <li>1. Keep `SUPABASE_SERVICE_ROLE_KEY` only in worker (Render).</li>
          <li>2. Use `NEXT_PUBLIC_SUPABASE_*` only in web (Vercel).</li>
          <li>3. Use server-side proxy with `WORKER_URL` + `ADMIN_API_SECRET` in web server env (không expose ra browser).</li>
          <li>4. Verify webhook and scheduler health after every release.</li>
        </ul>
      </section>
    </AppShell>
  );
}
