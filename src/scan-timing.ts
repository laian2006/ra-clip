import type { Clip } from './domain';
import { maxVideoSeconds, scanFrameCount } from './video-limits';

export type BatchMode = 'audio' | 'frame' | 'both';
export type ScanSample = { media: string; duration: number; seconds: number; cold: boolean };

const maxSamples = 40;
const storageKey = (mode: BatchMode) => `ra-clip-scan-timing-v2-${mode}`;
export const timingMediaId = (clip: Clip) => clip.fileHash || clip.mediaRevision || clip.id;

export function readScanTimings(mode: BatchMode): ScanSample[] {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(mode)) ?? '[]');
    if (Array.isArray(value)) return value.slice(-maxSamples).filter(row =>
      typeof row?.media === 'string' && typeof row.cold === 'boolean' && Number.isFinite(row.duration) &&
      row.duration > 0 && row.duration <= maxVideoSeconds && Number.isFinite(row.seconds) && row.seconds > 0 && row.seconds <= 3600);
  } catch { /* Time estimates also work with storage disabled. */ }
  return [];
}

export function saveScanTimings(mode: BatchMode, history: ScanSample[], measured: ScanSample[]) {
  const next = [...history, ...measured].slice(-maxSamples);
  try { localStorage.setItem(storageKey(mode), JSON.stringify(next)); }
  catch { /* The timings still work in the current dialog. */ }
  return next;
}

function normalTime(duration: number, mode: BatchMode) {
  const speech = mode === 'frame' ? 0 : 3 + duration * 0.68;
  const frame = mode === 'audio' ? 0 : 2 + scanFrameCount(duration) * 0.5;
  return 1 + speech + frame;
}

function median(values: number[]) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2;
}

export function scanTimeRange(clips: Clip[], mode: BatchMode, samples: ScanSample[], cold: boolean) {
  const warm = samples.filter(sample => !sample.cold);
  const scale = median(warm.map(sample => sample.seconds / normalTime(sample.duration, mode))) ?? 1;
  const estimateClip = (clip: Clip) => {
    const matches = warm.filter(sample => sample.media === timingMediaId(clip)).slice(-3);
    return median(matches.map(sample => sample.seconds)) ?? normalTime(clip.duration || 60, mode) * scale;
  };
  const coldSamples = samples.filter(sample => sample.cold);
  const extra = cold && clips.length ? median(coldSamples.map(sample => {
    const matched = median(warm.filter(row => row.media === sample.media).map(row => row.seconds));
    return Math.max(0, sample.seconds - (matched ?? normalTime(sample.duration, mode) * scale));
  })) ?? 18 : 0;
  const unknown = clips.filter(clip => !clip.duration).length;
  const expected = clips.reduce((sum, clip) => sum + estimateClip(clip), extra);
  const calibrated = warm.length >= 2 && (!cold || coldSamples.length > 0) && unknown === 0;
  return {
    expected: Math.ceil(expected), unknown, calibrated,
    low: Math.max(1, Math.floor(expected * (calibrated ? 0.75 : 0.55))),
    high: Math.max(2, Math.ceil(expected * (calibrated ? 1.25 : 1.6))),
  };
}
