'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { supabase } from '@/lib/supabase';
import { workerPost } from '@/lib/worker';

type Step = 1 | 2 | 3 | 4;

export default function SetupPage() {
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [groups, setGroups] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);

  const [sourceMode, setSourceMode] = useState<'auto' | 'scan'>('auto');
  const [sourceGroupId, setSourceGroupId] = useState('');
  const [scan, setScan] = useState({ chat_id: '', from_message_id: '', to_message_id: '' });
  const [scanResult, setScanResult] = useState<any>(null);

  const [targetGroupId, setTargetGroupId] = useState('');
  const [targetTopicId, setTargetTopicId] = useState('');
  const [newTopicName, setNewTopicName] = useState('');

  const [rule, setRule] = useState({
    name: 'Chiến dịch mới',
    copy_mode: 'copy',
    media_group_mode: 'keep',
    caption_mode: 'original',
    custom_caption: '',
    batch_size: 1,
    run_times: '09:00,15:00,21:00',
    timezone: 'Asia/Ho_Chi_Minh'
  });

  const summary = useMemo(() => ({
    sourceMode,
    sourceGroupId,
    targetGroupId,
    targetTopicId: targetTopicId || 'general',
    runTimes: rule.run_times,
    batch: rule.batch_size
  }), [sourceMode, sourceGroupId, targetGroupId, targetTopicId, rule]);

  async function load() {
    const [g, t] = await Promise.all([
      supabase.from('telegram_groups').select('*').order('title'),
      supabase.from('topics').select('*').order('name')
    ]);
    const gs = g.data || [];
    setGroups(gs);
    setTopics(t.data || []);

    const backup = gs.find((x: any) => x.type === 'backup');
    const main = gs.find((x: any) => x.type === 'main');
    if (!sourceGroupId && backup) setSourceGroupId(backup.id);
    if (!targetGroupId && main) setTargetGroupId(main.id);
  }

  useEffect(() => { load(); }, []);

  const sourceGroup = groups.find((g) => g.id === sourceGroupId);

  async function doScanRange() {
    setLoading(true);
    setNotice('');
    try {
      const result = await workerPost('/api/import/range', {
        chat_id: Number(scan.chat_id),
        from_message_id: Number(scan.from_message_id),
        to_message_id: Number(scan.to_message_id)
      });
      setScanResult(result);
      setNotice('Scan hoàn tất.');
    } catch (err: any) {
      setNotice(`Lỗi scan: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function createTopicNow() {
    if (!targetGroupId || !newTopicName) return;
    setLoading(true);
    setNotice('');
    try {
      const result = await workerPost('/api/topics/create', { groupId: targetGroupId, name: newTopicName });
      setTargetTopicId(result.topic.id);
      setNewTopicName('');
      await load();
      setNotice('Đã tạo topic mới và chọn làm đích.');
    } catch (err: any) {
      setNotice(`Lỗi tạo topic: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function saveAndStart() {
    setLoading(true);
    setNotice('');
    try {
      const payload: any = {
        name: rule.name,
        source_group_id: sourceGroupId || null,
        target_group_id: targetGroupId,
        target_topic_id: targetTopicId || null,
        copy_mode: rule.copy_mode,
        media_group_mode: rule.media_group_mode,
        caption_mode: rule.caption_mode,
        custom_caption: rule.caption_mode === 'custom' ? (rule.custom_caption || null) : null,
        batch_size: Number(rule.batch_size),
        runs_per_day: String(rule.run_times).split(',').filter(Boolean).length || 1,
        run_times: String(rule.run_times).split(',').map((s) => s.trim()).filter(Boolean),
        timezone: rule.timezone,
        random_delay_seconds: 0,
        status: 'active'
      };

      const { data: campaign, error } = await supabase.from('campaigns').insert(payload).select('*').single();
      if (error || !campaign) throw new Error(error?.message || 'Không tạo được campaign');

      if (sourceGroup?.chat_id) {
        const { data: sources } = await supabase
          .from('source_messages')
          .select('id,status')
          .eq('source_chat_id', sourceGroup.chat_id)
          .neq('status', 'link_only')
          .order('created_at', { ascending: false })
          .limit(300);

        const rows = (sources || []).map((s: any, idx: number) => ({
          campaign_id: campaign.id,
          source_message_id: s.id,
          sort_order: idx
        }));

        if (rows.length > 0) {
          await supabase.from('campaign_sources').insert(rows);
        }
      }

      const generate = await workerPost('/api/queue/generate', { campaignId: campaign.id });
      setNotice(`Hoàn tất. Campaign đã tạo và queue đã generate (created=${generate?.summary?.items_created ?? 0}).`);
      setStep(4);
    } catch (err: any) {
      setNotice(`Lỗi khởi tạo flow: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell title="Setup nhanh" subtitle="Flow mới: Nguồn -> Đích -> Luật gửi -> Bật chạy">
      <section className="card fade-up">
        <div className="flex flex-wrap gap-2 text-sm">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              className={`btn-secondary ${step === n ? 'bg-white/20' : ''}`}
              onClick={() => setStep(n as Step)}
            >
              Bước {n}
            </button>
          ))}
        </div>
      </section>

      {step === 1 ? (
        <section className="card fade-up space-y-3">
          <h3 className="section-title text-lg font-semibold">Bước 1 - Nguồn</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-zinc-300">Chế độ nạp nguồn</label>
              <select className="input" value={sourceMode} onChange={(e) => setSourceMode(e.target.value as any)}>
                <option value="auto">Tự động (bot nhận bài mới)</option>
                <option value="scan">Scan thủ công theo range</option>
              </select>
              <p className="mt-1 text-xs text-zinc-500">Khuyến nghị: thêm bot vào group backup và để chế độ tự động.</p>
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Nhóm nguồn (backup)</label>
              <select className="input" value={sourceGroupId} onChange={(e) => setSourceGroupId(e.target.value)}>
                <option value="">Chọn nhóm nguồn</option>
                {groups.filter((g) => g.type === 'backup').map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
            </div>
          </div>

          {sourceMode === 'scan' ? (
            <div className="grid gap-3 md:grid-cols-4">
              <input className="input" placeholder="chat_id" value={scan.chat_id} onChange={(e) => setScan({ ...scan, chat_id: e.target.value })} />
              <input className="input" placeholder="from_message_id" value={scan.from_message_id} onChange={(e) => setScan({ ...scan, from_message_id: e.target.value })} />
              <input className="input" placeholder="to_message_id" value={scan.to_message_id} onChange={(e) => setScan({ ...scan, to_message_id: e.target.value })} />
              <button className="btn" onClick={doScanRange} disabled={loading}>{loading ? 'Đang scan...' : 'Scan range'}</button>
            </div>
          ) : null}

          {scanResult ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
              <p>Tổng ID: {scanResult.range?.total}</p>
              <p>Đã có metadata: {scanResult.summary?.existed_ready}</p>
              <p>Tạo mới link_only: {scanResult.summary?.created_link_only}</p>
            </div>
          ) : null}

          <div className="flex justify-end"><button className="btn" onClick={() => setStep(2)}>Tiếp tục</button></div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="card fade-up space-y-3">
          <h3 className="section-title text-lg font-semibold">Bước 2 - Đích</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-zinc-300">Nhóm đích</label>
              <select className="input" value={targetGroupId} onChange={(e) => setTargetGroupId(e.target.value)}>
                <option value="">Chọn nhóm đích</option>
                {groups.filter((g) => g.type === 'main').map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Topic đích</label>
              <select className="input" value={targetTopicId} onChange={(e) => setTargetTopicId(e.target.value)}>
                <option value="">General chat (không topic)</option>
                {topics.filter((t) => t.group_id === targetGroupId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <input className="input" placeholder="Tên topic mới (nếu cần tạo ngay)" value={newTopicName} onChange={(e) => setNewTopicName(e.target.value)} />
            <button className="btn-secondary" onClick={createTopicNow} disabled={loading}>Tạo topic</button>
          </div>

          <div className="flex justify-between">
            <button className="btn-secondary" onClick={() => setStep(1)}>Quay lại</button>
            <button className="btn" onClick={() => setStep(3)}>Tiếp tục</button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="card fade-up space-y-3">
          <h3 className="section-title text-lg font-semibold">Bước 3 - Luật gửi</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <input className="input" placeholder="Tên chiến dịch" value={rule.name} onChange={(e) => setRule({ ...rule, name: e.target.value })} />
            <input className="input" placeholder="Khung giờ, ví dụ 09:00,15:00,21:00" value={rule.run_times} onChange={(e) => setRule({ ...rule, run_times: e.target.value })} />
            <select className="input" value={rule.copy_mode} onChange={(e) => setRule({ ...rule, copy_mode: e.target.value })}><option value="copy">copy</option><option value="forward">forward</option></select>
            <select className="input" value={rule.media_group_mode} onChange={(e) => setRule({ ...rule, media_group_mode: e.target.value })}><option value="keep">keep album</option><option value="split">split</option></select>
            <input className="input" type="number" min={1} value={rule.batch_size} onChange={(e) => setRule({ ...rule, batch_size: Number(e.target.value) })} />
            <input className="input" placeholder="Timezone" value={rule.timezone} onChange={(e) => setRule({ ...rule, timezone: e.target.value })} />
            <select className="input" value={rule.caption_mode} onChange={(e) => setRule({ ...rule, caption_mode: e.target.value })}><option value="original">Giữ caption gốc</option><option value="custom">Caption mới</option></select>
            {rule.caption_mode === 'custom' ? <input className="input" placeholder="Caption mới" value={rule.custom_caption} onChange={(e) => setRule({ ...rule, custom_caption: e.target.value })} /> : <div />}
          </div>

          <div className="flex justify-between">
            <button className="btn-secondary" onClick={() => setStep(2)}>Quay lại</button>
            <button className="btn" onClick={() => setStep(4)}>Xác nhận</button>
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <section className="card fade-up space-y-3">
          <h3 className="section-title text-lg font-semibold">Bước 4 - Xác nhận & chạy</h3>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm space-y-1">
            <p><b>Nguồn mode:</b> {summary.sourceMode}</p>
            <p><b>Nguồn group:</b> {summary.sourceGroupId || '-'}</p>
            <p><b>Đích group:</b> {summary.targetGroupId || '-'}</p>
            <p><b>Topic:</b> {summary.targetTopicId}</p>
            <p><b>Khung giờ:</b> {summary.runTimes}</p>
            <p><b>Batch:</b> {summary.batch}</p>
          </div>

          <div className="flex justify-between">
            <button className="btn-secondary" onClick={() => setStep(3)}>Quay lại</button>
            <button className="btn" onClick={saveAndStart} disabled={loading}>{loading ? 'Đang khởi tạo...' : 'Lưu & Bắt đầu'}</button>
          </div>
        </section>
      ) : null}

      {notice ? <section className="card"><p className="text-sm text-zinc-300">{notice}</p></section> : null}
    </AppShell>
  );
}
