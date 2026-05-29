'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { supabase } from '@/lib/supabase';
import { workerPost } from '@/lib/worker';

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [campaign, setCampaign] = useState<any>(null);
  const [sources, setSources] = useState<any[]>([]);
  const [allMsgs, setAllMsgs] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [savingConfig, setSavingConfig] = useState(false);
  const [notice, setNotice] = useState('');
  const [queueNotice, setQueueNotice] = useState('');
  const [preflightNotice, setPreflightNotice] = useState('');
  const [configForm, setConfigForm] = useState<any>(null);
  const [selected, setSelected] = useState('');

  async function load() {
    const [c, s, m, g, t] = await Promise.all([
      supabase.from('campaigns').select('*').eq('id', id).single(),
      supabase.from('campaign_sources').select('*,source_messages(*)').eq('campaign_id', id).order('sort_order'),
      supabase.from('source_messages').select('*').order('created_at', { ascending: false }).limit(300),
      supabase.from('telegram_groups').select('*').order('title'),
      supabase.from('topics').select('*').order('name')
    ]);
    setCampaign(c.data);
    if (c.data) {
      setConfigForm({
        name: c.data.name || '',
        target_group_id: c.data.target_group_id || '',
        target_topic_id: c.data.target_topic_id || '',
        copy_mode: c.data.copy_mode || 'copy',
        caption_mode: c.data.caption_mode || 'original',
        custom_caption: c.data.custom_caption || '',
        media_group_mode: c.data.media_group_mode || 'keep',
        batch_size: c.data.batch_size || 1,
        runs_per_day: c.data.runs_per_day || 1,
        run_times: (c.data.run_times || []).join(','),
        timezone: c.data.timezone || 'Asia/Ho_Chi_Minh',
        random_delay_seconds: c.data.random_delay_seconds || 0,
        status: c.data.status || 'active'
      });
    }
    setSources(s.data || []);
    setAllMsgs(m.data || []);
    setGroups(g.data || []);
    setTopics(t.data || []);
  }

  useEffect(() => { if (id) load(); }, [id]);

  async function addSource() {
    if (!selected) return;
    await supabase.from('campaign_sources').insert({ campaign_id: id, source_message_id: selected, sort_order: sources.length });
    setSelected('');
    load();
  }

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!configForm) return;
    setSavingConfig(true);
    setNotice('');
    const payload: any = {
      name: configForm.name,
      target_group_id: configForm.target_group_id || null,
      target_topic_id: configForm.target_topic_id || null,
      copy_mode: configForm.copy_mode,
      caption_mode: configForm.caption_mode,
      custom_caption: configForm.caption_mode === 'custom' ? (configForm.custom_caption || null) : null,
      media_group_mode: configForm.media_group_mode,
      batch_size: Number(configForm.batch_size),
      runs_per_day: Number(configForm.runs_per_day),
      run_times: String(configForm.run_times).split(',').map((s) => s.trim()).filter(Boolean),
      timezone: configForm.timezone,
      random_delay_seconds: Number(configForm.random_delay_seconds),
      status: configForm.status
    };
    const { error } = await supabase.from('campaigns').update(payload).eq('id', id);
    setSavingConfig(false);
    if (error) {
      setNotice(`Lỗi cập nhật: ${error.message}`);
      return;
    }
    setNotice('Đã cập nhật chiến dịch.');
    load();
  }

  return (
    <AppShell
      title={campaign?.name || 'Chi tiết chiến dịch'}
      subtitle="Thêm nguồn nội dung, quản lý thứ tự và generate queue cho chiến dịch này."
      actions={<div className="flex gap-2">
        <button className="btn-secondary" onClick={async () => {
          setPreflightNotice('');
          try {
            const p = await workerPost(`/api/campaigns/${id}/preflight`, {});
            const warn = (p?.warnings || []).length ? ` | warnings: ${(p.warnings || []).join(' ; ')}` : '';
            const issues = (p?.issues || []).length ? ` | issues: ${(p.issues || []).join(' ; ')}` : '';
            setPreflightNotice(`Preflight ${p?.ok ? 'OK' : 'FAILED'} | ready=${p?.stats?.ready_sources ?? 0} link_only=${p?.stats?.link_only_sources ?? 0}${warn}${issues}`);
          } catch (err: any) {
            setPreflightNotice(`Preflight lỗi: ${err.message}`);
          }
        }}>Preflight</button>
        <button className="btn" onClick={async () => {
          setQueueNotice('');
          try {
            const p = await workerPost(`/api/campaigns/${id}/preflight`, {});
            if (!p?.ok) {
              setQueueNotice(`Generate bị chặn do preflight fail: ${(p?.issues || []).join(' | ')}`);
              return;
            }
            const result = await workerPost('/api/queue/generate', { campaignId: id });
            const s = result?.summary;
            const warn = (p?.warnings || []).length ? ` | warnings: ${(p.warnings || []).join(' ; ')}` : '';
            setQueueNotice(
              `Generate queue xong: created=${s?.items_created ?? 0}, slots=${s?.slots_checked ?? 0}, ` +
              `skip_no_sources=${s?.skipped_no_sources ?? 0}, skip_existing_slot=${s?.skipped_existing_slot ?? 0}${warn}`
            );
          } catch (err: any) {
            setQueueNotice(`Generate queue lỗi: ${err.message}`);
          }
        }}>Generate Queue</button>
      </div>}
    >
      {preflightNotice ? <section className="card"><p className="text-sm text-zinc-300">{preflightNotice}</p></section> : null}
      {queueNotice ? <section className="card"><p className="text-sm text-zinc-300">{queueNotice}</p></section> : null}
      <section className="card fade-up">
        <div className="grid gap-3 md:grid-cols-3">
          <p><span className="text-zinc-400">Chế độ:</span> {campaign?.copy_mode}/{campaign?.media_group_mode}</p>
          <p><span className="text-zinc-400">Batch:</span> {campaign?.batch_size}</p>
          <p><span className="text-zinc-400">Khung giờ:</span> {(campaign?.run_times || []).join(', ')}</p>
        </div>
      </section>

      {configForm ? (
        <form className="card fade-up space-y-3" onSubmit={saveConfig}>
          <h2 className="text-lg font-semibold text-zinc-100">Sửa cấu hình chiến dịch</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div><label className="mb-1 block text-sm text-zinc-300">Tên chiến dịch</label><input className="input" value={configForm.name} onChange={(e) => setConfigForm({ ...configForm, name: e.target.value })} /></div>
            <div><label className="mb-1 block text-sm text-zinc-300">Nhóm đích</label><select className="input" value={configForm.target_group_id} onChange={(e) => setConfigForm({ ...configForm, target_group_id: e.target.value })}>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select></div>
            <div><label className="mb-1 block text-sm text-zinc-300">Topic đích</label><select className="input" value={configForm.target_topic_id || ''} onChange={(e) => setConfigForm({ ...configForm, target_topic_id: e.target.value })}>
              <option value="">General chat (không topic)</option>
              {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></div>
            <div><label className="mb-1 block text-sm text-zinc-300">Chế độ gửi</label><select className="input" value={configForm.copy_mode} onChange={(e) => setConfigForm({ ...configForm, copy_mode: e.target.value })}>
              <option value="copy">copy</option><option value="forward">forward</option>
            </select></div>
            <div><label className="mb-1 block text-sm text-zinc-300">Caption</label><select className="input" value={configForm.caption_mode} onChange={(e) => setConfigForm({ ...configForm, caption_mode: e.target.value })}>
              <option value="original">Giữ caption gốc</option><option value="custom">Caption mới (copy)</option>
            </select></div>
            <div><label className="mb-1 block text-sm text-zinc-300">Caption mới</label><input className="input" placeholder="Chỉ dùng khi chọn caption custom" value={configForm.custom_caption} onChange={(e) => setConfigForm({ ...configForm, custom_caption: e.target.value })} /></div>
            <div><label className="mb-1 block text-sm text-zinc-300">Album mode</label><select className="input" value={configForm.media_group_mode} onChange={(e) => setConfigForm({ ...configForm, media_group_mode: e.target.value })}>
              <option value="keep">keep</option><option value="split">split</option>
            </select></div>
            <div><label className="mb-1 block text-sm text-zinc-300">Batch size</label><input className="input" type="number" min={1} value={configForm.batch_size} onChange={(e) => setConfigForm({ ...configForm, batch_size: e.target.value })} /></div>
            <div><label className="mb-1 block text-sm text-zinc-300">Runs per day</label><input className="input" type="number" min={1} value={configForm.runs_per_day} onChange={(e) => setConfigForm({ ...configForm, runs_per_day: e.target.value })} /></div>
            <div><label className="mb-1 block text-sm text-zinc-300">Khung giờ</label><input className="input" value={configForm.run_times} onChange={(e) => setConfigForm({ ...configForm, run_times: e.target.value })} /></div>
            <div><label className="mb-1 block text-sm text-zinc-300">Timezone</label><input className="input" value={configForm.timezone} onChange={(e) => setConfigForm({ ...configForm, timezone: e.target.value })} /></div>
            <div><label className="mb-1 block text-sm text-zinc-300">Random delay (giây)</label><input className="input" type="number" min={0} value={configForm.random_delay_seconds} onChange={(e) => setConfigForm({ ...configForm, random_delay_seconds: e.target.value })} /></div>
            <div><label className="mb-1 block text-sm text-zinc-300">Trạng thái</label><select className="input" value={configForm.status} onChange={(e) => setConfigForm({ ...configForm, status: e.target.value })}>
              <option value="active">active</option><option value="paused">paused</option><option value="archived">archived</option>
            </select></div>
          </div>
          <div className="flex justify-end">
            <button className="btn" disabled={savingConfig}>{savingConfig ? 'Đang lưu...' : 'Lưu thay đổi'}</button>
          </div>
          {notice ? <p className="text-sm text-zinc-300">{notice}</p> : null}
        </form>
      ) : null}

      <section className="card fade-up">
        <h2 className="text-lg font-semibold text-zinc-100">Thêm source message</h2>
        <div className="mt-3 space-y-2">
          <label className="block text-sm text-zinc-300">Nguồn cần thêm</label>
          <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Chọn source message</option>
            {allMsgs.map((m) => <option key={m.id} value={m.id}>{m.source_chat_id}/{m.source_message_id} - {m.media_type}</option>)}
          </select>
          <p className="text-xs text-zinc-500">Chọn message từ inbox để đưa vào danh sách phát của campaign.</p>
          <div className="flex justify-end"><button className="btn" onClick={addSource}>Thêm source</button></div>
        </div>
      </section>

      <section className="card fade-up overflow-auto">
        <table className="table min-w-[860px]">
          <thead><tr><th>Thứ tự</th><th>Source</th><th>Loại</th><th>Album</th><th>Thao tác</th></tr></thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id}>
                <td>{s.sort_order}</td>
                <td>{s.source_messages.source_chat_id}/{s.source_messages.source_message_id}</td>
                <td>{s.source_messages.media_type}</td>
                <td>{s.source_messages.media_group_id || '-'}</td>
                <td><button className="btn-secondary" onClick={async () => { await supabase.from('campaign_sources').delete().eq('id', s.id); load(); }}>Xóa</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
