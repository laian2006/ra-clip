import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine, ArrowRight, ArrowUpRight, BookOpen, CheckCircle2, ChevronDown, CircleAlert,
  CircleHelp, Clapperboard, ClipboardList, FileSpreadsheet, Film, FolderOpen, Github, History, LayoutDashboard, LoaderCircle,
  Plus, ScanLine, ShieldCheck, SwitchCamera, Upload, X,
} from 'lucide-react';
import { ClipDetail, ClipList, Metrics } from './dashboard';
import { CampaignManager } from './campaigns';
import { EvidenceDialog } from './evidence';
import { HistoryView } from './history';
import { QueueView } from './queue';
import { makeBackup, readBackup } from './backup';
import { CatalogDialog } from './catalog-dialog';
import { applyCatalog, planCatalog, tiktokId } from './catalog';
import { BatchDialog } from './batch-dialog';
import { analyzeStoredClip, failScan, scanReceipt, type BatchEvent } from './batch';
import {
  changeEvidence, leadVerdict, prepareWorkspace, queueEntries, recordAudit, reviewOpen, setFindingNote, setReviews, updatedReport,
} from './workflow';
import { ClipDialog, OfferDialog, type DraftClip } from './dialogs';
import { displayDate, localTime, verdictLabels } from './domain';
import type { Campaign, CampaignDraft, Clip, Evidence, Finding, Offer, Review, Verdict, Workspace } from './domain';
import { auditCsv, download, downloadBlob, importOffers } from './files';
import { analyzeVideo, videoMetadata, type ScanOptions } from './media';
import { emptyWorkspace, refreshDemo, sampleWorkspace } from './demo';
import { OffersView } from './offers';
import { createCampaign, listCampaigns, loadMedia, loadWorkspace, renameCampaign, saveWorkspace, type MediaChange } from './storage';
import { Brand, Modal } from './ui';

type Page = 'report' | 'queue' | 'clips' | 'offers' | 'history' | 'guide';
type Notice = { text: string; error?: boolean };
const pages = [
  { id: 'report', label: 'Rà soát', icon: LayoutDashboard },
  { id: 'queue', label: 'Việc cần làm', icon: ClipboardList },
  { id: 'clips', label: 'Kho video', icon: Film },
  { id: 'offers', label: 'Bảng ưu đãi', icon: FileSpreadsheet },
  { id: 'history', label: 'Nhật ký rà', icon: History },
  { id: 'guide', label: 'Hướng dẫn', icon: CircleHelp },
] as const;

const title: Record<Page, string> = {
  report: 'Rà soát video sau sale', queue: 'Việc cần làm', clips: 'Kho video',
  offers: 'Bảng ưu đãi', history: 'Nhật ký rà soát', guide: 'Hướng dẫn sử dụng',
};

const descriptions: Record<Page, string> = {
  report: 'Tìm lại những clip còn nhắc giá, voucher hoặc quà tặng cũ.',
  queue: 'Xác nhận kết quả, ghi chú và theo dõi các việc sau sale.',
  clips: 'Quản lý video, phụ đề và mã sản phẩm cần đối chiếu.',
  offers: 'So sánh giá, voucher, quà tặng và các SKU chịu ảnh hưởng.',
  history: 'Xem lại báo cáo từng lần rà và các clip đổi trạng thái.',
  guide: 'Từ bảng ưu đãi và clip gốc đến báo cáo có bằng chứng.',
};

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function Guide({ onOffers, onAdd }: { onOffers: () => void; onAdd: () => void }) {
  return <section className="panel guide-panel">
    <div className="guide-intro"><div className="guide-mark"><BookOpen size={25} /></div>
      <div><h2>Rà một đợt sale</h2><p>Rà Clip dùng bảng shop cung cấp làm dữ liệu đối chiếu.</p></div></div>
    <div className="guide-steps">
      <article><span className="guide-icon"><FileSpreadsheet size={22} /></span><div><h3>Chuẩn bị bảng ưu đãi</h3>
        <p>Tải mẫu CSV hoặc nhập Excel. Dùng cùng SKU cho video và bảng. Ghi cả giá thường, mã giảm, điều kiện và thời hạn theo giờ Việt Nam.</p>
        <button className="text-button" onClick={onOffers}>Mở bảng ưu đãi <ArrowRight size={15} /></button></div></article>
      <article><span className="guide-icon"><Clapperboard size={22} /></span><div><h3>Đưa video vào kho</h3>
        <p>Thêm file để đọc lời thoại và chữ trong hình, hoặc nhập phụ đề SRT / VTT. Với clip ghi “chỉ hôm nay”, điền ngày đăng để xác định thời hạn.</p>
        <button className="text-button" onClick={onAdd}>Thêm video <ArrowRight size={15} /></button></div></article>
      <article><span className="guide-icon"><ScanLine size={22} /></span><div><h3>Kiểm tra bằng chứng và xuất CSV</h3>
        <p>Chọn một mốc rà, mở từng cảnh báo, kiểm tra đoạn gốc và đánh dấu phản hồi. Lưu phiên bản ưu đãi mới để tìm lại các clip theo SKU đã thay đổi.</p></div></article>
    </div>
    <div className="guide-privacy"><ShieldCheck size={20} /><div><strong>Dữ liệu lưu trên trình duyệt này</strong>
      <p>Video được xử lý tại chỗ. Lần đầu phân tích cần mạng để tải mô hình. Lời thoại và chữ nhận dạng có thể sai hoặc bỏ sót. Báo cáo dùng để ưu tiên kiểm tra thủ công.</p></div></div>
  </section>;
}

export function App() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [active, setActive] = useState('demo');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [page, setPage] = useState<Page>('report');
  const [filter, setFilter] = useState<Verdict | 'all'>('all');
  const [selected, setSelected] = useState('');
  const [date, setDate] = useState('');
  const [dialog, setDialog] = useState<'clip' | 'offers' | 'delete' | 'campaigns' | 'evidence' | 'catalog' | 'batch' | null>(null);
  const [editing, setEditing] = useState<Clip>();
  const [evidenceIndex, setEvidenceIndex] = useState<number | null>(null);
  const [findingFocus, setFindingFocus] = useState('');
  const todo = useMemo(() => workspace ? queueEntries(workspace).filter(row => reviewOpen(row.review)).length : 0, [workspace]);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const cancel = useRef<AbortController | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const writing = useRef(false);
  const opening = useRef(false);
  const pageHeading = useRef<HTMLHeadingElement>(null);

  async function open(id: string) {
    if (writing.current || opening.current) throw Error('Chờ thao tác hiện tại trước khi chuyển chiến dịch.');
    opening.current = true;
    setBusy('Đang mở chiến dịch…');
    try {
      const nextCampaigns = await listCampaigns();
      const key = id === 'demo' || nextCampaigns.some(item => item.id === id) ? id : 'demo';
      const saved = await loadWorkspace(key);
      const data = prepareWorkspace(key === 'demo' ? refreshDemo(saved) : saved ?? emptyWorkspace());
      setActive(key);
      setCampaigns(nextCampaigns);
      setWorkspace(data);
      setDate(data.checkedAt);
      setPage('report');
      setFilter('all');
      setSelected(data.clips[0]?.id ?? '');
      setFindingFocus('');
      setNotice(null);
      try { window.localStorage.setItem('ra-clip-mode', key); } catch { /* Browser settings can block localStorage. */ }
    } finally { opening.current = false; setBusy(''); }
  }

  function openFromPage(id: string) {
    void open(id).catch(error => setNotice({ text: errorText(error), error: true }));
  }

  useEffect(() => {
    let key = 'demo';
    try { key = window.localStorage.getItem('ra-clip-mode') || 'demo'; }
    catch { /* The demo still works without remembering the selected campaign. */ }
    function blocked() {
      setNotice({ text: 'Đóng tab Rà Clip bản cũ để cập nhật dữ liệu trên trình duyệt.', error: true });
    }
    window.addEventListener('ra-clip-storage-blocked', blocked);
    void open(key).catch(error => {
      const data = prepareWorkspace(sampleWorkspace());
      setWorkspace(data);
      setDate(data.checkedAt);
      setNotice({ text: `Không mở được bộ nhớ trình duyệt. ${errorText(error)}`, error: true });
    });
    return () => window.removeEventListener('ra-clip-storage-blocked', blocked);
  }, []);

  async function persist(next: Workspace, media?: MediaChange[]) {
    if (writing.current) throw Error('Đang lưu thay đổi. Thử lại sau khi lưu xong.');
    writing.current = true;
    try {
      const saved = await saveWorkspace(active, next, media);
      setWorkspace(saved);
      if (active !== 'demo') {
        const current = saved.clips.length;
        const openItems = queueEntries(saved).filter(row => reviewOpen(row.review)).length;
        setCampaigns(items => items.map(item => item.id === active
          ? { ...item, updatedAt: localTime(), clipCount: current, todoCount: openItems } : item));
      }
      return saved;
    } finally { writing.current = false; }
  }

  function notify(text: string, error = false) { setNotice({ text, error }); }
  function startAdd() { setEditing(undefined); setDialog('clip'); }
  function go(next: Page) {
    setPage(next); setFilter('all'); setFindingFocus('');
    requestAnimationFrame(() => pageHeading.current?.focus());
  }
  function openFinding(clip: Clip, finding: Finding) {
    setPage('report'); setFilter('all'); setSelected(clip.id); setFindingFocus(finding.id);
    requestAnimationFrame(() => {
      const evidence = document.getElementById('clip-evidence');
      evidence?.focus({ preventScroll: true });
      evidence?.scrollIntoView({ block: 'nearest' });
    });
  }
  function startEvidence(clip: Clip, index: number | null) {
    setEditing(clip); setEvidenceIndex(index); setDialog('evidence');
  }
  function startEdit(clip: Clip) { setEditing(clip); setDialog('clip'); }
  function startDelete(clip: Clip) { setEditing(clip); setDialog('delete'); }
  function clearDialog() { setDialog(null); setEditing(undefined); }

  if (!workspace) return <div className="boot"><Brand /><p role="status">Đang mở Rà Clip…</p>
    {notice && <p className="form-error" role="alert">{notice.text}</p>}</div>;
  const data = workspace;
  const campaign = campaigns.find(item => item.id === active);
  const version = data.versions.at(-1);
  const results = data.audit?.results ?? [];
  const resultIndex = new Map(results.map(row => [row.clipId, row]));
  const availableClips = page === 'report' && filter !== 'all'
    ? data.clips.filter(clip => leadVerdict(resultIndex.get(clip.id)?.findings ?? []) === filter)
    : data.clips;
  const currentClip = availableClips.find(clip => clip.id === selected) ?? availableClips[0];
  const dateChanged = date !== data.checkedAt;
  const found = results.filter(row => leadVerdict(row.findings) === 'action').length;

  async function launchCampaign(id: string) {
    await open(id);
    clearDialog();
  }

  async function addCampaign(draft: CampaignDraft) {
    const created = await createCampaign(draft, emptyWorkspace());
    await launchCampaign(created.id);
    notify(`Đã tạo chiến dịch “${created.name}”.`);
  }

  async function changeCampaign(id: string, draft: CampaignDraft) {
    await renameCampaign(id, draft);
    setCampaigns(await listCampaigns());
  }

  async function exportCampaign(id: string) {
    const details = campaigns.find(item => item.id === id);
    if (!details) throw Error('Không tìm thấy thông tin chiến dịch.');
    const saved = await loadWorkspace(id) ?? emptyWorkspace();
    const file = await makeBackup({ name: details.name, shop: details.shop }, saved, loadMedia);
    downloadBlob(file, `ra-clip-${localTime().slice(0, 10)}.raclip`);
    notify('Đã tạo file sao lưu kèm video.');
  }

  async function restoreCampaign(file: File) {
    const { draft, workspace, media } = await readBackup(file);
    const restored = await createCampaign(draft, workspace, media);
    await launchCampaign(restored.id);
    notify(`Đã mở bản sao lưu thành chiến dịch riêng “${restored.name}”.`);
  }

  async function newOffers(offers: Offer[]) {
    if (JSON.stringify(version?.offers) === JSON.stringify(offers)) {
      clearDialog();
      notify('Bảng ưu đãi giống phiên bản hiện tại.');
      return;
    }
    const next = updatedReport({ ...data, versions: [...data.versions, { id: crypto.randomUUID(), at: localTime(), offers }] }, 'offers');
    await persist(next);
    clearDialog();
    const count = next.audit?.refreshed.length ?? 0;
    notify(`Đã lưu bảng v${next.versions.length}. ${count ? `Đã rà lại ${count} video.` : 'Chưa có video nào bị ảnh hưởng.'}`);
  }

  async function handleImport(file: File) {
    setBusy('Đang đọc bảng ưu đãi…');
    try { await newOffers(await importOffers(file)); }
    catch (error) { notify(errorText(error), true); }
    finally { setBusy(''); }
  }

  async function importCatalog(rows: unknown[][]) {
    const plan = planCatalog(rows, data.clips);
    const count = plan.filter(row => row.state === 'add' || row.state === 'update').length;
    if (!count) throw Error('Bảng này chưa có dòng hợp lệ cần lưu.');
    const clips = applyCatalog(data.clips, plan);
    await persist(updatedReport({ ...data, clips }, 'clips'));
    clearDialog();
    notify(`Đã nhập ${count} video vào kho.`);
  }

  async function scanBatch(ids: string[], options: ScanOptions, signal: AbortSignal, onEvent: (event: BatchEvent) => void) {
    let current = data;
    const processed = new Set<string>();
    let success = 0;
    let warnings = 0;
    for (const id of ids) {
      if (signal.aborted) break;
      const clip = current.clips.find(row => row.id === id);
      if (!clip) continue;
      onEvent({ id, state: 'running', detail: 'Đang mở file video…' });
      let next: Clip;
      try {
        next = await analyzeStoredClip(clip, options, signal, detail => onEvent({ id, state: 'running', detail }));
      } catch (failure) {
        if (signal.aborted) {
          onEvent({ id, state: 'stopped', detail: 'Dừng trước khi lưu kết quả video này.' });
          break;
        }
        next = failScan(clip, options, errorText(failure));
      }
      const receipt = next.lastScan!;
      const clips = current.clips.map(row => row.id === id ? next : row);
      current = await persist(updatedReport({ ...current, clips }, 'batch', false));
      for (const refreshed of current.audit?.refreshed ?? []) processed.add(refreshed);
      if (receipt.state === 'ready') success++;
      else warnings++;
      onEvent({ id, state: receipt.state, detail: receipt.detail });
    }
    if (current.audit && success + warnings > 0) {
      await persist(recordAudit({ ...current, audit: { ...current.audit, refreshed: [...processed] } }, 'batch'));
    }
    const label = signal.aborted ? 'Đã dừng lượt quét.' : 'Đã xong lượt quét.';
    notify(`${label} ${success} video có kết quả · ${warnings} cần xem lại.`);
  }

  async function saveClips(drafts: DraftClip[], options: ScanOptions) {
    const controller = new AbortController();
    cancel.current = controller;
    setBusy('Đang chuẩn bị video…');
    const media: MediaChange[] = [];
    const rows: Clip[] = [];
    const warnings: string[] = [];
    try {
      for (const [index, draft] of drafts.entries()) {
        controller.signal.throwIfAborted();
        const id = editing?.id ?? crypto.randomUUID();
        let evidence = editing?.evidence ?? [];
        let lastScan = draft.file ? undefined : editing?.lastScan;
        if (draft.evidence.length) evidence = evidence.filter(row => row.source === 'audio' || row.source === 'frame');
        if (draft.file) {
          const file = draft.file;
          evidence = evidence.filter(row => row.source !== 'audio' && row.source !== 'frame');
          if (options.audio || options.frame) {
            const result = await analyzeVideo(file, options, message =>
              setBusy(`${index + 1}/${drafts.length} · ${message}`), controller.signal);
            evidence = [...evidence, ...result.evidence];
            lastScan = scanReceipt(options, result.evidence.length, result.notes);
            warnings.push(...result.notes.map(note => `${draft.title} · ${note}`));
          } else {
            setBusy(`${index + 1}/${drafts.length} · Kiểm tra video…`);
            (await videoMetadata(file, controller.signal)).release();
          }
          media.push({ id, blob: file });
        }
        rows.push({
          ...editing,
          id, title: draft.title, sku: draft.sku, link: draft.link, published: draft.published, format: draft.format,
          videoId: draft.link && draft.link !== editing?.link ? tiktokId(draft.link) || undefined : editing?.videoId,
          creator: draft.creator, stats: draft.stats, lastScan,
          evidence: [...evidence, ...draft.evidence].sort((a, b) => a.start - b.start),
          localMedia: Boolean(draft.file || editing?.localMedia),
          demoMedia: draft.file ? undefined : editing?.demoMedia,
          mediaRevision: draft.file ? crypto.randomUUID() : editing?.mediaRevision,
          masks: draft.file ? [] : editing?.masks,
        });
      }
      controller.signal.throwIfAborted();
      const clips = editing ? data.clips.map(clip => clip.id === editing.id ? rows[0] : clip) : [...data.clips, ...rows];
      setBusy('Đang lưu video…');
      cancel.current = null;
      await persist(updatedReport({ ...data, clips }, 'clips'), media);
      setSelected(rows[0].id);
      setFilter('all');
      if (page !== 'report') setPage('clips');
      clearDialog();
      notify(`Đã lưu ${rows.length} video.${warnings.length ? ' ' + warnings.slice(0, 2).join(' · ') : ''}`, warnings.length > 0);
    } catch (error) {
      if (controller.signal.aborted) throw Error('Đã dừng phân tích. Video chưa được lưu.');
      throw error;
    } finally { setBusy(''); cancel.current = null; }
  }

  async function rescan(clip: Clip) {
    const controller = new AbortController();
    cancel.current = controller;
    setBusy('Đang mở video…');
    const options = { audio: true, frame: true };
    try {
      let next: Clip;
      try { next = await analyzeStoredClip(clip, options, controller.signal, setBusy); }
      catch (failure) {
        controller.signal.throwIfAborted();
        next = failScan(clip, options, errorText(failure));
      }
      const clips = data.clips.map(row => row.id === clip.id ? next : row);
      setBusy('Đang lưu bằng chứng…');
      cancel.current = null;
      await persist(updatedReport({ ...data, clips }, 'evidence'));
      notify(next.lastScan!.detail, next.lastScan!.state !== 'ready');
    } catch (error) { notify(controller.signal.aborted ? 'Đã dừng phân tích video.' : errorText(error), !controller.signal.aborted); }
    finally { setBusy(''); cancel.current = null; }
  }

  async function deleteClip() {
    if (!editing) return;
    setBusy('Đang xóa video…');
    try {
      const clips = data.clips.filter(clip => clip.id !== editing?.id);
      const isOtherClip = ([key]: [string, unknown]) => {
        try { return JSON.parse(key)[0] !== editing.id; } catch { return false; }
      };
      const reviews = Object.fromEntries(Object.entries(data.reviews).filter(isOtherClip));
      const notes = Object.fromEntries(Object.entries(data.notes ?? {}).filter(isOtherClip));
      await persist(updatedReport({ ...data, clips, reviews, notes }, 'clips'), [{ id: editing.id, blob: null }]);
      clearDialog();
      notify('Đã xóa video khỏi kho.');
    } catch (error) { notify(errorText(error), true); }
    finally { setBusy(''); }
  }

  async function saveEvidence(value: Pick<Evidence, 'start' | 'end' | 'text'> | null) {
    if (!editing) return;
    const fixed = changeEvidence(editing, evidenceIndex, value);
    const clips = data.clips.map(clip => clip.id === fixed.id ? fixed : clip);
    await persist(updatedReport({ ...data, clips }, 'evidence'));
    clearDialog();
    notify(value ? 'Đã lưu đoạn trích và cập nhật kết quả.' : 'Đã xóa đoạn trích và cập nhật kết quả.');
  }

  async function review(ids: string[], value: Review | '') {
    try {
      await persist(setReviews(data, ids, value));
      if (ids.length > 1) notify(`Đã cập nhật tiến độ ${ids.length} việc.`);
      return true;
    } catch (error) {
      notify(errorText(error), true);
      return false;
    }
  }

  async function note(id: string, value: string) {
    await persist(setFindingNote(data, id, value));
    notify('Đã lưu ghi chú.');
  }

  async function runReport() {
    if (!version) { go('offers'); notify('Thêm bảng ưu đãi trước khi rà.'); return; }
    try {
      const next = updatedReport({ ...data, checkedAt: date }, 'manual');
      await persist(next);
      notify(`Đã rà ${data.clips.length} video theo bảng v${data.versions.length}.`);
    } catch (error) { notify(errorText(error), true); }
  }

  function exportReport() {
    if (data.audit) {
      download(auditCsv(data.audit, data.clips, data.reviews, data.notes), `ra-clip-${data.audit.checkedAt.slice(0, 10)}.csv`);
      notify('Đã tạo file báo cáo CSV.');
    }
  }

  return <div className="app-shell">
    <a className="skip-link" href="#main-content" onClick={event => {
      event.preventDefault(); document.getElementById('main-content')?.focus();
    }}>Bỏ qua điều hướng</a>
    <aside className="sidebar" aria-label="Không gian và điều hướng">
      <div className="sidebar-top"><Brand />
        <div className="workspace-switch">
          <span className="workspace-icon"><Clapperboard size={18} /></span>
          <div className="workspace-name"><strong>{data.demo ? 'Không gian mẫu' : campaign?.name ?? 'Không gian của shop'}</strong>
            <small>{data.demo ? 'Dữ liệu minh họa' : campaign?.shop || 'Dữ liệu trên máy'}</small></div>
          <ChevronDown size={13} />
          <label className="workspace-select"><span className="sr-only">Không gian làm việc</span>
            <select aria-label="Không gian làm việc" value={active} disabled={!!busy}
              onChange={event => openFromPage(event.target.value)}>
              <option value="demo">Không gian mẫu</option>
              {campaigns.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        </div>
        <button type="button" className="campaign-picker" onClick={() => setDialog('campaigns')} disabled={!!busy}><FolderOpen size={16} /> Quản lý chiến dịch</button>
        <nav aria-label="Điều hướng chính">{pages.map(({ id, label, icon: Icon }) =>
          <button type="button" className={page === id ? 'on' : ''} aria-current={page === id ? 'page' : undefined} key={id} onClick={() => go(id)}>
            <Icon size={18} /> <span>{label}</span>{id === 'queue' && todo > 0 && <small aria-hidden="true" className="nav-count">{todo}</small>}
            {page === id && id !== 'queue' && <span className="nav-indicator" />}
          </button>)}</nav>
      </div>
      <div className="sidebar-bottom">
        <div className="privacy-note"><ShieldCheck size={19} /><span><strong>Xử lý trên thiết bị</strong><small>Video lưu trên trình duyệt</small></span></div>
        <a href="https://github.com/laian2006/ra-clip" target="_blank" rel="noopener noreferrer"><Github size={16} /> GitHub <ArrowUpRight size={13} /></a>
      </div>
    </aside>

    <main className="main" id="main-content" tabIndex={-1}>
      <header className="topbar"><div className="breadcrumb"><span>{data.demo ? 'Không gian mẫu' : campaign?.name ?? 'Không gian của shop'}</span><span>/</span><strong>{pages.find(item => item.id === page)?.label}</strong></div>
        <div className="top-actions">
          <button className="button secondary" onClick={exportReport} disabled={!data.audit || !data.clips.length || !!busy}><ArrowDownToLine size={17} /> Xuất báo cáo</button>
          <button className="button primary" onClick={startAdd} disabled={!!busy}><Plus size={18} /> Thêm video</button>
        </div>
      </header>
      <div className="main-content">
        <div className="page-title">
          <div><h1 id="page-heading" ref={pageHeading} tabIndex={-1}>{title[page]}</h1><p>{descriptions[page]}</p></div>
          {page === 'report' && <span className="activity-pill"><span /> {data.audit ? `Đã rà ${results.length} video` : 'Chưa có lần rà'}</span>}
        </div>
        {data.demo && page === 'report' && <div className="demo-banner">
          <span className="demo-symbol"><SwitchCamera size={17} /></span>
          <div><strong>Đang xem dữ liệu mẫu</strong><span> · Thử mở một video hoặc sửa bảng ưu đãi.</span></div>
          <button className="text-button" onClick={() => openFromPage('shop')} disabled={!!busy}>Dùng dữ liệu của bạn <ArrowRight size={16} /></button>
        </div>}
        {busy && !dialog && <div className="inline-status" role="status"><LoaderCircle size={17} className="spin" /> {busy}
          {cancel.current && <button className="text-button" onClick={() => cancel.current?.abort()}>Dừng</button>}
        </div>}
        {page === 'report' && <>
          {todo > 0 && <div className="work-strip">
            <div><ClipboardList size={19} /><span><strong>{todo} việc đang mở</strong><small>Xác nhận cảnh báo và lưu tiến độ.</small></span></div>
            <button className="text-button" onClick={() => go('queue')}>Mở danh sách việc <ArrowRight size={16} /></button>
          </div>}
          <section className="scan-bar" aria-label="Thiết lập rà soát">
            <div className="scan-info"><FileSpreadsheet size={19} /><span><strong>{version ? `Bảng ưu đãi · v${data.versions.length}` : 'Chưa có bảng ưu đãi'}</strong>
              <small>{version ? `${version.offers.length} dòng · ${found} video cần xử lý` : 'Nhập giá, voucher và quà tặng theo SKU'}</small></span></div>
            <form className="scan-controls" onSubmit={event => { event.preventDefault(); void runReport(); }}>
              <label><span>Rà tại (UTC+7)</span><input type="datetime-local" aria-label="Thời điểm rà (UTC+7)" value={date}
                onChange={event => setDate(event.target.value)} required disabled={!!busy} /></label>
              <button type="submit" className="button dark" disabled={!!busy}><ScanLine size={17} /> Rà soát ngay</button>
            </form>
          </section>
          {dateChanged && <p className="date-changed">Vừa đổi thời điểm. Chọn Rà soát ngay để cập nhật báo cáo {data.audit ? `ngày ${displayDate(data.audit.checkedAt)}` : ''}.</p>}
          <Metrics results={results} filter={filter} onFilter={setFilter} />
        </>}
        {page === 'clips' && <section className="library-work" aria-label="Nhập và quét kho video">
          <div><strong>{data.clips.length} video</strong><span>{data.clips.filter(clip => !clip.sku).length} chưa gán SKU</span>
            <span>{data.clips.filter(clip => !clip.evidence.length).length} chưa có bằng chứng</span></div>
          <div><button className="button secondary" disabled={!!busy} onClick={() => setDialog('catalog')}><Upload size={16} /> Nhập danh sách</button>
            <button className="button dark" disabled={!!busy || !data.clips.some(clip => clip.localMedia || clip.demoMedia)}
              onClick={() => setDialog('batch')}><ScanLine size={16} /> Quét hàng loạt</button></div>
        </section>}
        {(page === 'report' || page === 'clips') && <div className="board">
          {page === 'report' && filter !== 'all' && <div className="filter-strip">Đang lọc: {verdictLabels[filter]}
            <button className="text-button" onClick={() => setFilter('all')}>Xóa bộ lọc <X size={14} /></button></div>}
          <ClipList key={page} clips={data.clips} results={resultIndex} filter={filter} selected={currentClip?.id ?? ''}
            onSelect={id => { setSelected(id); setFindingFocus(''); }} onAdd={startAdd} library={page === 'clips'} ready={!!data.audit} />
          <ClipDetail key={(currentClip?.id ?? 'empty') + findingFocus} clip={currentClip} result={currentClip && resultIndex.get(currentClip.id)}
            focusedFinding={findingFocus} reviews={data.reviews} notes={data.notes} onReview={(id, value) => void review([id], value)}
            onEdit={startEdit} onDelete={startDelete} onEvidence={startEvidence}
            onScan={clip => void rescan(clip)} busy={!!busy} />
        </div>}
        {page === 'queue' && <QueueView workspace={data} onOpen={openFinding} onReview={review} onNote={note} busy={!!busy} />}
        {page === 'history' && <HistoryView snapshots={data.snapshots ?? []} onReport={() => go('report')} />}
        {page === 'offers' && <OffersView versions={data.versions} clips={data.clips} onImport={() => importInput.current?.click()}
          onEdit={() => setDialog('offers')} busy={!!busy} />}
        {page === 'guide' && <Guide onOffers={() => go('offers')} onAdd={startAdd} />}
      </div>
    </main>
    <input ref={importInput} type="file" className="sr-only" tabIndex={-1} accept=".xlsx,.csv,.tsv"
      aria-label="Nhập bảng ưu đãi" onChange={event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) void handleImport(file);
      }} />
    {dialog === 'clip' && <ClipDialog clip={editing} skus={[...new Set(version?.offers.map(row => row.sku) ?? [])]}
      onClose={clearDialog} onSave={saveClips} busy={busy} onCancel={() => cancel.current?.abort()} />}
    {dialog === 'catalog' && <CatalogDialog clips={data.clips} onApply={importCatalog} onClose={clearDialog} />}
    {dialog === 'batch' && <BatchDialog clips={data.clips} onRun={scanBatch} onClose={clearDialog} />}
    {dialog === 'campaigns' && <CampaignManager items={campaigns} active={active} onOpen={launchCampaign}
      onCreate={addCampaign} onRename={changeCampaign} onBackup={exportCampaign} onRestore={restoreCampaign} onClose={clearDialog} />}
    {dialog === 'evidence' && <EvidenceDialog row={evidenceIndex === null ? undefined : editing?.evidence[evidenceIndex]}
      onSave={saveEvidence} onClose={clearDialog} />}
    {dialog === 'offers' && <OfferDialog offers={version?.offers ?? []} onClose={clearDialog} onSave={newOffers} />}
    {dialog === 'delete' && <Modal title="Xóa video?" detail={editing?.title} busy={!!busy} onClose={clearDialog}>
      <p className="delete-description">File video, phụ đề và phản hồi của clip này sẽ bị xóa khỏi trình duyệt.</p>
      <div className="dialog-actions"><button className="button secondary" onClick={clearDialog} disabled={!!busy}>Giữ lại</button>
        <button className="button primary" onClick={() => void deleteClip()} disabled={!!busy}>Xóa video</button>
      </div>
    </Modal>}
    {notice && <div className={`toast ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'}>
      {notice.error ? <CircleAlert size={19} /> : <CheckCircle2 size={19} />}
      <span>{notice.text}</span><button className="icon-button" aria-label="Ẩn thông báo" onClick={() => setNotice(null)}><X size={16} /></button>
    </div>}
  </div>;
}
