'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [globalRunTimes, setGlobalRunTimes] = useState('09:00,15:00,21:00');
  const [maxLateSeconds, setMaxLateSeconds] = useState('900');
  const [reconcileMinutes, setReconcileMinutes] = useState('60');

  async function load() {
    const { data } = await supabase
      .from('app_settings')
      .select('key,value')
      .in('key', ['global_run_times', 'max_late_seconds', 'reconcile_interval_minutes']);
    const map = new Map<string, any>();
    for (const row of data || []) map.set(String(row.key), row.value);
    const grt = map.get('global_run_times');
    if (Array.isArray(grt) && grt.length > 0) setGlobalRunTimes(grt.join(','));
    const mls = map.get('max_late_seconds');
    if (typeof mls === 'number') setMaxLateSeconds(String(mls));
    const rim = map.get('reconcile_interval_minutes');
    if (typeof rim === 'number') setReconcileMinutes(String(rim));
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveSettings() {
    setLoading(true);
    setNotice('');
    try {
      const times = globalRunTimes
        .split(',')
        .map((x) => x.trim())
        .filter((x) => /^\d{2}:\d{2}$/.test(x));
      if (times.length === 0) throw new Error('Khung giờ không hợp lệ. Dùng định dạng HH:mm, ví dụ 09:00,15:00,21:00');
      const late = Number(maxLateSeconds);
      const reconcile = Number(reconcileMinutes);
      if (!Number.isFinite(late) || late < 0) throw new Error('max_late_seconds phải là số >= 0');
      if (!Number.isFinite(reconcile) || reconcile <= 0) throw new Error('reconcile_interval_minutes phải là số > 0');

      const { error } = await supabase.from('app_settings').upsert([
        { key: 'global_run_times', value: times, description: 'Khung giờ toàn hệ thống theo HH:mm' },
        { key: 'max_late_seconds', value: late, description: 'Quá số giây này thì bỏ slot trễ' },
        { key: 'reconcile_interval_minutes', value: reconcile, description: 'Chu kỳ reconcile nguồn' }
      ], { onConflict: 'key' });
      if (error) throw error;
      setNotice('Đã lưu cài đặt hệ thống. Worker sẽ áp dụng tự động (max 30 giây).');
    } catch (err: any) {
      setNotice(`Lỗi lưu: ${err?.message || 'unknown'}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell
      title="Cài đặt hệ thống"
      subtitle="Quản lý khung giờ global và tham số runtime không cần redeploy."
    >
      <section className="card fade-up space-y-3">
        <h2 className="text-lg font-semibold text-slate-100">Runtime settings</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Khung giờ toàn hệ thống</label>
            <input className="input" value={globalRunTimes} onChange={(e) => setGlobalRunTimes(e.target.value)} placeholder="09:00,15:00,21:00" />
            <p className="mt-1 text-xs text-zinc-500">Tất cả campaign active dùng chung khung giờ này.</p>
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Max late seconds</label>
            <input className="input" value={maxLateSeconds} onChange={(e) => setMaxLateSeconds(e.target.value)} />
            <p className="mt-1 text-xs text-zinc-500">Lố quá số giây này thì bỏ slot, không dồn gửi.</p>
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Reconcile interval (phút)</label>
            <input className="input" value={reconcileMinutes} onChange={(e) => setReconcileMinutes(e.target.value)} />
            <p className="mt-1 text-xs text-zinc-500">Thông tin để vận hành; interval scheduler dùng env hiện tại.</p>
          </div>
        </div>
        <div className="flex justify-end">
          <button className="btn" onClick={saveSettings} disabled={loading}>
            {loading ? 'Đang lưu...' : 'Lưu cài đặt'}
          </button>
        </div>
        {notice ? <p className="notice text-sm">{notice}</p> : null}
      </section>

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
