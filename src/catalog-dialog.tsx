import { ArrowDownToLine, CircleAlert, FileSpreadsheet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { catalogCsv, planCatalog } from './catalog';
import type { Clip } from './domain';
import { csv, download, readTableFile } from './files';
import { Modal, TableRegion } from './ui';

const labels = { add: 'Mới', update: 'Cập nhật', same: 'Đã khớp', skip: 'Trùng dòng', invalid: 'Cần sửa' };

export function CatalogDialog({ clips, onApply, onClose }: {
  clips: Clip[]; onApply: (rows: unknown[][]) => Promise<void>; onClose: () => void;
}) {
  const [rows, setRows] = useState<unknown[][]>();
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [onlyIssues, setOnlyIssues] = useState(false);
  const plan = useMemo(() => rows ? planCatalog(rows, clips) : [], [rows, clips]);
  const upserts = plan.filter(row => row.state === 'add' || row.state === 'update');
  const issues = plan.filter(row => row.state === 'invalid' || row.state === 'skip');
  const shown = onlyIssues ? issues : plan;

  async function processFile(file: File) {
    setBusy(true); setError(''); setRows(undefined); setFileName(''); setOnlyIssues(false);
    try {
      const input = await readTableFile(file);
      if (!planCatalog(input, clips).length) throw Error('Bảng chưa có dòng video nào.');
      setRows(input);
      setFileName(file.name);
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  }

  async function submit() {
    if (!rows) return;
    setBusy(true); setError('');
    try { await onApply(rows); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  }

  return <Modal title="Nhập danh sách video" detail="Dùng file CSV, TSV hoặc Excel để đưa link và số liệu vào kho." onClose={onClose} busy={busy}>
    <div className="dialog-form">
      <div className="catalog-controls">
        <label className="button secondary file-button focus-label" aria-disabled={busy}><FileSpreadsheet size={17} /> {fileName ? 'Chọn bảng khác' : 'Chọn bảng video'}
          <input type="file" className="sr-only" accept=".csv,.tsv,.xlsx" aria-label="Chọn bảng video" disabled={busy} onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void processFile(file);
          }} />
        </label>
        <button className="button secondary" type="button" onClick={() => download(catalogCsv(), 'mau-kho-video.csv')}><ArrowDownToLine size={16} /> Tải mẫu CSV</button>
      </div>
      <p className="hint-text">App nhận diện video theo link hoặc ID. Nên dùng link đầy đủ để tránh Excel làm tròn ID dài. File video và đoạn trích đã lưu được giữ khi cập nhật.</p>
      {error && <p className="form-error" role="alert"><CircleAlert size={16} /> {error}</p>}
      {busy && <p className="progress-message" role="status">Đang đọc hoặc lưu bảng video…</p>}
      {fileName && <div className="catalog-preview">
        <div className="catalog-summary">
          <div><strong>{fileName}</strong><p role="status">{plan.filter(row => row.state === 'add').length} mới · {plan.filter(row => row.state === 'update').length} cập nhật · {issues.length} dòng cần xem</p></div>
          <label><input type="checkbox" checked={onlyIssues} onChange={event => setOnlyIssues(event.target.checked)} /> Chỉ xem dòng có vấn đề</label>
        </div>
        {shown.length ? <TableRegion label="Xem trước các dòng sẽ nhập"><table className="catalog-table">
          <thead><tr><th scope="col">Dòng</th><th scope="col">Video</th><th scope="col">Trạng thái</th><th scope="col">Chi tiết</th></tr></thead>
          <tbody>{shown.slice(0, 200).map(row => <tr key={row.line}><td>{row.line}</td><td>{row.title}</td>
            <td><span className={`import-tag ${row.state}`}>{labels[row.state]}</span></td><td>{row.detail}</td></tr>)}</tbody>
        </table></TableRegion> : <p className="empty-inline">Không có dòng cần sửa hoặc trùng trong file.</p>}
        {shown.length > 200 && <p className="hint-text">Hiển thị 200 dòng đầu trong bộ lọc. Báo cáo dòng lỗi chứa toàn bộ dòng có vấn đề.</p>}
      </div>}
      <div className="dialog-actions">
        {issues.length > 0 && <button type="button" className="button secondary start-action" onClick={() => download(csv([
          ['Dòng', 'Video', 'Vấn đề'], ...issues.map(row => [row.line, row.title, row.detail]),
        ]), 'loi-nhap-video.csv')}>Tải các dòng lỗi</button>}
        <button type="button" className="button secondary" onClick={onClose} disabled={busy}>Hủy</button>
        <button type="button" className="button primary" disabled={busy || !upserts.length} onClick={() => void submit()}>
          Nhập {upserts.length} video hợp lệ
        </button>
      </div>
    </div>
  </Modal>;
}
