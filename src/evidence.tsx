import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CircleAlert, CirclePlay, Image, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { fold, referenceOnly } from './claims';
import { isSpeechDraft } from './evidence-quality';
import { suggestShopTerm } from './shop-terms';
import type { SpeechDraftEdit } from './workflow';
import { sourceLabels, timestamp } from './domain';
import type { Clip, Evidence } from './domain';
import { Modal } from './ui';
import { loadClipVideo } from './batch';
import { captureFrame } from './media';

export function EvidenceFrame({ clip, seconds, onJump }: { clip: Clip; seconds: number; onJump: () => void }) {
  const [src, setSrc] = useState('');
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const task = useRef<AbortController | null>(null);
  useEffect(() => () => task.current?.abort(), []);

  async function open() {
    if (loading || task.current) return;
    if (src) { setVisible(!visible); return; }
    const controller = new AbortController();
    task.current = controller;
    setLoading(true);
    setError('');
    try {
      const blob = await loadClipVideo(clip, controller.signal);
      setSrc(await captureFrame(blob, seconds, controller.signal));
      setVisible(true);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Chưa mở được khung hình.');
    } finally {
      task.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return <div className="evidence-frame">
    <button className="text-button" type="button" onClick={() => void open()} disabled={loading} aria-expanded={visible}>
      <Image size={16} /> {visible ? 'Ẩn khung hình' : 'Xem khung hình gốc'}
    </button>
    {loading && <p role="status">Đang lấy ảnh tại {timestamp(seconds)}…</p>}
    {error && <p role="alert">{error}</p>}
    {visible && <button className="frame-preview" type="button" onClick={onJump} aria-label={`Tua video đến ${timestamp(seconds)}`}>
      <img src={src} alt={`Khung hình video tại ${timestamp(seconds)}`} />
    </button>}
  </div>;
}

export function EvidenceTimeline({ clip, playable, busy, initialSource, shopTerms, onJump, onEdit, onConfirmDrafts }: {
  clip: Clip; playable: boolean; busy: boolean; initialSource: Evidence['source'] | 'all';
  shopTerms: string[];
  onJump: (at: number) => void; onEdit: (index: number | null) => void;
  onConfirmDrafts: (drafts: SpeechDraftEdit[]) => Promise<void>;
}) {
  const [source, setSource] = useState(initialSource);
  const [search, setSearch] = useState('');
  const [excluded, setExcluded] = useState(new Set<Evidence>());
  const [draftText, setDraftText] = useState(new Map<Evidence, string>());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const rows = clip.evidence.flatMap((entry, index) =>
    (source === 'all' || entry.source === source) && fold(entry.text).includes(fold(search.trim())) ? [{ entry, index }] : []);
  const drafts = rows.map(row => row.entry).filter(isSpeechDraft);
  const chosen = drafts.filter(entry => !excluded.has(entry));

  async function confirmDrafts() {
    if (saving || busy || !chosen.length) return;
    setSaving(true);
    setSaveError('');
    try {
      await onConfirmDrafts(chosen.map(entry => ({ entry, text: draftText.get(entry) ?? entry.text })));
      setDraftText(values => new Map([...values].filter(([entry]) => !chosen.includes(entry))));
      setExcluded(new Set());
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Chưa lưu được các đoạn đã chọn.');
    } finally { setSaving(false); }
  }

  return <div className="timeline" id="timeline-heading" tabIndex={-1} role="region" aria-label="Các đoạn trích">
    <div className="timeline-tools">
      <label className="search-box"><Search size={16} /><input aria-label="Tìm đoạn trích" placeholder="Tìm đoạn trích…"
        value={search} onChange={event => setSearch(event.target.value)} /></label>
      <select aria-label="Nguồn đoạn trích" value={source} onChange={event => setSource(event.target.value as typeof source)}>
        <option value="all">Mọi nguồn</option>
        {Object.entries(sourceLabels).map(([key, value]) => <option value={key} key={key}>{value}</option>)}
      </select>
      <button type="button" className="button secondary" disabled={busy || saving} onClick={() => onEdit(null)}><Plus size={15} /> Thêm đoạn</button>
    </div>
    {drafts.length > 0 && <div className="draft-review">
      <p>Nghe và kiểm tra các đoạn đang chọn trước khi lưu để đối chiếu.</p>
      <div>
        <button className="text-button" type="button" disabled={busy || saving}
          onClick={() => setExcluded(new Set(chosen.length === drafts.length ? drafts : []))}>
          {chosen.length === drafts.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
        </button>
        <button className="button primary" type="button" disabled={busy || saving || !chosen.length}
          onClick={() => void confirmDrafts()}>Lưu {chosen.length}/{drafts.length} đoạn đã chọn</button>
      </div>
    </div>}
    {saveError && <p className="form-error" role="alert">{saveError}</p>}
    <ul className="timeline-list">{rows.map(({ entry, index }) => {
      const draft = isSpeechDraft(entry);
      const text = draftText.get(entry) ?? entry.text;
      const suggestion = draft && suggestShopTerm(text, shopTerms);
      return <li key={index}>
      <button type="button" className="time-button" disabled={!playable} onClick={() => onJump(entry.start)}
        aria-label={`Phát từ ${timestamp(entry.start)}`}><CirclePlay size={15}/>{timestamp(entry.start)}</button>
      <div><small>{sourceLabels[entry.source]}{entry.corrected && <span className="corrected">Đã sửa tay</span>}
        {referenceOnly(entry) && <span className="low-confidence">Độ tin cậy thấp</span>}</small><p>{text}</p>
        {draft && <div className="draft-row-actions">
          <label><input type="checkbox" checked={!excluded.has(entry)} disabled={busy || saving}
            onChange={event => {
              const checked = event.target.checked;
              setExcluded(previous => {
                const next = new Set(previous);
                if (checked) next.delete(entry);
                else next.add(entry);
                return next;
              });
            }} aria-label={`Chọn lưu đoạn ${timestamp(entry.start)}`} /> Chọn lưu</label>
          {suggestion && <button className="text-button" type="button" disabled={busy || saving}
            onClick={() => setDraftText(previous => new Map(previous).set(entry, suggestion.text))}>
            Sửa “{suggestion.from}” thành “{suggestion.to}”
          </button>}
          {draftText.has(entry) && <button className="text-button" type="button" disabled={busy || saving}
            onClick={() => setDraftText(previous => {
              const next = new Map(previous); next.delete(entry); return next;
            })}>Bỏ sửa gợi ý</button>}
        </div>}
      </div>
      <button type="button" className="icon-button" disabled={busy || saving} onClick={() => onEdit(index)}
        title={referenceOnly(entry) ? 'Kiểm tra đoạn' : 'Sửa đoạn'}
        aria-label={`${referenceOnly(entry) ? 'Kiểm tra đoạn' : 'Sửa đoạn'} ${timestamp(entry.start)} · ${sourceLabels[entry.source]}`}><Pencil size={15} /></button>
    </li>})}</ul>
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
    detail={row && referenceOnly(row) ? 'Kiểm tra đoạn gốc, chỉnh nội dung nếu cần rồi lưu để dùng khi đối chiếu.'
      : 'Báo cáo cập nhật ngay sau khi lưu đoạn.'} busy={busy} onClose={onClose}>
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
