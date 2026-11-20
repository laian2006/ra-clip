import { useEffect, useState, type FormEvent } from 'react';
import { ArrowUpRight, CircleAlert, Clapperboard, Download, FolderPlus, Pencil, Upload } from 'lucide-react';
import type { Campaign, CampaignDraft } from './domain';
import { Modal } from './ui';

const sizeLabel = (bytes: number) => bytes >= 1024 ** 3
  ? `${(bytes / 1024 ** 3).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} GB`
  : `${Math.ceil(bytes / 1024 ** 2).toLocaleString('vi-VN')} MB`;

export function CampaignManager({ items, active, onOpen, onCreate, onRename, onBackup, onRestore, onClose }: {
  items: Campaign[];
  active: string;
  onOpen: (id: string) => Promise<void>;
  onCreate: (draft: CampaignDraft) => Promise<void>;
  onRename: (id: string, draft: CampaignDraft) => Promise<void>;
  onBackup: (id: string) => Promise<void>;
  onRestore: (file: File) => Promise<void>;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [shop, setShop] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [backupStatus, setBackupStatus] = useState('');
  const [storage, setStorage] = useState<{ usage: number; quota: number }>();
  const [estimating, setEstimating] = useState(true);
  useEffect(() => {
    let mounted = true;
    async function estimate() {
      try {
        const result = await navigator.storage?.estimate?.();
        if (mounted && result && Number.isFinite(result.usage) && Number.isFinite(result.quota) && result.quota! > 0) {
          setStorage({ usage: result.usage!, quota: result.quota! });
        }
      } catch { /* Storage estimates are optional. */ }
      finally { if (mounted) setEstimating(false); }
    }
    void estimate();
    return () => { mounted = false; };
  }, []);

  function edit(item?: Campaign) {
    setEditing(item ?? null);
    setName(item?.name ?? '');
    setShop(item?.shop ?? '');
    setShowForm(true);
    setError('');
  }

  async function apply(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setBackupStatus('');
    try { await action(); }
    catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally { setBusy(false); }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void apply(async () => {
      const next = { name, shop };
      if (editing) await onRename(editing.id, next);
      else await onCreate(next);
      setShowForm(false);
    });
  }

  const ratio = storage ? storage.usage / storage.quota : 0;
  return <Modal title="Quản lý chiến dịch" detail="Mỗi chiến dịch có bảng ưu đãi, kho video và lịch sử riêng." busy={busy} onClose={onClose}>
    <div className="campaign-dialog">
      <section className="campaign-storage" aria-labelledby="storage-title">
        <h3 id="storage-title">Dung lượng trên trình duyệt</h3>
        {storage ? <>
          <meter min={0} max={1} high={0.85} optimum={0} value={Math.min(ratio, 1)} aria-labelledby="storage-title" />
          <p className="hint-text">Đã dùng khoảng {sizeLabel(storage.usage)} / {sizeLabel(storage.quota)} · còn khoảng {sizeLabel(Math.max(0, storage.quota - storage.usage))}.</p>
          {ratio >= 0.85 && <p className="form-error" role="alert">Dung lượng gần đầy. Sao lưu chiến dịch trước khi thêm video.</p>}
        </> : <p className="hint-text">{estimating ? 'Đang ước tính dung lượng…' : 'Trình duyệt chưa cung cấp số liệu dung lượng.'}</p>}
      </section>
      {showForm ? <form className="campaign-form" onSubmit={submit}>
        <div className="form-grid">
          <label>Tên chiến dịch<input value={name} onChange={event => setName(event.target.value)} maxLength={80} required
            placeholder="Ví dụ: Đợt sale 12.12" autoFocus disabled={busy} /></label>
          <label>Tên shop (tùy chọn)<input value={shop} onChange={event => setShop(event.target.value)} maxLength={80} disabled={busy} /></label>
        </div>
        <div className="toolbar-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={() => setShowForm(false)}>Hủy</button>
          <button type="submit" className="button primary" disabled={busy}>{editing ? 'Lưu tên' : 'Tạo và mở chiến dịch'}</button>
        </div>
      </form> : <div className="campaign-tools">
        <button className="button primary" disabled={busy} onClick={() => edit()}><FolderPlus size={16} /> Tạo chiến dịch</button>
        <label className="button secondary file-button" aria-disabled={busy}><Upload size={16} /> Mở bản sao lưu
          <input type="file" className="sr-only" aria-label="Mở bản sao lưu" accept=".raclip" disabled={busy} onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void apply(() => onRestore(file));
          }} />
        </label>
      </div>}
      {error && <p className="form-error" role="alert"><CircleAlert size={16} /> {error}</p>}
      {backupStatus && <p className="progress-message" role="status">{backupStatus}</p>}
      <div className="campaign-list">
        {items.map(item => <div className={`campaign-card ${active === item.id ? 'active' : ''}`} key={item.id}>
          <div className="campaign-card-icon"><Clapperboard size={19} /></div>
          <div className="campaign-card-label"><strong>{item.name}</strong>
            <small>{item.shop && item.shop + ' · '}{item.clipCount} video · {item.todoCount} việc đang mở</small></div>
          <button className="icon-button" disabled={busy} title="Đổi tên" aria-label={`Đổi tên ${item.name}`} onClick={() => edit(item)}><Pencil size={15} /></button>
          <button className="icon-button" disabled={busy} title="Sao lưu" aria-label={`Sao lưu ${item.name}`} onClick={() => void apply(async () => {
            await onBackup(item.id);
            setBackupStatus(`Đã kiểm tra khả năng mở bản sao lưu của “${item.name}” và bắt đầu tải file.`);
          })}><Download size={15} /></button>
          <button className="icon-button" disabled={busy} title="Mở chiến dịch" aria-label={`Mở ${item.name}`} onClick={() => void apply(() => onOpen(item.id))}><ArrowUpRight size={16} /></button>
        </div>)}
      </div>
    </div>
  </Modal>;
}
