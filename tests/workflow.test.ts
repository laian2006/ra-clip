import { describe, expect, it } from 'vitest';
import { compareOffers } from '../src/audit';
import { makeBackup, readBackup } from '../src/backup';
import { refreshDemo, sampleWorkspace } from '../src/demo';
import type { Clip, Evidence } from '../src/domain';
import { changeEvidence, leadVerdict, mergeScan, queueEntries, setFindingNote, setReviews, snapshotDelta, updatedReport } from '../src/workflow';

describe('campaign lifecycle', () => {
  it('keeps all expected kinds of sample outcomes with playable assets', () => {
    const workspace = sampleWorkspace();
    expect(workspace.clips).toHaveLength(9);
    expect(workspace.clips.every(clip => clip.demoMedia)).toBe(true);
    expect(workspace.audit?.results.map(result => leadVerdict(result.findings))).toEqual([
      'action', 'clear', 'action', 'action', 'review', 'dated', 'review', 'action', 'review',
    ]);
  });

  it('keeps custom sample work when an old browser gets the new sample pack', () => {
    const current = sampleWorkspace();
    const legacy = { ...current, demoPack: undefined, clips: [{ ...current.clips[0], title: 'Đã đổi tên' }] };
    const refreshed = refreshDemo(legacy);
    expect(refreshed.clips).toHaveLength(9);
    expect(refreshed.clips[0].title).toBe('Đã đổi tên');
    expect(refreshDemo(refreshed)).toBe(refreshed);
  });

  it('shows exact changed fields for edited, added and removed offers', () => {
    const workspace = sampleWorkspace();
    const [first, next] = workspace.versions;
    const removed = first.offers[1];
    const diff = compareOffers(first.offers, next.offers.filter(row => row !== next.offers[1]));
    expect(diff.some(row => row.before === removed && !row.after)).toBe(true);
    expect(diff.find(row => row.sku === 'AO-NAVY')?.fields).toEqual(['price', 'start']);
    expect(compareOffers([], next.offers).every(row => !row.before)).toBe(true);
  });

  it('keeps reports historical while a handwritten fix changes a clip outcome', () => {
    const first = sampleWorkspace();
    const clip = first.clips.find(clip => clip.id === 'demo-tee')!;
    const fixed = changeEvidence(clip, 1, { start: 5, end: null, text: 'Giá áo cotton 159k.' });
    const next = updatedReport({ ...first, clips: first.clips.map(row => row.id === clip.id ? fixed : row) }, 'evidence');
    expect(next.audit?.refreshed).toEqual([clip.id]);
    expect(snapshotDelta(next.snapshots?.at(-2), next.snapshots!.at(-1)!)).toMatchObject({ added: [], cleared: [{ id: clip.id }] });
    expect(first.snapshots?.at(-1)?.audit.results.find(row => row.clipId === clip.id)?.findings[0].verdict).toBe('action');
  });

  it('preserves manual corrections and suppression when AI is re-run', () => {
    const raw: Evidence = { start: 4.5, end: null, text: 'Còn 125k', source: 'frame' };
    const clip: Clip = {
      id: '1', title: 'Áo', sku: 'A', link: '', published: '',
      localMedia: true, evidence: [raw, { ...raw, start: 9, text: 'Lỗi chữ nền' }],
    };
    const corrected = changeEvidence(clip, 0, { start: 5, end: null, text: 'Còn 129k' });
    const removed = changeEvidence(corrected, 1, null);
    const scanned = mergeScan(removed, [{ ...raw, start: 4.7 }, { ...raw, start: 9.2 }, { ...raw, start: 13 }]);
    expect(scanned.evidence.map(row => [row.start, row.text, !!row.corrected])).toEqual([[5, 'Còn 129k', true], [13, 'Còn 125k', false]]);
  });

  it('groups actionable findings and persists a review plus a note', () => {
    const workspace = sampleWorkspace();
    const first = queueEntries(workspace)[0].finding;
    const next = setFindingNote(setReviews(workspace, [first.id, 'missing'], 'done'), first.id, ' Đã nhắc người đăng ');
    expect(queueEntries(next)[0]).toMatchObject({ review: 'done', note: 'Đã nhắc người đăng' });
    expect(next.reviews.missing).toBeUndefined();
  });
});

describe('portable campaign backup', () => {
  it('round trips files, findings, reviews and history with new clip identifiers', async () => {
    const source = sampleWorkspace();
    const clip = { ...source.clips[0], demoMedia: undefined, localMedia: true };
    const campaign = updatedReport({ ...source, demo: false, clips: [clip], snapshots: [] }, 'manual');
    const id = queueEntries(campaign)[0].finding.id;
    const noted = setFindingNote(setReviews(campaign, [id], 'done'), id, 'Đã gỡ khỏi quảng cáo');
    const workspace = updatedReport(noted, 'manual');
    const file = await makeBackup({ name: 'Chiến dịch thử', shop: 'Shop A' }, workspace,
      async () => new Blob(['video bytes'], { type: 'video/webm' }));
    const restored = await readBackup(file);
    expect(restored.draft.name).toBe('Chiến dịch thử');
    expect(restored.workspace.clips[0].id).not.toBe(clip.id);
    expect(restored.media[0].id).toBe(restored.workspace.clips[0].id);
    expect(await restored.media[0].blob?.text()).toBe('video bytes');
    expect(queueEntries(restored.workspace)[0]).toMatchObject({ note: 'Đã gỡ khỏi quảng cáo', review: 'done' });
    expect(restored.workspace.snapshots).toHaveLength(2);
  });

  it('rejects truncated or unrelated files', async () => {
    await expect(readBackup(new Blob(['hỏng']))).rejects.toThrow();
    const source = { ...sampleWorkspace(), demo: false, clips: [], snapshots: [] };
    const file = await makeBackup({ name: 'Sale', shop: '' }, source, async () => undefined);
    await expect(readBackup(file.slice(0, file.size - 1))).rejects.toThrow();
  });
});
