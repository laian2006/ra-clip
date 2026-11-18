export interface Offer {
  sku: string;
  name: string;
  code: string;
  price: number | null;
  gift: string;
  start: string;
  end: string;
  condition: string;
}

export interface Evidence {
  start: number;
  end: number | null;
  text: string;
  source: 'audio' | 'frame' | 'subtitle' | 'manual';
}

export interface Clip {
  id: string;
  title: string;
  sku: string;
  link: string;
  published: string;
  evidence: Evidence[];
  localMedia: boolean;
  demoMedia?: boolean;
}

export interface OfferVersion {
  id: string;
  at: string;
  offers: Offer[];
}

export type Verdict = 'action' | 'review' | 'dated' | 'clear';
export type Review = 'new' | 'known' | 'wrong' | 'done';
export type Kind = 'code' | 'price' | 'gift' | 'coverage';

export interface Claim {
  kind: Exclude<Kind, 'coverage'>;
  value: string | number;
  code: string;
  disclosure: string;
  conditional: boolean;
  evidence: Evidence;
}

export interface Finding {
  id: string;
  clipId: string;
  kind: Kind;
  verdict: Verdict;
  claim: string;
  reference: string;
  reason: string;
  evidence?: Evidence;
}

export interface ClipResult {
  clipId: string;
  signature: string;
  findings: Finding[];
}

export interface Audit {
  versionId: string;
  checkedAt: string;
  results: ClipResult[];
  refreshed: string[];
}

export interface Workspace {
  demo: boolean;
  clips: Clip[];
  versions: OfferVersion[];
  checkedAt: string;
  audit: Audit | null;
  reviews: Record<string, Review>;
}

export const verdictLabels: Record<Verdict, string> = {
  action: 'Cần xử lý', review: 'Cần xác nhận', dated: 'Có ghi thời hạn', clear: 'Khớp bảng',
};

export const kindLabels: Record<Kind, string> = {
  code: 'Voucher', price: 'Giá bán', gift: 'Quà tặng', coverage: 'Dữ liệu',
};

export const sourceLabels: Record<Evidence['source'], string> = {
  audio: 'Lời thoại', frame: 'Chữ trên video', subtitle: 'Phụ đề', manual: 'Nhập tay',
};

export const reviewLabels: Record<Review, string> = {
  new: 'Mới phát hiện', known: 'Đã biết', wrong: 'Báo nhầm', done: 'Đã xử lý',
};

export function localTime(now = new Date()) {
  return new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 16);
}

export function timestamp(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(s % 3600 / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function displayDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-');
  return day && month ? `${day}/${month}/${year}` : value;
}

export const money = (amount: number) => `${new Intl.NumberFormat('vi-VN').format(amount)} đ`;
export const normalizeCode = (value: string) => value.trim().toLocaleUpperCase('en-US');
export const offerKey = (offer: Offer) => JSON.stringify([offer.sku, offer.code]);

export function safeLink(value: string) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}
