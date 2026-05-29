'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { SkeletonTable } from '@/components/SkeletonTable';
import { supabase } from '@/lib/supabase';

export default function InboxPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [mediaType, setMediaType] = useState('all');
  const [loading, setLoading] = useState(false);

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
        <input className="input md:col-span-2" placeholder="Tìm theo chat/message/caption..." value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={mediaType} onChange={(e) => setMediaType(e.target.value)}>
          <option value="all">Tất cả media</option>
          <option value="text">text</option><option value="photo">photo</option><option value="video">video</option>
          <option value="document">document</option><option value="animation">animation</option><option value="audio">audio</option><option value="voice">voice</option>
        </select>
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
