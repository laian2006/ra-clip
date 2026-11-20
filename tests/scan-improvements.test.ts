import { describe, expect, it } from 'vitest';
import type { Clip, Evidence } from '../src/domain';
import { scanSourceDetail } from '../src/evidence-quality';
import { scanTimeRange } from '../src/scan-timing';
import { suggestShopTerm } from '../src/shop-terms';
import { readSpeechParts, speechSampleRate } from '../src/speech-recovery';
import { confirmSpeechDrafts, mergeScan } from '../src/workflow';
import { scanFrameCount } from '../src/video-limits';

const clip: Clip = {
  id: 'a', sku: 'MYPHAM-NHAT', title: 'Mỹ phẩm Nhật', link: '', published: '', evidence: [], localMedia: false,
};

describe('batch and long-video improvements', () => {
  it('confirms selected drafts together and derives the remaining count from the saved rows', () => {
    const evidence: Evidence[] = Array.from({ length: 6 }, (_, index) =>
      ({ source: 'audio', text: 'Mỹ phẩm nhặt', start: index * 16, end: index * 16 + 5, lowConfidence: true }));
    const previous: Clip = { ...clip, evidence, lastScan: {
      at: '2026-11-20T08:30', audio: true, frame: false, state: 'partial', detail: 'Đã đọc lại.',
      sources: { audio: { state: 'empty', discarded: 1, detail: 'Chưa nhận ra lời thoại. Bỏ 1 đoạn lặp bất thường. Có 6 đoạn độ tin cậy thấp để nghe lại.' } },
    } };
    expect(scanSourceDetail(previous, 'audio')).toContain('Còn 6 đoạn chờ nghe lại.');
    const edits = evidence.map(entry => ({ entry, text: 'Mỹ phẩm Nhật' }));
    const partial = confirmSpeechDrafts(previous, edits.slice(0, 3));
    expect(scanSourceDetail(partial, 'audio')).toContain('Đã xác nhận 3 đoạn lời thoại. Còn 3 đoạn chờ nghe lại.');
    expect(() => confirmSpeechDrafts(partial, edits)).toThrow('đã thay đổi');
    const confirmed = confirmSpeechDrafts(partial, edits.slice(3));
    expect(scanSourceDetail(confirmed, 'audio')).toBe('Bỏ 1 đoạn lặp bất thường. Đã xác nhận 6 đoạn lời thoại. Còn 0 đoạn chờ nghe lại.');
    expect(mergeScan(confirmed, evidence).evidence).toEqual(confirmed.evidence);
    expect(confirmSpeechDrafts(previous, edits)).toEqual(confirmed);
  });

  it('suggests a shop term from a similar phrase without changing nearby prices', () => {
    expect(suggestShopTerm('Mình thấy đồ mỹ phẩm nhặt giá 299k.', ['MYPHAM-NHAT', 'Mỹ phẩm Nhật']))
      .toMatchObject({ from: 'mỹ phẩm nhặt', to: 'Mỹ phẩm Nhật', text: 'Mình thấy đồ Mỹ phẩm Nhật giá 299k.' });
    expect(suggestShopTerm('merzaTint', ['MerzyTint', 'MerziTint'])).toBeUndefined();
    expect(suggestShopTerm('Mã SUMMER23', ['SUMMER24'])).toBeUndefined();
  });

  it('keeps absolute times on a long clip and retains available sections if one fails', async () => {
    const samples = new Float32Array(144 * speechSampleRate).fill(0.02);
    const seen: number[] = [];
    const result = await readSpeechParts(samples, async (part, index, total) => {
      expect(part.length).toBe(48 * speechSampleRate);
      expect(total).toBe(3);
      seen.push(index);
      if (index === 2) throw Error('Không đọc được phần này');
      return { evidence: [{ start: 38, end: null, source: 'audio', text: 'Giá 99k' }], discarded: 0, retried: 0, timingRejected: 0 };
    });
    expect(seen).toEqual([1, 2, 3]);
    expect(result).toMatchObject({ evidence: [{ start: 38, end: 48 }, { start: 134, end: 144 }], failedParts: 1 });
    expect(scanFrameCount(144)).toBeGreaterThan(scanFrameCount(120));
  });

  it('uses observed times for repeated files and keeps a wider range when unmeasured', () => {
    const clips = [{ ...clip, duration: 24 }, { ...clip, id: 'b', duration: 100 }];
    const initial = scanTimeRange(clips, 'both', [], true);
    const learned = scanTimeRange(clips, 'both', [
      { media: 'a', duration: 24, seconds: 25, cold: false },
      { media: 'b', duration: 100, seconds: 85, cold: false },
      { media: 'a', duration: 24, seconds: 38, cold: true },
    ], false);
    expect(learned).toMatchObject({ expected: 110, low: 82, high: 138, calibrated: true });
    expect(initial.calibrated).toBe(false);
    expect(initial.high - initial.low).toBeGreaterThan(learned.high - learned.low);
  });
});
