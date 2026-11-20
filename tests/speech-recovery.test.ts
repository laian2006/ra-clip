import { describe, expect, it, vi } from 'vitest';
import { runAudit } from '../src/audit';
import { captionsFor } from '../src/captions';
import { referenceOnly } from '../src/claims';
import type { Clip, Evidence } from '../src/domain';
import { recoverLoopedSpeech, speechSampleRate } from '../src/speech-recovery';
import { changeEvidence } from '../src/workflow';

const audio = (text: string, start = 0, end: number | null = null): Evidence => ({ text, start, end, source: 'audio' });
const loop = audio('nướng '.repeat(150));

describe('recovery when all recognized speech is filtered', () => {
  it('keeps short natural emphasis and skips the retry when one usable passage remains', async () => {
    const good = audio('Rất, rất rẻ, giá 149k.');
    const read = vi.fn();
    await expect(recoverLoopedSpeech(new Float32Array(1), [loop, good], read, vi.fn()))
      .resolves.toEqual({ evidence: [good], discarded: 1, retried: 0, timingRejected: 0 });
    expect(read).not.toHaveBeenCalled();
  });

  it('scans independent windows, offsets their timestamps and skips silent windows', async () => {
    const samples = new Float32Array(34 * speechSampleRate);
    samples.fill(0.2, 16 * speechSampleRate);
    const dense = audio('Không thể nói rõ toàn bộ câu dài này trong chưa đầy nửa giây như vậy.', 1.69);
    const read = vi.fn().mockResolvedValueOnce([audio('Giá 150k.', 1.03), loop])
      .mockResolvedValueOnce([audio('Sau phần cuối', 2.01), audio('Hết hàng', 0.1, 5), dense]);
    const progress = vi.fn();
    const result = await recoverLoopedSpeech(samples, [loop], read, progress);
    expect(read.mock.calls.map(([chunk]) => chunk.length / speechSampleRate)).toEqual([16, 2]);
    expect(progress.mock.calls).toEqual([[1, 3], [2, 3], [3, 3]]);
    expect(result).toEqual({ discarded: 2, retried: 2, timingRejected: 2, evidence: [
      { ...audio('Giá 150k.', 17.03, 32), lowConfidence: true },
      { ...audio('Hết hàng', 32.1, 34), lowConfidence: true },
    ] });
  });

  it('uses recovered ASR only after a review and labels OCR without a promotion', () => {
    const price = { ...audio('Giá 150k.', 17, 24), lowConfidence: true as const };
    const ocr: Evidence = { source: 'frame', start: 23, end: null, text: 'First Care Activating Serum' };
    const clip: Clip = {
      id: 'example', sku: 'COMBO', title: 'Clip', link: '', published: '', evidence: [price, ocr], localMedia: true,
      lastScan: {
        at: '2026-11-20T09:00', audio: true, frame: true, state: 'partial', detail: 'Có đoạn chờ xác nhận.',
        sources: { audio: { state: 'empty', discarded: 1, detail: 'Đã đọc lại.' } },
      },
    };
    const at = '2026-11-20T09:00';
    const versions = [{ id: '1', at, offers: [
      { sku: 'COMBO', code: '', name: 'Combo', price: 140000, gift: '', start: '', end: '', condition: '' },
    ] }];
    expect(referenceOnly(ocr)).toBe(true);
    expect(referenceOnly({ ...ocr, text: 'Giá 129k' })).toBe(false);
    expect(runAudit([clip], versions, at).results[0].findings).toMatchObject([
      { kind: 'coverage', verdict: 'review', reason: expect.stringContaining('1 đoạn độ tin cậy thấp') },
    ]);
    expect(captionsFor(clip.evidence)).toBe('');
    const checked = changeEvidence(clip, 0, { start: 17, end: 24, text: 'Giá 150k.' });
    expect(runAudit([checked], versions, at).results[0].findings).toMatchObject([{ kind: 'price', verdict: 'action' }]);
    expect(captionsFor(checked.evidence)).toContain('Giá 150k.');
  });
});
