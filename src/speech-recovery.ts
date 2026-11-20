import type { Evidence } from './domain';
import { keepSpeechEvidence } from './evidence-quality';
import { shortVideoSeconds } from './video-limits';

export const speechSampleRate = 16_000;
const samplesPerWindow = 16 * speechSampleRate;

export interface SpeechResult {
  evidence: Evidence[];
  discarded: number;
  retried: number;
  timingRejected: number;
  failedParts?: number;
}

export async function readSpeechParts(
  samples: Float32Array,
  read: (part: Float32Array, index: number, total: number) => Promise<SpeechResult>,
): Promise<SpeechResult> {
  if (samples.length <= shortVideoSeconds * speechSampleRate) return read(samples, 1, 1);

  const total = Math.ceil(samples.length / (60 * speechSampleRate));
  const partLength = Math.ceil(samples.length / total);
  const output: SpeechResult = { evidence: [], discarded: 0, retried: 0, timingRejected: 0 };
  let completed = 0;
  let failure: unknown;
  for (let index = 0; index < total; index++) {
    const offset = index * partLength;
    const part = samples.subarray(offset, offset + partLength);
    if (!part.some(value => Math.abs(value) > 0.005)) continue;
    try {
      const result = await read(part, index + 1, total);
      completed++;
      output.discarded += result.discarded;
      output.retried += result.retried;
      output.timingRejected += result.timingRejected;
      const duration = part.length / speechSampleRate;
      const start = offset / speechSampleRate;
      for (const row of result.evidence) {
        const end = Math.min(row.end ?? duration, duration);
        if (!Number.isFinite(row.start) || !Number.isFinite(end) || row.start < 0 || row.start >= duration || end < row.start) {
          output.timingRejected++;
          continue;
        }
        output.evidence.push({ ...row, start: Math.round((start + row.start) * 100) / 100, end: Math.round((start + end) * 100) / 100 });
      }
    } catch (error) {
      failure = error;
      output.failedParts = (output.failedParts ?? 0) + 1;
    }
  }
  if (!completed && output.failedParts) throw failure;
  return output;
}

export async function recoverLoopedSpeech(
  samples: Float32Array,
  firstPass: Evidence[],
  readWindow: (samples: Float32Array) => Promise<Evidence[]>,
  progress: (current: number, total: number) => void,
): Promise<SpeechResult> {
  const evidence = keepSpeechEvidence(firstPass);
  let discarded = firstPass.length - evidence.length;
  if (!discarded || evidence.length) return { evidence, discarded, retried: 0, timingRejected: 0 };

  let retried = 0;
  let timingRejected = 0;
  const total = Math.ceil(samples.length / samplesPerWindow);
  for (let index = 0; index < total; index++) {
    progress(index + 1, total);
    const offset = index * samplesPerWindow;
    const window = samples.subarray(offset, offset + samplesPerWindow);
    if (!window.some(sample => Math.abs(sample) > 0.005)) continue;
    retried++;
    const seconds = window.length / speechSampleRate;
    const start = offset / speechSampleRate;
    let draft: Evidence[];
    try { draft = await readWindow(window); }
    catch (error) { console.debug('PhoWhisper window:', error); continue; }
    const kept = keepSpeechEvidence(draft);
    discarded += draft.length - kept.length;
    for (const segment of kept) {
      const text = segment.text.trim();
      if (!text) continue;
      const end = Math.max(segment.start, Math.min(seconds, segment.end ?? seconds));
      const words = text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
      if (!Number.isFinite(end) || segment.start < 0 || segment.start >= seconds || end <= segment.start ||
        words > 8 + (end - segment.start) * 16) {
        timingRejected++;
        continue;
      }
      evidence.push({
        ...segment, source: 'audio', start: Math.round((segment.start + start) * 100) / 100,
        end: Math.round((end + start) * 100) / 100, lowConfidence: true,
      });
    }
  }
  return { evidence, discarded, retried, timingRejected };
}
