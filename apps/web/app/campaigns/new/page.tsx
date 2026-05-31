'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { supabase } from '@/lib/supabase';
import { appToast } from '@/lib/toast';

export default function CampaignNewPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const router = useRouter();
  const [form, setForm] = useState<any>({
    name: '',
    source_group_id: '',
    target_group_id: '',
    target_topic_id: '',
    copy_mode: 'copy',
    caption_mode: 'original',
    custom_caption: '',
    media_group_mode: 'keep',
    batch_size: 1,
    run_times: '09:00,15:00,21:00',
    timezone: 'Asia/Ho_Chi_Minh',
    random_delay_seconds: 0,
    status: 'active'
  });
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    Promise.all([
      supabase.from('telegram_groups').select('*').order('title'),
      supabase.from('topics').select('*').order('name')
    ]).then(([g, t]) => {
      const gs = g.data || [];
      setGroups(gs);
      setTopics(t.data || []);
      const main = gs.find((x: any) => x.type === 'main') || gs[0];
      if (main) setForm((f: any) => ({ ...f, target_group_id: main.id }));
    });
  }, []);

  const targetTopics = useMemo(
    () => topics.filter((t: any) => t.group_id === form.target_group_id),
    [topics, form.target_group_id]
  );

  const runTimes = useMemo(
    () => String(form.run_times).split(',').map((s: string) => s.trim()).filter(Boolean),
    [form.run_times]
  );

  const validationError = useMemo(() => {
    if (!form.name.trim()) return 'Tên campaign là bắt buộc.';
    if (!form.target_group_id) return 'Chọn nhóm đích.';
    if (!runTimes.length || runTimes.some((x: string) => !/^\d{2}:\d{2}$/.test(x))) return 'Khung giờ không hợp lệ. Dùng HH:mm, ví dụ 09:00,15:00.';
    if (Number(form.batch_size) < 1) return 'Batch size phải >= 1.';
    if (form.caption_mode === 'custom' && !form.custom_caption.trim()) return 'Bạn chọn custom caption nhưng chưa nhập nội dung caption.';
    return '';
  }, [form, runTimes]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (validationError) {
      appToast(validationError, 'error');
      return;
    }
    setSubmitting(true);
    setNotice('');
    const payload = {
      ...form,
      source_group_id: form.source_group_id || null,
      target_topic_id: form.target_topic_id || null,
      custom_caption: form.caption_mode === 'custom' ? (form.custom_caption || null) : null,
      run_times: runTimes,
      batch_size: Number(form.batch_size),
      runs_per_day: runTimes.length || 1,
      random_delay_seconds: Number(form.random_delay_seconds)
    };

    const first = await supabase.from('campaigns').insert(payload).select('*').single();
    if (first.error) {
      const msg = first.error.message || '';
      const missingCaptionCols = msg.includes('caption_mode') || msg.includes('custom_caption');
      if (missingCaptionCols) {
        const legacyPayload: any = { ...payload };
        delete legacyPayload.caption_mode;
        delete legacyPayload.custom_caption;
        const second = await supabase.from('campaigns').insert(legacyPayload).select('*').single();
        setSubmitting(false);
        if (second.error || !second.data) {
          setNotice(`Lỗi tạo chiến dịch: ${second.error?.message || 'Không rõ nguyên nhân'}`);
          appToast('Tạo campaign thất bại', 'error');
          return;
        }
        appToast('Đã tạo campaign (legacy mode)', 'success');
        router.push(`/campaigns/${second.data.id}`);
        return;
      }
      setSubmitting(false);
      setNotice(`Lỗi tạo chiến dịch: ${msg}`);
      appToast('Tạo campaign thất bại', 'error');
      return;
    }

    setSubmitting(false);
    appToast('Đã tạo campaign thành công', 'success');
    router.push(`/campaigns/${first.data.id}`);
  }

  return (
    <AppShell
      title="Campaign Builder"
      subtitle="Thiết kế campaign theo target group/topic trước, sau đó mới tinh chỉnh delivery rules."
    >
      <form className="grid gap-4 xl:grid-cols-[1.5fr_1fr]" onSubmit={submit}>
        <section className="card space-y-4">
          <h2 className="section-title text-xl text-slate-50">1) Routing đích</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Tên campaign</label>
              <input className="input" placeholder="Ví dụ: Auto phân phối video tối" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Nhóm nguồn (optional)</label>
              <select className="input" value={form.source_group_id} onChange={(e) => setForm({ ...form, source_group_id: e.target.value })}>
                <option value="">Không khóa nhóm nguồn</option>
                {groups.filter((g: any) => g.type === 'backup').map((g: any) => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Target group</label>
              <select className="input" value={form.target_group_id} onChange={(e) => setForm({ ...form, target_group_id: e.target.value, target_topic_id: '' })}>
                <option value="">Chọn nhóm đích</option>
                {groups.filter((g: any) => g.type === 'main').map((g: any) => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Target topic</label>
              <select className="input" value={form.target_topic_id} onChange={(e) => setForm({ ...form, target_topic_id: e.target.value })}>
                <option value="">General chat (không topic)</option>
                {targetTopics.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>

          <h2 className="section-title pt-2 text-xl text-slate-50">2) Delivery rules</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Send mode</label>
              <select className="input" value={form.copy_mode} onChange={(e) => setForm({ ...form, copy_mode: e.target.value })}>
                <option value="copy">copy (ẩn nguồn)</option>
                <option value="forward">forward (giữ nguồn)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Album mode</label>
              <select className="input" value={form.media_group_mode} onChange={(e) => setForm({ ...form, media_group_mode: e.target.value })}>
                <option value="keep">keep (giữ cụm album)</option>
                <option value="split">split (tách lẻ)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Caption mode</label>
              <select className="input" value={form.caption_mode} onChange={(e) => setForm({ ...form, caption_mode: e.target.value })}>
                <option value="original">Giữ caption gốc</option>
                <option value="custom">Custom caption (copy only)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Batch size</label>
              <input className="input" type="number" min={1} value={form.batch_size} onChange={(e) => setForm({ ...form, batch_size: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Khung giờ chạy (HH:mm)</label>
              <input className="input" value={form.run_times} onChange={(e) => setForm({ ...form, run_times: e.target.value })} placeholder="09:00,15:00,21:00" />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Timezone</label>
              <input className="input" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Random delay (s)</label>
              <input className="input" type="number" min={0} value={form.random_delay_seconds} onChange={(e) => setForm({ ...form, random_delay_seconds: e.target.value })} />
            </div>
            {form.caption_mode === 'custom' ? (
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Custom caption</label>
                <textarea className="input min-h-24" value={form.custom_caption} onChange={(e) => setForm({ ...form, custom_caption: e.target.value })} />
              </div>
            ) : null}
          </div>

          {validationError ? <p className="field-error">{validationError}</p> : null}
          {notice ? <p className="notice text-sm">{notice}</p> : null}

          <div className="flex justify-end">
            <button className="btn" disabled={submitting || !!validationError}>{submitting ? 'Đang tạo...' : 'Tạo campaign'}</button>
          </div>
        </section>

        <section className="card space-y-4">
          <h2 className="section-title text-xl text-slate-50">Routing Preview</h2>
          <div className="rounded-xl border border-slate-700/60 bg-slate-950/50 p-4 text-sm">
            <p><span className="text-slate-500">Target group:</span> <span className="font-semibold text-slate-100">{groups.find((g: any) => g.id === form.target_group_id)?.title || '-'}</span></p>
            <p className="mt-1"><span className="text-slate-500">Target topic:</span> <span className="font-semibold text-slate-100">{targetTopics.find((t: any) => t.id === form.target_topic_id)?.name || 'General chat'}</span></p>
            <p className="mt-1"><span className="text-slate-500">Runs per day:</span> <span className="font-semibold text-slate-100">{runTimes.length || 1}</span></p>
            <p className="mt-1"><span className="text-slate-500">Mode:</span> <span className="font-semibold text-slate-100">{form.copy_mode}/{form.media_group_mode}</span></p>
          </div>
          <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-3 text-xs text-sky-100">
            Mẹo: nếu campaign cần phân phối riêng cho từng topic, tạo mỗi topic một campaign riêng để dễ preflight và dễ debug logs.
          </div>
        </section>
      </form>
    </AppShell>
  );
}
