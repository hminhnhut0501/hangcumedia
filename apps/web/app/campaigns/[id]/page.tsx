'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { supabase } from '@/lib/supabase';
import { workerPost } from '@/lib/worker';
import { appToast } from '@/lib/toast';

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
      supabase.from('source_messages').select('*').order('created_at', { ascending: false }).limit(400),
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

  const targetTopics = useMemo(
    () => topics.filter((t: any) => t.group_id === configForm?.target_group_id),
    [topics, configForm?.target_group_id]
  );

  async function addSource() {
    if (!selected) return;
    await supabase.from('campaign_sources').insert({ campaign_id: id, source_message_id: selected, sort_order: sources.length });
    setSelected('');
    appToast('Đã thêm source message', 'success');
    load();
  }

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!configForm) return;
    setSavingConfig(true);
    setNotice('');
    const runTimes = String(configForm.run_times).split(',').map((s) => s.trim()).filter(Boolean);
    const payload: any = {
      name: configForm.name,
      target_group_id: configForm.target_group_id || null,
      target_topic_id: configForm.target_topic_id || null,
      copy_mode: configForm.copy_mode,
      caption_mode: configForm.caption_mode,
      custom_caption: configForm.caption_mode === 'custom' ? (configForm.custom_caption || null) : null,
      media_group_mode: configForm.media_group_mode,
      batch_size: Number(configForm.batch_size),
      run_times: runTimes,
      runs_per_day: runTimes.length || 1,
      timezone: configForm.timezone,
      random_delay_seconds: Number(configForm.random_delay_seconds),
      status: configForm.status
    };
    const { error } = await supabase.from('campaigns').update(payload).eq('id', id);
    setSavingConfig(false);
    if (error) {
      setNotice(`Lỗi cập nhật: ${error.message}`);
      appToast('Lưu campaign thất bại', 'error');
      return;
    }
    setNotice('Đã cập nhật campaign.');
    appToast('Đã lưu thay đổi', 'success');
    load();
  }

  const selectedGroupTitle = groups.find((g: any) => g.id === configForm?.target_group_id)?.title || '-';
  const selectedTopicTitle = targetTopics.find((t: any) => t.id === configForm?.target_topic_id)?.name || 'General chat';

  return (
    <AppShell
      title={campaign?.name || 'Campaign Detail'}
      subtitle="Chỉnh routing theo target group/topic, preflight trước khi generate queue."
      actions={<div className="flex gap-2">
        <button className="btn-secondary" onClick={async () => {
          setPreflightNotice('');
          try {
            const p = await workerPost(`/api/campaigns/${id}/preflight`, {});
            const warn = (p?.warnings || []).length ? ` | warnings: ${(p.warnings || []).join(' ; ')}` : '';
            const issues = (p?.issues || []).length ? ` | issues: ${(p.issues || []).join(' ; ')}` : '';
            setPreflightNotice(`Preflight ${p?.ok ? 'OK' : 'FAILED'} | ready=${p?.stats?.ready_sources ?? 0} link_only=${p?.stats?.link_only_sources ?? 0}${warn}${issues}`);
            appToast(p?.ok ? 'Preflight OK' : 'Preflight failed', p?.ok ? 'success' : 'error');
          } catch (err: any) {
            setPreflightNotice(`Preflight lỗi: ${err.message}`);
            appToast('Preflight lỗi', 'error');
          }
        }}>Preflight</button>
        <button className="btn" onClick={async () => {
          setQueueNotice('');
          try {
            const p = await workerPost(`/api/campaigns/${id}/preflight`, {});
            if (!p?.ok) {
              setQueueNotice(`Generate bị chặn do preflight fail: ${(p?.issues || []).join(' | ')}`);
              appToast('Generate bị chặn bởi preflight', 'error');
              return;
            }
            const result = await workerPost('/api/queue/generate', { campaignId: id });
            const s = result?.summary;
            setQueueNotice(`Generate queue: created=${s?.items_created ?? 0}, slots=${s?.slots_checked ?? 0}, skip_existing=${s?.skipped_existing_slot ?? 0}`);
            appToast('Đã generate queue', 'success');
          } catch (err: any) {
            setQueueNotice(`Generate queue lỗi: ${err.message}`);
            appToast('Generate queue thất bại', 'error');
          }
        }}>Generate Queue</button>
      </div>}
    >
      <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <form className="card space-y-3" onSubmit={saveConfig}>
          <h2 className="section-title text-xl text-slate-50">Routing & Delivery Config</h2>
          {configForm ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div><label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Tên campaign</label><input className="input" value={configForm.name} onChange={(e) => setConfigForm({ ...configForm, name: e.target.value })} /></div>
              <div><label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Trạng thái</label><select className="input" value={configForm.status} onChange={(e) => setConfigForm({ ...configForm, status: e.target.value })}><option value="active">active</option><option value="paused">paused</option><option value="archived">archived</option></select></div>
              <div><label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Target group</label><select className="input" value={configForm.target_group_id || ''} onChange={(e) => setConfigForm({ ...configForm, target_group_id: e.target.value, target_topic_id: '' })}>{groups.filter((g: any) => g.type === 'main').map((g: any) => <option key={g.id} value={g.id}>{g.title}</option>)}</select></div>
              <div><label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Target topic</label><select className="input" value={configForm.target_topic_id || ''} onChange={(e) => setConfigForm({ ...configForm, target_topic_id: e.target.value })}><option value="">General chat</option>{targetTopics.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
              <div><label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Mode</label><select className="input" value={configForm.copy_mode} onChange={(e) => setConfigForm({ ...configForm, copy_mode: e.target.value })}><option value="copy">copy</option><option value="forward">forward</option></select></div>
              <div><label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Album mode</label><select className="input" value={configForm.media_group_mode} onChange={(e) => setConfigForm({ ...configForm, media_group_mode: e.target.value })}><option value="keep">keep</option><option value="split">split</option></select></div>
              <div><label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Caption mode</label><select className="input" value={configForm.caption_mode} onChange={(e) => setConfigForm({ ...configForm, caption_mode: e.target.value })}><option value="original">original</option><option value="custom">custom</option></select></div>
              <div><label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Batch size</label><input className="input" type="number" min={1} value={configForm.batch_size} onChange={(e) => setConfigForm({ ...configForm, batch_size: e.target.value })} /></div>
              <div className="md:col-span-2"><label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Khung giờ</label><input className="input" value={configForm.run_times} onChange={(e) => setConfigForm({ ...configForm, run_times: e.target.value })} /></div>
              <div><label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Timezone</label><input className="input" value={configForm.timezone} onChange={(e) => setConfigForm({ ...configForm, timezone: e.target.value })} /></div>
              <div><label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Random delay</label><input className="input" type="number" min={0} value={configForm.random_delay_seconds} onChange={(e) => setConfigForm({ ...configForm, random_delay_seconds: e.target.value })} /></div>
              {configForm.caption_mode === 'custom' ? <div className="md:col-span-2"><label className="mb-1 block text-xs uppercase tracking-wider text-slate-500">Custom caption</label><textarea className="input min-h-20" value={configForm.custom_caption} onChange={(e) => setConfigForm({ ...configForm, custom_caption: e.target.value })} /></div> : null}
            </div>
          ) : null}
          <div className="flex justify-end"><button className="btn" disabled={savingConfig}>{savingConfig ? 'Đang lưu...' : 'Lưu thay đổi'}</button></div>
          {notice ? <p className="notice text-sm">{notice}</p> : null}
        </form>

        <section className="card space-y-3">
          <h2 className="section-title text-xl text-slate-50">Target Snapshot</h2>
          <div className="rounded-xl border border-slate-700/60 bg-slate-950/50 p-3 text-sm space-y-1">
            <p><span className="text-slate-500">Group:</span> <span className="font-semibold text-slate-100">{selectedGroupTitle}</span></p>
            <p><span className="text-slate-500">Topic:</span> <span className="font-semibold text-slate-100">{selectedTopicTitle}</span></p>
            <p><span className="text-slate-500">Run times:</span> <span className="font-semibold text-slate-100">{configForm?.run_times || '-'}</span></p>
            <p><span className="text-slate-500">Source state:</span> <span className={campaign?.source_state === 'waiting_for_source' ? 'text-amber-300 font-semibold' : 'text-emerald-300 font-semibold'}>{campaign?.source_state || 'ready'}</span></p>
          </div>
          {preflightNotice ? <p className="notice text-sm">{preflightNotice}</p> : null}
          {queueNotice ? <p className="notice text-sm">{queueNotice}</p> : null}
        </section>
      </section>

      <section className="card">
        <h2 className="section-title text-xl text-slate-50">Source Pool</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
          <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Chọn source message để add</option>
            {allMsgs.map((m) => <option key={m.id} value={m.id}>{m.source_chat_id}/{m.source_message_id} - {m.media_type}</option>)}
          </select>
          <button className="btn" onClick={addSource}>Thêm source</button>
        </div>
      </section>

      <section className="card overflow-auto">
        <table className="table min-w-[900px]">
          <thead><tr><th>Sort</th><th>Source</th><th>Type</th><th>Album</th><th>Action</th></tr></thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id}>
                <td>{s.sort_order}</td>
                <td>{s.source_messages.source_chat_id}/{s.source_messages.source_message_id}</td>
                <td>{s.source_messages.media_type}</td>
                <td>{s.source_messages.media_group_id || '-'}</td>
                <td><button className="btn-secondary" onClick={async () => { await supabase.from('campaign_sources').delete().eq('id', s.id); appToast('Đã xóa source khỏi campaign', 'info'); load(); }}>Xóa</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
