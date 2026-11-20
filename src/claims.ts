import type { Claim, Clip, Evidence, Offer } from './domain';
import { normalizeCode } from './domain';

export const fold = (value: string) =>
  value.toLocaleLowerCase('vi').normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');

export function hasOfferCue(text: string) {
  const value = fold(text);
  const price = /(?:^|[^a-z0-9])(?:\d{1,3}(?:[.,]\d{3})+|\d{2,})\s*(?:k\b|d\b|dong\b|vnd\b|nghin\b|ngan\b|trieu\b|₫)/.test(value) ||
    /\b(?:gia|chi con|giam con)\s*[:=]?\s*\d{2,}\b/.test(value);
  const labeled = /\b(?:ma|voucher|code)\s*[:=]?\s*[a-z0-9][a-z0-9_-]{1,39}\b/.test(value);
  const gift = /\btang\s+(?:[0-9]+|[a-z]{2,})\b/.test(value);
  const code = text.split('\n').some(line => /^[A-Z]{3,}[0-9][A-Z0-9_-]*$/.test(line.trim()));
  const date = /\b(?:chi\s+(?:co\s+)?hom\s+nay|(?:chi|ngay|het|den)\s+(?:ngay\s+)?\d{1,2}[/-]\d{1,2})\b/.test(value);
  return price || labeled || gift || code || date;
}

export function referenceOnly(row: Evidence) {
  return !row.corrected && (row.lowConfidence || (row.source === 'frame' && !hasOfferCue(row.text)));
}

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
  return /\b(?:giam|tang(?:\s+(?:them|kem|ngay))?|tiet\s+kiem|voucher(?:\s+giam)?|giam\s+them|chiet\s+khau|gia\s+goc|gia\s+niem\s+yet|(?:hoa\s+)?don(?:\s+hang)?\s+(?:tu|tren|toi\s+thieu)|chi\s+tieu\s+(?:tu|toi\s+thieu))\s*[:=]?\s*$/.test(prefix);
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

function namedGiftKey(value: string) {
  return value.replace(/\b(?:qua\s+tang|tang\s+kem|tang\s+them|tang|mot|1|cai|chiec)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

const quantity = `(?:[0-9]+|${sequence}(?:\\s+${sequence}){0,5})`;
const buyGift = new RegExp(
  `\\bmua\\s+(${quantity})\\s*(?:[+,:;–—-]+\\s*|thi\\s+)?\\btang\\s+(?:(?:kem|them|ngay)\\s+)?(${quantity})(?![a-z0-9])`,
  'g',
);

function purchaseGifts(value: string) {
  return [...value.matchAll(buyGift)].flatMap(match => {
    const start = match.index!;
    const end = start + match[0].length;
    // Match the quantities independently of how the speaker continues the sentence.
    // A money unit immediately after the gift amount is a different kind of offer.
    if (/^(?:[.,]\d|\s*(?:k|nghin|ngan|trieu|tr|dong|vnd|d)\b|\s*%)/.test(value.slice(end))) return [];
    const count = (text: string) => /^\d+$/.test(text) ? Number(text) : spokenNumber(text.replace(/\s+/g, ' '));
    const buy = count(match[1]);
    const gift = count(match[2]);
    if (!buy || !gift || !Number.isSafeInteger(buy) || !Number.isSafeInteger(gift)) return [];
    const negated = /\b(?:khong(?:\s+(?:co|con))?|het)\s*$/.test(value.slice(0, start));
    return [{ start, end, negated, text: `Mua ${buy} tặng ${gift}`, key: `mua:${buy}:tang:${gift}` }];
  });
}

export function giftKey(value: string) {
  const text = fold(value.normalize('NFC')).trim();
  const purchase = purchaseGifts(text)[0];
  return purchase?.start === 0 && !purchase.negated ? purchase.key : namedGiftKey(text);
}

export function compareGift(value: string, expected: string, evidence: string) {
  const claimKey = giftKey(value);
  const expectedKey = giftKey(expected);
  const claimIsRatio = claimKey.startsWith('mua:');
  const expectedIsRatio = expectedKey.startsWith('mua:');
  if (expectedKey && claimIsRatio !== expectedIsRatio) return 'unclear';
  if (claimKey !== expectedKey) return 'different';
  if (expectedIsRatio) {
    const expectedText = fold(expected.normalize('NFC')).trim();
    const offer = purchaseGifts(expectedText)[0];
    const qualifier = expectedText.slice(offer.end).replace(/^[\s,.:;–—-]+|[\s,.:;–—-]+$/g, '');
    const transcript = fold(evidence.normalize('NFC'));
    if (qualifier && !purchaseGifts(transcript).some(promo => {
      if (promo.negated || promo.key !== expectedKey) return false;
      const suffix = transcript.slice(promo.end).replace(/^[\s,.:;–—-]+/, '');
      return suffix.startsWith(qualifier) && !/^\p{L}/u.test(suffix.slice(qualifier.length));
    })) return 'unclear';
  }
  return 'match';
}

function giftClaims(segment: Evidence, previous?: Evidence) {
  const normalized = segment.text.normalize('NFC');
  const prefix = previous ? previous.text.normalize('NFC') + '\n' : '';
  const purchases = purchaseGifts(fold(prefix + normalized)).filter(promo => promo.end > prefix.length);
  let rest = normalized;
  for (const { start, end } of [...purchases].reverse()) {
    rest = rest.slice(0, Math.max(0, start - prefix.length)) + ' ' + rest.slice(end - prefix.length);
  }
  const gifts = purchases.filter(promo => !promo.negated).map(promo => ({
    value: promo.text, conditional: conditionPattern.test(fold(rest)),
    evidence: previous && promo.start < prefix.length
      ? { ...segment, start: previous.start, text: prefix + normalized, corrected: undefined }
      : segment,
  }));
  const pattern = /\btặng\s+(?:(?:kèm|thêm|ngay)\s+)?([^\n.!?;,:]+?)(?=\s+(?:khi|nếu|cho|trong\s+ngày|đến\s+hết)\b|[\n.!?;,:]|$)/giu;
  for (const match of rest.matchAll(pattern)) {
    const value = match[1].trim();
    if (value && giftKey(value) && !/^(?:từ|giá|voucher|mã|[\d.,]+\s*(?:k|nghìn|ngàn|đồng|%))/i.test(value)) {
      gifts.push({ value, conditional: conditionPattern.test(fold(normalized)), evidence: segment });
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
  const evidence = clip.evidence.filter(row => !referenceOnly(row));
  return evidence.find(segment => {
    if (segment.source !== 'audio') return false;
    const text = fold(segment.text);
    if (!mentioned.test(text) || negated.test(text)) return false;
    return !evidence.some(row => !row.untimed && Math.abs(row.start - segment.start) <= 4 && readCodes(row.text, offers).length > 0);
  });
}

export function extractClaims(clip: Clip, offers: Offer[]) {
  const claims: Claim[] = [];
  const seen = new Set<string>();
  const evidence = clip.evidence.filter(row => !referenceOnly(row)).sort((a, b) => a.start - b.start);
  const lastBySource = new Map<Evidence['source'], Evidence>();
  for (const segment of evidence) {
    const prior = lastBySource.get(segment.source);
    lastBySource.set(segment.source, segment);
    const adjacent = prior && segment.source !== 'frame' && !segment.untimed && !prior.untimed &&
      segment.start > prior.start && Math.abs(segment.start - (prior.end ?? prior.start)) <= 3 ? prior : undefined;
    const text = fold(segment.text);
    const context = evidence.filter(other => other.untimed === segment.untimed && Math.abs(other.start - segment.start) <= 4)
      .map(other => other.text).join('\n');
    const codes = readCodes(segment.text, offers);
    const contextCodes = codes.length ? codes : readCodes(context, offers);
    const code = contextCodes.length === 1 ? contextCodes[0] : '';
    const disclosure = readDisclosure(text, clip.published) || readDisclosure(fold(context), clip.published);
    const conditional = conditionPattern.test(text);
    const candidates: Array<Pick<Claim, 'kind' | 'value' | 'code' | 'conditional' | 'evidence'>> = [
      ...codes.map(value => ({ kind: 'code' as const, value, code: value, conditional, evidence: segment })),
      ...prices(fold(segment.text.normalize('NFC').replace(/\bngăn\b/gi, 'khoang'))).map(value =>
        ({ kind: 'price' as const, value, code, conditional, evidence: segment })),
      ...giftClaims(segment, adjacent).map(gift => ({ ...gift, kind: 'gift' as const, code })),
    ];
    for (const candidate of candidates) {
      const value = candidate.kind === 'gift' ? giftKey(String(candidate.value)) : candidate.value;
      const key = JSON.stringify([candidate.kind, value, candidate.code, disclosure, candidate.conditional, segment.untimed]);
      if (seen.has(key)) continue;
      seen.add(key);
      claims.push({ ...candidate, disclosure });
    }
  }
  return claims;
}
