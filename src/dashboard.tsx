import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine, ArrowUpRight, CalendarClock, ChevronRight, CirclePlay, FileVideo,
  Film, Link2, ListChecks, Pencil, ScanLine, Search, Trash2,
} from 'lucide-react';
import { fold } from './claims';
import { clipFormats, kindLabels, reviewLabels, sourceLabels, timestamp, verdictLabels } from './domain';
import type { Clip, ClipFormat, ClipResult, Finding, Review, Verdict } from './domain';
import { loadMedia } from './storage';
import { demoAsset } from './demo';
import { EvidenceTimeline } from './evidence';
import { leadVerdict, verdicts } from './workflow';
import { ClipGlyph, Empty, FindingReason, Tag, verdictIcons } from './ui';

export function Metrics({ results, filter, onFilter }: {
  results: ClipResult[]; filter: Verdict | 'all'; onFilter: (value: Verdict | 'all') => void;
}) {
  const tally = Object.fromEntries(verdicts.map(verdict => [verdict, results.filter(row => leadVerdict(row.findings) === verdict).length]));
  return <div className="metrics" aria-label="Tổng hợp kết quả">
    {verdicts.map(verdict => {
      const Icon = verdictIcons[verdict];
      return <button className={`metric ${verdict} ${filter === verdict ? 'chosen' : ''}`} key={verdict}
        aria-pressed={filter === verdict} onClick={() => onFilter(filter === verdict ? 'all' : verdict)}>
        <span className="metric-caption"><span className="metric-icon"><Icon size={17} strokeWidth={2} /></span>
          {verdictLabels[verdict]}</span>
        <span className="metric-bottom"><strong>{tally[verdict]}</strong><span>video</span><ArrowUpRight size={16} /></span>
      </button>;
    })}
  </div>;
}

export function ClipList({ clips, results, filter, selected, onSelect, onAdd, library, ready }: {
  clips: Clip[]; results: Map<string, ClipResult>; filter: Verdict | 'all'; selected: string;
  onSelect: (id: string) => void; onAdd: () => void; library?: boolean; ready: boolean;
}) {
  const [query, setQuery] = useState('');
  const [format, setFormat] = useState<ClipFormat | 'all' | 'unset'>('all');
  const search = fold(query.trim());
  const entries = clips.filter(clip => {
    if (search && !fold(`${clip.title} ${clip.sku} ${clip.format ? clipFormats[clip.format] : ''}`).includes(search)) return false;
    if (library && format !== 'all' && (clip.format ?? 'unset') !== format) return false;
    return library || filter === 'all' || leadVerdict(results.get(clip.id)?.findings ?? []) === filter;
  });
  return <section className="panel list-panel">
    <div className="panel-heading">
      <div><h2>{library ? 'Kho video' : 'Kết quả rà soát'}</h2>
        <p>{entries.length === clips.length ? `${clips.length} video` : `${entries.length} / ${clips.length} video`}</p>
      </div>
      <div className="list-tools">
        {library && <select aria-label="Lọc kiểu video" value={format} onChange={event => setFormat(event.target.value as typeof format)}>
          <option value="all">Mọi kiểu video</option>
          {Object.entries(clipFormats).map(([key, value]) => <option value={key} key={key}>{value}</option>)}
          <option value="unset">Chưa chọn kiểu</option>
        </select>}
        <label className="search-box"><Search size={17} /><input aria-label="Tìm video" placeholder="Tìm video…" value={query}
          onChange={event => setQuery(event.target.value)} /></label>
      </div>
    </div>
    {entries.length ? <>
      <div className="list-labels"><span>Video</span><span>Kết quả</span></div>
      <div className="clip-list">{entries.map(clip => {
        const findings = results.get(clip.id)?.findings ?? [];
        const verdict = leadVerdict(findings);
        const hits = findings.filter(row => row.verdict === 'action').length;
        return <button type="button" className={`clip-row ${selected === clip.id ? 'selected' : ''}`} key={clip.id}
          aria-pressed={selected === clip.id} onClick={() => onSelect(clip.id)}>
          <span className="row-main"><ClipGlyph clip={clip} /><span className="row-title">
            <strong>{clip.title}</strong><small>{clip.sku || 'Chưa gán SKU'}{clip.format ? ' · ' + clipFormats[clip.format] : ''}</small></span></span>
          <span className="row-status">{ready && verdict ? <Tag verdict={verdict} /> : <span className="unscanned">Chờ rà</span>}
            {hits > 1 && <small className="hits">{hits} dấu hiệu</small>}
          </span>
          <ChevronRight className="row-arrow" size={16} />
        </button>;
      })}</div>
    </> : clips.length ? <Empty title="Không tìm thấy video" detail="Đổi từ khóa hoặc bộ lọc để xem kết quả khác." />
      : <Empty title="Kho video đang trống" detail="Thêm clip hoặc phụ đề để bắt đầu đối chiếu.">
        <button onClick={onAdd} className="button secondary">Thêm video</button>
      </Empty>}
  </section>;
}

function ClipPlayer({ clip, jump }: { clip: Clip; jump: { time: number; tick: number } | null }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  const jumpTime = jump?.time;
  const fixture = demoAsset(clip);

  useEffect(() => {
    let objectUrl = '';
    let disposed = false;
    setUrl('');
    setFailed(false);
    if (fixture) setUrl(`${fixture}.webm`);
    if (clip.localMedia) {
      void loadMedia(clip.id).then(blob => {
        if (disposed) return;
        if (blob) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }
        else setFailed(true);
      }).catch(() => { if (!disposed) setFailed(true); });
    }
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [clip.id, fixture, clip.localMedia, clip.mediaRevision]);

  function seek(video: HTMLVideoElement) {
    if (jumpTime !== undefined && Number.isFinite(video.duration)) {
      video.currentTime = Math.min(jumpTime, Math.max(0, video.duration - 0.01));
    }
  }

  useEffect(() => {
    if (ref.current) seek(ref.current);
  }, [jump?.tick]);

  return <div className="player">
    {url && !failed ? <video key={url} ref={ref} src={url} controls playsInline preload="metadata"
      poster={fixture ? `${fixture}.webp` : undefined}
      onError={() => setFailed(true)} onLoadedMetadata={event => seek(event.currentTarget)} aria-label={`Phát ${clip.title}`}>
        {fixture && <track kind="captions" label="Tiếng Việt" srcLang="vi" src={`${fixture}.vtt`} />}
      </video>
      : <div className="player-placeholder"><Film size={26} /><span>{failed ? 'Video không mở được' :
        (clip.localMedia || clip.demoMedia) ? 'Đang mở video…' : 'Clip chưa có file phát'}</span>
        {clip.link && <a href={clip.link} target="_blank" rel="noopener noreferrer"><Link2 size={14} /> Mở bài đăng</a>}
      </div>}
  </div>;
}

export function ClipDetail({ clip, result, focusedFinding, reviews, notes, onReview, onEdit, onDelete, onEvidence, onScan, busy }: {
  clip?: Clip; result?: ClipResult; focusedFinding: string; reviews: Record<string, Review>;
  notes?: Record<string, string>; onReview: (id: string, value: Review | '') => void;
  onEdit: (clip: Clip) => void; onDelete: (clip: Clip) => void; onScan: (clip: Clip) => void; busy: boolean;
  onEvidence: (clip: Clip, index: number | null) => void;
}) {
  const [tab, setTab] = useState<'results' | 'segments'>('results');
  const [findingId, setFinding] = useState(focusedFinding);
  const [jump, setJump] = useState<{ time: number; tick: number } | null>(() => {
    const evidence = result?.findings.find(row => row.id === focusedFinding)?.evidence;
    return evidence ? { time: evidence.start, tick: 0 } : null;
  });
  if (!clip) return <section className="panel detail-panel">
    <div className="panel-heading"><div><h2>Bằng chứng</h2></div></div>
    <Empty title="Chưa chọn video" detail="Chọn một video để xem từng đoạn phát hiện." />
  </section>;
  const findings = [...(result?.findings ?? [])].sort((a, b) =>
    verdicts.indexOf(a.verdict) - verdicts.indexOf(b.verdict) || (a.evidence?.start ?? 0) - (b.evidence?.start ?? 0));
  const active = findings.find(row => row.id === findingId) ?? findings[0];
  const activeReview = active ? reviews[active.id] : undefined;
  const playable = clip.localMedia || Boolean(clip.demoMedia);

  function jumpTo(time: number) {
    setJump(previous => ({ time, tick: (previous?.tick ?? 0) + 1 }));
  }

  function select(row: Finding) {
    setFinding(row.id);
    if (row.evidence) jumpTo(row.evidence.start);
  }

  return <section className="panel detail-panel" id="clip-evidence">
    <div className="panel-heading detail-header">
      <div><h2>Bằng chứng</h2><p title={clip.title}>{clip.title}</p></div>
      <div className="mini-actions">
        {clip.demoMedia && <a className="icon-button" href={`${demoAsset(clip)}.webm`} download
          title="Tải video mẫu" aria-label="Tải video mẫu"><ArrowDownToLine size={16} /></a>}
        {clip.link && <a className="icon-button" href={clip.link} target="_blank" rel="noopener noreferrer" title="Mở bài đăng" aria-label="Mở bài đăng"><ArrowUpRight size={17} /></a>}
        <button className="icon-button" onClick={() => onEdit(clip)} title="Sửa video" aria-label="Sửa video" disabled={busy}><Pencil size={16} /></button>
        <button className="icon-button" onClick={() => onDelete(clip)} title="Xóa video" aria-label="Xóa video" disabled={busy}><Trash2 size={16} /></button>
      </div>
    </div>
    <div className="detail-content">
      <ClipPlayer clip={clip} jump={jump} />
      {playable && <button className="text-button scan-video" type="button" onClick={() => onScan(clip)} disabled={busy}><ScanLine size={15} /> Phân tích video bằng AI</button>}
      <div className="segmented evidence-tabs" aria-label="Xem bằng chứng">
        <button type="button" className={tab === 'results' ? 'active' : ''} aria-pressed={tab === 'results'} onClick={() => setTab('results')}>Phát hiện</button>
        <button type="button" className={tab === 'segments' ? 'active' : ''} aria-pressed={tab === 'segments'} onClick={() => setTab('segments')}>Đoạn trích<span>{clip.evidence.length}</span></button>
      </div>
      {tab === 'segments' ? <EvidenceTimeline clip={clip} playable={playable} busy={busy}
        onJump={jumpTo} onEdit={index => onEvidence(clip, index)} /> : active ? <>
        <div className={`evidence-card ${active.verdict}`}>
          <div className="evidence-top"><Tag verdict={active.verdict} />
            {active.evidence && <button className="time-button" onClick={() => select(active)} title="Đến mốc trong video" disabled={!playable}>
              <CirclePlay size={15} /> {timestamp(active.evidence.start)}</button>}
          </div>
          {active.evidence && <blockquote>“{active.evidence.text}”</blockquote>}
          <p>{active.reason}</p>
          {active.reference && <div className="evidence-reference"><span>Bảng ưu đãi</span><strong>{active.reference}</strong></div>}
          {active.evidence && <p className="evidence-source">Nguồn · {sourceLabels[active.evidence.source]}</p>}
        </div>
        <label className="review-field"><span><ListChecks size={16} /> Phản hồi của shop</span>
          <select value={activeReview ?? ''} aria-label="Phản hồi của shop" disabled={busy}
            onChange={event => onReview(active.id, event.target.value as Review | '')}>
            <option value="">Chưa đánh dấu</option>
            {Object.entries(reviewLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
          </select>
        </label>
        {notes?.[active.id] && <p className="finding-note">{notes[active.id]}</p>}
        {findings.length > 1 && <div className="finding-list" aria-label="Các phát hiện trong video">
          {findings.map(row => <button type="button" key={row.id}
            aria-pressed={row.id === active.id} className={row.id === active.id ? 'active' : ''}
            onClick={() => select(row)}><FindingReason row={row} /></button>)}
        </div>}
      </> : <div className="no-evidence"><FileVideo size={19} /> Chạy rà soát để đối chiếu bằng chứng với bảng ưu đãi.</div>}
      <div className="clip-meta">
        <span>{clip.sku ? `SKU · ${clip.sku}` : 'Chưa gán SKU'}</span>
        <span><CalendarClock size={14} /> {clip.evidence.length} đoạn đã ghi nhận</span>
      </div>
    </div>
  </section>;
}
