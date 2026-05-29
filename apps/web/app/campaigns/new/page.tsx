'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

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
    runs_per_day: 1,
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
      setGroups(g.data || []);
      setTopics(t.data || []);
      if (g.data?.[0]) setForm((f: any) => ({ ...f, target_group_id: g.data[0].id }));
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setNotice('');
    const payload = {
      ...form,
      source_group_id: form.source_group_id || null,
      target_topic_id: form.target_topic_id || null,
      custom_caption: form.caption_mode === 'custom' ? (form.custom_caption || null) : null,
      run_times: form.run_times.split(',').map((s: string) => s.trim()).filter(Boolean),
      batch_size: Number(form.batch_size),
      runs_per_day: Number(form.runs_per_day),
      random_delay_seconds: Number(form.random_delay_seconds)
    };

    // Backward-compatible insert: if DB has not run newer migration yet, retry without caption fields.
    const first = await supabase.from('campaigns').insert(payload).select('*').single();
    if (first.error) {
      const msg = first.error.message || '';
      const missingCaptionCols = msg.includes('caption_mode') || msg.includes('custom_caption');
      if (missingCaptionCols) {
        const legacyPayload = { ...payload };
        delete legacyPayload.caption_mode;
        delete legacyPayload.custom_caption;
        const second = await supabase.from('campaigns').insert(legacyPayload).select('*').single();
        setSubmitting(false);
        if (second.error || !second.data) {
          setNotice(`Lỗi tạo chiến dịch: ${second.error?.message || 'Không rõ nguyên nhân'}`);
          return;
        }
        setNotice('Đã tạo chiến dịch. Lưu ý: DB chưa có cột caption_mode/custom_caption, hãy chạy migration mới.');
        router.push(`/campaigns/${second.data.id}`);
        return;
      }
      setSubmitting(false);
      setNotice(`Lỗi tạo chiến dịch: ${msg}`);
      return;
    }

    setSubmitting(false);
    router.push(`/campaigns/${first.data.id}`);
  }

  return (
    <AppShell
      title="Tạo chiến dịch mới"
      subtitle="Mỗi trường đều có mô tả ngắn để bạn cấu hình đúng ngay từ lần đầu."
    >
      <form className="card fade-up space-y-4" onSubmit={submit}>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Tên chiến dịch</label>
            <input className="input" placeholder="Ví dụ: Đẩy video tối" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <p className="mt-1 text-xs text-zinc-500">Tên để nhận diện chiến dịch trong queue/logs.</p>
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Nhóm nguồn (tuỳ chọn)</label>
            <select className="input" value={form.source_group_id} onChange={(e) => setForm({ ...form, source_group_id: e.target.value })}>
              <option value="">Không giới hạn nhóm nguồn</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
            <p className="mt-1 text-xs text-zinc-500">Nếu chọn, chỉ dùng nội dung từ nhóm nguồn này.</p>
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Nhóm đích</label>
            <select className="input" value={form.target_group_id} onChange={(e) => setForm({ ...form, target_group_id: e.target.value })}>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
            <p className="mt-1 text-xs text-zinc-500">Nơi hệ thống sẽ gửi bài theo lịch.</p>
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Topic đích</label>
            <select className="input" value={form.target_topic_id} onChange={(e) => setForm({ ...form, target_topic_id: e.target.value })}>
              <option value="">General chat (không topic)</option>
              {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <p className="mt-1 text-xs text-zinc-500">Chọn topic nếu nhóm đích là forum.</p>
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Chế độ gửi</label>
            <select className="input" value={form.copy_mode} onChange={(e) => setForm({ ...form, copy_mode: e.target.value })}>
              <option value="copy">copy (ẩn nguồn)</option>
              <option value="forward">forward (giữ nguồn)</option>
            </select>
            <p className="mt-1 text-xs text-zinc-500">`copy` thường dùng để ẩn nguồn bài gốc.</p>
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Tùy chọn caption</label>
            <select className="input" value={form.caption_mode} onChange={(e) => setForm({ ...form, caption_mode: e.target.value })}>
              <option value="original">Giữ caption gốc</option>
              <option value="custom">Dùng caption mới (chỉ áp dụng khi copy)</option>
            </select>
            <p className="mt-1 text-xs text-zinc-500">Forward của Telegram luôn giữ caption gốc, không sửa được caption.</p>
          </div>

          {form.caption_mode === 'custom' ? (
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm text-zinc-300">Caption mới</label>
              <textarea
                className="input min-h-24"
                placeholder="Nhập caption mới cho mọi bài gửi bởi campaign này..."
                value={form.custom_caption}
                onChange={(e) => setForm({ ...form, custom_caption: e.target.value })}
              />
              <p className="mt-1 text-xs text-zinc-500">Sẽ ghi đè caption khi gửi bằng copy.</p>
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Chế độ album</label>
            <select className="input" value={form.media_group_mode} onChange={(e) => setForm({ ...form, media_group_mode: e.target.value })}>
              <option value="keep">keep (giữ nhóm album)</option>
              <option value="split">split (tách từng message)</option>
            </select>
            <p className="mt-1 text-xs text-zinc-500">`keep` phù hợp khi muốn giữ thứ tự album/video.</p>
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Batch size</label>
            <input className="input" type="number" min={1} value={form.batch_size} onChange={(e) => setForm({ ...form, batch_size: e.target.value })} />
            <p className="mt-1 text-xs text-zinc-500">Mỗi lần chạy gửi bao nhiêu đơn vị nội dung.</p>
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Runs per day</label>
            <input className="input" type="number" min={1} value={form.runs_per_day} onChange={(e) => setForm({ ...form, runs_per_day: e.target.value })} />
            <p className="mt-1 text-xs text-zinc-500">Số lần gửi dự kiến trong một ngày.</p>
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Khung giờ chạy</label>
            <input className="input" value={form.run_times} onChange={(e) => setForm({ ...form, run_times: e.target.value })} placeholder="09:00,15:00,21:00" />
            <p className="mt-1 text-xs text-zinc-500">Nhập danh sách giờ theo định dạng `HH:mm`, ngăn cách bằng dấu phẩy.</p>
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Múi giờ</label>
            <input className="input" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} placeholder="Asia/Ho_Chi_Minh" />
            <p className="mt-1 text-xs text-zinc-500">Múi giờ dùng để tính `run_times`.</p>
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Random delay (giây)</label>
            <input className="input" type="number" min={0} value={form.random_delay_seconds} onChange={(e) => setForm({ ...form, random_delay_seconds: e.target.value })} />
            <p className="mt-1 text-xs text-zinc-500">Độ trễ ngẫu nhiên thêm vào lúc gửi (0 = không trễ).</p>
          </div>
        </div>

        <div className="flex justify-end">
          <button className="btn" disabled={submitting}>{submitting ? 'Đang tạo...' : 'Tạo chiến dịch'}</button>
        </div>
        {notice ? <p className="text-sm text-zinc-300">{notice}</p> : null}
      </form>
    </AppShell>
  );
}
