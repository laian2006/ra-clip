import { describe, expect, it } from 'vitest';
import { applyCatalog, planCatalog, readCount, tiktokId } from '../src/catalog';
import type { Clip } from '../src/domain';
import { captionsFor } from '../src/captions';
import { completeScan, failScan } from '../src/batch';

const id = '7134567890123456789';
const link = `https://www.tiktok.com/@example/video/${id}`;
const clip: Clip = {
  id: 'existing', title: 'Clip cũ', sku: 'SKU-CU', link, published: '2026-11-08', localMedia: true,
  mediaRevision: 'original', creator: 'Người cũ', stats: { views: 12, orders: 5 },
  evidence: [{ source: 'manual', start: 2, end: 4, text: 'Còn 99k.' }],
};

describe('catalog import', () => {
  it('uses the stable ID despite a different TikTok URL and preserves existing media and notes', () => {
    const rows = planCatalog([
      ['Tên video', 'Link video', 'Mã SKU', 'Lượt xem', 'Số đơn hàng'],
      ['Đã đổi tên', `https://m.tiktok.com/@other/video/${id}?is_from_webapp=1`, '', '1.200', '0'],
    ], [clip]);
    expect(rows[0]).toMatchObject({ state: 'update', target: 'existing' });
    expect(applyCatalog([clip], rows)[0]).toMatchObject({
      title: 'Đã đổi tên', sku: 'SKU-CU', localMedia: true, mediaRevision: 'original', creator: 'Người cũ',
      videoId: id, stats: { views: 1200, orders: 0 }, evidence: clip.evidence,
    });
  });

  it('does not import invalid or duplicate rows and does not overwrite absent metrics', () => {
    const rows = planCatalog([
      ['title', 'link', 'video_id', 'orders'],
      ['A', 'https://example.com/a', '', 5],
      ['Trùng', 'https://example.com/a#tracker', '', 4],
      ['Sai link', 'javascript:alert(1)', '', ''],
      ['ID làm tròn', '', Number(id), ''],
      ['ID chính xác từ link', link, Number(id), ''],
    ], [clip]);
    expect(rows.map(item => item.state)).toEqual(['add', 'skip', 'invalid', 'invalid', 'update']);
    const result = applyCatalog([clip], rows);
    expect(result).toHaveLength(2);
    expect(result[0].stats).toEqual({ views: 12, orders: 5 });
    expect(tiktokId(`https://tiktok.com.evil.test/@example/video/${id}`)).toBe('');
  });

  it('rejects an ambiguous duplicate in the existing library', () => {
    expect(planCatalog([['link'], [link]], [clip, { ...clip, id: 'another' }])[0].state).toBe('invalid');
    expect(() => readCount('1,25', 'Đơn')).toThrow('số nguyên');
  });
});

describe('caption and scan state', () => {
  it('prefers the user subtitle and escapes markup in WebVTT', () => {
    expect(captionsFor([
      { source: 'frame', start: 2, end: null, text: 'Chữ trong hình' },
      { source: 'audio', start: 1, end: 2, text: 'Đã nhận dạng' },
      { source: 'subtitle', start: 5.123, end: null, text: 'Sửa lại <tag> & nội dung' },
      { source: 'subtitle', start: 6, end: 7, text: 'Câu tiếp theo' },
    ])).toContain('00:00:05.123 --> 00:00:06.000\nSửa lại &lt;tag&gt; &amp; nội dung');
    expect(captionsFor([{ source: 'frame', start: 0, end: null, text: 'Không phải lời thoại' }])).toBe('');
  });

  it('keeps the previous evidence through empty and failed scans', () => {
    const options = { audio: false, frame: true };
    expect(completeScan(clip, options, { evidence: [], sources: { frame: { state: 'empty', detail: 'Không đọc được chữ.' } } })).toMatchObject({
      evidence: clip.evidence, lastScan: { state: 'empty', frame: true },
    });
    expect(failScan(clip, options, 'Thiếu file')).toMatchObject({ evidence: clip.evidence, lastScan: { state: 'failed' } });
  });
});
