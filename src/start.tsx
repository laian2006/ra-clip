import { ArrowRight, Check, Clapperboard, PlayCircle } from 'lucide-react';
import type { Clip, OfferVersion } from './domain';

export function DemoStart({ onExample, onShop, onGuide, busy }: {
  onExample?: () => void; onShop: () => void; onGuide: () => void; busy: boolean;
}) {
  return <section className="start-banner" aria-labelledby="demo-start">
    <span className="demo-symbol"><Clapperboard size={20} aria-hidden="true" /></span>
    <div className="start-copy">
      <h2 id="demo-start">Thử với dữ liệu mẫu</h2>
      <p>Mở một cảnh báo để xem đoạn video và lý do app đánh dấu.</p>
    </div>
    <div className="start-actions">
      <button className="button primary" type="button" onClick={onExample ?? onGuide} disabled={busy}>
        <PlayCircle size={17} aria-hidden="true" /> {onExample ? 'Xem một cảnh báo mẫu' : 'Xem hướng dẫn'}
      </button>
      <button className="button secondary" type="button" onClick={onShop} disabled={busy}>
        Dùng dữ liệu của bạn <ArrowRight size={16} aria-hidden="true" />
      </button>
    </div>
  </section>;
}

export function ShopStart({ version, clips, hasReport, busy, onOffers, onAdd, onEdit, onScan, onResults }: {
  version?: OfferVersion; clips: Clip[]; hasReport: boolean; busy: boolean;
  onOffers: () => void; onAdd: () => void; onEdit: (clip: Clip) => void; onScan: (clip: Clip) => void; onResults: () => void;
}) {
  const skus = new Set(version?.offers.map(offer => offer.sku));
  const matched = clips.filter(clip => skus.has(clip.sku));
  const ready = matched.some(clip => clip.evidence.length > 0);
  const complete = ready && hasReport;
  const currentStep = ready ? 2 : version ? 1 : 0;
  const steps = [
    { title: 'Thêm bảng ưu đãi', done: !!version },
    { title: 'Chuẩn bị video cùng mã sản phẩm', done: ready },
    { title: 'Xem kết quả đối chiếu', done: complete },
  ];
  const target = matched[0] ?? clips[0];
  let next = { label: 'Mở bảng ưu đãi', detail: 'Nhập bảng giá, voucher hoặc quà tặng của shop.', action: onOffers };
  if (version) {
    if (!target) {
      next = { label: 'Thêm video để rà', detail: 'Chọn file video hoặc nhập phụ đề. Dùng cùng mã sản phẩm (SKU) với bảng ưu đãi.', action: onAdd };
    } else if (!matched.length) {
      next = { label: 'Gán mã sản phẩm cho video', detail: 'Chọn mã sản phẩm (SKU) có trong bảng để app biết cần so sánh với dòng nào.', action: () => onEdit(target) };
    } else if (!ready) {
      const playable = matched.find(clip => clip.localMedia || clip.demoMedia);
      next = playable
        ? { label: 'Quét video chưa có đoạn trích', detail: 'Đọc lời thoại hoặc chữ trên video để lấy nội dung cần đối chiếu.', action: () => onScan(playable) }
        : { label: 'Bổ sung nội dung video', detail: 'Gắn file video hoặc nhập phụ đề có mốc thời gian. Link bài đăng chỉ dùng để mở lại clip.', action: () => onEdit(target) };
    } else {
      next = { label: 'Xem kết quả', detail: 'Chọn video để xem đoạn được đánh dấu và lý do.', action: onResults };
    }
  }
  return <section className="start-checklist" aria-labelledby="shop-start">
    <div className="start-copy">
      <h2 id="shop-start">{complete ? 'Báo cáo đã sẵn sàng' : 'Bắt đầu rà video của bạn'}</h2>
      <p>{next.detail}</p>
    </div>
    <div className="start-actions">
      <button className="button primary" type="button" onClick={next.action} disabled={busy}>{next.label} <ArrowRight size={16} aria-hidden="true" /></button>
      {!complete && hasReport && <button className="button secondary" type="button" onClick={onResults}>Xem kết quả hiện có</button>}
    </div>
    {!complete && <ol>
      {steps.map((step, index) => <li key={step.title} aria-current={index === currentStep ? 'step' : undefined}>
        <span aria-hidden="true">{step.done ? <Check size={15} /> : index + 1}</span>
        <span>{step.title}<span className="sr-only">{step.done ? ', đã xong' : ', chưa xong'}</span></span>
      </li>)}
    </ol>}
  </section>;
}
