import { describe, expect, it } from 'vitest';
import { changedSkus, runAudit, validateOffers } from '../src/audit';
import { extractClaims } from '../src/claims';
import { sampleWorkspace } from '../src/demo';
import type { Clip, Offer, OfferVersion } from '../src/domain';
import { dateInput, parseVietnamTime } from '../src/time';

const offer: Offer = { sku: 'A', name: 'Bình 500 ml', code: 'SALE99', price: 99000, gift: 'lõi thay',
  start: '2026-11-04', end: '2026-11-11', condition: '' };
const clip = (text: string, id = 'clip', sku = 'A', published = '2026-11-10'): Clip => ({
  id, title: id, sku, link: '', published, localMedia: false,
  evidence: [{ start: 4.2, end: null, text, source: 'audio' }],
});
const version = (offers: Offer[], id = '1'): OfferVersion => ({ id, at: '2026-11-04T08:00', offers });
const at = '2026-11-12T09:00';
const first = (item: Clip, offers: Offer[] = [offer], time = at) =>
  runAudit([item], [version(offers)], time).results[0].findings;

describe('Evidence extraction', () => {
  it.each([
    ['Bản 500 ml còn 99k.', 99000],
    ['Mua combo giá 99.000 đồng.', 99000],
    ['Giá chỉ 1,2 triệu.', 1200000],
    ['Còn chín mươi chín nghìn.', 99000],
    ['Hôm nay giá chín chín.', 99000],
    ['Giá gốc 169k, giảm 70k, còn 99k.', 99000],
    ['Tiết kiệm hai mươi nghìn, còn 99k.', 99000],
  ])('extracts the actual advertised price in %s', (text, expected) => {
    const claims = extractClaims(clip(text), [offer]).filter(row => row.kind === 'price');
    expect(claims.map(row => row.value)).toEqual([expected]);
  });

  it('joins price and known voucher between nearby evidence', () => {
    const item = clip('Còn 99k!');
    item.evidence.push({ start: 5, end: null, text: 'Áp mã SALE99', source: 'frame' });
    expect(extractClaims(item, [offer]).find(row => row.kind === 'price')?.code).toBe('SALE99');
  });

  it('does not treat sizes or dates as prices', () => {
    expect(extractClaims(clip('Bình 500 ml, ngày 11/11, giảm 20%.'), [offer])).toEqual([]);
  });

  it('recognizes gifts and flags incomplete conditions', () => {
    const current = { ...offer, code: '', start: '', end: '' };
    expect(first(clip('Tặng kèm một lõi thay.'), [current])[0].verdict).toBe('clear');
    expect(first(clip('Mua hai tặng một lõi thay.'), [current])[0].verdict).toBe('review');
    expect(first(clip('Tặng kèm một lõi thay.'), [{ ...current, gift: '' }])[0].verdict).toBe('action');
  });
});

describe('Audit decisions and versions', () => {
  it('marks expired vouchers with the original timestamp', () => {
    const findings = first(clip('Còn 99k với mã SALE99.'));
    expect(findings.map(row => row.verdict)).toEqual(['action', 'action']);
    expect(findings[0].evidence?.start).toBe(4.2);
  });

  it('classifies stated dates separately and handles unknown publication', () => {
    expect(first(clip('Còn 99k với mã SALE99, chỉ ngày 11/11.')).every(row => row.verdict === 'dated')).toBe(true);
    expect(first(clip('Còn 99k với mã SALE99, chỉ hôm nay.', 'clip', 'A', ''))[0].verdict).toBe('review');
    expect(first(clip('Mã SALE99 áp dụng đến ngày 14/11.'))[0].verdict).toBe('review');
  });

  it('uses the date-only expiry through the end of a Vietnam day', () => {
    expect(first(clip('Mã SALE99.'), [offer], '2026-11-11T23:59:59')[0].verdict).toBe('clear');
    expect(first(clip('Mã SALE99.'), [offer], '2026-11-12T00:00:00')[0].verdict).toBe('action');
  });

  it('never returns clear for unknown SKU, multiple vouchers or missing evidence', () => {
    expect(first(clip('Mã SALE99.', 'clip', 'B'))[0].verdict).toBe('review');
    expect(first(clip('Còn 99k lúc áp voucher.'), [offer, { ...offer, code: 'SALE89' }])[0].verdict).toBe('review');
    expect(first(clip('Nắp bình bằng thép.'))[0].kind).toBe('coverage');
  });

  it('only rechecks affected products and clips with edited inputs', () => {
    const data = sampleWorkspace();
    const [before] = data.versions.slice(-1);
    const amended = before.offers.map(row => row.sku === 'TUI-KEM' ? { ...row, price: 149000 } : row);
    expect([...changedSkus(before.offers, amended)]).toEqual(['TUI-KEM']);
    const next = runAudit(data.clips, [...data.versions, version(amended, 'v3')], data.checkedAt, data.audit);
    expect(next.refreshed).toEqual(['sample-three', 'sample-five']);
    expect(next.results[0]).toBe(data.audit?.results[0]);
    expect(next.results[2].findings[0].verdict).toBe('action');
  });

  it('rechecks all clips when the audit time changes', () => {
    const data = sampleWorkspace();
    expect(runAudit(data.clips, data.versions, '2026-11-10T12:00', data.audit).refreshed).toHaveLength(5);
  });

  it('distinguishes removed vouchers from missing data', () => {
    const next = runAudit([clip('SALE99 còn 99k.')],
      [version([offer]), version([{ ...offer, code: '', price: 149000 }], '2')], at);
    expect(next.results[0].findings[0].verdict).toBe('review');
  });

  it('rejects duplicates, noninteger prices and backwards dates', () => {
    expect(() => validateOffers([offer, { ...offer, code: 'sale99' }])).toThrow('Trùng SKU');
    expect(() => validateOffers([{ ...offer, price: 9.9 }])).toThrow('số nguyên');
    expect(() => validateOffers([{ ...offer, end: '2026-10-01' }])).toThrow('đứng sau');
  });
});

describe('Vietnam time', () => {
  it('uses UTC+7 independently of the host timezone', () => {
    expect(parseVietnamTime('2026-11-12T09:30')).toBe(Date.UTC(2026, 10, 12, 2, 30));
    expect(dateInput('12/11/2026 9:30')).toBe('2026-11-12T09:30');
  });

  it('rejects impossible dates and out-of-range times', () => {
    expect(parseVietnamTime('2026-02-29')).toBeNull();
    expect(parseVietnamTime('2026-11-12T24:00')).toBeNull();
  });
});
