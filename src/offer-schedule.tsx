import { ArrowRight, CalendarClock, FileText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ClipPlayer } from './dashboard';
import { money, offerKey, sourceLabels, timestamp } from './domain';
import type { Clip, Finding, Workspace } from './domain';
import { OfferBriefDialog } from './offer-brief-view';
import { offerTimeLabel } from './offer-brief';
import { milestoneTime, offerMilestones, previewMilestone, type OfferMilestone } from './offer-milestones';
import { parseVietnamTime } from './time';
import { ToolFindings } from './tool-findings';
import { Empty, Modal } from './ui';

function milestoneLabel(milestone: OfferMilestone) {
  const starts = milestone.changes.filter(item => item.type === 'start').length;
  const ends = milestone.changes.length - starts;
  return [offerTimeLabel(milestoneTime(milestone.at)), starts && `${starts} bắt đầu`, ends && `${ends} hết hạn`].filter(Boolean).join(' · ');
}

export function OfferSchedule({ workspace, busy, onOffers, onLibrary, onClip }: {
  workspace: Workspace; busy: boolean; onOffers: () => void; onLibrary: () => void; onClip: (clip: Clip) => void;
}) {
  const current = workspace.versions.at(-1);
  const milestones = useMemo(() => offerMilestones(current?.offers ?? []), [current]);
  const [now] = useState(() => workspace.demo ? parseVietnamTime(workspace.checkedAt) ?? Date.now() : Date.now());
  const [period, setPeriod] = useState<'future' | 'past'>(() => milestones.some(item => item.at >= now) ? 'future' : 'past');
  const [selection, setSelection] = useState('');
  const [brief, setBrief] = useState(false);
  const [evidence, setEvidence] = useState<{ clip: Clip; finding: Finding }>();
  const future = milestones.filter(item => item.at >= now);
  const past = milestones.filter(item => item.at < now).reverse();
  const choices = period === 'future' ? future : past;
  const selected = choices.find(item => String(item.at) === selection) ?? choices[0];
  const preview = useMemo(() => selected ? previewMilestone(workspace.clips, workspace.versions, selected) : undefined,
    [selected, workspace.clips, workspace.versions]);

  return <div className="tool-layout">
    <section className="panel tool-panel" aria-labelledby="milestones-title">
      <div className="panel-heading tool-heading">
        <div><h2 id="milestones-title">Mốc trong bảng ưu đãi {current && `v${workspace.versions.length}`}</h2>
          <p>Thời gian hiển thị theo giờ Việt Nam. {workspace.demo && 'Lịch mẫu tính từ ngày rà của không gian mẫu.'}</p></div>
        {current?.offers.length ? <button className="button secondary" type="button" disabled={busy} onClick={() => setBrief(true)}>
          <FileText size={16} aria-hidden="true" /> Tạo phiếu cho KOC
        </button> : null}
      </div>
      {milestones.length ? <div className="tool-body">
        <div className="milestone-controls">
          <div className="segmented" role="group" aria-label="Khoảng thời gian">
            <button type="button" className={period === 'future' ? 'active' : ''} aria-pressed={period === 'future'}
              onClick={() => { setPeriod('future'); setSelection(''); }}>Sắp tới <span>{future.length}</span></button>
            <button type="button" className={period === 'past' ? 'active' : ''} aria-pressed={period === 'past'}
              onClick={() => { setPeriod('past'); setSelection(''); }}>Đã qua <span>{past.length}</span></button>
          </div>
          {selected && <label className="stack-field tool-select">Mốc ưu đãi
            <select value={selected.at} onChange={event => setSelection(event.target.value)}>
              {choices.map(item => <option key={item.at} value={item.at}>{milestoneLabel(item)}</option>)}
            </select>
          </label>}
        </div>
        {selected ? <ul className="milestone-items" aria-label="Ưu đãi thay đổi" tabIndex={0}>
          {selected.changes.map(({ offer, type }) => <li key={offerKey(offer) + type}>
            <span className={`milestone-state ${type}`}>{type === 'start' ? 'Bắt đầu' : 'Hết hạn'}</span>
            <div><strong>{offer.name || offer.sku}</strong><small>{[
              offer.name && offer.sku, offer.code, offer.price !== null && money(offer.price), offer.gift && `Quà ${offer.gift}`, offer.condition,
            ].filter(Boolean).join(' · ')}</small></div>
          </li>)}
        </ul> : <p className="empty-inline">{period === 'future' ? 'Chưa có mốc ưu đãi sắp tới trong bảng hiện tại.' : 'Chưa có mốc đã qua trong bảng hiện tại.'}</p>}
      </div> : <Empty title={current ? 'Bảng chưa có mốc thời hạn' : 'Chưa có bảng ưu đãi'}
        detail={current ? 'Thêm ngày bắt đầu hoặc kết thúc cho một ưu đãi để xem mốc.' : 'Nhập bảng ưu đãi của shop để xem lịch và video liên quan.'}>
        <button type="button" className="button secondary" onClick={onOffers}>Tới bảng ưu đãi <ArrowRight size={16} aria-hidden="true" /></button>
      </Empty>}
    </section>
    {preview && selected && <section className="panel tool-panel" aria-labelledby="milestone-preview">
      <div className="panel-heading tool-heading"><div><h2 id="milestone-preview"><CalendarClock size={19} aria-hidden="true" /> Ảnh hưởng tới video</h2>
        <p>Đối chiếu ngay trước và ngay sau mốc bằng bảng v{workspace.versions.length} và video hiện có.</p></div></div>
      <div className="tool-body">
        <p className="tool-summary" role="status">{preview.count} video cùng SKU · {preview.raised.length} có cảnh báo mới hoặc đổi · {preview.cleared.length} hết cảnh báo · {preview.missing.length} chưa đủ đoạn trích</p>
        {preview.raised.length ? <div className="milestone-results">
          {preview.raised.map(({ clip, findings }) => <article key={clip.id}>
            <h3>{clip.title}</h3><p className="hint-text">{[clip.sku, clip.creator].filter(Boolean).join(' · ')}</p>
            <ToolFindings findings={findings} onEvidence={finding => setEvidence({ clip, finding })} />
          </article>)}
        </div> : <p className="empty-inline">{preview.count ? 'Chưa tìm được cảnh báo mới hoặc đổi ở mốc này.' : 'Kho chưa có video gắn với các mã sản phẩm tại mốc này.'}</p>}
        {([
          ['Video hết cảnh báo', preview.cleared],
          ['Video chưa đủ đoạn trích để đối chiếu', preview.missing],
        ] as const).map(([label, clips]) => clips.length > 0 && <details className="tool-details" key={label}>
          <summary>{label} ({clips.length})</summary>
          <ul>{clips.map(clip => <li key={clip.id}><button className="text-button" type="button" onClick={() => onClip(clip)}>
            {clip.title} <ArrowRight size={14} aria-hidden="true" />
          </button></li>)}</ul>
        </details>)}
        {!preview.count && <button className="button secondary" type="button" onClick={onLibrary}>Mở kho video <ArrowRight size={16} aria-hidden="true" /></button>}
      </div>
    </section>}
    {current?.offers.length && brief ? <OfferBriefDialog offers={current.offers} version={workspace.versions.length}
      onClose={() => setBrief(false)} /> : null}
    {evidence && <Modal title={evidence.clip.title} detail="Đoạn gốc của lần xem trước." onClose={() => setEvidence(undefined)}>
      <div className="dialog-form">
        <ClipPlayer clip={evidence.clip} jump={evidence.finding.evidence ? { time: evidence.finding.evidence.start, tick: 0 } : null} />
        {evidence.finding.evidence && <div className="tool-quote">
          <strong>{timestamp(evidence.finding.evidence.start)} · {sourceLabels[evidence.finding.evidence.source]}</strong>
          <blockquote>{evidence.finding.evidence.text}</blockquote>
        </div>}
      </div>
    </Modal>}
  </div>;
}
