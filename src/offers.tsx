import { ArrowRight, Clock3, Download, FileSpreadsheet, History, Pencil, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { displayDate, money, offerKey } from './domain';
import type { Clip, Offer, OfferVersion } from './domain';
import { csv, download, offersCsv, templateRows } from './files';
import { changedSkus, compareOffers, type OfferField } from './audit';
import { Empty, TableRegion } from './ui';

const fieldNames: Record<OfferField, string> = {
  name: 'Tên sản phẩm', price: 'Giá', gift: 'Quà tặng',
  start: 'Bắt đầu', end: 'Kết thúc', condition: 'Điều kiện',
};

function fieldValue(field: OfferField, offer?: Offer) {
  const value = offer?.[field];
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return money(value);
  if (field === 'start' || field === 'end') {
    return displayDate(value) + (value.length > 10 ? ' · ' + value.slice(11) : '');
  }
  return value;
}

export function OffersView({ versions, clips, onImport, onEdit, onNext, busy }: {
  versions: OfferVersion[]; clips: Clip[]; onImport: () => void; onEdit: () => void; onNext?: () => void; busy: boolean;
}) {
  const [viewId, setView] = useState('');
  const [tab, setTab] = useState<'table' | 'diff'>('table');
  const [comparisonId, setComparison] = useState('');
  const current = versions.at(-1);
  const viewing = versions.find(row => row.id === viewId) ?? current;
  useEffect(() => setView(''), [current?.id]);
  const index = viewing ? versions.indexOf(viewing) : -1;
  const previous = versions[index - 1];
  const changed = previous && viewing ? changedSkus(previous.offers, viewing.offers).size : 0;
  const comparison = versions.find(row => row.id === comparisonId && row.id !== viewing?.id) ??
    previous ?? versions.find(row => row.id !== viewing?.id);
  const changes = comparison && viewing ? compareOffers(comparison.offers, viewing.offers) : [];
  const impacted = new Set(changes.map(row => row.sku));
  const affectedClips = clips.filter(clip => impacted.has(clip.sku)).length;
  return <div className="offer-layout">
    <section className="panel">
      <div className="panel-heading offers-header">
        <div><h2>{viewing ? `Bảng ưu đãi · v${index + 1}` : 'Bảng ưu đãi'}</h2>
          <p>{viewing ? `${viewing.offers.length} dòng · ${displayDate(viewing.at)}` : 'Nhập bảng Excel, CSV hoặc TSV của shop.'}</p>
        </div>
        <div className="offer-actions">
          <button className="button secondary" onClick={() => download(csv(templateRows, false), 'mau-uu-dai.csv')}><Download size={16} /> Tải mẫu</button>
          <button className="button secondary" disabled={busy} onClick={onImport}><Upload size={16} /> Nhập bảng</button>
          <button className="button primary" disabled={busy} onClick={onEdit}><Pencil size={16} /> {current ? 'Sửa bảng' : 'Tạo bảng'}</button>
        </div>
      </div>
      {current && onNext && <div className="offer-next">
        <p>Bảng đã sẵn sàng. Thêm video có cùng mã sản phẩm (SKU) để app đối chiếu.</p>
        <button className="button primary" type="button" disabled={busy} onClick={onNext}>Thêm video để rà <ArrowRight size={16} aria-hidden="true" /></button>
      </div>}
      {viewing && versions.length > 1 && <div className="ops-toolbar offer-tabs">
        <div className="segmented" aria-label="Chế độ xem bảng">
          <button type="button" className={tab === 'table' ? 'active' : ''} aria-pressed={tab === 'table'} onClick={() => setTab('table')}>Dữ liệu ưu đãi</button>
          <button type="button" className={tab === 'diff' ? 'active' : ''} aria-pressed={tab === 'diff'} onClick={() => setTab('diff')}>So sánh phiên bản</button>
        </div>
      </div>}
      {viewing && tab === 'diff' && comparison ? <div className="diff-view">
        <div className="diff-summary"><label>So với <select aria-label="Phiên bản đối chiếu" value={comparison.id} onChange={event => setComparison(event.target.value)}>
          {versions.map((row, i) => row.id !== viewing.id && <option key={row.id} value={row.id}>v{i + 1} · {displayDate(row.at)}</option>)}
        </select></label><span>{changes.length} dòng thay đổi · {impacted.size} SKU · {affectedClips} video liên quan</span></div>
        {changes.length ? <div className="diff-list">{changes.map(row =>
          <article className="diff-row" key={row.key}>
            <div className="diff-title"><strong>{row.sku}</strong><span>{row.code || 'Giá thường'}</span>
              <span className={`diff-badge ${!row.before ? 'added' : !row.after ? 'removed' : 'modified'}`}>
                {!row.before ? 'Dòng mới' : !row.after ? 'Đã bỏ' : 'Đã sửa'}</span></div>
            <dl>{row.fields.filter(field => row.before && row.after ||
              (row.before ?? row.after)?.[field] !== '' && (row.before ?? row.after)?.[field] !== null).map(field =>
              <div key={field}><dt>{fieldNames[field]}</dt><dd><span>{fieldValue(field, row.before)}</span>
                <ArrowRight size={14} /><strong>{fieldValue(field, row.after)}</strong></dd></div>)}</dl>
          </article>)}</div>
          : <p className="empty-inline">Hai phiên bản có cùng các dòng ưu đãi.</p>}
      </div> : viewing ? <>
        <TableRegion label="Bảng ưu đãi. Có thể cuộn ngang nếu cần."><table>
          <thead><tr><th scope="col">Sản phẩm</th><th scope="col">Voucher</th><th scope="col">Giá</th><th scope="col">Quà tặng</th><th scope="col">Thời hạn</th><th scope="col">Điều kiện</th></tr></thead>
          <tbody>{viewing.offers.map(row => <tr key={offerKey(row)}>
            <td><strong>{row.name || row.sku}</strong><small>{row.sku}</small></td>
            <td>{row.code ? <code>{row.code}</code> : '—'}</td><td>{row.price !== null ? money(row.price) : '—'}</td>
            <td>{row.gift || '—'}</td>
            <td>{row.end ? <><span>{displayDate(row.end)}</span>{row.end.length > 10 && <small>{row.end.slice(11)}</small>}</> : '—'}</td>
            <td>{row.condition || '—'}</td>
          </tr>)}</tbody>
        </table></TableRegion>
        <div className="table-footer">
          <span><Clock3 size={15} /> {previous ? `${changed} SKU đổi so với v${index}` : 'Phiên bản đầu tiên'}</span>
          <button className="text-button" onClick={() => download(offersCsv(viewing.offers), `uu-dai-v${index + 1}.csv`)}><Download size={15} /> Xuất bảng này</button>
        </div>
      </> : <Empty title="Chưa có bảng ưu đãi" detail="Có sẵn file của shop? Chọn Nhập bảng. Bạn cũng có thể tải mẫu hoặc chọn Tạo bảng để điền trực tiếp." />}
    </section>
    <aside className="panel history">
      <div className="panel-heading"><div><h2><History size={19} /> Lịch sử</h2><p>{versions.length} phiên bản</p></div></div>
      {versions.length ? <div className="version-list">{[...versions].reverse().map((version, i) =>
        <button className={version.id === viewing?.id ? 'active' : ''} aria-pressed={version.id === viewing?.id} key={version.id} onClick={() => setView(version.id)}>
          <FileSpreadsheet size={17} /><span><strong>Phiên bản {versions.length - i}</strong><small>{displayDate(version.at)} · {version.at.slice(11, 16)}</small></span>
          {i === 0 && <span className="latest">Hiện tại</span>}
        </button>
      )}</div> : <p className="history-empty">Mỗi lần lưu bảng sẽ xuất hiện ở đây.</p>}
    </aside>
  </div>;
}
