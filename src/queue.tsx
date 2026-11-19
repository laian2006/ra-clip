import { ArrowDownToLine, ArrowUpRight, Check, ClipboardList, Search, StickyNote } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { fold } from './claims';
import { kindLabels, reviewLabels, timestamp } from './domain';
import type { Clip, Finding, Review, Workspace } from './domain';
import { auditCsv, download } from './files';
import { Modal, TableRegion, Tag } from './ui';
import { numberLabel } from './catalog';
import { queueEntries, reviewOpen } from './workflow';
import { coverageHelp } from './audit';

type QueueFilter = 'open' | 'done' | 'wrong' | 'all';
type QueueSort = 'severity' | 'orders' | 'views';
const filters: { value: QueueFilter; label: string }[] = [
  { value: 'open', label: 'Cần làm' }, { value: 'done', label: 'Đã xử lý' },
  { value: 'wrong', label: 'Báo nhầm' }, { value: 'all', label: 'Tất cả' },
];

export function QueueView({ workspace, busy, exportBlocked, onReview, onNote, onOpen }: {
  workspace: Workspace; busy: boolean; exportBlocked: boolean;
  onReview: (ids: string[], value: Review | '') => Promise<boolean>;
  onNote: (id: string, note: string) => Promise<void>;
  onOpen: (clip: Clip, finding: Finding) => void;
}) {
  const entries = useMemo(() => queueEntries(workspace), [workspace]);
  const knownSkus = new Set(workspace.versions.at(-1)?.offers.map(offer => offer.sku));
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<QueueFilter>('open');
  const [sort, setSort] = useState<QueueSort>('severity');
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const [noteFor, setNoteFor] = useState<string>();
  const [draft, setDraft] = useState('');
  const [noteError, setNoteError] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [updating, setUpdating] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const q = fold(query.trim());
  const state = (review: Review | undefined): QueueFilter => reviewOpen(review) ? 'open' : review === 'done' ? 'done' : 'wrong';
  const rows = entries.filter(({ clip, finding, note, review }) =>
    (filter === 'all' || state(review) === filter) &&
    fold(`${clip.title} ${clip.sku} ${clip.creator ?? ''} ${finding.claim} ${finding.reason} ${note}`).includes(q))
    .sort((a, b) => {
      if (sort !== 'severity') {
        const order = (b.clip.stats?.[sort] ?? -1) - (a.clip.stats?.[sort] ?? -1);
        if (order) return order;
      }
      return Number(b.finding.verdict === 'action') - Number(a.finding.verdict === 'action');
    });
  const selected = rows.filter(row => selection.has(row.finding.id));
  const selectedIds = selected.map(row => row.finding.id);
  const noteRow = entries.find(item => item.finding.id === noteFor);

  useEffect(() => { setSelection(new Set()); }, [filter, query]);

  function setChecked(id: string, checked: boolean) {
    setSelection(values => {
      const next = new Set(values);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function change(ids: string[], review: Review | '') {
    const opener = document.activeElement;
    setUpdating(true);
    try {
      if (await onReview(ids, review)) {
        setSelection(new Set());
        requestAnimationFrame(() => {
          if (!opener?.isConnected || document.activeElement === document.body) {
            filtersRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
          }
        });
      }
    } finally { setUpdating(false); }
  }

  async function saveNote(event: FormEvent) {
    event.preventDefault();
    if (!noteRow) return;
    setSavingNote(true);
    setNoteError('');
    try { await onNote(noteRow.finding.id, draft); setNoteFor(undefined); }
    catch (error) { setNoteError(error instanceof Error ? error.message : String(error)); }
    finally { setSavingNote(false); }
  }

  function exportRows() {
    if (!workspace.audit || exportBlocked) return;
    const ids = new Set(rows.map(row => row.finding.id));
    const audit = { ...workspace.audit, results: workspace.audit.results.map(result => ({
      ...result, findings: result.findings.filter(finding => ids.has(finding.id)),
    })) };
    download(auditCsv(audit, workspace.clips, workspace.reviews, workspace.notes), 'ra-clip-viec.csv');
  }

  return <section className="panel queue-panel">
    <div className="panel-heading ops-heading"><div><h2>Danh sách việc</h2><p>{entries.filter(row => reviewOpen(row.review)).length} việc đang mở</p></div>
      <button className="button secondary" type="button" disabled={!rows.length || exportBlocked} onClick={exportRows}
        aria-describedby={exportBlocked ? 'pending-audit' : undefined}><ArrowDownToLine size={16} /> Xuất danh sách</button>
    </div>
    <div className="ops-toolbar">
      <div className="segmented" ref={filtersRef} role="group" aria-label="Lọc theo tiến độ">
        {filters.map(option => <button type="button" aria-pressed={filter === option.value} className={filter === option.value ? 'active' : ''}
          key={option.value} onClick={() => setFilter(option.value)}>
          {option.label}<span>{option.value === 'all' ? entries.length : entries.filter(row => state(row.review) === option.value).length}</span>
        </button>)}
      </div>
      <div className="queue-controls">
        <label className="search-box"><Search size={16} /><input aria-label="Tìm việc" placeholder="Video, SKU, nhà sáng tạo…"
          value={query} onChange={event => setQuery(event.target.value)} /></label>
        <label className="sort-control"><span>Sắp xếp</span><select value={sort} onChange={event => setSort(event.target.value as QueueSort)}>
          <option value="severity">Mức cần xử lý</option><option value="orders">Nhiều đơn đã nhập</option><option value="views">Nhiều lượt xem đã nhập</option>
        </select></label>
      </div>
    </div>
    {selected.length > 0 && <div className="bulk-actions">
      <strong>Đã chọn {selected.length} việc</strong>
      <button type="button" className="button secondary" disabled={busy || updating} onClick={() => void change(selectedIds, 'wrong')}>Báo nhầm</button>
      <button type="button" className="button primary" disabled={busy || updating} onClick={() => void change(selectedIds, 'done')}><Check size={16} /> Đánh dấu đã xử lý</button>
    </div>}
    {rows.length ? <TableRegion label="Bảng danh sách việc. Có thể cuộn ngang nếu cần."><table className="queue-table">
      <thead><tr><th><input type="checkbox" aria-label="Chọn tất cả việc đang hiển thị" checked={selected.length === rows.length}
        disabled={busy || updating} onChange={event => setSelection(event.target.checked ? new Set(rows.map(row => row.finding.id)) : new Set())} /></th>
        <th scope="col">Video và dấu hiệu</th><th scope="col">Kết quả</th><th scope="col">Tiến độ</th><th scope="col">Ghi chú</th></tr></thead>
      <tbody>{rows.map(({ clip, finding, note, review }) => <tr key={finding.id}>
        <td><input type="checkbox" aria-label={`Chọn ${clip.title} · ${kindLabels[finding.kind]}`}
          checked={selection.has(finding.id)} disabled={busy || updating}
          onChange={event => setChecked(finding.id, event.target.checked)} /></td>
        <td className="queue-title">
          <button type="button" className="queue-link" onClick={() => onOpen(clip, finding)}>{clip.title}<ArrowUpRight size={14} /></button>
          <small>{clip.sku || 'Chưa gán SKU'} · {kindLabels[finding.kind]}{finding.evidence ? ' · ' + timestamp(finding.evidence.start) : ''}</small>
          {(clip.creator || clip.stats) && <small className="queue-stats">{[
            clip.creator, clip.stats?.orders === undefined ? '' : numberLabel(clip.stats.orders) + ' đơn',
            clip.stats?.views === undefined ? '' : numberLabel(clip.stats.views) + ' lượt xem',
          ].filter(Boolean).join(' · ')}</small>}
          <p>{finding.kind === 'coverage' && !finding.evidence ? coverageHelp(clip, knownSkus.has(clip.sku)).reason : finding.reason}</p>
        </td>
        <td><Tag verdict={finding.verdict} /><small>{finding.claim}</small></td>
        <td><select aria-label={`Tiến độ ${clip.title} · ${kindLabels[finding.kind]}`} value={review ?? ''}
          disabled={busy || updating} onChange={event => void change([finding.id], event.target.value as Review | '')}>
          <option value="">Chưa đánh dấu</option>
          {Object.entries(reviewLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select></td>
        <td><button type="button" className="note-button" disabled={busy || updating} onClick={() => {
          setNoteFor(finding.id); setDraft(note); setNoteError('');
        }}><StickyNote size={15} /><span>{note || 'Thêm ghi chú'}</span></button></td>
      </tr>)}</tbody>
    </table></TableRegion> : <div className="empty ops-empty"><ClipboardList size={30} /><strong>Chưa có việc trong bộ lọc này</strong>
      <p>{entries.length ? 'Đổi bộ lọc hoặc từ khóa để tìm việc.' : 'Kết quả cần xử lý hoặc xác nhận sẽ xuất hiện sau khi rà.'}</p></div>}
    {noteRow && <Modal title="Ghi chú xử lý" detail={noteRow.clip.title} busy={savingNote} onClose={() => setNoteFor(undefined)}>
      <form className="dialog-form" onSubmit={saveNote}>
        <label className="stack-field">Ghi chú<textarea rows={5} maxLength={500} value={draft} onChange={event => setDraft(event.target.value)}
          disabled={savingNote} placeholder="Ví dụ: Nhờ KOC cập nhật mô tả trước 17h." /></label>
        {noteError && <p className="form-error" role="alert">{noteError}</p>}
        <div className="dialog-actions"><button className="button secondary" type="button" onClick={() => setNoteFor(undefined)} disabled={savingNote}>Hủy</button>
          <button className="button primary" type="submit" disabled={savingNote}>Lưu ghi chú</button></div>
      </form>
    </Modal>}
  </section>;
}
