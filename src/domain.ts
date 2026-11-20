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
  corrected?: boolean;
  untimed?: true;
}

export type MediaSource = Extract<Evidence['source'], 'audio' | 'frame'>;
export interface EvidenceMask {
  source: MediaSource;
  start: number;
  end: number | null;
}

export const clipFormats = {
  review: 'Review sản phẩm', live: 'Cắt livestream', unbox: 'Mở hộp',
  combo: 'Combo', affiliate: 'Video gắn giỏ', promo: 'Video khuyến mãi',
} as const;
export type ClipFormat = keyof typeof clipFormats;

export interface VideoStats {
  views?: number;
  orders?: number;
}

export interface ScanReceipt {
  at: string;
  state: 'ready' | 'partial' | 'empty' | 'failed';
  detail: string;
  audio: boolean;
  frame: boolean;
  sources?: Partial<Record<MediaSource, ScanSource>>;
}

export interface ScanSource {
  state: 'done' | 'empty' | 'failed';
  detail: string;
  discarded?: number;
}

export const scanLabels: Record<ScanReceipt['state'], string> = {
  ready: 'Có kết quả', partial: 'Có kết quả một phần', empty: 'Chưa đọc được đoạn', failed: 'Quét lỗi',
};

export interface Clip {
  id: string;
  videoId?: string;
  creator?: string;
  stats?: VideoStats;
  lastScan?: ScanReceipt;
  title: string;
  sku: string;
  link: string;
  published: string;
  format?: ClipFormat;
  evidence: Evidence[];
  localMedia: boolean;
  demoMedia?: boolean | string;
  mediaRevision?: string;
  fileHash?: string;
  masks?: EvidenceMask[];
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
  rulesVersion?: number;
}

export type AuditTrigger = 'manual' | 'offers' | 'clips' | 'evidence' | 'batch' | 'baseline';

export type ClipSummary = Pick<Clip, 'id' | 'title' | 'sku' | 'link' | 'videoId' | 'creator' | 'stats'>;

export interface AuditSnapshot {
  id: string;
  recordedAt: string;
  trigger: AuditTrigger;
  versionNumber: number;
  audit: Audit;
  clips: ClipSummary[];
  reviews: Record<string, Review>;
  notes: Record<string, string>;
}

export interface Campaign {
  id: string;
  name: string;
  shop: string;
  createdAt: string;
  updatedAt: string;
  clipCount: number;
  todoCount: number;
}

export type CampaignDraft = Pick<Campaign, 'name' | 'shop'>;

export interface Workspace {
  demo: boolean;
  demoPack?: number;
  clips: Clip[];
  versions: OfferVersion[];
  checkedAt: string;
  audit: Audit | null;
  reviews: Record<string, Review>;
  notes?: Record<string, string>;
  snapshots?: AuditSnapshot[];
  revision?: string;
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
  const s = Math.max(0, Math.round(seconds));
  const mm = String(Math.floor(s % 3600 / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function displayDateTime(value: string) {
  return value ? `${displayDate(value)}, ${value.slice(11, 16)}` : '';
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
