import { extractClaims, fold, giftKey } from './claims';
import { displayDate, kindLabels, money, normalizeCode, offerKey } from './domain';
import type { Audit, Claim, Clip, Finding, Offer, OfferVersion, Verdict } from './domain';
import { parseVietnamTime } from './time';

export function validateOffers(input: Offer[]): Offer[] {
  if (!input.length) throw Error('Bảng ưu đãi cần ít nhất một dòng.');
  const keys = new Set<string>();
  return input.map((item, index) => {
    const offer: Offer = {
      sku: normalizeCode(item.sku), name: item.name.trim(), code: normalizeCode(item.code),
      price: item.price, gift: item.gift.trim(), start: item.start.trim(),
      end: item.end.trim(), condition: item.condition.trim(),
    };
    const fail = (message: string): never => { throw Error(`Dòng ${index + 2}: ${message}`); };
    if (!offer.sku) fail('Thiếu mã phân loại (SKU).');
    if (offer.code && !/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(offer.code)) fail('Mã voucher không hợp lệ.');
    if (offer.price !== null && (!Number.isSafeInteger(offer.price) || offer.price < 0)) fail('Giá phải là số nguyên VNĐ.');
    if (!offer.code && offer.price === null && !offer.gift) fail('Thêm giá, voucher hoặc quà tặng.');
    const starts = offer.start ? parseVietnamTime(offer.start) : null;
    const ends = offer.end ? parseVietnamTime(offer.end, true) : null;
    if ((offer.start && starts === null) || (offer.end && ends === null)) fail('Ngày không hợp lệ.');
    if (starts !== null && ends !== null && starts > ends) fail('Ngày bắt đầu đứng sau ngày kết thúc.');
    const key = offerKey(offer);
    if (keys.has(key)) fail('Trùng SKU và mã voucher.');
    keys.add(key);
    return offer;
  });
}

export const offerFields = ['name', 'price', 'gift', 'start', 'end', 'condition'] as const;
export type OfferField = typeof offerFields[number];
export interface OfferChange {
  key: string;
  sku: string;
  code: string;
  before?: Offer;
  after?: Offer;
  fields: OfferField[];
}

export function compareOffers(before: Offer[], after: Offer[]): OfferChange[] {
  const old = new Map(before.map(row => [offerKey(row), row]));
  const next = new Map(after.map(row => [offerKey(row), row]));
  return [...new Set([...old.keys(), ...next.keys()])].flatMap(key => {
    const previous = old.get(key);
    const current = next.get(key);
    const fields = offerFields.filter(field => previous?.[field] !== current?.[field]);
    if (previous && current && !fields.length) return [];
    const row = (current ?? previous)!;
    return [{ key, sku: row.sku, code: row.code, before: previous, after: current, fields }];
  });
}

export function changedSkus(before: Offer[], after: Offer[]) {
  return new Set(compareOffers(before, after).map(row => row.sku));
}

function finding(clip: Clip, claim: Claim | null, verdict: Verdict, reason: string, reference = ''): Finding {
  const kind = claim?.kind ?? 'coverage';
  const value = claim?.kind === 'price' ? money(Number(claim.value)) : String(claim?.value ?? '');
  const seed = JSON.stringify([clip.id, kind, value, claim?.code, claim?.evidence.start, verdict, reason, reference]);
  return {
    id: seed, clipId: clip.id, kind, verdict, claim: value || 'Chưa đủ dữ liệu',
    reason, reference, evidence: claim?.evidence,
  };
}

function referenceValue(offer: Offer, claim: Claim) {
  if (claim.kind === 'code') return offer.end ? `${offer.code} · đến ${displayDate(offer.end)}` : offer.code;
  if (claim.kind === 'price') return offer.price === null ? 'Bảng chưa ghi giá' : money(offer.price);
  return offer.gift || 'Bảng không có quà tặng';
}

function matchOffer(options: Offer[], claim: Claim) {
  if (claim.code) return options.filter(row => row.code === claim.code);
  const base = options.filter(row => !row.code);
  if (base.length === 1 && !claim.conditional) return base;
  return options;
}

function checkClaim(clip: Clip, claim: Claim, options: Offer[], now: number): Finding {
  const candidates = matchOffer(options, claim);
  if (!candidates.length) {
    const reason = !clip.sku ? 'Gán mã phân loại (SKU) cho clip để đối chiếu.'
      : options.length ? 'Mã trong clip vắng mặt ở bảng hiện tại. Xác nhận đã gỡ mã hay bảng còn thiếu.'
      : 'SKU này chưa có trong bảng ưu đãi.';
    return finding(clip, claim, 'review', reason);
  }
  if (candidates.length > 1) {
    return finding(clip, claim, 'review', 'SKU có nhiều ưu đãi. Cần xác định mã hoặc điều kiện mà clip đang nói tới.');
  }

  const [offer] = candidates;
  const reference = referenceValue(offer, claim);
  let mismatch = '';
  if (claim.kind === 'price' && offer.price !== null && claim.value !== offer.price) {
    mismatch = 'Giá được nhắc khác giá ghi trong bảng ưu đãi.';
  }
  if (claim.kind === 'gift' && giftKey(String(claim.value)) !== giftKey(offer.gift)) {
    mismatch = 'Quà tặng được nhắc khác bảng ưu đãi.';
  }
  const starts = offer.start ? parseVietnamTime(offer.start) : null;
  const ends = offer.end ? parseVietnamTime(offer.end, true) : null;
  const expired = ends !== null && now > ends;
  const disclosure = claim.disclosure.startsWith('????') && offer.end
    ? offer.end.slice(0, 4) + claim.disclosure.slice(4)
    : claim.disclosure;
  const statedEnd = disclosure ? parseVietnamTime(disclosure, true) : null;
  const published = clip.published ? parseVietnamTime(clip.published) : null;

  if (claim.disclosure && statedEnd === null) {
    return finding(clip, claim, 'review', 'Clip có nhắc thời hạn nhưng chưa xác định được ngày. Kiểm tra ngày đăng hoặc lời thoại.', reference);
  }
  if (statedEnd !== null && (ends === null || (starts !== null && statedEnd < starts) ||
    (ends !== null && Math.floor((statedEnd + 25_200_000) / 86_400_000) > Math.floor((ends + 25_200_000) / 86_400_000)) ||
    (published !== null && published > statedEnd))) {
    return finding(clip, claim, 'review', 'Ngày ghi trong clip chưa khớp lịch của ưu đãi. Kiểm tra trước khi dùng lại.', reference);
  }
  if (statedEnd !== null && now > statedEnd && (ends !== null && (starts === null || statedEnd >= starts))) {
    if (mismatch) return finding(clip, claim, 'action', mismatch, reference);
    return finding(clip, claim, 'dated', `Clip có ghi ngày ${displayDate(disclosure)}. Kiểm tra trước khi tái sử dụng.`, reference);
  }
  if (expired) {
    return finding(clip, claim, 'action', `Ưu đãi hết hạn ngày ${displayDate(offer.end)}. Clip cần được xem lại.`, reference);
  }
  if (starts !== null && now < starts) {
    return finding(clip, claim, 'review', `Ưu đãi bắt đầu ngày ${displayDate(offer.start)}.`, reference);
  }
  if (claim.conditional && !claim.code && !offer.condition) {
    return finding(clip, claim, 'review', 'Clip nhắc điều kiện mua nhưng bảng chưa ghi điều kiện tương ứng.', reference);
  }
  if (claim.kind === 'price' && offer.price === null) {
    return finding(clip, claim, 'review', 'Bảng chưa có giá để so sánh.', reference);
  }
  if (mismatch) return finding(clip, claim, 'action', mismatch, reference);
  if (offer.condition && !fold(claim.evidence.text).includes(fold(offer.condition))) {
    return finding(clip, claim, 'review', `Xác nhận clip đã nêu điều kiện: ${offer.condition}.`, reference);
  }
  return finding(clip, claim, 'clear', `${kindLabels[claim.kind]} khớp bảng ưu đãi tại thời điểm rà.`, reference);
}

function scanClip(clip: Clip, offers: Offer[], history: Offer[], now: number) {
  const candidates = offers.filter(row => row.sku === clip.sku);
  const known = history.filter(row => row.sku === clip.sku);
  const claims = extractClaims(clip, known);
  if (!claims.length) {
    const message = clip.evidence.length ? 'Chưa trích được giá, voucher hoặc quà tặng.'
      : 'Thêm video đã phân tích, phụ đề hoặc ghi chú có mốc thời gian.';
    return [finding(clip, null, 'review', message)];
  }
  return claims.map(claim => checkClaim(clip, claim, candidates, now));
}

export function runAudit(clips: Clip[], versions: OfferVersion[], checkedAt: string, previous: Audit | null = null): Audit {
  const current = versions.at(-1);
  const now = parseVietnamTime(checkedAt);
  if (!current || now === null) throw Error('Cần bảng ưu đãi và thời điểm rà hợp lệ.');
  const oldVersion = previous && previous.checkedAt === checkedAt
    ? versions.find(row => row.id === previous.versionId) : undefined;
  const skus = oldVersion ? changedSkus(oldVersion.offers, current.offers) : null;
  const previousResults = new Map((previous?.results ?? []).map(row => [row.clipId, row]));
  const history = versions.flatMap(version => version.offers);
  const refreshed: string[] = [];
  const results = clips.map(clip => {
    const signature = JSON.stringify([clip.sku, clip.published, clip.evidence]);
    const old = previousResults.get(clip.id);
    if (skus && old?.signature === signature && !skus.has(clip.sku)) return old;
    refreshed.push(clip.id);
    return { clipId: clip.id, signature, findings: scanClip(clip, current.offers, history, now) };
  });
  return { versionId: current.id, checkedAt, results, refreshed };
}
