import type { Claim, Clip, Offer } from './domain';
import { normalizeCode } from './domain';

export const fold = (value: string) =>
  value.toLocaleLowerCase('vi').normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');

const disclosurePattern = /\b(?:chi(?:\s+(?:ap\s+dung|co|trong|den))?\s+(?:ngay\s+)?|(?:ap\s+dung\s+)?(?:tu|den|het)\s+(?:ngay\s+)?|ngay\s+)(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?\b/g;
const conditionPattern = /\b(?:khi\s+(?:ap|dung|nhap|co|mua|dat)|voi\s+(?:ma|voucher)|don\s+tu|mua\s+(?:combo|[2-9]|hai|ba|bon|nam)|tu\s+\d+\s+(?:mon|san\s+pham)|khach\s+moi|cho\s+(?:don|khach|lan)|(?:ma|voucher)\s+[a-z0-9])\b/;
const pricePattern = /(?<![\p{L}\d])(?:(\d{1,3}(?:[., ]\d{3})+|\d+(?:[.,]\d+)?)\s*(trieu|tr|nghin|ngan|k|dong|vnd|d)(?![\p{L}\d])|(\d{1,3}(?:[., ]\d{3})+|\d+)(?![\p{L}\d]))/gu;
const digit: Record<string, number> = { khong: 0, mot: 1, hai: 2, ba: 3, bon: 4, tu: 4, nam: 5, lam: 5, sau: 6, bay: 7, tam: 8, chin: 9 };
const sequence = '(?:khong|mot|hai|ba|bon|tu|nam|lam|sau|bay|tam|chin|muoi|tram|le|linh)';
const spoken = new RegExp('\\b(' + sequence + '(?:\\s+' + sequence + '){0,5})\\s+(nghin|ngan|trieu)\\b', 'g');

function spokenNumber(text: string): number | null {
  let words = text.split(/\s+/);
  let value = 0;
  if (words[1] === 'tram' && digit[words[0]] !== undefined) {
    value += digit[words[0]] * 100;
    words = words.slice(2);
  }
  if (words[0] === 'le' || words[0] === 'linh') words = words.slice(1);
  if (words[0] === 'muoi') { value += 10; words = words.slice(1); }
  else if (words[1] === 'muoi' && digit[words[0]] !== undefined) {
    value += digit[words[0]] * 10;
    words = words.slice(2);
  }
  if (!words.length) return value;
  if (words.length === 1 && digit[words[0]] !== undefined) return value + digit[words[0]];
  return null;
}

function isComparisonPrice(prefix: string) {
  return /\b(?:giam|tiet\s+kiem|voucher(?:\s+giam)?|giam\s+them|chiet\s+khau|gia\s+goc|gia\s+niem\s+yet|(?:hoa\s+)?don(?:\s+hang)?\s+(?:tu|tren|toi\s+thieu)|chi\s+tieu\s+(?:tu|toi\s+thieu))\s*[:=]?\s*$/.test(prefix);
}

function prices(text: string): number[] {
  const result = new Set<number>();
  for (const match of text.matchAll(pricePattern)) {
    const [, digits, unit, bare] = match;
    const prefix = text.slice(Math.max(0, match.index! - 42), match.index);
    const suffix = text.slice(match.index! + match[0].length);
    if (isComparisonPrice(prefix)) continue;
    if (/^\s*(?:%|\/|ml\b|cm\b|mm\b|kg\b|g\b|w\b|mah\b|sp\b)/.test(suffix)) continue;
    if (!unit && !/\b(?:gia(?:\s+chi)?|chi\s+con|giam\s+con|con)\s*[:=]?\s*$/.test(prefix)) continue;
    const amount = digits ?? bare;
    const large = unit && /^(tr|trieu)$/.test(unit);
    const thousands = unit && /^(k|nghin|ngan)$/.test(unit);
    const grouped = /^\d{1,3}(?:[., ]\d{3})+$/.test(amount);
    const numeric = grouped && !large ? amount.replace(/[., ]/g, '') : amount.replace(',', '.');
    const value = Math.round(Number(numeric) * (large ? 1_000_000 : thousands ? 1000 : 1));
    if (Number.isSafeInteger(value) && value > 0) result.add(value);
  }
  for (const match of text.matchAll(spoken)) {
    const prefix = text.slice(Math.max(0, match.index! - 42), match.index);
    const amount = spokenNumber(match[1]);
    if (!isComparisonPrice(prefix) && amount && amount > 0) {
      result.add(amount * (match[2] === 'trieu' ? 1_000_000 : 1000));
    }
  }
  if (/\b(?:gia|con|chi)\s+(?:co\s+)?chin\s+chin\b/.test(text)) result.add(99000);
  return [...result];
}

export function giftKey(value: string) {
  return fold(value).replace(/\b(?:qua\s+tang|tang\s+kem|tang\s+them|tang|mot|1|cai|chiec)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function giftClaims(text: string) {
  const gifts = [];
  const pattern = /\btặng\s+(?:(?:kèm|thêm|ngay)\s+)?([^\n.!?;,:]+?)(?=\s+(?:khi|nếu|cho|trong\s+ngày|đến\s+hết)\b|[\n.!?;,:]|$)/giu;
  for (const match of text.matchAll(pattern)) {
    const value = match[1].trim();
    if (value && giftKey(value) && !/^(?:từ|giá|voucher|mã|[\d.,]+\s*(?:k|nghìn|ngàn|đồng|%))/i.test(value)) {
      gifts.push(value);
    }
  }
  return gifts;
}

function readDisclosure(text: string, published: string) {
  const dates = [...text.matchAll(disclosurePattern)];
  const last = dates.at(-1);
  if (last) {
    const [, day, month, year] = last;
    return `${year || published.slice(0, 4) || '????'}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  if (/\b(?:chi\s+(?:(?:co|ap\s+dung)\s+)?hom\s+nay|het\s+hom\s+nay|den\s+het\s+hom\s+nay)\b/.test(text)) {
    return published.slice(0, 10) || 'relative';
  }
  return '';
}

function readCodes(text: string, offers: Offer[]) {
  const upper = normalizeCode(text);
  const explicit = Array.from(upper.matchAll(/(?:^|[^\p{L}\d])(?:MÃ|VOUCHER|CODE)\s*[:=]?\s*([A-Z\d][A-Z\d_-]{2,39})(?![\p{L}\d_-])/gu))
    .map(match => match[1]).filter(code => /\d/.test(code) || !['GIAM', 'SALE', 'CHO', 'FREESHIP', 'NAY'].includes(code));
  const tokens = new Set(upper.match(/[A-Z\d][A-Z\d_-]+/g));
  const spaced = new Set(Array.from(upper.matchAll(/(?:^|[^\p{L}\d])(?:MÃ|VOUCHER|CODE)\s*[:=]?\s*([A-Z]{2,})[ \t]+(\d{2,})(?![\p{L}\d_-])/gu))
    .map(match => match[1] + match[2]));
  const known = offers.map(offer => offer.code).filter(code => code && (tokens.has(code) || spaced.has(code)));
  return [...new Set([...explicit, ...known].filter(code => /[A-Z]/.test(code)))];
}

export function unclearSpokenVoucher(clip: Clip, offers: Offer[]) {
  const mentioned = /\b(?:(?:ap|nhap|dung)\s+ma|ma\s+(?:giam gia|uu dai)|voucher)\b/;
  const negated = /\b(?:khong|chang)\s+(?:can\s+)?(?:ap|nhap|dung)\s+ma\b/;
  return clip.evidence.find(segment => {
    if (segment.source !== 'audio') return false;
    const text = fold(segment.text);
    if (!mentioned.test(text) || negated.test(text)) return false;
    return !clip.evidence.some(row => !row.untimed && Math.abs(row.start - segment.start) <= 4 && readCodes(row.text, offers).length > 0);
  });
}

export function extractClaims(clip: Clip, offers: Offer[]) {
  const claims: Claim[] = [];
  const seen = new Set<string>();
  const evidence = [...clip.evidence].sort((a, b) => a.start - b.start);
  for (const segment of evidence) {
    const text = fold(segment.text);
    const context = evidence.filter(other => other.untimed === segment.untimed && Math.abs(other.start - segment.start) <= 4)
      .map(other => other.text).join('\n');
    const codes = readCodes(segment.text, offers);
    const contextCodes = codes.length ? codes : readCodes(context, offers);
    const code = contextCodes.length === 1 ? contextCodes[0] : '';
    const disclosure = readDisclosure(text, clip.published) || readDisclosure(fold(context), clip.published);
    const conditional = conditionPattern.test(text);
    const candidates: Array<Pick<Claim, 'kind' | 'value' | 'code'>> = [
      ...codes.map(value => ({ kind: 'code' as const, value, code: value })),
      ...prices(fold(segment.text.normalize('NFC').replace(/\bngăn\b/gi, 'khoang'))).map(value => ({ kind: 'price' as const, value, code })),
      ...giftClaims(segment.text).map(value => ({ kind: 'gift' as const, value, code })),
    ];
    for (const candidate of candidates) {
      const value = candidate.kind === 'gift' ? giftKey(String(candidate.value)) : candidate.value;
      const key = JSON.stringify([candidate.kind, value, candidate.code, disclosure, conditional, segment.untimed]);
      if (seen.has(key)) continue;
      seen.add(key);
      claims.push({ ...candidate, disclosure, conditional, evidence: segment });
    }
  }
  return claims;
}
