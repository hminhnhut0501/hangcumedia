'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { supabase } from '@/lib/supabase';
import { workerPost } from '@/lib/worker';
import { appToast } from '@/lib/toast';

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
  const [preflightResult, setPreflightResult] = useState<any>(null);

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

  const scanError = useMemo(() => {
    if (sourceMode !== 'scan') return '';
    const from = Number(scan.from_message_id);
    const to = Number(scan.to_message_id);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return 'Cần nhập đủ From/To message ID.';
    if (Math.abs(to - from) + 1 > 500) return 'Mỗi lần scan tối đa 500 ID.';
    return '';
  }, [sourceMode, scan.from_message_id, scan.to_message_id]);

  const ruleError = useMemo(() => {
    if (!rule.name.trim()) return 'Tên chiến dịch không được để trống.';
    const times = String(rule.run_times).split(',').map((x) => x.trim()).filter(Boolean);
    if (!times.length || times.some((x) => !/^\d{2}:\d{2}$/.test(x))) return 'Khung giờ phải theo định dạng HH:mm, ví dụ 09:00,15:00.';
    if (Number(rule.batch_size) < 1) return 'Batch size phải >= 1.';
    if (rule.caption_mode === 'custom' && !rule.custom_caption.trim()) return 'Caption mới không được để trống khi chọn custom.';
    return '';
  }, [rule]);

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
  useEffect(() => {
    if (!sourceGroup) return;
    setScan((prev) => ({ ...prev, chat_id: String(sourceGroup.chat_id || '') }));
  }, [sourceGroup?.id, sourceGroup?.chat_id]);

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
      appToast('Scan range hoàn tất', 'success');
    } catch (err: any) {
      setNotice(`Lỗi scan: ${err.message}`);
      appToast('Scan range thất bại', 'error');
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
      appToast('Đã tạo topic mới', 'success');
    } catch (err: any) {
      setNotice(`Lỗi tạo topic: ${err.message}`);
      appToast('Tạo topic thất bại', 'error');
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
          .select('id,status,created_at,source_message_id')
          .eq('source_chat_id', sourceGroup.chat_id)
          .order('created_at', { ascending: false })
          .limit(500);

        const ready = (sources || []).filter((s: any) => s.status !== 'link_only');
        const linkOnly = (sources || []).filter((s: any) => s.status === 'link_only');
        const selectedPool = ready.length > 0 ? ready : linkOnly;

        const rows = selectedPool.slice(0, 300).map((s: any, idx: number) => ({
          campaign_id: campaign.id,
          source_message_id: s.id,
          sort_order: idx
        }));

        if (rows.length > 0) {
          await supabase.from('campaign_sources').insert(rows);
          if (ready.length === 0) {
            setNotice('Đang dùng nguồn link_only (chưa có metadata đầy đủ). Nếu gửi lỗi, hãy forward bài gốc cho bot để bot lưu metadata thật.');
          }
        } else {
          throw new Error('Nhóm nguồn chưa có source_messages. Hãy gửi bài mới vào nhóm backup hoặc scan range trước.');
        }
      }

      const preflight = await workerPost(`/api/campaigns/${campaign.id}/preflight`, {});
      setPreflightResult(preflight);
      if (!preflight?.ok) {
        const issueText = (preflight?.issues || []).join(' | ') || 'Preflight không đạt.';
        throw new Error(`Preflight fail: ${issueText}`);
      }

      const generate = await workerPost('/api/queue/generate', { campaignId: campaign.id });
      const warningText = (preflight?.warnings || []).length ? ` Cảnh báo: ${(preflight.warnings || []).join(' | ')}` : '';
      const exhaustedText = (generate?.summary?.exhausted_campaigns ?? 0) > 0
        ? ' Campaign đã hết source chưa dùng. Hãy thêm source mới.'
        : '';
      setNotice(`Hoàn tất. Campaign đã tạo và queue đã generate (created=${generate?.summary?.items_created ?? 0}).${warningText}${exhaustedText}`);
      appToast('Đã tạo campaign và generate queue', 'success');
      setStep(4);
    } catch (err: any) {
      setNotice(`Lỗi khởi tạo flow: ${err.message}`);
      appToast('Khởi tạo flow thất bại', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell title="Setup nhanh" subtitle="Flow mới: Nguồn -> Đích -> Luật gửi -> Bật chạy">
      <section className="card fade-up">
        <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-sky-300 to-violet-300 transition-all duration-500" style={{ width: `${(step / 4) * 100}%` }} />
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {[
            { n: 1, label: 'Nguồn' },
            { n: 2, label: 'Đích' },
            { n: 3, label: 'Luật gửi' },
            { n: 4, label: 'Chạy' }
          ].map((x) => (
            <button
              key={x.n}
              className={`step-pill ${step === x.n ? 'active' : ''}`}
              onClick={() => setStep(x.n as Step)}
            >
              Bước {x.n} - {x.label}
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
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm text-zinc-300">Chat ID nguồn</label>
                  <input className="input opacity-90" placeholder="-100xxxxxxxxxx" value={scan.chat_id} readOnly />
                  <p className="mt-1 text-xs text-zinc-500">Tự động lấy từ Nhóm nguồn (backup), không cần nhập tay.</p>
                </div>
                <div>
                  <label className="mb-1 block text-sm text-zinc-300">Từ Message ID</label>
                  <input className="input" placeholder="1000" value={scan.from_message_id} onChange={(e) => setScan({ ...scan, from_message_id: e.target.value })} />
                  <p className="mt-1 text-xs text-zinc-500">ID bắt đầu của dải cần import.</p>
                </div>
                <div>
                  <label className="mb-1 block text-sm text-zinc-300">Đến Message ID</label>
                  <input className="input" placeholder="1200" value={scan.to_message_id} onChange={(e) => setScan({ ...scan, to_message_id: e.target.value })} />
                  <p className="mt-1 text-xs text-zinc-500">ID kết thúc của dải cần import (tối đa 500 ID/lần).</p>
                </div>
              </div>
              <div className="flex justify-end">
                <button className="btn" onClick={doScanRange} disabled={loading || !!scanError}>{loading ? 'Đang scan...' : 'Scan range'}</button>
              </div>
              {scanError ? <p className="field-error">{scanError}</p> : null}
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
            <div>
              <label className="mb-1 block text-sm text-zinc-300">Tên chiến dịch</label>
              <input className="input" placeholder="Ví dụ: Đẩy video khung giờ tối" value={rule.name} onChange={(e) => setRule({ ...rule, name: e.target.value })} />
              <p className="mt-1 text-xs text-zinc-500">Tên hiển thị để quản lý ở màn Chiến dịch/Queue.</p>
            </div>
            <div>
              <label className="mb-1 block text-sm text-zinc-300">Khung giờ chạy</label>
              <input className="input" placeholder="09:00,15:00,21:00" value={rule.run_times} onChange={(e) => setRule({ ...rule, run_times: e.target.value })} />
              <p className="mt-1 text-xs text-zinc-500">Nhập dạng `HH:mm`, ngăn cách bằng dấu phẩy.</p>
            </div>
            <div>
              <label className="mb-1 block text-sm text-zinc-300">Chế độ gửi</label>
              <select className="input" value={rule.copy_mode} onChange={(e) => setRule({ ...rule, copy_mode: e.target.value })}><option value="copy">copy (ẩn nguồn)</option><option value="forward">forward (giữ nguồn)</option></select>
              <p className="mt-1 text-xs text-zinc-500">`copy` thường dùng khi muốn ẩn nguồn bài gốc.</p>
            </div>
            <div>
              <label className="mb-1 block text-sm text-zinc-300">Xử lý album</label>
              <select className="input" value={rule.media_group_mode} onChange={(e) => setRule({ ...rule, media_group_mode: e.target.value })}><option value="keep">keep album (giữ cụm)</option><option value="split">split (tách lẻ)</option></select>
              <p className="mt-1 text-xs text-zinc-500">`keep` sẽ gửi cả album theo cụm, `split` gửi từng item.</p>
            </div>
            <div>
              <label className="mb-1 block text-sm text-zinc-300">Batch size</label>
              <input className="input" type="number" min={1} value={rule.batch_size} onChange={(e) => setRule({ ...rule, batch_size: Number(e.target.value) })} />
              <p className="mt-1 text-xs text-zinc-500">Mỗi lần chạy gửi bao nhiêu đơn vị nội dung.</p>
            </div>
            <div>
              <label className="mb-1 block text-sm text-zinc-300">Múi giờ</label>
              <input className="input" placeholder="Asia/Ho_Chi_Minh" value={rule.timezone} onChange={(e) => setRule({ ...rule, timezone: e.target.value })} />
              <p className="mt-1 text-xs text-zinc-500">Dùng để tính đúng khung giờ chạy.</p>
            </div>
            <div>
              <label className="mb-1 block text-sm text-zinc-300">Caption mode</label>
              <select className="input" value={rule.caption_mode} onChange={(e) => setRule({ ...rule, caption_mode: e.target.value })}><option value="original">Giữ caption gốc</option><option value="custom">Dùng caption mới</option></select>
              <p className="mt-1 text-xs text-zinc-500">Forward luôn giữ caption gốc theo Telegram.</p>
            </div>
            {rule.caption_mode === 'custom' ? (
              <div>
                <label className="mb-1 block text-sm text-zinc-300">Caption mới</label>
                <input className="input" placeholder="Nhập caption mới..." value={rule.custom_caption} onChange={(e) => setRule({ ...rule, custom_caption: e.target.value })} />
                <p className="mt-1 text-xs text-zinc-500">Sẽ áp dụng khi gửi bằng copy.</p>
              </div>
            ) : <div />}
          </div>

          <div className="flex justify-between">
            <button className="btn-secondary" onClick={() => setStep(2)}>Quay lại</button>
            <button className="btn" onClick={() => setStep(4)} disabled={!!ruleError}>Xác nhận</button>
          </div>
          {ruleError ? <p className="field-error">{ruleError}</p> : null}
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
          {preflightResult ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm space-y-1">
              <p><b>Preflight:</b> {preflightResult.ok ? 'OK' : 'FAILED'}</p>
              <p><b>Source ready/link_only:</b> {preflightResult.stats?.ready_sources ?? 0}/{preflightResult.stats?.link_only_sources ?? 0}</p>
              {(preflightResult.warnings || []).map((w: string, i: number) => <p key={`w-${i}`} className="text-amber-300">Cảnh báo: {w}</p>)}
              {(preflightResult.issues || []).map((x: string, i: number) => <p key={`i-${i}`} className="text-rose-300">Lỗi: {x}</p>)}
            </div>
          ) : null}

          <div className="flex justify-between">
            <button className="btn-secondary" onClick={() => setStep(3)}>Quay lại</button>
            <button className="btn" onClick={saveAndStart} disabled={loading}>{loading ? 'Đang khởi tạo...' : 'Lưu & Bắt đầu'}</button>
          </div>
        </section>
      ) : null}

      {notice ? <section className="card"><p className="notice text-sm">{notice}</p></section> : null}
    </AppShell>
  );
}
