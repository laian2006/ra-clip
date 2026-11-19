import { useState, type FormEvent } from 'react';
import { CircleAlert, CirclePlay, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { fold } from './claims';
import { sourceLabels, timestamp } from './domain';
import type { Clip, Evidence } from './domain';
import { Modal } from './ui';

export function EvidenceTimeline({ clip, playable, busy, onJump, onEdit }: {
  clip: Clip; playable: boolean; busy: boolean; onJump: (at: number) => void; onEdit: (index: number | null) => void;
}) {
  const [source, setSource] = useState<Evidence['source'] | 'all'>('all');
  const [search, setSearch] = useState('');
  const rows = clip.evidence.flatMap((entry, index) =>
    (source === 'all' || entry.source === source) && fold(entry.text).includes(fold(search.trim())) ? [{ entry, index }] : []);
  return <div className="timeline">
    <div className="timeline-tools">
      <label className="search-box"><Search size={16} /><input aria-label="Tìm đoạn trích" placeholder="Tìm đoạn trích…"
        value={search} onChange={event => setSearch(event.target.value)} /></label>
      <select aria-label="Nguồn đoạn trích" value={source} onChange={event => setSource(event.target.value as typeof source)}>
        <option value="all">Mọi nguồn</option>
        {Object.entries(sourceLabels).map(([key, value]) => <option value={key} key={key}>{value}</option>)}
      </select>
      <button type="button" className="button secondary" disabled={busy} onClick={() => onEdit(null)}><Plus size={15} /> Thêm đoạn</button>
    </div>
    <ul className="timeline-list">{rows.map(({ entry, index }) => <li key={index}>
      <button type="button" className="time-button" disabled={!playable} onClick={() => onJump(entry.start)}
        aria-label={`Phát từ ${timestamp(entry.start)}`}><CirclePlay size={15}/>{timestamp(entry.start)}</button>
      <div><small>{sourceLabels[entry.source]}{entry.corrected && <span className="corrected">Đã sửa tay</span>}</small><p>{entry.text}</p></div>
      <button type="button" className="icon-button" disabled={busy} onClick={() => onEdit(index)} title="Sửa đoạn"
        aria-label={`Sửa đoạn ${timestamp(entry.start)} · ${sourceLabels[entry.source]}`}><Pencil size={15} /></button>
    </li>)}</ul>
    {!rows.length && <p className="empty-inline">{clip.evidence.length ? 'Không có đoạn nào khớp bộ lọc.' : 'Chưa có đoạn trích. Phân tích video hoặc thêm một đoạn thủ công.'}</p>}
  </div>;
}

export function EvidenceDialog({ row, onSave, onClose }: {
  row?: Evidence;
  onSave: (value: Pick<Evidence, 'start' | 'end' | 'text'> | null) => Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState(row?.text ?? '');
  const [start, setStart] = useState(row?.start.toString() ?? '');
  const [end, setEnd] = useState(row?.end?.toString() ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save(value: Pick<Evidence, 'start' | 'end' | 'text'> | null) {
    setBusy(true);
    setError('');
    try { await onSave(value); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!start.trim()) { setError('Nhập mốc bắt đầu.'); return; }
    void save({ start: Number(start), end: end.trim() ? Number(end) : null, text });
  }

  return <Modal title={row ? 'Sửa đoạn trích' : 'Thêm đoạn trích'}
    detail="Báo cáo cập nhật ngay sau khi lưu đoạn." busy={busy} onClose={onClose}>
    <form className="dialog-form" onSubmit={submit}>
      <div className="form-grid">
        <label>Bắt đầu (giây)<input type="number" min="0" max="7200" step="0.01" required
          value={start} disabled={busy} onChange={event => setStart(event.target.value)} /></label>
        <label>Kết thúc (giây, tùy chọn)<input type="number" min="0" max="7200" step="0.01"
          value={end} disabled={busy} onChange={event => setEnd(event.target.value)} /></label>
      </div>
      <label className="stack-field">Nội dung đoạn trích<textarea rows={5} maxLength={4000} required
        value={text} disabled={busy} onChange={event => setText(event.target.value)} /></label>
      {error && <p role="alert" className="form-error"><CircleAlert size={16} /> {error}</p>}
      {confirmDelete && <p className="form-error">Xóa đoạn này khỏi báo cáo? Với đoạn AI, lần quét tiếp theo sẽ bỏ qua mốc đã xóa.</p>}
      <div className="dialog-actions">
        {row && <button className="button danger-text start-action" type="button" disabled={busy}
          onClick={() => confirmDelete ? void save(null) : setConfirmDelete(true)}><Trash2 size={16} /> {confirmDelete ? 'Xác nhận xóa' : 'Xóa đoạn'}</button>}
        <button className="button secondary" type="button" onClick={onClose} disabled={busy}>Hủy</button>
        <button className="button primary" type="submit" disabled={busy}>Lưu đoạn trích</button>
      </div>
    </form>
  </Modal>;
}
