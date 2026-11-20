import { ArrowDownToLine, FileText, Film, LoaderCircle, ScanLine } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { auditDraft, validateOffers } from './audit';
import { completeScan, failScan } from './batch';
import { ClipPlayer } from './dashboard';
import { displayDateTime, localTime } from './domain';
import type { Audit, Clip, Evidence, Offer } from './domain';
import { auditCsv, download, readPrice, readSubtitles } from './files';
import { analyzeVideo, validateVideo, videoMetadata, type ScanOptions } from './media';
import { readOfferBrief } from './offer-brief';
import { dateInput } from './time';
import { ToolFindings } from './tool-findings';

type OfferInput = Omit<Offer, 'price'> & { price: string };
const emptyOffer: OfferInput = { sku: '', name: '', code: '', price: '', gift: '', start: '', end: '', condition: '' };
const sampleOffer = {
  sku: 'GIAY-6', name: 'Combo 6 gói khăn giấy', price: '129k', code: 'COMBO129', gift: '',
  start: '12/12/2026', end: '12/12/2026', condition: 'khi mua 6 gói',
};

function draftEvidence(input: string, source: Evidence['source']): Evidence[] {
  const text = input.trim();
  if (!text) return [];
  if (source === 'subtitle' || /^WEBVTT(?:\s|$)/.test(text) || text.includes('-->') || /^\s*\[?(?:\d+:)?\d{1,2}:\d{2}\b/m.test(text)) {
    return readSubtitles(text, source);
  }
  return [{ start: 0, end: null, text, source, untimed: true }];
}

export function QuickCheck() {
  const [draft, setDraft] = useState(emptyOffer);
  const [checkedAt, setCheckedAt] = useState(localTime);
  const [subtitles, setSubtitles] = useState('');
  const [subSource, setSubSource] = useState<Evidence['source']>('manual');
  const [video, setVideo] = useState<File>();
  const [scan, setScan] = useState<ScanOptions>({ frame: true, audio: false });
  const [result, setResult] = useState<{ clip: Clip; audit: Audit; playable: boolean }>();
  const [jump, setJump] = useState<{ time: number; tick: number } | null>(null);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [reading, setReading] = useState(false);
  const active = useRef<AbortController | null>(null);
  const resultTitle = useRef<HTMLHeadingElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const running = reading || !!progress;
  const cachedScan = useRef<{ video: File; audio: boolean; frame: boolean; value: Awaited<ReturnType<typeof analyzeVideo>> }>(undefined);

  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    if (!result) return;
    resultTitle.current?.focus({ preventScroll: true });
    resultTitle.current?.scrollIntoView({ block: 'start' });
  }, [result]);

  function resetResult() {
    setResult(undefined);
    setJump(null);
    setError('');
  }
  function setField(field: keyof OfferInput, value: string) {
    resetResult();
    setDraft(current => ({ ...current, [field]: value }));
  }
  function sample() {
    resetResult();
    setSourceName('');
    setVideo(undefined);
    if (videoInput.current) videoInput.current.value = '';
    cachedScan.current = undefined;
    setDraft(sampleOffer);
    setCheckedAt('2026-12-12T10:00');
    setSubSource('manual');
    setSubtitles('00:02 Đây là combo 6 gói khăn giấy.\n00:05 Còn 99k khi áp mã COMBO129 khi mua 6 gói.');
  }
  async function importBrief(file: File) {
    setError('');
    setReading(true);
    try {
      const offer = await readOfferBrief(file);
      resetResult();
      setDraft({ ...offer, price: String(offer.price ?? '') });
      setSourceName(file.name);
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'Chưa đọc được phiếu ưu đãi.'); }
    finally { setReading(false); }
  }
  async function importSubtitles(file: File) {
    setError('');
    setReading(true);
    try {
      if (file.size > 80_000) throw Error('Phụ đề vượt quá 80 KB.');
      const content = await file.text();
      const source = /\.txt$/i.test(file.name) ? 'manual' : 'subtitle';
      if (!draftEvidence(content, source).length) throw Error('Tệp phụ đề hoặc kịch bản đang trống.');
      resetResult();
      setSubSource(source);
      setSubtitles(content);
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'Chưa đọc được phụ đề.'); }
    finally { setReading(false); }
  }

  async function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current || running) return;
    resetResult();
    const controller = new AbortController();
    active.current = controller;
    const { signal } = controller;
    try {
      const [offer] = validateOffers([{ ...draft, sku: draft.sku.trim() || 'BAN-NHAP', price: readPrice(draft.price),
        start: dateInput(draft.start), end: dateInput(draft.end, true) }]);
      const evidence = draftEvidence(subtitles, subSource);
      const wantsScan = video && (scan.frame || scan.audio);
      if (!evidence.length && !wantsScan) throw Error('Thêm kịch bản, phụ đề hoặc chọn nguồn quét cho file video.');
      let clip: Clip = {
        id: 'quick', title: offer.name || video?.name || 'Bản nháp', sku: offer.sku, link: '',
        published: checkedAt.slice(0, 10), evidence, localMedia: false,
      };
      let playable = false;
      if (video) {
        setProgress('Đang mở video…');
        try {
          if (wantsScan) {
            const saved = cachedScan.current;
            const sameSource = saved?.video === video && saved.audio === scan.audio && saved.frame === scan.frame;
            const analysis = sameSource ? saved.value : await analyzeVideo(video, scan, setProgress, signal);
            signal.throwIfAborted();
            if (Object.values(analysis.sources).every(outcome => outcome.state === 'done')) {
              cachedScan.current = { video, ...scan, value: analysis };
            }
            clip = completeScan(clip, scan, analysis);
          } else {
            const media = await videoMetadata(video, signal);
            media.release();
          }
          playable = true;
        } catch (issue) {
          signal.throwIfAborted();
          if (!evidence.length) throw issue;
          const reason = issue instanceof Error ? issue.message : 'Chưa đọc được video.';
          clip = failScan(clip, scan, `${reason} Kết quả dựa trên phụ đề hoặc kịch bản đã nhập.`);
        }
      }
      signal.throwIfAborted();
      const audit = auditDraft(clip, offer, checkedAt);
      setResult({ clip, audit, playable });
    } catch (issue) {
      const message = signal.aborted ? 'Đã dừng lượt kiểm.' : issue instanceof Error ? issue.message : 'Chưa kiểm được bản nháp.';
      setError(message.replace(/^Dòng 1: /, ''));
    } finally {
      active.current = null;
      setProgress('');
    }
  }

  const findings = result?.audit.results[0].findings ?? [];
  const attention = findings.filter(row => row.verdict === 'action' || row.verdict === 'review').length;
  return <div className="tool-layout">
    <form className="panel quick-form" onSubmit={event => void check(event)}>
      <div className="panel-heading tool-heading">
        <div><h2>Video và thông tin ưu đãi</h2><p>Lần kiểm này dùng riêng trên trang này. Bạn có thể tải kết quả để lưu.</p></div>
        <button className="button secondary" type="button" onClick={sample} disabled={running}>Điền kịch bản mẫu</button>
      </div>
      <div className="quick-fields">
        <fieldset className="clip-fields tool-fields" disabled={running}>
          <legend>Nội dung của bạn</legend>
          <div className="tool-upload">
            <label className="button secondary file-button">
              <Film size={16} aria-hidden="true" /> Chọn video
              <input ref={videoInput} className="sr-only" type="file" accept=".mp4,.webm,.m4v,.mov,video/mp4,video/webm,video/quicktime"
                onChange={event => {
                  const file = event.target.files?.[0];
                  resetResult();
                  setVideo(undefined);
                  cachedScan.current = undefined;
                  if (file) try { validateVideo(file); setVideo(file); }
                  catch (issue) { setError((issue as Error).message); event.target.value = ''; }
                }} />
            </label>
            {video ? <><span>{video.name}</span><button type="button" className="text-button" onClick={() => {
              resetResult(); setVideo(undefined); cachedScan.current = undefined;
              if (videoInput.current) videoInput.current.value = '';
            }}>Bỏ file</button></> : <span>MP4, WebM, M4V, MOV · tối đa 2 phút và 150 MB</span>}
          </div>
          {video && <div className="scan-options" role="group" aria-label="Nguồn quét">
            <label><input type="checkbox" checked={scan.frame} onChange={event => { resetResult(); setScan({ ...scan, frame: event.target.checked }); }} /> Quét chữ trên video</label>
            <label><input type="checkbox" checked={scan.audio} onChange={event => { resetResult(); setScan({ ...scan, audio: event.target.checked }); }} /> Đọc lời thoại</label>
            <small>Đọc lời thoại lần đầu cần tải mô hình khoảng 80 MB.</small>
          </div>}
          <label className="stack-field">Kịch bản hoặc phụ đề
            <textarea rows={6} maxLength={80_000} value={subtitles} placeholder="00:05 Còn 129k khi áp mã COMBO129."
              onChange={event => { resetResult(); setSubSource('manual'); setSubtitles(event.target.value); }} />
          </label>
          <div className="tool-upload">
            <label className="button secondary file-button"><FileText size={16} aria-hidden="true" /> Mở phụ đề
              <input className="sr-only" type="file" accept=".srt,.vtt,.txt" onChange={event => {
                const file = event.target.files?.[0]; event.target.value = '';
                if (file) void importSubtitles(file);
              }} />
            </label>
            <span>Dán kịch bản trực tiếp hoặc mở phụ đề SRT, VTT, TXT.</span>
          </div>
          <label className="stack-field">Dự kiến đăng (giờ Việt Nam)
            <input type="datetime-local" required value={checkedAt} onChange={event => { resetResult(); setCheckedAt(event.target.value); }} />
          </label>
        </fieldset>
        <fieldset className="clip-fields tool-fields" disabled={running}>
          <legend>Ưu đãi shop xác nhận</legend>
          <div className="tool-upload">
            <label className="button secondary file-button"><FileText size={16} aria-hidden="true" /> Mở phiếu ưu đãi
              <input className="sr-only" type="file" accept=".json,application/json" onChange={event => {
                const file = event.target.files?.[0]; event.target.value = '';
                if (file) void importBrief(file);
              }} />
            </label>
            {sourceName && <span role="status">Đã mở {sourceName}</span>}
          </div>
          <p className="hint-text">Điền giá áp dụng, mã hoặc quà tặng. Ghi kèm điều kiện nếu chỉ một số đơn đủ điều kiện.</p>
          <div className="form-grid">
            <label>Giá áp dụng (đ)<input inputMode="text" maxLength={25} placeholder="129k" value={draft.price} onChange={event => setField('price', event.target.value)} /></label>
            <label>Mã voucher<input maxLength={40} value={draft.code} onChange={event => setField('code', event.target.value)} /></label>
            <label>Tên sản phẩm<input maxLength={180} value={draft.name} onChange={event => setField('name', event.target.value)} /></label>
            <label>Mã sản phẩm (SKU)<input maxLength={100} value={draft.sku} onChange={event => setField('sku', event.target.value)} /></label>
            <label>Bắt đầu<input value={draft.start} maxLength={25} placeholder="12/12/2026 00:00" onChange={event => setField('start', event.target.value)} /></label>
            <label>Đến hết<input value={draft.end} maxLength={25} placeholder="12/12/2026 23:59" onChange={event => setField('end', event.target.value)} /></label>
          </div>
          <p className="hint-text">Ngày dùng giờ Việt Nam. Chỉ điền ngày nếu áp dụng cả ngày.</p>
          <label className="stack-field">Quà tặng<input value={draft.gift} maxLength={300} onChange={event => setField('gift', event.target.value)} /></label>
          <label className="stack-field">Điều kiện<textarea rows={2} value={draft.condition} maxLength={800}
            placeholder="Ví dụ đơn từ 199k hoặc khi mua 6 gói" onChange={event => setField('condition', event.target.value)} /></label>
        </fieldset>
      </div>
      <div className="tool-foot">
        {error && <p className="form-error" role="alert">{error}</p>}
        {progress && <p className="progress-message" role="status"><LoaderCircle size={15} className="spin" aria-hidden="true" /> {progress}</p>}
        <div>
          {progress && <button type="button" className="button secondary" onClick={() => active.current?.abort()}>Dừng quét</button>}
          <button type="submit" className="button primary" disabled={running}><ScanLine size={17} aria-hidden="true" /> Kiểm bản nháp</button>
        </div>
      </div>
    </form>
    {result && <section className="panel tool-panel" aria-labelledby="quick-result">
      <div className="panel-heading tool-heading">
        <div><h2 id="quick-result" ref={resultTitle} tabIndex={-1}>Kết quả kiểm bản nháp</h2>
          <p>{attention} mục cần xem lại · Dự kiến đăng {displayDateTime(result.audit.checkedAt)}</p></div>
        <button type="button" className="button secondary" onClick={() => download(auditCsv(result.audit, [result.clip], {}), 'ra-clip-ban-nhap.csv')}>
          <ArrowDownToLine size={16} aria-hidden="true" /> Tải kết quả
        </button>
      </div>
      <div className={result.playable ? 'quick-results with-player' : 'quick-results'}>
        {result.playable && <ClipPlayer clip={result.clip} jump={jump} file={video} />}
        <div>
          {result.clip.lastScan?.detail && <p className="hint-text quick-scan-detail">{result.clip.lastScan.detail}</p>}
          <ToolFindings findings={findings} onEvidence={result.playable ? row => {
            if (row.evidence) setJump(current => ({ time: row.evidence!.start, tick: (current?.tick ?? 0) + 1 }));
          } : undefined} />
        </div>
      </div>
    </section>}
  </div>;
}
