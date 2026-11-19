import { ArrowRight, ClipboardList, MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { displayDateTime, kindLabels, timestamp } from './domain';
import type { Clip, Finding } from './domain';
import type { OfferImpact } from './impact';
import { Modal, Tag } from './ui';

export function OfferImpactSummary({ impact, onOpen }: { impact: OfferImpact; onOpen: () => void }) {
  return <section className="offer-impact-summary" aria-labelledby="offer-impact-title">
    <ClipboardList size={21} aria-hidden="true" />
    <div>
      <h3 id="offer-impact-title">Tác động của bảng v{impact.version}</h3>
      <p>{impact.skuCount} mã sản phẩm đổi · {impact.clipCount} video được đối chiếu · {impact.raised.length} có cảnh báo mới hoặc đổi · {impact.cleared.length} hết cảnh báo</p>
    </div>
    <button className="button secondary" type="button" onClick={onOpen}>Xem clip bị ảnh hưởng <ArrowRight size={16} /></button>
  </section>;
}

export function OfferImpactDialog({ impact, onClose, onOpen, onHandoff, blockHandoff }: {
  impact: OfferImpact;
  onClose: () => void;
  onOpen: (clip: Clip, finding: Finding) => void;
  onHandoff: () => void;
  blockHandoff: boolean;
}) {
  const [tab, setTab] = useState<'raised' | 'cleared'>(impact.raised.length || !impact.cleared.length ? 'raised' : 'cleared');
  const items = impact[tab];
  return <Modal title={`Video bị ảnh hưởng bởi bảng v${impact.version}`}
    detail={`Đối chiếu với v${impact.version - 1} tại cùng thời điểm ${displayDateTime(impact.checkedAt)} (giờ Việt Nam).`} onClose={onClose}>
    <div className="dialog-form">
      <div className="segmented impact-tabs" role="group" aria-label="Loại thay đổi">
        <button type="button" aria-pressed={tab === 'raised'} className={tab === 'raised' ? 'active' : ''}
          onClick={() => setTab('raised')}>Cảnh báo mới hoặc đổi <span>{impact.raised.length}</span></button>
        <button type="button" aria-pressed={tab === 'cleared'} className={tab === 'cleared' ? 'active' : ''}
          onClick={() => setTab('cleared')}>Hết cảnh báo <span>{impact.cleared.length}</span></button>
      </div>
      {items.length ? <ul className="impact-clips">{items.map(({ clip, findings }) => <li key={clip.id}>
        <div><strong>{clip.title}</strong><small>{[clip.sku, clip.creator].filter(Boolean).join(' · ')}</small></div>
        {tab === 'raised' ? <ul>{findings.map(finding => <li key={finding.id}>
          <Tag verdict={finding.verdict} />
          <button className="text-button" type="button" onClick={() => onOpen(clip, finding)}>
            {finding.evidence && `${timestamp(finding.evidence.start)} · `}{kindLabels[finding.kind]} · {finding.claim} <ArrowRight size={13} />
          </button>
          <small>{finding.reason}{finding.reference && ` Bảng v${impact.version} · ${finding.reference}`}</small>
        </li>)}</ul> : <button className="text-button" type="button" onClick={() => onOpen(clip, findings[0])}>
          Xem kết quả hiện tại <ArrowRight size={13} /></button>}
      </li>)}</ul> : <p className="empty-inline">
        {tab === 'raised' ? 'Không có cảnh báo mới hoặc đổi từ lần cập nhật bảng này.' : 'Không có video chuyển sang trạng thái hết cảnh báo.'}
      </p>}
      <div className="dialog-actions">
        <button className="button secondary" type="button" onClick={onClose}>Đóng</button>
        {impact.pending.length > 0 && <button className="button primary" type="button" disabled={blockHandoff}
          title={blockHandoff ? 'Rà soát lại theo thời điểm mới trước khi soạn.' : undefined} onClick={onHandoff}>
          <MessageSquare size={16} /> Soạn bản nhắc
        </button>}
      </div>
    </div>
  </Modal>;
}
