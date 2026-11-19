import { useRef, useState, type FormEvent } from 'react';
import { ArrowUpFromLine, CircleAlert, CirclePlus, FileText, LoaderCircle, Trash2 } from 'lucide-react';
import { clipFormats, normalizeCode, safeLink } from './domain';
import type { Clip, ClipFormat, Evidence, Offer, VideoStats } from './domain';
import { readCount } from './catalog';
import { readPrice, readSubtitles } from './files';
import { validateOffers } from './audit';
import { type ScanOptions, validateVideo } from './media';
import { Modal } from './ui';

export interface DraftClip {
  title: string; sku: string; link: string; published: string; format?: ClipFormat;
  creator?: string; stats?: VideoStats; evidence: Evidence[]; file: File | null;
}

export function ClipDialog({ clip, skus, onSave, onClose, busy, onCancel }: {
  clip?: Clip;
  skus: string[];
  onSave: (drafts: DraftClip[], scan: ScanOptions) => Promise<void>;
  onClose: () => void;
  busy: string;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(clip?.title ?? '');
  const [sku, setSku] = useState(clip?.sku ?? '');
  const [link, setLink] = useState(clip?.link ?? '');
  const [published, setPublished] = useState(clip?.published ?? '');
  const [format, setFormat] = useState<ClipFormat | ''>(clip?.format ?? '');
  const [creator, setCreator] = useState(clip?.creator ?? '');
  const [views, setViews] = useState(clip?.stats?.views?.toString() ?? '');
  const [orders, setOrders] = useState(clip?.stats?.orders?.toString() ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [fileSkus, setFileSkus] = useState<string[]>([]);
  const [subtitles, setSubtitles] = useState('');
  const [subtitleFile, setSubtitleFile] = useState('');
  const [audio, setAudio] = useState(true);
  const [frame, setFrame] = useState(true);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const many = files.length > 1;

  function pick(selected: File[]) {
    try {
      if (selected.length > 20 || (clip && selected.length > 1)) {
        throw Error(clip ? 'Chỉ chọn một video để thay.' : 'Chọn tối đa 20 video mỗi lượt.');
      }
      selected.forEach(validateVideo);
      setFiles(selected);
      if (selected.length > 1 && files.length <= 1) {
        setAudio(false);
        setFrame(false);
      }
      setFileSkus(selected.map(() => ''));
      setError('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Video không hợp lệ.');
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const url = link.trim() ? safeLink(link.trim()) : '';
      if (link.trim() && !url && !many) throw Error('Dùng link bắt đầu bằng https:// hoặc http://.');
      const evidence = subtitles.trim() && !many ? readSubtitles(subtitles, subtitleFile ? 'subtitle' : 'manual') : [];
      const selections: (File | null)[] = files.length ? files : [null];
      const stats: VideoStats | undefined = !many && (views || orders)
        ? { views: readCount(views, 'Lượt xem'), orders: readCount(orders, 'Số đơn') } : undefined;
      const drafts = selections.map((file, index) => ({
        title: (!many && title.trim()) || file?.name.replace(/\.[^.]+$/, '') || '',
        sku: normalizeCode(fileSkus[index]?.trim() || sku),
        link: many ? '' : url, published, format: format || undefined, evidence, file,
        creator: !many && creator.trim() ? creator.trim() : undefined, stats,
      }));
      if (drafts.some(item => !item.title)) throw Error('Nhập tên video.');
      if (drafts.some(item => item.title.length > 140)) throw Error('Tên video tối đa 140 ký tự.');
      await onSave(drafts, { audio: files.length > 0 && audio, frame: files.length > 0 && frame });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Chưa lưu được video.');
    }
  }

  return <Modal title={clip ? 'Sửa video' : 'Thêm video'} detail="Tải video hoặc nhập phụ đề có mốc thời gian." busy={!!busy} onClose={onClose}>
    <form className="dialog-form" onSubmit={submit}>
      <input ref={input} type="file" className="sr-only" tabIndex={-1}
        accept=".mp4,.webm,.mov,.m4v,video/mp4,video/webm,video/quicktime" multiple={!clip}
        onChange={event => { pick(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
      <button type="button" className="dropzone" disabled={!!busy} onClick={() => input.current?.click()}
        onDragOver={event => event.preventDefault()}
        onDrop={event => { event.preventDefault(); if (!busy) pick(Array.from(event.dataTransfer.files)); }}>
        <span className="drop-icon"><ArrowUpFromLine size={20} /></span>
        <strong>{files.length ? `${files.length} video đã chọn · Đổi file` : 'Chọn hoặc kéo video vào đây'}</strong>
        <small>MP4, WebM, MOV, M4V · tối đa 2 phút và 150 MB mỗi clip</small>
      </button>
      {files.length > 0 && <div className="selected-files">
        {files.map((file, i) => <div key={i}>
          <span>{file.name}</span>
          {many && <input aria-label={`SKU cho ${file.name}`} placeholder="SKU riêng" list="clip-skus"
            value={fileSkus[i]} onChange={event => setFileSkus(values => values.map((value, j) => j === i ? event.target.value : value))}
            disabled={!!busy} />}
        </div>)}
        <button type="button" className="text-button" disabled={!!busy} onClick={() => pick([])}>Bỏ file đã chọn</button>
      </div>}
      <div className="form-grid">
        {!many && <label>Tên video<input value={title} maxLength={140} onChange={event => setTitle(event.target.value)} placeholder="Ví dụ: Bình giữ nhiệt 500 ml" disabled={!!busy} /></label>}
        <label>{many ? 'SKU mặc định' : 'Mã phân loại (SKU)'}<input value={sku} maxLength={100} onChange={event => setSku(event.target.value)} list="clip-skus" placeholder="BINH-500" disabled={!!busy} /></label>
        <datalist id="clip-skus">{skus.map(value => <option key={value} value={value} />)}</datalist>
        {!many && <label>Link bài đăng<input type="url" value={link} onChange={event => setLink(event.target.value)} placeholder="https://…" disabled={!!busy} /></label>}
        <label>Ngày đăng<input type="date" value={published} onChange={event => setPublished(event.target.value)} disabled={!!busy} /></label>
        <label>Kiểu video<select value={format} disabled={!!busy} onChange={event => setFormat(event.target.value as typeof format)}>
          <option value="">Chưa chọn kiểu</option>
          {Object.entries(clipFormats).map(([key, name]) => <option value={key} key={key}>{name}</option>)}
        </select></label>
      </div>
      {!many && <details className="clip-stats-editor" open={Boolean(creator || views || orders) || undefined}>
        <summary>Nhà sáng tạo và số liệu đã ghi nhận</summary>
        <div className="form-grid">
          <label>Nhà sáng tạo<input value={creator} maxLength={100} onChange={event => setCreator(event.target.value)} disabled={!!busy} /></label>
          <label>Lượt xem đã nhập<input value={views} inputMode="numeric" maxLength={24} onChange={event => setViews(event.target.value)} disabled={!!busy} /></label>
          <label>Số đơn đã nhập<input value={orders} inputMode="numeric" maxLength={24} onChange={event => setOrders(event.target.value)} disabled={!!busy} /></label>
        </div>
      </details>}
      {files.length > 0 && <fieldset className="scan-options"><legend>Phân tích trên thiết bị</legend>
        <label><input type="checkbox" checked={audio} onChange={event => setAudio(event.target.checked)} disabled={!!busy} /> Lời thoại</label>
        <label><input type="checkbox" checked={frame} onChange={event => setFrame(event.target.checked)} disabled={!!busy} /> Chữ trên khung hình</label>
        <small>{many ? 'Có thể lưu file trước rồi quét hàng loạt trong Kho video.' : 'Lần đầu trình duyệt tải mô hình. Video được xử lý tại chỗ.'}</small>
      </fieldset>}
      {!many && <div className="subtitle-label">
        <div><label htmlFor="clip-subtitles">Phụ đề hoặc ghi chú</label>
          <label className="text-button file-button" aria-disabled={!!busy}><FileText size={14} /> Chọn SRT / VTT
          <input type="file" className="sr-only" accept=".srt,.vtt,.txt" disabled={!!busy} onChange={async event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file && file.size > 1024 * 1024) { setError('Phụ đề tối đa 1 MB.'); return; }
            if (file) {
              try { setSubtitles(await file.text()); setSubtitleFile(file.name); setError(''); }
              catch { setError('Chưa đọc được file phụ đề.'); }
            }
          }} />
        </label></div>
        <textarea id="clip-subtitles" value={subtitles} maxLength={200000} disabled={!!busy} placeholder="00:05 Còn 99k khi áp mã SALE99." rows={3}
          onChange={event => { setSubtitles(event.target.value); setSubtitleFile(''); }} />
        <small>{subtitleFile || (clip ? 'Nội dung mới sẽ thay phụ đề và ghi chú đã nhập.' : 'Mỗi dòng bắt đầu bằng phút:giây.')}</small>
      </div>}
      {error && <p className="form-error" role="alert"><CircleAlert size={16} /> {error}</p>}
      {busy && <p className="progress-message" role="status"><LoaderCircle size={16} className="spin" /> {busy}</p>}
      <div className="dialog-actions">
        <button type="button" className="button secondary" onClick={busy ? onCancel : onClose}>{busy ? 'Dừng phân tích' : 'Hủy'}</button>
        <button type="submit" className="button primary" disabled={!!busy}>{clip ? 'Lưu video' : 'Thêm vào kho'}</button>
      </div>
    </form>
  </Modal>;
}

type OfferRow = Omit<Offer, 'price'> & { price: string };
const blankOffer: OfferRow = { sku: '', name: '', code: '', price: '', gift: '', start: '', end: '', condition: '' };

export function OfferDialog({ offers, onSave, onClose }: { offers: Offer[]; onSave: (value: Offer[]) => Promise<void>; onClose: () => void }) {
  const [rows, setRows] = useState<OfferRow[]>(offers.length
    ? offers.map(row => ({ ...row, price: row.price?.toString() ?? '' })) : [{ ...blankOffer }]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fields: { key: keyof OfferRow; label: string; holder: string }[] = [
    { key: 'sku', label: 'SKU', holder: 'BINH-500' }, { key: 'name', label: 'Tên sản phẩm', holder: 'Bình giữ nhiệt 500 ml' },
    { key: 'code', label: 'Voucher', holder: 'SALE99' }, { key: 'price', label: 'Giá (đ)', holder: '99000' },
    { key: 'gift', label: 'Quà tặng', holder: 'Lõi thay' }, { key: 'condition', label: 'Điều kiện', holder: 'Đơn từ 200k' },
    { key: 'start', label: 'Bắt đầu', holder: '2026-11-09' }, { key: 'end', label: 'Kết thúc', holder: '2026-11-11 23:59' },
  ];
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(validateOffers(rows.map(row => ({ ...row, price: readPrice(row.price) }))));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Chưa lưu được bảng.');
    } finally { setSaving(false); }
  }
  return <Modal title="Sửa bảng ưu đãi" detail="Mỗi lần lưu tạo một phiên bản mới. Ngày và giờ dùng theo giờ Việt Nam." busy={saving} onClose={onClose}>
    <form className="dialog-form" onSubmit={submit}>
      <div className="offer-edit-list">
        {rows.map((row, index) => <fieldset className="offer-edit" key={index}>
          <legend>Dòng {index + 1}</legend>
          {rows.length > 1 && <button type="button" className="icon-button remove-row" title="Xóa dòng" aria-label={`Xóa dòng ${index + 1}`}
            onClick={() => setRows(values => values.filter((_, at) => at !== index))} disabled={saving}><Trash2 size={16} /></button>}
          <div className="form-grid">{fields.map(field => <label key={field.key}>{field.label}
            <input value={row[field.key]} placeholder={field.holder} disabled={saving}
              onChange={event => setRows(values => values.map((value, at) => at === index ? { ...value, [field.key]: event.target.value } : value))} />
          </label>)}</div>
        </fieldset>)}
      </div>
      <button type="button" className="button secondary add-offer" onClick={() => setRows(values => [...values, { ...blankOffer }])} disabled={saving}><CirclePlus size={16} /> Thêm dòng</button>
      {error && <p className="form-error" role="alert"><CircleAlert size={16} /> {error}</p>}
      <div className="dialog-actions">
        <button type="button" className="button secondary" onClick={onClose} disabled={saving}>Hủy</button>
        <button className="button primary" type="submit" disabled={saving}>Lưu phiên bản</button>
      </div>
    </form>
  </Modal>;
}
