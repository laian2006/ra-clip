import { fold } from './claims';
import { clipFormats, normalizeCode, safeLink } from './domain';
import type { Clip, ClipFormat, VideoStats } from './domain';
import { csv, sheetText } from './files';
import { dateInput } from './time';

const columns = ['title', 'sku', 'link', 'published', 'format', 'video_id', 'creator', 'views', 'orders'] as const;
type Column = typeof columns[number];
const aliases: Record<string, Column> = {
  video: 'title', video_title: 'title', ten_video: 'title', tieu_de: 'title', video_name: 'title',
  url: 'link', video_link: 'link', video_url: 'link', link_video: 'link', lien_ket_video: 'link',
  ma_video: 'video_id', id_video: 'video_id', post_id: 'video_id',
  ma_sku: 'sku', ma_phan_loai: 'sku', seller_sku: 'sku',
  published_at: 'published', ngay_dang: 'published', date_posted: 'published',
  kieu_video: 'format', creator_name: 'creator', creator_username: 'creator', nha_sang_tao: 'creator', koc: 'creator',
  video_views: 'views', view_count: 'views', luot_xem: 'views', luot_xem_video: 'views',
  order_count: 'orders', so_don: 'orders', so_don_hang: 'orders',
};

type Patch = Partial<Pick<Clip, 'title' | 'sku' | 'link' | 'published' | 'format' | 'videoId' | 'creator' | 'stats'>>;
export type CatalogRow =
  | { line: number; state: 'add' | 'update' | 'same'; title: string; patch: Patch; target?: string; detail: string }
  | { line: number; state: 'skip' | 'invalid'; title: string; detail: string };

export function tiktokId(raw: string) {
  const link = safeLink(raw);
  if (!link) return '';
  const url = new URL(link);
  const domain = url.hostname.toLowerCase();
  return domain === 'tiktok.com' || domain.endsWith('.tiktok.com')
    ? url.pathname.match(/\/video\/(\d{15,25})(?:\/|$)/)?.[1] ?? '' : '';
}

function linkKey(raw: string) {
  const link = safeLink(raw);
  if (!link) return '';
  const url = new URL(link);
  url.hash = '';
  if (url.hostname === 'tiktok.com' || url.hostname.endsWith('.tiktok.com')) url.search = '';
  return url.href.replace(/\/$/, '');
}

export function readCount(value: string, label: string) {
  if (!value.trim()) return undefined;
  const clean = value.trim().replace(/[\u00a0\u202f]/g, ' ');
  if (!/^\d+$/.test(clean) && !/^\d{1,3}(?:[,. ]\d{3})+$/.test(clean)) throw Error(`${label} cần là số nguyên không âm.`);
  const number = Number(clean.replace(/[,. ]/g, ''));
  if (!Number.isSafeInteger(number)) throw Error(`${label} vượt giới hạn an toàn.`);
  return number;
}

function formatInput(raw: string): ClipFormat | undefined {
  if (!raw) return undefined;
  const match = (Object.keys(clipFormats) as ClipFormat[]).find(key => fold(raw) === key || fold(raw) === fold(clipFormats[key]));
  if (!match) throw Error('Kiểu video chưa có trong danh sách. Dùng giá trị trong file mẫu hoặc để trống.');
  return match;
}

function setKey(map: Map<string, Set<Clip>>, key: string, clip: Clip) {
  if (!key) return;
  const matches = map.get(key) ?? new Set();
  matches.add(clip);
  map.set(key, matches);
}

function merge(clip: Clip, patch: Patch): Clip {
  return { ...clip, ...patch, stats: patch.stats ? { ...clip.stats, ...patch.stats } : clip.stats };
}

export function planCatalog(rows: unknown[][], clips: Clip[]): CatalogRow[] {
  const [headers, ...body] = rows;
  const index = new Map<Column, number>();
  if (!headers) throw Error('Bảng video đang trống.');
  headers.forEach((item, i) => {
    const name = fold(sheetText(item)).trim().replace(/[^a-z0-9]+/g, '_');
    const key = aliases[name] ?? name as Column;
    if (!columns.includes(key)) return;
    if (index.has(key)) throw Error(`Có nhiều cột cùng nghĩa với “${key}”. Giữ lại một cột.`);
    index.set(key, i);
  });
  if (!index.has('link') && !index.has('video_id')) throw Error('Bảng cần cột link hoặc video_id để nhận diện video.');

  const ids = new Map<string, Set<Clip>>();
  const links = new Map<string, Set<Clip>>();
  for (const clip of clips) {
    setKey(ids, clip.videoId || tiktokId(clip.link), clip);
    setKey(links, linkKey(clip.link), clip);
  }
  const seen = new Set<string>();
  return body.flatMap((line, i): CatalogRow[] => {
    if (!line.some(value => sheetText(value).trim())) return [];
    const value = (key: Column) => line[index.get(key) ?? -1];
    const get = (key: Column) => sheetText(value(key)).trim();
    const title = get('title');
    try {
      const rawId = get('video_id');
      const rawLink = get('link');
      const link = rawLink ? safeLink(rawLink) : '';
      if (rawLink && !link) throw Error('Link phải là địa chỉ HTTP hoặc HTTPS hợp lệ.');
      const fromLink = tiktokId(link);
      const rawIdIsExact = /^\d{15,25}$/.test(rawId) && (typeof value('video_id') !== 'number' || Number.isSafeInteger(value('video_id')));
      if (rawId && !rawIdIsExact && !fromLink) throw Error('ID phải được lưu dạng văn bản. Có thể dùng link TikTok đầy đủ.');
      if (rawIdIsExact && fromLink && rawId !== fromLink) throw Error('ID và link đang chỉ tới hai video khác nhau.');
      const videoId = fromLink || (rawIdIsExact ? rawId : '');
      const canonicalLink = linkKey(link);
      if (!videoId && !canonicalLink) throw Error('Thiếu link hoặc ID video.');
      const matches = new Set([...(ids.get(videoId) ?? []), ...(links.get(canonicalLink) ?? [])]);
      if (matches.size > 1) throw Error('Có nhiều video khớp ID hoặc link trong kho. Kiểm tra trước khi cập nhật.');
      const target = [...matches][0];
      const targetId = target?.videoId || (target && tiktokId(target.link));
      if (targetId && videoId && targetId !== videoId) throw Error('Link khớp một video có ID khác.');
      const dedup = [videoId && `id:${videoId}`, canonicalLink && `link:${canonicalLink}`, target && `row:${target.id}`].filter(Boolean) as string[];
      if (dedup.some(key => seen.has(key))) return [{ line: i + 2, state: 'skip', title: title || rawLink || rawId, detail: 'Trùng một dòng trước trong file.' }];
      const sku = get('sku');
      const creator = get('creator');
      if (title.length > 140 || sku.length > 100 || creator.length > 100 || link.length > 4000) throw Error('Tên, SKU, nhà sáng tạo hoặc link quá dài.');
      const views = readCount(get('views'), 'Lượt xem');
      const orders = readCount(get('orders'), 'Số đơn');
      const stats: VideoStats = { ...(views === undefined ? {} : { views }), ...(orders === undefined ? {} : { orders }) };
      const patch: Patch = {
        ...(title ? { title } : {}), ...(sku ? { sku: normalizeCode(sku) } : {}),
        ...(creator ? { creator } : {}), ...(videoId ? { videoId } : {}), ...(link ? { link } : {}),
        ...(get('published') ? { published: dateInput(get('published')).slice(0, 10) } : {}),
        ...(get('format') ? { format: formatInput(get('format')) } : {}),
        ...(Object.keys(stats).length ? { stats } : {}),
      };
      if (!target && !patch.title) patch.title = videoId ? `Video ${videoId.slice(-8)}` : new URL(link).hostname;
      dedup.forEach(key => seen.add(key));
      const state = !target ? 'add' : JSON.stringify(merge(target, patch)) === JSON.stringify(target) ? 'same' : 'update';
      const labels = { add: 'Tạo bản ghi video mới.', update: 'Cập nhật thông tin, giữ nguyên file và đoạn trích.', same: 'Thông tin đã khớp kho.' };
      return [{ line: i + 2, state, title: patch.title ?? target!.title, patch, target: target?.id, detail: labels[state] }];
    } catch (error) {
      return [{ line: i + 2, state: 'invalid', title: title || `Dòng ${i + 2}`, detail: error instanceof Error ? error.message : String(error) }];
    }
  });
}

export function applyCatalog(clips: Clip[], plan: CatalogRow[]) {
  const updates = new Map<string, Patch>();
  const newClips: Clip[] = [];
  for (const row of plan) {
    if (row.state === 'add') newClips.push({
      id: crypto.randomUUID(), title: row.title, link: '', sku: '', published: '',
      localMedia: false, evidence: [], ...row.patch,
    });
    if (row.state === 'update' && row.target) updates.set(row.target, row.patch);
  }
  return [...clips.map(clip => updates.has(clip.id) ? merge(clip, updates.get(clip.id)!) : clip), ...newClips];
}

export function catalogCsv() {
  return csv([
    [...columns],
    ['Review bình giữ nhiệt', 'BINH-500', 'https://example.com/video/binh-500', '2026-11-11', 'review', '', 'KOC minh họa', 12000, 25],
  ], false);
}

export const numberLabel = (value: number) => new Intl.NumberFormat('vi-VN').format(value);
