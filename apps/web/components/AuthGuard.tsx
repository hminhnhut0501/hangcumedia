'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

let cachedAuthOk = false;
let cachedAuthChecked = false;

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState(cachedAuthOk);
  const [checking, setChecking] = useState(!cachedAuthChecked);

  useEffect(() => {
    if (cachedAuthChecked && cachedAuthOk) return;

    supabase.auth.getSession().then(({ data }) => {
      const email = data.session?.user?.email?.toLowerCase() || '';
      const allow = (process.env.NEXT_PUBLIC_ADMIN_EMAIL_ALLOWLIST || '')
        .split(',')
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);

      const passed = !!data.session?.user && (allow.length === 0 || allow.includes(email));
      cachedAuthChecked = true;
      cachedAuthOk = passed;
      setOk(passed);
      setChecking(false);

      if (!passed) router.replace('/login');
    });
  }, [router]);

  if (checking) return <div className="min-h-[20vh]" />;
  if (!ok) return null;
  return <>{children}</>;
}
