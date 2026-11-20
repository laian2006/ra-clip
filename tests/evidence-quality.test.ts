import { describe, expect, it } from 'vitest';
import { runAudit } from '../src/audit';
import { completeScan } from '../src/batch';
import { referenceOnly } from '../src/claims';
import type { Clip, Evidence, OfferVersion, Workspace } from '../src/domain';
import { emptyWorkspace } from '../src/demo';
import { hasSpeechLoop, keepSpeechEvidence, screenOcrLines, screenedSource } from '../src/evidence-quality';
import { prepareWorkspace } from '../src/workflow';

const loop = Array(150).fill('nướng').join(' ');
const at = '2026-11-20T09:00';
const clip: Clip = {
  id: 'test', sku: 'SON-MERZY', title: 'Kiểm thử lời thoại', link: '', published: '', localMedia: false, evidence: [],
};
const audio = (text: string, start = 4): Evidence => ({ text, start, end: null, source: 'audio' });
const version: OfferVersion = {
  id: 'v1', at, offers: [{ sku: clip.sku, name: 'Son', code: '', price: 140000, start: '', end: '', condition: '', gift: 'Mua 1 tặng 1' }],
};

describe('buy-and-get gifts', () => {
  it.each([
    ['Giá 140k, mua một tặng một.', 'Mua 1 tặng 1', 'clear'],
    ['Chưa tới một trăm bốn mươi, mua một tặng một nha.', 'Mua 1 tặng 1', 'clear'],
    ['Chưa tới một trăm bốn mươi nghìn cành lại còn mua một tặng một nhanh tay trốt đơn kéo lố mấy bà ơi.',
      'Mua 1 tặng 1', 'clear'],
    ['Lại còn mua một tặng một nhanh tay trót đơn kẻo lỡ mấy bà ơi.', 'Mua 1 tặng 1', 'clear'],
    ['Mua 2 tặng 1.', 'Mua 1 tặng 1', 'action'],
    ['Mua một tặng hai.', 'Mua 1 tặng 1', 'action'],
    ['Tặng kèm một lõi thay.', 'lõi thay', 'clear'],
  ])('checks %s against %s', (text, gift, verdict) => {
    const specific = { ...version, offers: [{ ...version.offers[0], gift }] };
    const { findings } = runAudit([{ ...clip, evidence: [audio(text)] }], [specific], at).results[0];
    expect(findings.filter(row => row.kind === 'gift')).toMatchObject([{ verdict }]);
    if (verdict === 'clear') expect(findings.every(row => row.verdict === 'clear')).toBe(true);
  });

  it('joins adjacent speech chunks and keeps the actual words as evidence', () => {
    const earlier = { ...audio('Lại còn mua một', 8), end: 10 };
    const later = audio('tặng một nhanh tay chốt đơn.', 10.1);
    const { findings } = runAudit([{ ...clip, evidence: [earlier, later] }], [version], at).results[0];
    expect(findings).toMatchObject([{ kind: 'gift', verdict: 'clear', claim: 'Mua 1 tặng 1',
      evidence: { start: 8, text: 'Lại còn mua một\ntặng một nhanh tay chốt đơn.' } }]);
  });

  it('uses verification instead of a false mismatch when only the gift fragment is known', () => {
    for (const text of ['Tặng một nhanh tay chốt đơn.', 'Mua một tặng một trăm nghìn.']) {
      const { findings } = runAudit([{ ...clip, evidence: [audio(text)] }], [version], at).results[0];
      expect(findings.every(finding => finding.verdict === 'review')).toBe(true);
    }
  });

  it('checks the named item when the offer includes one along with the gift ratio', () => {
    const qualified = { ...version, offers: [{ ...version.offers[0], gift: 'Mua 1 tặng 1 lõi thay' }] };
    expect(runAudit([{ ...clip, evidence: [audio('Mua một tặng một lõi thay, chốt đơn ngay.')] }], [qualified], at)
      .results[0].findings[0].verdict).toBe('clear');
    expect(runAudit([{ ...clip, evidence: [audio('Mua một tặng một bình mới, chốt đơn ngay.')] }], [qualified], at)
      .results[0].findings[0].verdict).toBe('review');
  });
});

describe('machine evidence filters', () => {
  it('removes long word and phrase loops and keeps brief natural emphasis or edits', () => {
    expect(hasSpeechLoop(loop)).toBe(true);
    expect(hasSpeechLoop('rất đẹp '.repeat(9) + 'ạ')).toBe(true);
    expect(hasSpeechLoop('Giá rất, rất, rất rẻ. Mua một tặng một.')).toBe(false);
    expect(hasSpeechLoop(`Xin chào ${'giá, '.repeat(8)} hôm nay`)).toBe(true);
    expect(hasSpeechLoop('rẻ '.repeat(7))).toBe(false);
    const natural = audio('Giá rất, rất rẻ.');
    const edited = { ...audio(loop), corrected: true };
    expect(keepSpeechEvidence([natural, audio(loop, 0), edited])).toEqual([natural, edited]);
  });

  it('keeps credible OCR lines from a mixed frame and drops low-confidence prices', () => {
    expect(screenOcrLines([
      { text: 'SALE99', confidence: 94 }, { text: '1 4 ##l', confidence: 85 },
      { text: 'Giá 140.000đ', confidence: 42 }, { text: 'Tặng một lõi thay', confidence: 82 },
    ])).toEqual({ text: 'SALE99\nTặng một lõi thay', discarded: 2 });
  });

  it('drops isolated OCR fragments from the real reports even at high confidence', () => {
    expect(screenOcrLines([
      ...['is', 'ay Bi ii', 'Z2', 'M13)', 'Fox', 'Sị'].map(text => ({ text, confidence: 94 })),
      { text: 'Mã Z2', confidence: 92 }, { text: '129K', confidence: 68 },
      { text: 'Sulwhasoo First Care Activating', confidence: 91 },
    ])).toEqual({ text: 'Mã Z2\n129K\nSulwhasoo First Care Activating', discarded: 6 });
  });

  it('uses supported OCR price and date formats without trusting product fragments', () => {
    const screened = screenOcrLines([{ text: 'Giá chỉ 2 tr', confidence: 65 }]);
    const frame: Evidence = { source: 'frame', start: 5, end: null, text: screened.text };
    const twoMillion = { ...version, offers: [{ ...version.offers[0], price: 2_000_000, gift: '' }] };
    const { findings } = runAudit([{ ...clip, evidence: [frame] }], [twoMillion], at).results[0];
    expect(findings).toMatchObject([{ kind: 'price', verdict: 'clear' }]);
    expect(referenceOnly({ ...frame, text: 'Còn một triệu' })).toBe(false);
    expect(referenceOnly({ ...frame, text: 'Áp dụng từ 20/11' })).toBe(false);
    expect(referenceOnly({ ...frame, text: 'Dâu Tây tran' })).toBe(true);
  });

  it('clears old unusable audio on a completed empty scan while preserving corrections', () => {
    const corrected = { ...audio('Giá 140k.', 7), corrected: true };
    const prior = { ...clip, evidence: [audio(loop, 0), corrected] };
    const result = completeScan(prior, { audio: true, frame: false }, {
      evidence: [], sources: { audio: screenedSource('audio', 0, 1) },
    });
    expect(result.evidence).toEqual([corrected]);
    expect(result.lastScan?.sources?.audio?.detail).toMatch(/Chưa nhận ra lời thoại.*lặp bất thường/);
  });

  it('rebuilds a saved old report and drops legacy noise without adding an audit run', () => {
    const matching = audio('Mua một tặng một.');
    const prior = { ...clip, evidence: [audio(loop, 0), matching], lastScan: {
      at, audio: true, frame: false, state: 'ready' as const, detail: 'Đã nhận dạng 2 đoạn.',
    } };
    const audit = runAudit([prior], [version], at);
    const legacy: Workspace = { ...emptyWorkspace(), clips: [prior], versions: [version], checkedAt: at,
      audit: { ...audit, rulesVersion: undefined, results: [{ ...audit.results[0], findings: [] }] } };
    const migrated = prepareWorkspace(legacy);
    expect(migrated.clips[0].evidence).toEqual([matching]);
    expect(migrated.clips[0].lastScan?.sources?.audio?.discarded).toBe(1);
    expect(migrated.audit?.results[0].findings).toMatchObject([{ verdict: 'clear', claim: 'Mua 1 tặng 1' }]);
    expect(migrated.snapshots).toHaveLength(0);
  });
});
