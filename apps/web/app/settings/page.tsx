'use client';

import { AuthGuard } from '@/components/AuthGuard';
import { Nav } from '@/components/Nav';

export default function SettingsPage() {
  return (
    <AuthGuard>
      <main className="container space-y-4">
        <Nav />
        <section className="card">
          <h1 className="text-lg font-semibold">Settings</h1>
          <p className="text-sm text-stone-600">Use `.env` to set API base URLs and admin allowlist.</p>
        </section>
      </main>
    </AuthGuard>
  );
}
