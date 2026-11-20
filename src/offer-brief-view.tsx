import { ArrowDownToLine, Copy } from 'lucide-react';
import { useRef, useState } from 'react';
import { offerKey } from './domain';
import type { Offer } from './domain';
import { downloadBlob } from './files';
import { makeOfferBrief, offerBriefText } from './offer-brief';
import { Modal } from './ui';

export function OfferBriefDialog({ offers, version, onClose }: { offers: Offer[]; version: number; onClose: () => void }) {
  const [key, setKey] = useState(() => offerKey(offers[0]));
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const preview = useRef<HTMLTextAreaElement>(null);
  const offer = offers.find(row => offerKey(row) === key) ?? offers[0];
  const text = offerBriefText(offer);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('Đã sao chép nội dung phiếu.');
    } catch {
      preview.current?.focus();
      preview.current?.select();
      setStatus('Đã chọn nội dung. Nhấn Ctrl+C hoặc dùng lệnh Sao chép.');
    }
  }
  function save() {
    setError('');
    try {
      downloadBlob(makeOfferBrief(offer), 'phieu-uu-dai.raclip.json');
      setStatus('Đã tạo tệp phiếu ưu đãi.');
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'Chưa tải được phiếu.'); }
  }

  return <Modal title="Phiếu ưu đãi cho KOC"
    detail={`Chọn một ưu đãi từ bảng v${version} hiện tại. KOC có thể mở tệp phiếu trong mục Kiểm nhanh bản nháp.`} onClose={onClose}>
    <div className="dialog-form handoff-form">
      <label className="stack-field tool-select">Ưu đãi cần gửi
        <select value={key} onChange={event => { setKey(event.target.value); setStatus(''); setError(''); }}>
          {offers.map(row => <option key={offerKey(row)} value={offerKey(row)}>{row.sku} · {row.code || 'Giá thường'}{row.name && ` · ${row.name}`}</option>)}
        </select>
      </label>
      <label className="stack-field">Nội dung phiếu<textarea rows={9} ref={preview} readOnly value={text} /></label>
      {error && <p role="alert" className="form-error">{error}</p>}
      <p role="status" className="hint-text">{status}</p>
      <div className="dialog-actions tool-dialog-actions">
        <button className="button secondary" type="button" onClick={() => void copy()}><Copy size={16} aria-hidden="true" /> Sao chép</button>
        <button className="button primary" type="button" onClick={save}><ArrowDownToLine size={16} aria-hidden="true" /> Tải phiếu</button>
      </div>
    </div>
  </Modal>;
}
