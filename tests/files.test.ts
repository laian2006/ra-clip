import { describe, expect, it } from 'vitest';
import { auditCsv, csv, readDelimited, readPrice, readSubtitles, rowsToOffers } from '../src/files';
import { sampleWorkspace } from '../src/demo';
import { safeLink } from '../src/domain';

describe('Import and export', () => {
  it('handles Vietnamese headings, BOM, quoted CSV and delimiters', () => {
    const rows = readDelimited('\uFEFFMã SKU;Tên sản phẩm;Giá VNĐ;Kết thúc\r\nA;"Bình ""kem""";99.000;11/11/2026\r\n');
    expect(rowsToOffers(rows)[0]).toMatchObject({ sku: 'A', price: 99000, name: 'Bình "kem"', end: '2026-11-11' });
    expect(readDelimited('sku,name\nA,"Tên, mới"')).toEqual([['sku', 'name'], ['A', 'Tên, mới']]);
  });

  it('parses amounts and catches corrupted input', () => {
    expect(readPrice('99k')).toBe(99000);
    expect(readPrice('99.000 đ')).toBe(99000);
    expect(() => readPrice('99k 12')).toThrow();
    expect(() => readDelimited('sku,name\nA,"vẫn mở')).toThrow();
    expect(() => rowsToOffers([['price'], ['200']])).toThrow('Thiếu cột sku');
  });

  it('extracts and sorts SRT and VTT cues and manual notes', () => {
    expect(readSubtitles('1\r\n00:00:05,200 --> 00:00:07,000\r\n<i>Mã SALE99</i>'))
      .toEqual([{ start: 5.2, end: 7, text: 'Mã SALE99', source: 'subtitle' }]);
    expect(readSubtitles('WEBVTT\n\n00:08.125 --> 00:09.000 align:start\nCòn 99k')[0].start).toBe(8.125);
    expect(readSubtitles('00:18 Còn 99k\n00:02 Không khuyến mãi', 'manual')[0].start).toBe(2);
    expect(() => readSubtitles('00:99 Không hợp lệ')).toThrow('Thiếu mốc');
  });

  it('writes review decisions and a CSV that escapes spreadsheet formulas', () => {
    const data = sampleWorkspace();
    const first = data.audit!.results[0].findings[0];
    expect(auditCsv(data.audit!, data.clips, { [first.id]: 'new' })).toContain('Mới phát hiện');
    expect(csv([['=1+1', 'has "quotes"', '@SUM(1,2)']])).toContain('"\'=1+1","has ""quotes""","\'@SUM(1,2)"');
  });

  it('accepts only ordinary HTTP(S) links', () => {
    expect(safeLink('javascript:alert(2)')).toBe('');
    expect(safeLink('https://abc:def@example.com')).toBe('');
    expect(safeLink('https://example.com/clip')).toBe('https://example.com/clip');
  });
});
