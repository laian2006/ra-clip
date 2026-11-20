import { ArrowRight, CalendarClock, Clapperboard, UsersRound } from 'lucide-react';

export const tools = [
  { id: 'quick', audience: 'KOC · Người làm video', title: 'Kiểm nhanh bản nháp', icon: Clapperboard,
    detail: 'Đối chiếu một video hoặc kịch bản với ưu đãi do shop gửi.' },
  { id: 'schedule', audience: 'Chủ shop · Vận hành', title: 'Lịch đổi ưu đãi', icon: CalendarClock,
    detail: 'Xem trước clip bị ảnh hưởng khi voucher, giá hoặc quà bắt đầu hay hết hạn.' },
  { id: 'creators', audience: 'Agency · Quản lý KOC', title: 'Điều phối người đăng', icon: UsersRound,
    detail: 'Gán người đăng và theo dõi việc cần xử lý của từng người.' },
] as const;

export type ToolPage = typeof tools[number]['id'];

export function ToolLinks({ onOpen }: { onOpen: (page: ToolPage) => void }) {
  return <div className="tool-links">
    {tools.map(({ id, audience, title, detail, icon: Icon }) =>
      <button className="tool-link" type="button" key={id} onClick={() => onOpen(id)}>
        <span className="tool-icon"><Icon size={19} aria-hidden="true" /></span>
        <span className="tool-link-copy"><small>{audience}</small><strong>{title}</strong><span>{detail}</span></span>
        <ArrowRight className="tool-arrow" size={16} aria-hidden="true" />
      </button>)}
  </div>;
}
