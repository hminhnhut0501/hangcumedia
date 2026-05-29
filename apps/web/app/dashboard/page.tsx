'use client';

import { AuthGuard } from '@/components/AuthGuard';
import { Nav } from '@/components/Nav';

export default function Dashboard() {
  return (
    <AuthGuard>
      <main className="container">
        <Nav />
        <section className="card">
          <h1 className="text-xl font-semibold">Telegram Content Scheduler</h1>
          <p className="mt-2 text-sm text-stone-600">
            MVP admin panel for groups, topics, inbox import, campaign, queue and logs.
          </p>
        </section>
      </main>
    </AuthGuard>
  );
}
