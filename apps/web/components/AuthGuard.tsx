'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email?.toLowerCase() || '';
      const allow = (process.env.NEXT_PUBLIC_ADMIN_EMAIL_ALLOWLIST || '')
        .split(',')
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);

      if (!data.user || (allow.length > 0 && !allow.includes(email))) {
        router.replace('/login');
      } else {
        setOk(true);
      }
    });
  }, [router]);

  if (!ok) return <div className="container">Checking authentication...</div>;
  return <>{children}</>;
}
