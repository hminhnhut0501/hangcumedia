'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return setError(error.message);
    router.push('/dashboard');
  }

  return (
    <main className="app-bg flex min-h-screen items-center justify-center p-6">
      <section className="panel-glass w-full max-w-md p-6 fade-up">
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Executive Ops Studio</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-100">Chào mừng quay lại</h1>
        <p className="mt-1 text-sm text-slate-400">Đăng nhập để quản lý toàn bộ vận hành nội dung Telegram.</p>

        <form onSubmit={login} className="mt-5 space-y-3">
          <input className="input" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="input" type="password" placeholder="Mật khẩu" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn w-full" type="submit">Đăng nhập hệ thống</button>
          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        </form>
      </section>
    </main>
  );
}
