import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine, ArrowLeft, ArrowUpRight, CalendarClock, ChevronRight, CirclePlay, FileVideo,
  Captions, Film, Link2, ListChecks, Pencil, ScanLine, Search, Trash2,
} from 'lucide-react';
import { fold, referenceOnly } from './claims';
import { clipFormats, kindLabels, reviewLabels, sourceLabels, timestamp, verdictLabels } from './domain';
import type { Clip, ClipFormat, ClipResult, Evidence, Finding, Review, Verdict } from './domain';
import { loadMedia } from './storage';
import { demoAsset } from './demo';
import { EvidenceFrame, EvidenceTimeline } from './evidence';
import { captionsFor } from './captions';
import { lastScanDetail, lastScanLabel } from './batch';
import { coverageHelp } from './audit';
import { filteredSpeech, isSpeechDraft, scanSourceDetail } from './evidence-quality';
import type { SpeechDraftEdit } from './workflow';
import type { ScanOptions } from './media';
import { numberLabel } from './catalog';
import { leadVerdict, verdicts } from './workflow';
import { ClipGlyph, Empty, FindingReason, Tag, verdictIcons } from './ui';

type EvidenceSource = Evidence['source'];

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

export type ClipFilters = { query: string; format: ClipFormat | 'all' | 'unset'; readiness: 'all' | 'sku' | 'evidence' | 'file' };
export const allClipFilters: ClipFilters = { query: '', format: 'all', readiness: 'all' };

export function visibleClips(clips: Clip[], results: Map<string, ClipResult>, verdict: Verdict | 'all', filters: ClipFilters) {
  const { query, format, readiness } = filters;
  const search = fold(query.trim());
  return clips.filter(clip => {
    if (search && !fold(`${clip.title} ${clip.sku} ${clip.creator ?? ''} ${clip.format ? clipFormats[clip.format] : ''}`).includes(search)) return false;
    if ((readiness === 'sku' && clip.sku) || (readiness === 'evidence' && clip.evidence.length)
      || (readiness === 'file' && (clip.localMedia || clip.demoMedia))) return false;
    if (format !== 'all' && (clip.format ?? 'unset') !== format) return false;
    return verdict === 'all' || leadVerdict(results.get(clip.id)?.findings ?? []) === verdict;
  });
}

export function ClipList({ entries, total, results, filters, onFilter, selected, onSelect, onAdd, library, ready }: {
  entries: Clip[]; total: number; results: Map<string, ClipResult>; filters: ClipFilters; onFilter: (value: ClipFilters) => void; selected: string;
  onSelect: (id: string) => void; onAdd: () => void; library?: boolean; ready: boolean;
}) {
  const { query, format, readiness } = filters;
  const searchInput = useRef<HTMLInputElement>(null);
  return <section className="panel list-panel">
    <div className="panel-heading">
      <div><h2 id="clip-list-heading" tabIndex={-1}>{library ? 'Danh sách video' : 'Kết quả rà soát'}</h2>
        <p role="status" aria-atomic="true">{entries.length === total ? `${total} video` : `${entries.length} / ${total} video`}</p>
      </div>
      <div className="list-tools">
        {library && <select aria-label="Lọc kiểu video" value={format}
          onChange={event => onFilter({ ...filters, format: event.target.value as ClipFilters['format'] })}>
          <option value="all">Mọi kiểu video</option>
          {Object.entries(clipFormats).map(([key, value]) => <option value={key} key={key}>{value}</option>)}
          <option value="unset">Chưa chọn kiểu</option>
        </select>}
        {library && <select aria-label="Lọc theo dữ liệu chuẩn bị" value={readiness}
          onChange={event => onFilter({ ...filters, readiness: event.target.value as ClipFilters['readiness'] })}>
          <option value="all">Mọi trạng thái dữ liệu</option><option value="sku">Chưa gán SKU</option>
          <option value="evidence">Chưa có bằng chứng</option><option value="file">Chưa có file video</option>
        </select>}
        <label className="search-box"><Search size={17} /><input ref={searchInput} aria-label="Tìm video" placeholder="Tìm video…" value={query}
          onChange={event => onFilter({ ...filters, query: event.target.value })} /></label>
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
            <strong>{clip.title}</strong><small>{clip.sku || 'Chưa gán SKU'}{clip.format ? ' · ' + clipFormats[clip.format] : ''}</small>
            {library && (clip.creator || clip.lastScan) && <small>{[clip.creator, clip.lastScan && lastScanLabel(clip)].filter(Boolean).join(' · ')}</small>}</span></span>
          <span className="row-status">{ready && verdict ? <Tag verdict={verdict} /> : <span className="unscanned">Chờ rà</span>}
            {hits > 1 && <small className="hits">{hits} dấu hiệu</small>}
          </span>
          <ChevronRight className="row-arrow" size={16} />
        </button>;
      })}</div>
    </> : total ? <Empty title="Không tìm thấy video" detail="Đổi từ khóa hoặc bộ lọc để xem kết quả khác.">
      {(query || format !== 'all' || readiness !== 'all') && <button className="button secondary" type="button"
        onClick={() => { onFilter(allClipFilters); searchInput.current?.focus(); }}>Xóa tìm kiếm và bộ lọc</button>}
    </Empty>
      : <Empty title="Kho video đang trống" detail="Thêm clip hoặc phụ đề để bắt đầu đối chiếu.">
        <button onClick={onAdd} className="button secondary">Thêm video</button>
      </Empty>}
  </section>;
}

export function ClipPlayer({ clip, jump, file }: { clip: Clip; jump: { time: number; tick: number } | null; file?: Blob }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  const [captionFile, setCaptionFile] = useState('');
  const [captions, setCaptions] = useState(() => {
    try { return localStorage.getItem('ra-clip-captions') === 'on'; }
    catch { return false; }
  });
  const ref = useRef<HTMLVideoElement>(null);
  const jumpTime = jump?.time;
  const fixture = demoAsset(clip);
  const transcript = useMemo(() => fixture ? '' : captionsFor(clip.evidence), [fixture, clip.evidence]);
  const trackUrl = fixture ? `${fixture}.vtt` : captionFile;

  useEffect(() => {
    if (!transcript) { setCaptionFile(''); return; }
    const track = URL.createObjectURL(new Blob([transcript], { type: 'text/vtt;charset=utf-8' }));
    setCaptionFile(track);
    return () => URL.revokeObjectURL(track);
  }, [transcript]);

  useEffect(() => {
    try { localStorage.setItem('ra-clip-captions', captions ? 'on' : 'off'); } catch { /* The current player remains usable. */ }
  }, [captions]);

  useEffect(() => {
    const track = ref.current?.textTracks[0];
    if (track) track.mode = captions ? 'showing' : 'hidden';
  }, [captions, trackUrl, url]);

  useEffect(() => {
    const tracks = ref.current?.textTracks;
    if (!tracks) return;
    const sync = () => { setCaptions(tracks[0]?.mode === 'showing'); };
    tracks.addEventListener('change', sync);
    return () => tracks.removeEventListener('change', sync);
  }, [trackUrl, url]);

  useEffect(() => {
    let objectUrl = '';
    let disposed = false;
    setUrl('');
    setFailed(false);
    if (file) {
      objectUrl = URL.createObjectURL(file);
      setUrl(objectUrl);
    } else if (fixture) setUrl(`${fixture}.webm`);
    else if (clip.localMedia) {
      void loadMedia(clip.id).then(blob => {
        if (disposed) return;
        if (blob) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }
        else setFailed(true);
      }).catch(() => { if (!disposed) setFailed(true); });
    }
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [clip.id, fixture, clip.localMedia, clip.mediaRevision, file]);

  function seek(video: HTMLVideoElement) {
    if (jumpTime !== undefined && Number.isFinite(video.duration)) {
      video.currentTime = Math.min(jumpTime, Math.max(0, video.duration - 0.01));
    }
  }

  useEffect(() => {
    if (ref.current) seek(ref.current);
  }, [jump?.tick]);

  return <div className="player-wrap"><div className="player">
    {url && !failed ? <video key={url} ref={ref} src={url} controls playsInline preload="metadata"
      poster={fixture ? `${fixture}.webp` : undefined}
      onError={() => setFailed(true)} onLoadedMetadata={event => seek(event.currentTarget)} aria-label={`Phát ${clip.title}`}>
        {trackUrl && <track key={trackUrl} kind="captions" label={fixture ? 'Tiếng Việt' : 'Tiếng Việt · đoạn trích'}
          srcLang="vi" src={trackUrl} onLoad={event => { event.currentTarget.track.mode = captions ? 'showing' : 'hidden'; }} />}
      </video>
      : <div className="player-placeholder"><Film size={26} /><span>{failed ? 'Video không mở được' :
        (file || clip.localMedia || clip.demoMedia) ? 'Đang mở video…' : 'Clip chưa có file phát'}</span>
        {clip.link && <a href={clip.link} target="_blank" rel="noopener noreferrer"><Link2 size={14} /> Mở bài đăng</a>}
      </div>}
  </div>
    {url && trackUrl && !failed && <button type="button" className="button secondary caption-toggle" aria-pressed={captions}
      onClick={() => setCaptions(value => !value)}><Captions size={17} /> Phụ đề</button>}
  </div>;
}

export function ClipDetail({ clip, result, focusedFinding, reviews, notes, onReview, onEdit, onDelete, onEvidence,
  onConfirmDrafts, onScan, onBack, onOffers, hasSku, shopTerms, busy }: {
  clip: Clip; result?: ClipResult; focusedFinding: string; reviews: Record<string, Review>;
  notes?: Record<string, string>; onReview: (id: string, value: Review | '') => void;
  onEdit: (clip: Clip, focusSubtitles?: boolean) => void; onDelete: (clip: Clip) => void; onScan: (clip: Clip, options?: ScanOptions) => void;
  onBack: () => void; onOffers: () => void; hasSku: boolean; busy: boolean;
  shopTerms: string[];
  onEvidence: (clip: Clip, index: number | null) => void;
  onConfirmDrafts: (clip: Clip, drafts: SpeechDraftEdit[]) => Promise<void>;
}) {
  const [tab, setTab] = useState<'results' | 'segments'>('results');
  const [segmentSource, setSegmentSource] = useState<'all' | EvidenceSource>('all');
  const [findingId, setFinding] = useState(focusedFinding);
  const [jump, setJump] = useState<{ time: number; tick: number } | null>(() => {
    const evidence = result?.findings.find(row => row.id === focusedFinding)?.evidence;
    return evidence ? { time: evidence.start, tick: 0 } : null;
  });
  const findings = [...(result?.findings ?? [])].sort((a, b) =>
    verdicts.indexOf(a.verdict) - verdicts.indexOf(b.verdict) || (a.evidence?.start ?? 0) - (b.evidence?.start ?? 0));
  const active = findings.find(row => row.id === findingId) ?? findings[0];
  const activeReview = active ? reviews[active.id] : undefined;
  const playable = clip.localMedia || Boolean(clip.demoMedia);
  const speechGap = filteredSpeech(clip);
  const hasSpeechDraft = clip.evidence.some(isSpeechDraft);
  const coverage = active && ((!hasSku && active.verdict === 'review') || (active.kind === 'coverage' && !active.evidence))
    ? coverageHelp(clip, hasSku) : undefined;
  const unclearEvidence = active?.kind === 'coverage' ? active.evidence : undefined;
  const unclearIndex = unclearEvidence ? clip.evidence.findIndex(row => row.source === unclearEvidence.source &&
    row.start === unclearEvidence.start && row.text === unclearEvidence.text) : -1;
  const sourceKeys = Object.keys(sourceLabels) as EvidenceSource[];

  function openSegments(source: 'all' | EvidenceSource = 'all') {
    setSegmentSource(source);
    setTab('segments');
    requestAnimationFrame(() => document.getElementById('timeline-heading')?.focus());
  }

  const step = coverage?.action ?? (unclearIndex >= 0 ? 'correct' : active?.reason.includes('ngày đăng') ? 'edit'
    : active?.reason.startsWith('Chưa đủ nội dung để đối chiếu thể lệ') ? 'segments' : 'offers');
  const nextAction = {
    sku: { label: clip.sku ? 'Gán lại mã sản phẩm' : 'Gán mã sản phẩm', run: () => onEdit(clip) },
    audio: { label: playable ? clip.lastScan?.audio || clip.lastScan?.sources?.audio ? 'Thử lại lời thoại' : 'Quét lời thoại' : 'Bổ sung phụ đề',
      run: () => playable ? onScan(clip, { audio: true, frame: false }) : onEdit(clip) },
    subtitles: { label: 'Thêm phụ đề hoặc lời thoại', run: () => onEdit(clip, true) },
    'audio-draft': { label: 'Xem lời thoại đọc lại', run: () => openSegments('audio') },
    segments: { label: 'Xem các đoạn đã đọc', run: () => openSegments() },
    scan: { label: 'Quét video này', run: () => onScan(clip) },
    correct: { label: 'Sửa đoạn lời thoại', run: () => onEvidence(clip, unclearIndex) },
    edit: { label: 'Sửa thông tin hoặc thêm phụ đề', run: () => onEdit(clip) },
    offers: { label: 'Kiểm tra bảng ưu đãi', run: onOffers },
  }[step];

  function jumpTo(time: number) {
    setJump(previous => ({ time, tick: (previous?.tick ?? 0) + 1 }));
  }

  function select(row: Finding) {
    setFinding(row.id);
    if (row.evidence) jumpTo(row.evidence.start);
  }

  return <section className="panel detail-panel" id="clip-evidence" tabIndex={-1} aria-label={`Bằng chứng video ${clip.title}`}>
    <button className="text-button back-to-clips" type="button" onClick={onBack}>
      <ArrowLeft size={16} aria-hidden="true" /> Về danh sách video
    </button>
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
      {!playable && clip.link && <button className="text-button scan-video" type="button" onClick={() => onEdit(clip)} disabled={busy}>
        <FileVideo size={15} aria-hidden="true" /> Gắn file video hoặc phụ đề
      </button>}
      {playable && <button className="text-button scan-video" type="button" onClick={() => onScan(clip)} disabled={busy}><ScanLine size={15} /> Phân tích video bằng AI</button>}
      {(speechGap || hasSpeechDraft && tab !== 'segments') &&
        (tab === 'segments' || coverage?.action !== 'subtitles' && coverage?.action !== 'audio-draft') && <div className="scan-guidance">
        {speechGap && <p>{speechGap}</p>}
        {hasSpeechDraft && tab !== 'segments' && <button type="button" className="text-button" onClick={() => openSegments('audio')}>Xem lời thoại đọc lại</button>}
        {speechGap && <button type="button" className="text-button" onClick={() => onEdit(clip, true)} disabled={busy}>Thêm phụ đề hoặc lời thoại</button>}
      </div>}
      <div className="segmented evidence-tabs" role="group" aria-label="Xem bằng chứng">
        <button type="button" className={tab === 'results' ? 'active' : ''} aria-pressed={tab === 'results'} onClick={() => setTab('results')}>Phát hiện</button>
        <button type="button" className={tab === 'segments' ? 'active' : ''} aria-pressed={tab === 'segments'} onClick={() => openSegments()}>Đoạn trích<span>{clip.evidence.length}</span></button>
      </div>
      {tab === 'segments' ? <EvidenceTimeline key={segmentSource} initialSource={segmentSource} clip={clip} playable={playable} busy={busy}
        shopTerms={shopTerms} onConfirmDrafts={drafts => onConfirmDrafts(clip, drafts)}
        onJump={jumpTo} onEdit={index => onEvidence(clip, index)} /> : active ? <>
        <div className={`evidence-card ${active.verdict}`}>
          <div className="evidence-top"><Tag verdict={active.verdict} />
            {active.evidence && (playable
              ? <button className="time-button" onClick={() => select(active)}><CirclePlay size={15} aria-hidden="true" /> Đến {timestamp(active.evidence.start)}</button>
              : <span className="small-time">{timestamp(active.evidence.start)}</span>)}
          </div>
          {active.evidence && <blockquote>“{active.evidence.text}”</blockquote>}
          <p>{coverage?.reason ?? active.reason}</p>
          {active.reference && <div className="evidence-reference"><span>Bảng ưu đãi</span><strong>{active.reference}</strong></div>}
          {active.evidence && <p className="evidence-source">Nguồn · {sourceLabels[active.evidence.source]}</p>}
          {playable && active.evidence?.source === 'frame' && <EvidenceFrame key={`${clip.mediaRevision ?? ''}:${active.evidence.start}`}
            clip={clip} seconds={active.evidence.start} onJump={() => select(active)} />}
          {active.verdict === 'review' && <button className="button secondary evidence-next" type="button" onClick={nextAction.run} disabled={busy}>
            {nextAction.label}</button>}
          {coverage?.action === 'audio-draft' && <button className="text-button evidence-next" type="button"
            onClick={() => onEdit(clip, true)} disabled={busy}>Thêm phụ đề hoặc lời thoại</button>}
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
      </> : <div className="no-evidence"><FileVideo size={19} aria-hidden="true" /> Kết quả sẽ xuất hiện khi có bảng ưu đãi.</div>}
      {(clip.creator || clip.stats) && <div className="clip-stats"><strong>Số liệu đã nhập</strong>
        {[clip.creator, clip.stats?.views === undefined ? '' : numberLabel(clip.stats.views) + ' lượt xem',
          clip.stats?.orders === undefined ? '' : numberLabel(clip.stats.orders) + ' đơn'].filter(Boolean).join(' · ')}</div>}
      {(playable || clip.lastScan || clip.evidence.length > 0) && <div className="clip-scan-summary">
        <strong>Nguồn bằng chứng</strong>
        <ul className="evidence-sources">{sourceKeys.map(source => {
          const entries = clip.evidence.filter(entry => entry.source === source);
          const count = entries.length;
          const drafts = entries.filter(referenceOnly).length;
          const outcome = source === 'audio' || source === 'frame' ? clip.lastScan?.sources?.[source] : undefined;
          if (!count && !outcome && source !== 'audio' && source !== 'frame') return null;
          return <li key={source}>
            {count ? <button type="button" className="text-button" onClick={() => openSegments(source)}>{sourceLabels[source]} · {count} đoạn</button>
              : <span>{sourceLabels[source]} · {outcome ? '0 đoạn giữ lại' : 'Chưa quét'}</span>}
            {drafts > 0 && <small>{drafts}/{count} đoạn độ tin cậy thấp</small>}
            {outcome && <small>{scanSourceDetail(clip, source as 'audio' | 'frame')}</small>}
          </li>;
        })}</ul>
        {clip.lastScan && !clip.lastScan.sources && <span>{lastScanDetail(clip)}</span>}
      </div>}
      <div className="clip-meta">
        <span>{clip.sku ? `SKU · ${clip.sku}` : 'Chưa gán SKU'}</span>
        <span><CalendarClock size={14} /> {clip.evidence.length} đoạn đã ghi nhận</span>
      </div>
    </div>
  </section>;
}
