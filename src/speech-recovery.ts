import type { Evidence } from './domain';
import { keepSpeechEvidence } from './evidence-quality';

export const speechSampleRate = 16_000;
const samplesPerWindow = 16 * speechSampleRate;

export interface SpeechResult {
  evidence: Evidence[];
  discarded: number;
  retried: number;
  timingRejected: number;
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
