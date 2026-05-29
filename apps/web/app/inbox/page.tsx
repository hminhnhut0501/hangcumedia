'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { SkeletonTable } from '@/components/SkeletonTable';
import { supabase } from '@/lib/supabase';
import { workerPost } from '@/lib/worker';

export default function InboxPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [mediaType, setMediaType] = useState('all');
  const [loading, setLoading] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanNotice, setScanNotice] = useState('');
  const [scanResult, setScanResult] = useState<any>(null);
  const [scanForm, setScanForm] = useState({ chat_id: '', from_message_id: '', to_message_id: '' });

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('source_messages').select('*').order('created_at', { ascending: false }).limit(400);
    setRows(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const matchType = mediaType === 'all' ? true : r.media_type === mediaType;
      const text = `${r.source_chat_id} ${r.source_message_id} ${r.caption || ''} ${r.text || ''}`.toLowerCase();
      const matchQ = q ? text.includes(q.toLowerCase()) : true;
      return matchType && matchQ;
    });
  }, [rows, q, mediaType]);

  return (
    <AppShell
      title="Hộp nguồn"
      subtitle="Duyệt nội dung bot đã import, lọc theo media type và chuẩn bị nguồn cho chiến dịch."
      actions={<button className="btn-secondary" onClick={load}>{loading ? 'Đang tải...' : 'Làm mới'}</button>}
    >
      <section className="card fade-up grid gap-3 md:grid-cols-3">
        <div className="md:col-span-2">
          <label className="mb-1 block text-sm text-zinc-300">Tìm kiếm nhanh</label>
          <input className="input" placeholder="Tìm theo chat/message/caption..." value={q} onChange={(e) => setQ(e.target.value)} />
          <p className="mt-1 text-xs text-zinc-500">Hỗ trợ tìm theo ID chat, ID message và nội dung caption/text.</p>
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-300">Bộ lọc media type</label>
          <select className="input" value={mediaType} onChange={(e) => setMediaType(e.target.value)}>
            <option value="all">Tất cả media</option>
            <option value="text">text</option><option value="photo">photo</option><option value="video">video</option>
            <option value="document">document</option><option value="animation">animation</option><option value="audio">audio</option><option value="voice">voice</option>
          </select>
          <p className="mt-1 text-xs text-zinc-500">Lọc nhanh theo loại nội dung bot đã import.</p>
        </div>
      </section>

      <section className="card fade-up space-y-3">
        <h3 className="section-title text-lg font-semibold">Scan range theo Message ID</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Chat ID</label>
            <input className="input" placeholder="-1001234567890" value={scanForm.chat_id} onChange={(e) => setScanForm({ ...scanForm, chat_id: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-300">From message ID</label>
            <input className="input" placeholder="100" value={scanForm.from_message_id} onChange={(e) => setScanForm({ ...scanForm, from_message_id: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-300">To message ID</label>
            <input className="input" placeholder="200" value={scanForm.to_message_id} onChange={(e) => setScanForm({ ...scanForm, to_message_id: e.target.value })} />
          </div>
        </div>
        <p className="text-xs text-zinc-500">Giới hạn an toàn: tối đa 500 ID mỗi lần scan. Hệ thống sẽ tạo `link_only` cho ID chưa có metadata.</p>
        <div className="flex gap-2">
          <button
            className="btn"
            disabled={scanLoading}
            onClick={async () => {
              setScanLoading(true);
              setScanNotice('');
              setScanResult(null);
              try {
                const result = await workerPost('/api/import/range', {
                  chat_id: Number(scanForm.chat_id),
                  from_message_id: Number(scanForm.from_message_id),
                  to_message_id: Number(scanForm.to_message_id)
                });
                setScanResult(result);
                setScanNotice('Scan hoàn tất.');
                await load();
              } catch (err: any) {
                setScanNotice(`Lỗi scan: ${err.message}`);
              } finally {
                setScanLoading(false);
              }
            }}
          >
            {scanLoading ? 'Đang scan...' : 'Scan range'}
          </button>
        </div>
        {scanNotice ? <p className="text-sm text-zinc-300">{scanNotice}</p> : null}
        {scanResult ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
            <p><b>Tổng ID:</b> {scanResult.range?.total}</p>
            <p><b>Đã có metadata:</b> {scanResult.summary?.existed_ready}</p>
            <p><b>Đã có link_only:</b> {scanResult.summary?.existed_link_only}</p>
            <p><b>Tạo mới link_only:</b> {scanResult.summary?.created_link_only}</p>
            <p className="mt-2"><b>Progress checkpoints:</b> {(scanResult.checkpoints || []).map((c: any) => `${c.percent}%`).join(' • ')}</p>
          </div>
        ) : null}
      </section>

      <section className="card fade-up overflow-auto">
        {loading ? <SkeletonTable rows={6} cols={8} /> : null}
        {!loading && filtered.length === 0 ? <div className="empty-state">Không có bản ghi phù hợp bộ lọc hiện tại.</div> : null}
        {!loading && filtered.length > 0 ? (
          <table className="table min-w-[1100px]">
            <thead>
              <tr><th>Chat</th><th>Msg</th><th>Thread</th><th>Album</th><th>Type</th><th>Nội dung</th><th>Count</th><th>Imported By</th></tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>{r.source_chat_id}</td><td>{r.source_message_id}</td><td>{r.source_message_thread_id || '-'}</td><td>{r.media_group_id || '-'}</td><td>{r.media_type}</td>
                  <td className="max-w-[360px] truncate">{(r.caption || r.text || '').slice(0, 120)}</td><td>{r.album_item_count}</td><td>{r.imported_by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>
    </AppShell>
  );
}
