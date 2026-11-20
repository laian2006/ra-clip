import { localTime, scanLabels, sourceLabels } from './domain';
import type { Clip, ScanReceipt } from './domain';
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

export function scanReceipt(options: ScanOptions, result: Awaited<ReturnType<typeof analyzeVideo>>): ScanReceipt {
  const notes = Object.entries(result.sources).map(([source, outcome]) =>
    `${sourceLabels[source as 'audio' | 'frame']} · ${outcome.detail}`);
  const states = Object.values(result.sources);
  return {
    ...options, at: localTime(), sources: result.sources,
    state: result.evidence.length ? states.every(source => source.state === 'done' && !source.discarded) ? 'ready' : 'partial'
      : states.some(source => source.state === 'failed') ? 'failed' : 'empty',
    detail: notes.join(' ').slice(0, 1600),
  };
}

export function completeScan(clip: Clip, options: ScanOptions, result: Awaited<ReturnType<typeof analyzeVideo>>): Clip {
  const receipt = scanReceipt(options, result);
  const oldEvidence = clip.evidence.filter(row => row.corrected || (row.source !== 'audio' && row.source !== 'frame') ||
    !result.sources[row.source] || result.sources[row.source]?.state === 'failed');
  return { ...mergeScan({ ...clip, evidence: oldEvidence }, result.evidence), lastScan: {
    ...receipt, sources: { ...clip.lastScan?.sources, ...receipt.sources },
  } };
}

export function failScan(clip: Clip, options: ScanOptions, detail: string): Clip {
  return { ...clip, lastScan: { ...options, at: localTime(), state: 'failed', detail: detail.slice(0, 1600) } };
}

export async function loadClipVideo(clip: Clip, signal: AbortSignal) {
  const fixture = demoAsset(clip);
  const file = clip.localMedia ? await loadMedia(clip.id)
    : fixture ? await fetch(`${fixture}.webm`, { signal }).then(response => {
      if (!response.ok) throw Error('Chưa mở được video mẫu.');
      return response.blob();
    }) : undefined;
  signal.throwIfAborted();
  if (!file) throw Error('File video không còn trong bộ nhớ trình duyệt.');
  return file;
}

export async function analyzeStoredClip(clip: Clip, options: ScanOptions, signal: AbortSignal, progress: (text: string) => void) {
  const file = await loadClipVideo(clip, signal);
  const analysis = await analyzeVideo(file, options, progress, signal);
  signal.throwIfAborted();
  return completeScan(clip, options, analysis);
}

export function lastScanLabel(clip: Clip) {
  return clip.lastScan ? scanLabels[clip.lastScan.state] : 'Chưa chạy AI';
}

export function lastScanDetail(clip: Clip) {
  const receipt = clip.lastScan;
  if (!receipt || receipt.sources) return receipt?.detail;
  if (/decode audio|EncodingError|failed to fetch|network|tunnel/i.test(receipt.detail)) {
    return 'Lượt quét cũ gặp lỗi. Thử quét lại hoặc dùng phụ đề SRT/VTT để bổ sung lời thoại.';
  }
  return receipt.detail;
}
