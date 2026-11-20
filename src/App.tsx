import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine, ArrowRight, ArrowUpRight, BookOpen, CheckCircle2, ChevronDown, CircleAlert,
  CalendarClock, CircleHelp, Clapperboard, ClipboardList, FileSpreadsheet, FileText, Film, FolderOpen, Github, History,
  LayoutDashboard, LoaderCircle, Plus, ScanLine, ShieldCheck, Upload, Wrench, X,
} from 'lucide-react';
import { allClipFilters, ClipDetail, ClipList, Metrics, visibleClips } from './dashboard';
import { CampaignManager } from './campaigns';
import { EvidenceDialog } from './evidence';
import { HistoryView } from './history';
import { QueueView } from './queue';
import { makeBackup, readBackup } from './backup';
import { CatalogDialog } from './catalog-dialog';
import { applyCatalog, planCatalog, tiktokId } from './catalog';
import { BatchDialog } from './batch-dialog';
import { offerWarnings } from './audit';
import { analyzeStoredClip, failScan, scanReceipt, type BatchEvent } from './batch';
import {
  changeEvidence, leadVerdict, prepareWorkspace, queueEntries, recordAudit, reviewOpen, setFindingNote, setReviews, updatedReport,
} from './workflow';
import { ClipDialog, ConfirmOfferImport, OfferDialog, type DraftClip } from './dialogs';
import { findDuplicateVideos, inspectUploads, type DuplicateChoice } from './duplicates';
import { displayDate, displayDateTime, localTime, verdictLabels } from './domain';
import type { Campaign, CampaignDraft, Clip, Evidence, Finding, Offer, Review, Verdict, Workspace } from './domain';
import { auditCsv, download, downloadBlob, importOffers } from './files';
import { analyzeVideo, videoMetadata, type ScanOptions } from './media';
import { emptyWorkspace, refreshDemo, sampleWorkspace } from './demo';
import { OffersView } from './offers';
import { latestOfferImpact } from './impact';
import { OfferImpactDialog, OfferImpactSummary } from './impact-view';
import { HandoffDialog } from './handoff';
import { DemoStart, ShopStart } from './start';
import { CreatorBoard } from './creator-board';
import { assignCreator } from './creators';
import { OfferBriefDialog } from './offer-brief-view';
import { OfferSchedule } from './offer-schedule';
import { QuickCheck } from './quick-check';
import { ToolLinks, tools, type ToolPage } from './tool-links';
import { createCampaign, listCampaigns, loadMedia, loadWorkspace, renameCampaign, saveWorkspace, type MediaChange } from './storage';
import { Brand, Modal } from './ui';

type Page = 'report' | 'queue' | 'clips' | 'offers' | 'history' | 'guide' | 'tools' | ToolPage;
type Notice = { text: string; error?: boolean };
type DeletedVideo = { clip: Clip; blob?: Blob; reviews: Workspace['reviews']; notes: NonNullable<Workspace['notes']> };
const pages = [
  { id: 'report', label: 'Rà soát', icon: LayoutDashboard },
  { id: 'tools', label: 'Công cụ', icon: Wrench },
  { id: 'queue', label: 'Việc cần làm', icon: ClipboardList },
  { id: 'clips', label: 'Kho video', icon: Film },
  { id: 'offers', label: 'Bảng ưu đãi', icon: FileSpreadsheet },
  { id: 'history', label: 'Nhật ký rà', icon: History },
  { id: 'guide', label: 'Hướng dẫn', icon: CircleHelp },
] as const;

const title: Record<Page, string> = {
  report: 'Rà soát video sau sale', queue: 'Việc cần làm', clips: 'Kho video',
  offers: 'Bảng ưu đãi', history: 'Nhật ký rà soát', guide: 'Hướng dẫn sử dụng',
  tools: 'Công cụ', quick: 'Kiểm nhanh bản nháp', schedule: 'Lịch đổi ưu đãi', creators: 'Điều phối người đăng',
};

const descriptions: Record<Page, string> = {
  report: 'Tìm lại những clip còn nhắc giá, voucher hoặc quà tặng cũ.',
  queue: 'Xác nhận kết quả, ghi chú và theo dõi các việc sau sale.',
  clips: 'Quản lý video, phụ đề và mã sản phẩm cần đối chiếu.',
  offers: 'So sánh giá, voucher, quà tặng và các SKU chịu ảnh hưởng.',
  history: 'Xem lại báo cáo từng lần rà và các clip đổi trạng thái.',
  guide: 'Từ bảng ưu đãi và clip gốc đến báo cáo có bằng chứng.',
  tools: 'Chọn việc cần làm cho video, ưu đãi hoặc đội người đăng.',
  quick: 'Kiểm một video hoặc kịch bản theo ưu đãi shop gửi, ngay cả khi bạn chưa tạo chiến dịch.',
  schedule: 'Xem trước video cần rà ở những mốc bắt đầu hoặc hết hạn của deal.',
  creators: 'Gán người đăng, theo dõi tiến độ và soạn tin nhắc theo từng người.',
};

function errorText(error: unknown) {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return 'Bộ nhớ trình duyệt đã đầy. Sao lưu chiến dịch và giải phóng dung lượng trước khi thử lại.';
  }
  return error instanceof Error ? error.message : String(error);
}

function Guide({ onOffers, onAdd, onReport }: { onOffers: () => void; onAdd: () => void; onReport: () => void }) {
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
        <p>App tự cập nhật kết quả khi lưu dữ liệu. Chọn video rồi bấm mốc thời gian để kiểm tra đoạn gốc. Mở Việc cần làm để theo dõi các cảnh báo.</p>
        <button className="text-button" onClick={onReport}>Mở màn hình rà soát <ArrowRight size={15} /></button></div></article>
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
  const [clipFilters, setClipFilters] = useState(allClipFilters);
  const [duplicateIds, setDuplicateIds] = useState<Set<string>>();
  const [selected, setSelected] = useState('');
  const [date, setDate] = useState('');
  const [dialog, setDialog] = useState<'clip' | 'offers' | 'verify-offers' | 'delete' | 'campaigns' | 'evidence' | 'catalog' | 'batch' | 'impact' | 'impact-handoff' | 'brief' | null>(null);
  const [offerImport, setOfferImport] = useState<{ offers: Offer[]; warnings: string[] }>();
  const [queueCreator, setQueueCreator] = useState<string>();
  const [editing, setEditing] = useState<Clip>();
  const [evidenceIndex, setEvidenceIndex] = useState<number | null>(null);
  const [findingFocus, setFindingFocus] = useState('');
  const [showDetail, setShowDetail] = useState(false);
  const [boardFocus, setBoardFocus] = useState<{ id: 'clip-evidence' | 'clip-list-heading' }>();
  const todo = useMemo(() => workspace ? queueEntries(workspace).filter(row => reviewOpen(row.review)).length : 0, [workspace]);
  const impact = useMemo(() => workspace && page === 'offers' ? latestOfferImpact(workspace) : undefined, [workspace, page]);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [deleted, setDeleted] = useState<DeletedVideo>();
  const cancel = useRef<AbortController | null>(null);
  const sidebar = useRef<HTMLElement>(null);
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
      setQueueCreator(undefined);
      setFilter('all');
      setClipFilters(allClipFilters);
      setDuplicateIds(undefined);
      setSelected(data.clips[0]?.id ?? '');
      setFindingFocus('');
      setShowDetail(false);
      setDeleted(undefined);
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
  useEffect(() => {
    if (!deleted) return;
    const timer = setTimeout(() => setDeleted(undefined), 30_000);
    return () => clearTimeout(timer);
  }, [deleted]);
  const ready = workspace !== null;
  useEffect(() => {
    const element = sidebar.current;
    if (!element) return;
    const root = document.documentElement;
    const measure = () => root.style.setProperty('--mobile-scroll-top', `${Math.ceil(element.getBoundingClientRect().height) + 8}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => { observer.disconnect(); root.style.removeProperty('--mobile-scroll-top'); };
  }, [ready]);

  async function persist(next: Workspace, media?: MediaChange[]) {
    if (writing.current) throw Error('Đang lưu thay đổi. Thử lại sau khi lưu xong.');
    writing.current = true;
    try {
      const saved = await saveWorkspace(active, next, media);
      setWorkspace(saved);
      setDuplicateIds(undefined);
      if (active !== 'demo') {
        const current = saved.clips.length;
        const openItems = queueEntries(saved).filter(row => reviewOpen(row.review)).length;
        setCampaigns(items => items.map(item => item.id === active
          ? { ...item, updatedAt: localTime(), clipCount: current, todoCount: openItems } : item));
      }
      return saved;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'QuotaExceededError') throw Error(errorText(error));
      throw error;
    } finally { writing.current = false; }
  }

  function notify(text: string, error = false) { setNotice({ text, error }); }
  function startAdd() { setNotice(null); setEditing(undefined); setDialog('clip'); }
  function go(next: Page, creator?: string) {
    setPage(next); setFilter('all'); setClipFilters(allClipFilters); setFindingFocus(''); setShowDetail(false);
    setQueueCreator(creator);
    setDuplicateIds(undefined);
    requestAnimationFrame(() => {
      pageHeading.current?.focus({ preventScroll: true });
      pageHeading.current?.scrollIntoView({ block: 'start' });
    });
  }
  function openShop(next: Page) {
    void open('shop').then(() => go(next)).catch(error => notify(errorText(error), true));
  }
  function focusBoard(id: 'clip-evidence' | 'clip-list-heading') {
    setBoardFocus({ id });
  }
  useEffect(() => {
    if (!boardFocus) return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(boardFocus.id);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [boardFocus]);
  function selectClip(id: string) {
    setSelected(id); setFindingFocus('');
    if (window.matchMedia('(max-width: 900px)').matches) {
      setShowDetail(true);
      focusBoard('clip-evidence');
    }
  }
  function openFinding(clip: Clip, finding: Finding) {
    setPage('report'); setFilter('all'); setClipFilters(allClipFilters); setSelected(clip.id); setFindingFocus(finding.id);
    setShowDetail(true);
    focusBoard('clip-evidence');
  }
  function openLibraryClip(clip: Clip) {
    go('clips');
    setSelected(clip.id);
    setShowDetail(true);
    focusBoard('clip-evidence');
  }
  function startEvidence(clip: Clip, index: number | null) {
    setEditing(clip); setEvidenceIndex(index); setDialog('evidence');
  }
  function startEdit(clip: Clip) { setNotice(null); setEditing(clip); setDialog('clip'); }
  function startDelete(clip: Clip) { setEditing(clip); setDialog('delete'); }
  function clearDialog() { setDialog(null); setEditing(undefined); setOfferImport(undefined); }

  if (!workspace) return <div className="boot"><Brand /><p role="status">Đang mở Rà Clip…</p>
    {notice && <p className="form-error" role="alert">{notice.text}</p>}</div>;
  const data = workspace;
  const campaign = campaigns.find(item => item.id === active);
  const version = data.versions.at(-1);
  const results = data.audit?.results ?? [];
  const resultIndex = new Map(results.map(row => [row.clipId, row]));
  const candidates = page === 'clips' && duplicateIds ? data.clips.filter(clip => duplicateIds.has(clip.id)) : data.clips;
  const availableClips = visibleClips(candidates, resultIndex, page === 'report' ? filter : 'all', clipFilters);
  const currentClip = availableClips.find(clip => clip.id === selected) ?? availableClips[0];
  const dateChanged = date !== data.checkedAt;
  const inTools = page === 'tools' || tools.some(item => item.id === page);
  const found = results.filter(row => leadVerdict(row.findings) === 'action').length;
  const example = data.demo ? queueEntries(data).find(({ clip, finding }) =>
    clip.demoMedia && finding.verdict === 'action' && finding.evidence) : undefined;

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
    const saved = prepareWorkspace(await loadWorkspace(id) ?? emptyWorkspace());
    const file = await makeBackup({ name: details.name, shop: details.shop }, saved, loadMedia);
    await readBackup(file);
    downloadBlob(file, `ra-clip-${localTime().slice(0, 10)}.raclip`);
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
    try {
      const offers = await importOffers(file);
      const warnings = offerWarnings(offers);
      if (warnings.length) {
        setOfferImport({ offers, warnings });
        setDialog('verify-offers');
      } else await newOffers(offers);
    }
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

  async function checkDuplicates() {
    if (busy) return;
    const controller = new AbortController();
    cancel.current = controller;
    setBusy('Đang tìm video trùng trong chiến dịch…');
    try {
      const matches = await findDuplicateVideos(data.clips, controller.signal);
      setDuplicateIds(matches);
      setClipFilters(allClipFilters);
      setShowDetail(false);
      notify(matches.size ? `Tìm thấy ${matches.size} video trùng file, link hoặc ID.` : 'Không tìm thấy video trùng trong chiến dịch.');
    } catch (error) { notify(controller.signal.aborted ? 'Đã dừng tìm video trùng.' : errorText(error), !controller.signal.aborted); }
    finally { setBusy(''); cancel.current = null; }
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
    const reminder = !current.demo && success + warnings >= 10 ? ' Có thể tải bản sao lưu trong Quản lý chiến dịch.' : '';
    notify(`${label} ${success} video có kết quả · ${warnings} cần xem lại.${reminder}`);
  }

  async function saveClips(drafts: DraftClip[], options: ScanOptions, choice: DuplicateChoice) {
    const controller = new AbortController();
    cancel.current = controller;
    setBusy('Đang kiểm tra video trùng…');
    const original = choice.replace ?? editing;
    const media: MediaChange[] = [];
    const rows: Clip[] = [];
    let warnings = 0;
    try {
      const incoming = drafts.map(draft => ({ ...draft, link: original?.link === draft.link || choice.replace ? '' : draft.link }));
      const hashes = await inspectUploads(incoming, data.clips.filter(clip => clip.id !== original?.id), choice.separate, controller.signal);
      for (const [index, draft] of drafts.entries()) {
        controller.signal.throwIfAborted();
        const id = original?.id ?? crypto.randomUUID();
        let evidence = original?.evidence ?? [];
        let lastScan = draft.file ? undefined : original?.lastScan;
        if (draft.evidence.length) evidence = evidence.filter(row => row.source === 'audio' || row.source === 'frame');
        if (draft.file) {
          const file = draft.file;
          evidence = evidence.filter(row => row.source !== 'audio' && row.source !== 'frame');
          if (options.audio || options.frame) {
            const result = await analyzeVideo(file, options, message =>
              setBusy(`${index + 1}/${drafts.length} · ${message}`), controller.signal);
            evidence = [...evidence, ...result.evidence];
            lastScan = scanReceipt(options, result);
            if (lastScan.state !== 'ready') warnings++;
          } else {
            setBusy(`${index + 1}/${drafts.length} · Kiểm tra video…`);
            (await videoMetadata(file, controller.signal)).release();
          }
          media.push({ id, blob: file });
        }
        rows.push({
          ...original,
          id, title: choice.replace?.title ?? draft.title, sku: choice.replace?.sku ?? draft.sku,
          link: choice.replace?.link ?? draft.link, published: choice.replace?.published ?? draft.published,
          format: choice.replace ? choice.replace.format : draft.format,
          videoId: choice.replace ? choice.replace.videoId : draft.link !== editing?.link ? tiktokId(draft.link) || undefined : editing?.videoId,
          creator: choice.replace ? choice.replace.creator : draft.creator,
          stats: choice.replace ? choice.replace.stats : draft.stats, lastScan,
          evidence: [...evidence, ...draft.evidence].sort((a, b) => a.start - b.start),
          localMedia: Boolean(draft.file || original?.localMedia),
          demoMedia: draft.file ? undefined : original?.demoMedia,
          mediaRevision: draft.file ? crypto.randomUUID() : original?.mediaRevision,
          fileHash: hashes[index] ?? original?.fileHash,
          masks: draft.file ? [] : original?.masks,
        });
      }
      controller.signal.throwIfAborted();
      const clips = original ? data.clips.map(clip => clip.id === original.id ? rows[0] : clip) : [...data.clips, ...rows];
      setBusy('Đang lưu video…');
      cancel.current = null;
      await persist(updatedReport({ ...data, clips }, 'clips'), media);
      setSelected(rows[0].id);
      setShowDetail(false);
      setFilter('all');
      if (!editing) setClipFilters(allClipFilters);
      if (page !== 'report') setPage('clips');
      clearDialog();
      notify(`Đã lưu ${rows.length} video.${warnings ? ` ${warnings} video cần xem trạng thái quét trong phần Bằng chứng.` : ''}`);
    } catch (error) {
      if (controller.signal.aborted) throw Error('Đã dừng phân tích. Video chưa được lưu.');
      throw error;
    } finally { setBusy(''); cancel.current = null; }
  }

  async function rescan(clip: Clip, options: ScanOptions = { audio: true, frame: true }) {
    const controller = new AbortController();
    cancel.current = controller;
    setBusy('Đang mở video…');
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
      const reviewEntries = Object.entries(data.reviews);
      const noteEntries = Object.entries(data.notes ?? {});
      const reviews = Object.fromEntries(reviewEntries.filter(isOtherClip));
      const notes = Object.fromEntries(noteEntries.filter(isOtherClip));
      const blob = editing.localMedia ? await loadMedia(editing.id) : undefined;
      await persist(updatedReport({ ...data, clips, reviews, notes }, 'clips'), [{ id: editing.id, blob: null }]);
      setDeleted({ clip: editing, blob, reviews: Object.fromEntries(reviewEntries.filter(row => !isOtherClip(row))),
        notes: Object.fromEntries(noteEntries.filter(row => !isOtherClip(row))) });
      clearDialog();
      setShowDetail(false);
      setNotice(null);
    } catch (error) { notify(errorText(error), true); }
    finally { setBusy(''); }
  }

  async function undoDelete() {
    if (!deleted || busy) return;
    setBusy('Đang khôi phục video…');
    try {
      const { clip, blob, reviews, notes } = deleted;
      await persist(updatedReport({
        ...data, clips: [...data.clips, clip], reviews: { ...data.reviews, ...reviews }, notes: { ...data.notes, ...notes },
      }, 'clips'), blob ? [{ id: clip.id, blob }] : []);
      setDeleted(undefined);
      setSelected(clip.id);
      notify('Đã khôi phục video và phản hồi.');
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

  async function changeCreators(ids: string[], creator?: string) {
    if (busy || opening.current) throw Error('Chờ thao tác hiện tại trước khi gán người đăng.');
    setBusy('Đang cập nhật người đăng…');
    try {
      const clips = assignCreator(data.clips, ids, creator);
      await persist({ ...data, clips });
      notify(creator ? `Đã gán ${ids.length} video cho ${creator}.` : `Đã bỏ gán người đăng cho ${ids.length} video.`);
    } finally { setBusy(''); }
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
    if (data.audit && !dateChanged) {
      download(auditCsv(data.audit, data.clips, data.reviews, data.notes), `ra-clip-${data.audit.checkedAt.slice(0, 10)}.csv`);
      notify('Đã tạo file báo cáo CSV.');
    }
  }

  return <div className="app-shell">
    <a className="skip-link" href="#main-content" onClick={event => {
      event.preventDefault(); document.getElementById('main-content')?.focus();
    }}>Bỏ qua điều hướng</a>
    <aside className="sidebar" ref={sidebar} aria-label="Không gian và điều hướng">
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
        <nav aria-label="Điều hướng chính">{pages.map(({ id, label, icon: Icon }) => {
          const current = page === id || (id === 'tools' && inTools);
          return <button type="button" className={current ? 'on' : ''} aria-current={current ? 'page' : undefined} key={id} onClick={() => go(id)}>
            <Icon size={18} /> <span>{label}</span>{id === 'queue' && todo > 0 && <small aria-hidden="true" className="nav-count">{todo}</small>}
            {current && id !== 'queue' && <span className="nav-indicator" />}
          </button>;
        })}</nav>
      </div>
      <div className="sidebar-bottom">
        <div className="privacy-note"><ShieldCheck size={19} /><span><strong>Xử lý trên thiết bị</strong><small>Video lưu trên trình duyệt</small></span></div>
        <a href="https://github.com/laian2006/ra-clip" target="_blank" rel="noopener noreferrer"><Github size={16} /> GitHub <ArrowUpRight size={13} /></a>
      </div>
    </aside>

    <main className="main" id="main-content" tabIndex={-1}>
      <header className="topbar"><div className="breadcrumb"><span>{data.demo ? 'Không gian mẫu' : campaign?.name ?? 'Không gian của shop'}</span><span>/</span><strong>{pages.find(item => item.id === page)?.label ?? title[page]}</strong></div>
        {inTools && page !== 'tools' && <button className="button secondary tool-back" type="button" onClick={() => go('tools')}>Về công cụ</button>}
        {!inTools && <div className="top-actions">
          <button className="button secondary" onClick={exportReport} disabled={!data.audit || !data.clips.length || dateChanged || !!busy}
            aria-describedby={dateChanged ? 'pending-audit' : undefined}><ArrowDownToLine size={17} /> Xuất báo cáo</button>
          <button className={`button ${page === 'report' ? 'secondary' : 'primary'}`} onClick={startAdd} disabled={!!busy}><Plus size={18} /> Thêm video</button>
        </div>}
      </header>
      <div className={`main-content${(page === 'report' || page === 'clips') && showDetail && currentClip ? ' viewing-mobile-clip' : ''}`}>
        <div className="page-title">
          <div><h1 id="page-heading" ref={pageHeading} tabIndex={-1}>{title[page]}</h1><p>{descriptions[page]}</p></div>
          {page === 'report' && <span className="activity-pill"><span /> {data.audit ? `Đã rà ${results.length} video` : 'Chưa có lần rà'}</span>}
          {(page === 'report' || page === 'clips') && currentClip && !showDetail &&
            <button className="button secondary mobile-clip-link" type="button" onClick={() => selectClip(currentClip.id)}>
              Xem bằng chứng <ArrowRight size={16} aria-hidden="true" />
            </button>}
        </div>
        {page === 'report' && (data.demo
          ? <DemoStart onExample={example ? () => openFinding(example.clip, example.finding) : undefined}
            onShop={() => openShop('report')}
            onGuide={() => go('guide')} busy={!!busy} />
          : <ShopStart version={version} clips={data.clips} hasReport={results.length > 0} busy={!!busy}
            onOffers={() => go('offers')} onAdd={startAdd} onEdit={startEdit}
            onScan={clip => { setEditing(clip); setDialog('batch'); }}
            onResults={() => { setFilter('all'); setClipFilters(allClipFilters); setShowDetail(false); focusBoard('clip-list-heading'); }} />)}
        {page === 'report' && <section className="report-tool-links" aria-label="Công cụ theo nhu cầu">
          <ToolLinks onOpen={go} />
        </section>}
        {busy && !dialog && <div className="inline-status" role="status"><LoaderCircle size={17} className="spin" /> {busy}
          {cancel.current && <button className="text-button" onClick={() => cancel.current?.abort()}>Dừng</button>}
        </div>}
        {page === 'report' && (data.demo || data.clips.length > 0) && <>
          {todo > 0 && <div className="work-strip">
            <div><ClipboardList size={19} /><span><strong>{todo} việc đang mở</strong><small>Xác nhận cảnh báo và lưu tiến độ.</small></span></div>
            <button className="text-button" onClick={() => go('queue')}>Mở danh sách việc <ArrowRight size={16} /></button>
          </div>}
          <section className="scan-bar" aria-label="Thiết lập rà soát">
            <div className="scan-info"><FileSpreadsheet size={19} /><span><strong>{version ? `Bảng ưu đãi · v${data.versions.length}` : 'Chưa có bảng ưu đãi'}</strong>
              <small>{version ? `${version.offers.length} dòng · ${found} video cần xử lý` : 'Nhập giá, voucher và quà tặng theo SKU'}</small></span></div>
            <form className="scan-controls" onSubmit={event => { event.preventDefault(); void runReport(); }}>
              <label><span>Rà tại (UTC+7)<small className="chosen-date" id="chosen-date">{displayDateTime(date)}</small></span>
                <input type="datetime-local" aria-label="Thời điểm rà (UTC+7)" aria-describedby="chosen-date" value={date}
                  onChange={event => setDate(event.target.value)} required disabled={!!busy} /></label>
              <button type="submit" className="button dark" disabled={!!busy}><ScanLine size={17} /> Rà soát ngay</button>
            </form>
          </section>
        </>}
        {dateChanged && (!inTools || page === 'creators') && <div className="date-changed">
          <p id="pending-audit" role="status">Thời điểm mới chưa được áp dụng.
            {data.audit && ` Kết quả hiện tại dùng ngày ${displayDate(data.audit.checkedAt)}.`}
            {page === 'report' && ' Chọn Rà soát ngay để cập nhật trước khi xuất.'}</p>
          {page !== 'report' && <button className="text-button" type="button" onClick={() => go('report')}>Về Rà soát</button>}
          <button className="text-button" type="button" onClick={() => setDate(data.checkedAt)}>Dùng thời điểm cũ</button>
        </div>}
        {page === 'report' && (data.demo || data.clips.length > 0) && <Metrics results={results} filter={filter} onFilter={setFilter} />}
        {page === 'clips' && <section className="library-work" aria-label="Nhập và quét kho video">
          <div><strong>{data.clips.length} video</strong><span>{data.clips.filter(clip => !clip.sku).length} chưa gán SKU</span>
            <span>{data.clips.filter(clip => !clip.evidence.length).length} chưa có bằng chứng</span></div>
          <div><button className="button secondary" disabled={!!busy} onClick={() => setDialog('catalog')}><Upload size={16} /> Nhập danh sách</button>
            <button className="button secondary" disabled={!!busy || data.clips.length < 2}
              onClick={() => duplicateIds ? setDuplicateIds(undefined) : void checkDuplicates()}>
              {duplicateIds ? 'Hiện tất cả video' : 'Tìm video trùng'}</button>
            <button className="button dark" disabled={!!busy || !data.clips.some(clip => clip.localMedia || clip.demoMedia)}
              onClick={() => setDialog('batch')}><ScanLine size={16} /> Quét hàng loạt</button></div>
        </section>}
        {(page === 'report' || page === 'clips') && <div className={`board${currentClip ? (showDetail ? ' showing-detail' : '') : ' single-column'}`}>
          {page === 'report' && filter !== 'all' && <div className="filter-strip">Đang lọc: {verdictLabels[filter]}
            <button className="text-button" onClick={() => setFilter('all')}>Xóa bộ lọc <X size={14} /></button></div>}
          <ClipList key={page} entries={availableClips} total={data.clips.length} results={resultIndex} filters={clipFilters}
            onFilter={setClipFilters} selected={currentClip?.id ?? ''}
            onSelect={selectClip} onAdd={startAdd} library={page === 'clips'} ready={!!data.audit} />
          {currentClip && <ClipDetail key={currentClip.id + '|' + findingFocus} clip={currentClip} result={resultIndex.get(currentClip.id)}
            focusedFinding={findingFocus} reviews={data.reviews} notes={data.notes} onReview={(id, value) => void review([id], value)}
            onEdit={startEdit} onDelete={startDelete} onEvidence={startEvidence}
            hasSku={Boolean(version?.offers.some(offer => offer.sku === currentClip.sku))}
            onOffers={() => go('offers')} onScan={(clip, options) => void rescan(clip, options)}
            onBack={() => { setShowDetail(false); focusBoard('clip-list-heading'); }} busy={!!busy} />}
        </div>}
        {page === 'queue' && <>
          <div className="tool-shortcuts">
            <button className="button secondary" type="button" onClick={() => go('creators')}>Điều phối người đăng <ArrowRight size={16} /></button>
          </div>
          <QueueView key={queueCreator === undefined ? 'all' : `creator:${queueCreator}`} workspace={data} initialCreator={queueCreator} onOpen={openFinding}
            onReview={review} onNote={note} busy={!!busy} exportBlocked={dateChanged} />
        </>}
        {page === 'history' && <HistoryView snapshots={data.snapshots ?? []} onReport={() => go('report')} />}
        {page === 'offers' && <>
          {version && <div className="tool-shortcuts">
            <button className="button secondary" type="button" onClick={() => go('schedule')}><CalendarClock size={16} /> Lịch đổi ưu đãi</button>
            <button className="button secondary" type="button" disabled={!!busy} onClick={() => setDialog('brief')}><FileText size={16} /> Tạo phiếu cho KOC</button>
          </div>}
          <OffersView versions={data.versions} clips={data.clips} onImport={() => importInput.current?.click()}
            onEdit={() => setDialog('offers')} onNext={!data.demo && !data.clips.length ? () => { go('report'); startAdd(); } : undefined} busy={!!busy}
            impactSummary={impact && impact.clipCount > 0 ? <OfferImpactSummary impact={impact} onOpen={() => setDialog('impact')} /> : undefined} />
        </>}
        {page === 'guide' && <Guide onOffers={() => go('offers')} onAdd={startAdd} onReport={() => go('report')} />}
        {page === 'tools' && <ToolLinks onOpen={go} />}
        {page === 'quick' && <QuickCheck />}
        {data.demo && (page === 'schedule' || page === 'creators') && <div className="tool-demo-note">
          <span>Đang xem dữ liệu minh họa.</span>
          <button type="button" className="button secondary" onClick={() => openShop(page)} disabled={!!busy}>Dùng dữ liệu của bạn <ArrowRight size={16} /></button>
        </div>}
        {page === 'schedule' && <OfferSchedule key={active} workspace={data} busy={!!busy} onOffers={() => go('offers')}
          onLibrary={() => go('clips')} onClip={openLibraryClip} />}
        {page === 'creators' && <CreatorBoard key={active} workspace={data} busy={!!busy} pendingDate={dateChanged}
          onLibrary={() => go('clips')} onQueue={name => go('queue', name)} onAssign={changeCreators} />}
      </div>
    </main>
    <input ref={importInput} type="file" className="sr-only" tabIndex={-1} accept=".xlsx,.csv,.tsv"
      aria-label="Nhập bảng ưu đãi" onChange={event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) void handleImport(file);
      }} />
    {dialog === 'clip' && <ClipDialog clip={editing} skus={[...new Set(version?.offers.map(row => row.sku) ?? [])]}
      onClose={clearDialog} onSave={saveClips} busy={busy} onCancel={() => cancel.current?.abort()}
      onOpen={clip => { clearDialog(); setClipFilters(allClipFilters); setFilter('all'); selectClip(clip.id); }} />}
    {dialog === 'catalog' && <CatalogDialog clips={data.clips} onApply={importCatalog} onClose={clearDialog} />}
    {dialog === 'batch' && <BatchDialog clips={data.clips} initialClipId={editing?.id} onRun={scanBatch} onClose={clearDialog} />}
    {dialog === 'campaigns' && <CampaignManager items={campaigns} active={active} onOpen={launchCampaign}
      onCreate={addCampaign} onRename={changeCampaign} onBackup={exportCampaign} onRestore={restoreCampaign} onClose={clearDialog} />}
    {dialog === 'evidence' && <EvidenceDialog row={evidenceIndex === null ? undefined : editing?.evidence[evidenceIndex]}
      onSave={saveEvidence} onClose={clearDialog} />}
    {dialog === 'offers' && <OfferDialog offers={version?.offers ?? []} onClose={clearDialog} onSave={newOffers} />}
    {dialog === 'verify-offers' && offerImport && <ConfirmOfferImport items={offerImport.warnings} onClose={clearDialog}
      onSave={() => newOffers(offerImport.offers)} />}
    {dialog === 'brief' && version?.offers.length ? <OfferBriefDialog offers={version.offers} version={data.versions.length}
      onClose={clearDialog} /> : null}
    {dialog === 'impact' && impact && <OfferImpactDialog impact={impact} onClose={clearDialog}
      onOpen={(clip, finding) => { clearDialog(); openFinding(clip, finding); }}
      onHandoff={() => setDialog('impact-handoff')} blockHandoff={dateChanged} />}
    {dialog === 'impact-handoff' && impact && <HandoffDialog rows={impact.pending} version={impact.version} checkedAt={impact.checkedAt}
      onClose={() => setDialog('impact')} />}
    {dialog === 'delete' && <Modal title="Xóa video?" detail={editing?.title} busy={!!busy} onClose={clearDialog}>
      <p className="delete-description">File video, phụ đề và phản hồi của clip này sẽ bị xóa khỏi trình duyệt.</p>
      <div className="dialog-actions"><button className="button secondary" onClick={clearDialog} disabled={!!busy}>Giữ lại</button>
        <button className="button primary" onClick={() => void deleteClip()} disabled={!!busy}>Xóa video</button>
      </div>
    </Modal>}
    {deleted && !dialog && <div className="trash-undo">
      <span role="status">Đã xóa video “{deleted.clip.title}”.</span>
      <button type="button" className="button secondary" disabled={!!busy} onClick={() => void undoDelete()}>Hoàn tác xóa</button>
    </div>}
    {notice && !dialog && <div className={`toast ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'}>
      {notice.error ? <CircleAlert size={19} /> : <CheckCircle2 size={19} />}
      <span>{notice.text}</span><button className="icon-button" aria-label="Ẩn thông báo" onClick={() => setNotice(null)}><X size={16} /></button>
    </div>}
  </div>;
}
