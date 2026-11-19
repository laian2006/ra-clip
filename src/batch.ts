import { localTime, scanLabels } from './domain';
import type { Clip, Evidence, ScanReceipt } from './domain';
import { analyzeVideo, type ScanOptions } from './media';
import { loadMedia } from './storage';
import { demoAsset } from './demo';
import { mergeScan } from './workflow';

export interface BatchEvent {
  id: string;
  state: ScanReceipt['state'] | 'running' | 'stopped';
  detail: string;
}

export function needsScan(clip: Clip, options?: ScanOptions) {
  if (!clip.lastScan || clip.lastScan.state !== 'ready') return true;
  if (!options) return false;
  return options.audio && !clip.evidence.some(row => row.source === 'audio') ||
    options.frame && !clip.evidence.some(row => row.source === 'frame');
}

export function scanReceipt(options: ScanOptions, count: number, notes: string[]): ScanReceipt {
  return {
    ...options, at: localTime(), state: !count ? 'empty' : notes.length ? 'partial' : 'ready',
    detail: notes.join(' · ').slice(0, 1600) || `Đã đọc ${count} đoạn.`,
  };
}

export function completeScan(clip: Clip, options: ScanOptions, evidence: Evidence[], notes: string[]): Clip {
  return { ...mergeScan(clip, evidence), lastScan: scanReceipt(options, evidence.length, notes) };
}

export function failScan(clip: Clip, options: ScanOptions, detail: string): Clip {
  return { ...clip, lastScan: { ...options, at: localTime(), state: 'failed', detail: detail.slice(0, 1600) } };
}

export async function analyzeStoredClip(clip: Clip, options: ScanOptions, signal: AbortSignal, progress: (text: string) => void) {
  const fixture = demoAsset(clip);
  const file = clip.localMedia ? await loadMedia(clip.id)
    : fixture ? await fetch(`${fixture}.webm`, { signal }).then(response => {
      if (!response.ok) throw Error('Chưa mở được video mẫu.');
      return response.blob();
    }) : undefined;
  signal.throwIfAborted();
  if (!file) throw Error('File video không còn trong bộ nhớ trình duyệt.');
  const analysis = await analyzeVideo(file, options, progress, signal);
  signal.throwIfAborted();
  return completeScan(clip, options, analysis.evidence, analysis.notes);
}

export function lastScanLabel(clip: Clip) {
  return clip.lastScan ? scanLabels[clip.lastScan.state] : 'Chưa chạy AI';
}
