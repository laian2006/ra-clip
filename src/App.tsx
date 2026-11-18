import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine, ArrowRight, ArrowUpRight, BookOpen, CheckCircle2, ChevronDown, CircleAlert,
  CircleHelp, Clapperboard, FileSpreadsheet, Film, Github, LayoutDashboard, LoaderCircle,
  Plus, ScanLine, ShieldCheck, SwitchCamera, X,
} from 'lucide-react';
import { runAudit } from './audit';
import { ClipDetail, ClipList, leadVerdict, Metrics } from './dashboard';
import { ClipDialog, OfferDialog, type DraftClip } from './dialogs';
import { displayDate, localTime, verdictLabels } from './domain';
import type { Clip, Offer, Review, Verdict, Workspace } from './domain';
import { auditCsv, download, importOffers } from './files';
import { analyzeVideo, videoMetadata, type ScanOptions } from './media';
import { emptyWorkspace, sampleWorkspace } from './demo';
import { OffersView } from './offers';
import { loadMedia, loadWorkspace, saveWorkspace, type MediaChange } from './storage';
import { Brand, Modal } from './ui';

type Page = 'report' | 'clips' | 'offers' | 'guide';
type Notice = { text: string; error?: boolean };
const pages = [
  { id: 'report', label: 'Rà soát', icon: LayoutDashboard },
  { id: 'clips', label: 'Kho video', icon: Film },
  { id: 'offers', label: 'Bảng ưu đãi', icon: FileSpreadsheet },
  { id: 'guide', label: 'Hướng dẫn', icon: CircleHelp },
] as const;

const title: Record<Page, string> = {
  report: 'Rà soát video sau sale', clips: 'Kho video', offers: 'Bảng ưu đãi', guide: 'Hướng dẫn sử dụng',
};

const descriptions: Record<Page, string> = {
  report: 'Tìm lại những clip còn nhắc giá, voucher hoặc quà tặng cũ.',
  clips: 'Quản lý video, phụ đề và mã sản phẩm cần đối chiếu.',
  offers: 'Lưu từng phiên bản giá, voucher và quà tặng theo SKU.',
  guide: 'Từ bảng ưu đãi và clip gốc đến báo cáo có bằng chứng.',
};

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function updatedReport(workspace: Workspace, manual = false): Workspace {
  return { ...workspace, audit: workspace.versions.length
    ? runAudit(workspace.clips, workspace.versions, workspace.checkedAt, manual ? null : workspace.audit)
    : null };
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
  const [page, setPage] = useState<Page>('report');
  const [filter, setFilter] = useState<Verdict | 'all'>('all');
  const [selected, setSelected] = useState('');
  const [date, setDate] = useState('');
  const [dialog, setDialog] = useState<'clip' | 'offers' | 'delete' | null>(null);
  const [editing, setEditing] = useState<Clip>();
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const cancel = useRef<AbortController | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const writing = useRef(false);

  async function open(demo: boolean) {
    setBusy('Đang mở không gian làm việc…');
    try {
      const data = await loadWorkspace(demo) ?? (demo ? sampleWorkspace() : emptyWorkspace());
      setWorkspace(data);
      setDate(data.checkedAt);
      setPage('report');
      setFilter('all');
      setSelected(data.clips[0]?.id ?? '');
      window.localStorage.setItem('ra-clip-mode', demo ? 'demo' : 'shop');
      setNotice(null);
    } catch (error) {
      setNotice({ text: `Không mở được bộ nhớ trình duyệt. ${errorText(error)}`, error: true });
      setWorkspace(previous => previous ?? sampleWorkspace());
      setDate(previous => previous || sampleWorkspace().checkedAt);
    } finally { setBusy(''); }
  }

  useEffect(() => {
    let demo = true;
    try { demo = window.localStorage.getItem('ra-clip-mode') !== 'shop'; }
    catch { /* Browsers can disable storage. The demo can still be displayed. */ }
    void open(demo);
  }, []);

  async function persist(next: Workspace, media?: MediaChange[]) {
    if (writing.current) throw Error('Đang lưu thay đổi. Thử lại sau khi lưu xong.');
    writing.current = true;
    try {
      await saveWorkspace(next, media);
      setWorkspace(next);
    } finally { writing.current = false; }
  }

  function notify(text: string, error = false) { setNotice({ text, error }); }
  function startAdd() { setEditing(undefined); setDialog('clip'); }
  function go(next: Page) { setPage(next); setFilter('all'); }
  function startEdit(clip: Clip) { setEditing(clip); setDialog('clip'); }
  function startDelete(clip: Clip) { setEditing(clip); setDialog('delete'); }
  function clearDialog() { setDialog(null); setEditing(undefined); }

  if (!workspace) return <div className="boot"><Brand /><p role="status">Đang mở Rà Clip…</p></div>;
  const data = workspace;
  const version = data.versions.at(-1);
  const results = data.audit?.results ?? [];
  const resultIndex = new Map(results.map(row => [row.clipId, row]));
  const availableClips = page === 'report' && filter !== 'all'
    ? data.clips.filter(clip => leadVerdict(resultIndex.get(clip.id)?.findings ?? []) === filter)
    : data.clips;
  const currentClip = availableClips.find(clip => clip.id === selected) ?? availableClips[0];
  const dateChanged = date !== data.checkedAt;
  const found = results.filter(row => leadVerdict(row.findings) === 'action').length;

  async function newOffers(offers: Offer[]) {
    if (JSON.stringify(version?.offers) === JSON.stringify(offers)) {
      clearDialog();
      notify('Bảng ưu đãi giống phiên bản hiện tại.');
      return;
    }
    const next = updatedReport({ ...data, versions: [...data.versions, { id: crypto.randomUUID(), at: localTime(), offers }] });
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
        if (draft.evidence.length) evidence = evidence.filter(row => row.source === 'audio' || row.source === 'frame');
        if (draft.file) {
          const file = draft.file;
          evidence = evidence.filter(row => row.source !== 'audio' && row.source !== 'frame');
          if (options.audio || options.frame) {
            const result = await analyzeVideo(file, options, message =>
              setBusy(`${index + 1}/${drafts.length} · ${message}`), controller.signal);
            evidence = [...evidence, ...result.evidence];
            warnings.push(...result.notes.map(note => `${draft.title} · ${note}`));
          } else {
            setBusy(`${index + 1}/${drafts.length} · Kiểm tra video…`);
            (await videoMetadata(file, controller.signal)).release();
          }
          media.push({ id, blob: file });
        }
        rows.push({
          id, title: draft.title, sku: draft.sku, link: draft.link, published: draft.published,
          evidence: [...evidence, ...draft.evidence].sort((a, b) => a.start - b.start),
          localMedia: Boolean(draft.file || editing?.localMedia),
          demoMedia: !draft.file && editing?.demoMedia,
        });
      }
      controller.signal.throwIfAborted();
      const clips = editing ? data.clips.map(clip => clip.id === editing.id ? rows[0] : clip) : [...data.clips, ...rows];
      setBusy('Đang lưu video…');
      cancel.current = null;
      await persist(updatedReport({ ...data, clips }), media);
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
    try {
      const blob = clip.localMedia ? await loadMedia(clip.id)
        : await fetch(`${import.meta.env.BASE_URL}binh-500.webm`, { signal: controller.signal }).then(res => {
          if (!res.ok) throw Error('Chưa mở được video mẫu.');
          return res.blob();
        });
      if (!blob) throw Error('File video vắng mặt trong bộ nhớ trình duyệt.');
      const result = await analyzeVideo(blob, { audio: true, frame: true }, setBusy, controller.signal);
      if (!result.evidence.length) throw Error(result.notes.join(' · ') || 'Chưa trích được lời thoại hoặc chữ.');
      const sources = new Set(result.evidence.map(row => row.source));
      const evidence = [...clip.evidence.filter(row => !sources.has(row.source)), ...result.evidence].sort((a, b) => a.start - b.start);
      const clips = data.clips.map(row => row.id === clip.id ? { ...row, evidence } : row);
      setBusy('Đang lưu bằng chứng…');
      cancel.current = null;
      await persist(updatedReport({ ...data, clips }));
      notify(`Đã đọc ${result.evidence.length} đoạn.${result.notes.length ? ' ' + result.notes.join(' · ') : ''}`, result.notes.length > 0);
    } catch (error) { notify(controller.signal.aborted ? 'Đã dừng phân tích video.' : errorText(error), !controller.signal.aborted); }
    finally { setBusy(''); cancel.current = null; }
  }

  async function deleteClip() {
    if (!editing) return;
    setBusy('Đang xóa video…');
    try {
      const clips = data.clips.filter(clip => clip.id !== editing?.id);
      const reviews = Object.fromEntries(Object.entries(data.reviews).filter(([key]) => {
        try { return JSON.parse(key)[0] !== editing.id; } catch { return false; }
      }));
      await persist(updatedReport({ ...data, clips, reviews }), [{ id: editing.id, blob: null }]);
      clearDialog();
      notify('Đã xóa video khỏi kho.');
    } catch (error) { notify(errorText(error), true); }
    finally { setBusy(''); }
  }

  async function review(id: string, value: Review | '') {
    const reviews = { ...data.reviews };
    if (value) reviews[id] = value;
    else delete reviews[id];
    try { await persist({ ...data, reviews }); }
    catch (error) { notify(errorText(error), true); }
  }

  async function runReport() {
    if (!version) { go('offers'); notify('Thêm bảng ưu đãi trước khi rà.'); return; }
    try {
      const next = updatedReport({ ...data, checkedAt: date }, true);
      await persist(next);
      notify(`Đã rà ${data.clips.length} video theo bảng v${data.versions.length}.`);
    } catch (error) { notify(errorText(error), true); }
  }

  function exportReport() {
    if (data.audit) {
      download(auditCsv(data.audit, data.clips, data.reviews), `ra-clip-${data.audit.checkedAt.slice(0, 10)}.csv`);
      notify('Đã tạo file báo cáo CSV.');
    }
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="sidebar-top"><Brand />
        <div className="workspace-switch">
          <span className="workspace-icon"><Clapperboard size={18} /></span>
          <div><strong>{data.demo ? 'Không gian mẫu' : 'Không gian của shop'}</strong>
            <small>{data.demo ? 'Dữ liệu minh họa' : 'Dữ liệu trên máy'}</small></div>
          <ChevronDown size={13} />
          <label className="workspace-select"><span className="sr-only">Không gian làm việc</span>
            <select aria-label="Không gian làm việc" value={data.demo ? 'demo' : 'shop'} disabled={!!busy}
              onChange={event => void open(event.target.value === 'demo')}>
              <option value="demo">Không gian mẫu</option><option value="shop">Không gian của shop</option>
            </select>
          </label>
        </div>
        <nav aria-label="Điều hướng chính">{pages.map(({ id, label, icon: Icon }) =>
          <button type="button" className={page === id ? 'on' : ''} aria-current={page === id ? 'page' : undefined} key={id} onClick={() => go(id)}>
            <Icon size={18} /> <span>{label}</span>{page === id && <span className="nav-indicator" />}
          </button>)}</nav>
      </div>
      <div className="sidebar-bottom">
        <div className="privacy-note"><ShieldCheck size={19} /><span><strong>Xử lý trên thiết bị</strong><small>Video lưu trên trình duyệt</small></span></div>
        <a href="https://github.com/laian2006/ra-clip" target="_blank" rel="noopener noreferrer"><Github size={16} /> GitHub <ArrowUpRight size={13} /></a>
      </div>
    </aside>

    <main className="main">
      <header className="topbar"><div className="breadcrumb"><span>Không gian làm việc</span><span>/</span><strong>{pages.find(item => item.id === page)?.label}</strong></div>
        <div className="top-actions">
          <button className="button secondary" onClick={exportReport} disabled={!data.audit || !data.clips.length || !!busy}><ArrowDownToLine size={17} /> Xuất báo cáo</button>
          <button className="button primary" onClick={startAdd} disabled={!!busy}><Plus size={18} /> Thêm video</button>
        </div>
      </header>
      <div className="main-content">
        <div className="page-title">
          <div><h1>{title[page]}</h1><p>{descriptions[page]}</p></div>
          {page === 'report' && <span className="activity-pill"><span /> {data.audit ? `Đã rà ${results.length} video` : 'Chưa có lần rà'}</span>}
        </div>
        {data.demo && page === 'report' && <div className="demo-banner">
          <span className="demo-symbol"><SwitchCamera size={17} /></span>
          <div><strong>Đang xem dữ liệu mẫu</strong><span> · Thử mở một video hoặc sửa bảng ưu đãi.</span></div>
          <button className="text-button" onClick={() => void open(false)} disabled={!!busy}>Dùng dữ liệu của bạn <ArrowRight size={16} /></button>
        </div>}
        {busy && !dialog && <div className="inline-status" role="status"><LoaderCircle size={17} className="spin" /> {busy}
          {cancel.current && <button className="text-button" onClick={() => cancel.current?.abort()}>Dừng</button>}
        </div>}
        {page === 'report' && <>
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
        {(page === 'report' || page === 'clips') && <div className="board">
          {page === 'report' && filter !== 'all' && <div className="filter-strip">Đang lọc: {verdictLabels[filter]}
            <button className="text-button" onClick={() => setFilter('all')}>Xóa bộ lọc <X size={14} /></button></div>}
          <ClipList key={page} clips={data.clips} results={resultIndex} filter={filter} selected={currentClip?.id ?? ''}
            onSelect={setSelected} onAdd={startAdd} library={page === 'clips'} ready={!!data.audit} />
          <ClipDetail key={currentClip?.id ?? 'empty'} clip={currentClip} result={currentClip && resultIndex.get(currentClip.id)}
            reviews={data.reviews} onReview={(id, value) => void review(id, value)} onEdit={startEdit} onDelete={startDelete}
            onScan={clip => void rescan(clip)} busy={!!busy} />
        </div>}
        {page === 'offers' && <OffersView versions={data.versions} onImport={() => importInput.current?.click()}
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
