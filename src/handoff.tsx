import { Copy } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { groupHandoff, handoffText, type HandoffRow } from './impact';
import { Modal } from './ui';

export function HandoffDialog({ rows, version, checkedAt, onClose }: {
  rows: HandoffRow[];
  version: number;
  checkedAt: string;
  onClose: () => void;
}) {
  const groups = useMemo(() => groupHandoff(rows), [rows]);
  const [creator, setCreator] = useState(groups[0]?.[0] ?? '');
  const [status, setStatus] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);
  const selected = groups.find(([name]) => name === creator)?.[1] ?? groups[0]?.[1] ?? [];
  const text = handoffText(selected, version, checkedAt);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('Đã sao chép bản nhắc.');
    } catch {
      textarea.current?.focus();
      textarea.current?.select();
      setStatus('Đã chọn nội dung. Nhấn Ctrl+C hoặc dùng lệnh Sao chép.');
    }
  }

  return <Modal title="Soạn bản nhắc cho người đăng" detail="Xem nội dung trước khi gửi qua kênh bạn chọn." onClose={onClose}>
    <div className="dialog-form handoff-form">
      <label className="stack-field">Người đăng<select aria-label="Người đăng" value={creator} onChange={event => { setCreator(event.target.value); setStatus(''); }}>
        {groups.map(([name, items]) => <option key={name} value={name}>{name || 'Chưa gán người đăng'} · {items.length} việc</option>)}
      </select></label>
      <label className="stack-field">Nội dung bản nhắc<textarea ref={textarea} rows={11} readOnly value={text} /></label>
      <p className="hint-text" role="status">{status}</p>
      <div className="dialog-actions">
        <button className="button secondary" type="button" onClick={onClose}>Đóng</button>
        <button className="button primary" type="button" disabled={!selected.length} onClick={() => void copy()}><Copy size={16} /> Sao chép bản nhắc</button>
      </div>
    </div>
  </Modal>;
}
