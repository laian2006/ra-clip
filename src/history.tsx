import { ArrowDownToLine, CalendarClock, CircleCheckBig, History, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { auditRulesVersion } from './audit';
import { displayDate, verdictLabels } from './domain';
import type { AuditSnapshot, Verdict } from './domain';
import { auditCsv, download } from './files';
import { snapshotDelta, triggerLabels, leadVerdict, verdicts } from './workflow';

function dateTime(value: string) {
  return `${displayDate(value)} · ${value.slice(11, 16)}`;
}

export function HistoryView({ snapshots, onReport }: { snapshots: AuditSnapshot[]; onReport: () => void }) {
  const [active, setActive] = useState('');
  const selected = snapshots.find(item => item.id === active) ?? snapshots.at(-1);
  const index = selected ? snapshots.indexOf(selected) : -1;
  if (!selected) return <section className="panel"><div className="empty ops-empty"><History size={30} />
    <strong>Chưa có lịch sử rà soát</strong><p>Một lần rà có video sẽ tạo bản báo cáo lưu tại đây.</p>
    <button className="button secondary" onClick={onReport}>Mở trang rà soát</button>
  </div></section>;
  const outcomes = new Map<Verdict, number>(verdicts.map(verdict => [verdict, 0]));
  selected.audit.results.forEach(row => {
    const verdict = leadVerdict(row.findings);
    if (verdict) outcomes.set(verdict, (outcomes.get(verdict) ?? 0) + 1);
  });
  const delta = snapshotDelta(snapshots[index - 1], selected);

  return <div className="history-grid">
    <aside className="panel">
      <div className="panel-heading"><div><h2>Các lần rà</h2><p>{snapshots.length} bản báo cáo</p></div><History size={19} /></div>
      <div className="run-list">{[...snapshots].reverse().map(item => <button type="button" key={item.id}
        className={item.id === selected.id ? 'active' : ''} aria-pressed={item.id === selected.id} onClick={() => setActive(item.id)}>
        <CalendarClock size={17} /><span><strong>{triggerLabels[item.trigger]}</strong>
          <small>{dateTime(item.recordedAt)} · v{item.versionNumber}</small></span>
      </button>)}</div>
    </aside>
    <section className="panel run-detail">
      <div className="panel-heading ops-heading"><div><h2>{triggerLabels[selected.trigger]}</h2>
        <p>Rà tại {dateTime(selected.audit.checkedAt)} (UTC+7) · Bảng v{selected.versionNumber}</p></div>
        <button className="button secondary" type="button" onClick={() => download(
          auditCsv(selected.audit, selected.clips, selected.reviews, selected.notes),
          `ra-clip-v${selected.versionNumber}-${selected.audit.checkedAt.slice(0, 10)}.csv`,
        )}><ArrowDownToLine size={16} /> Tải bản báo cáo</button>
      </div>
      <div className="run-body">
        {selected.audit.rulesVersion !== auditRulesVersion && <div className="history-rules">
          <p>Bản ghi này dùng quy tắc rà cũ. Xem báo cáo hiện tại khi cần xử lý cảnh báo.</p>
          <button type="button" className="text-button" onClick={onReport}>Xem báo cáo hiện tại</button>
        </div>}
        <dl className="run-metrics">{verdicts.map(verdict =>
          <div key={verdict} className={verdict}><dt>{verdictLabels[verdict]}</dt><dd>{outcomes.get(verdict)}</dd></div>)}</dl>
        <p className="history-caption">{selected.audit.refreshed.length} video được tính lại trong lần rà này.</p>
        {index > 0 && <div className="delta-columns">
          <div><h3><TriangleAlert size={17} /> Mới cần kiểm tra</h3>
            {delta.added.length ? <ul>{delta.added.map(clip => <li key={clip.id}>{clip.title}<small>{clip.sku}</small></li>)}</ul> : <p>Không có video mới.</p>}</div>
          <div><h3><CircleCheckBig size={17} /> Hết dấu hiệu cần kiểm tra</h3>
            {delta.cleared.length ? <ul>{delta.cleared.map(clip => <li key={clip.id}>{clip.title}<small>{clip.sku}</small></li>)}</ul> : <p>Không có video chuyển trạng thái.</p>}</div>
        </div>}
      </div>
    </section>
  </div>;
}
