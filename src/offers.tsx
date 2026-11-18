import { Clock3, Download, FileSpreadsheet, History, Pencil, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { displayDate, money, offerKey } from './domain';
import type { OfferVersion } from './domain';
import { csv, download, offersCsv, templateRows } from './files';
import { changedSkus } from './audit';
import { Empty } from './ui';

export function OffersView({ versions, onImport, onEdit, busy }: {
  versions: OfferVersion[]; onImport: () => void; onEdit: () => void; busy: boolean;
}) {
  const [viewId, setView] = useState('');
  const current = versions.at(-1);
  const viewing = versions.find(row => row.id === viewId) ?? current;
  useEffect(() => setView(''), [current?.id]);
  const index = viewing ? versions.indexOf(viewing) : -1;
  const previous = versions[index - 1];
  const changed = previous && viewing ? changedSkus(previous.offers, viewing.offers).size : 0;
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
      {viewing ? <>
        <div className="table-wrap"><table>
          <thead><tr><th scope="col">Sản phẩm</th><th scope="col">Voucher</th><th scope="col">Giá</th><th scope="col">Quà tặng</th><th scope="col">Thời hạn</th><th scope="col">Điều kiện</th></tr></thead>
          <tbody>{viewing.offers.map(row => <tr key={offerKey(row)}>
            <td><strong>{row.name || row.sku}</strong><small>{row.sku}</small></td>
            <td>{row.code ? <code>{row.code}</code> : '—'}</td><td>{row.price !== null ? money(row.price) : '—'}</td>
            <td>{row.gift || '—'}</td>
            <td>{row.end ? <><span>{displayDate(row.end)}</span>{row.end.length > 10 && <small>{row.end.slice(11)}</small>}</> : '—'}</td>
            <td>{row.condition || '—'}</td>
          </tr>)}</tbody>
        </table></div>
        <div className="table-footer">
          <span><Clock3 size={15} /> {previous ? `${changed} SKU đổi so với v${index}` : 'Phiên bản đầu tiên'}</span>
          <button className="text-button" onClick={() => download(offersCsv(viewing.offers), `uu-dai-v${index + 1}.csv`)}><Download size={15} /> Xuất bảng này</button>
        </div>
      </> : <Empty title="Chưa có bảng ưu đãi" detail="Bắt đầu bằng file mẫu hoặc nhập trực tiếp từng SKU." />}
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
