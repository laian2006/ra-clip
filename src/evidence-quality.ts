import type { Clip, Evidence, MediaSource, ScanReceipt, ScanSource } from './domain';
import { hasOfferCue, referenceOnly } from './claims';

export function hasSpeechLoop(text: string) {
  const words = text.normalize('NFC').toLocaleLowerCase('vi').match(/[\p{L}\p{N}]+/gu) ?? [];
  let streak = 1;
  for (let i = 1; i < words.length; i++) {
    streak = words[i] === words[i - 1] ? streak + 1 : 1;
    if (streak >= 8) return true;
  }
  for (let size = 2; size <= 6; size++) {
    const needed = Math.max(size * 6, Math.ceil(words.length / size * 0.8) * size);
    let length = size;
    for (let i = size; i < words.length; i++) {
      length = words[i] === words[i - size] ? length + 1 : size;
      if (length >= needed) return true;
    }
  }
  return false;
}

function readableText(text: string, confidence: number) {
  const tokens = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  const characters = tokens.join('').length;
  if (characters < 2 || characters / text.replace(/\s/g, '').length < 0.65 || hasSpeechLoop(text)) return false;
  if (hasOfferCue(text)) return confidence >= 60;
  // High OCR confidence by itself does not make isolated fragments into readable text.
  const words = tokens.filter(token => /\p{L}{3,}/u.test(token));
  return confidence >= 70 && words.length >= 2 && words.length * 2 >= tokens.length;
}

export function screenOcrLines(lines: { text: string; confidence: number }[]) {
  const kept: string[] = [];
  let discarded = 0;
  for (const row of lines) {
    const text = row.text.trim();
    if (!text) continue;
    if (!Number.isFinite(row.confidence) || !readableText(text, row.confidence)) discarded++;
    else kept.push(text);
  }
  return { text: kept.join('\n'), discarded };
}

export function screenedSource(source: MediaSource, count: number, discarded: number): ScanSource {
  const detail = source === 'audio'
    ? count ? `Đã nhận dạng ${count} đoạn lời thoại.` : 'Chưa nhận ra lời thoại.'
    : count ? `Đã giữ chữ đọc được tại ${count} mốc.` : 'Chưa đọc được chữ đủ rõ trên các khung hình đã quét.';
  const removed = source === 'audio' ? `Bỏ ${discarded} đoạn lặp bất thường.` : `Bỏ ${discarded} dòng chữ thiếu ngữ cảnh hoặc độ tin cậy thấp.`;
  return { state: count ? 'done' : 'empty', detail: discarded ? `${detail} ${removed}` : detail, discarded };
}

export function keepSpeechEvidence(rows: Evidence[]) {
  return rows.filter(row => row.source !== 'audio' || row.corrected || !hasSpeechLoop(row.text));
}

export function filteredSpeech(clip: Clip) {
  const source = clip.lastScan?.sources?.audio;
  if (source?.state !== 'empty' || !source.discarded ||
    clip.evidence.some(row => row.source !== 'frame' && !referenceOnly(row))) return '';
  const drafts = clip.evidence.filter(row => row.source === 'audio' && referenceOnly(row)).length;
  if (drafts) {
    return `Đã loại lời thoại lặp bất thường. Lượt đọc lại có ${drafts} đoạn độ tin cậy thấp. Nghe lại đoạn gốc và lưu lời thoại đúng, hoặc thêm phụ đề SRT/VTT.`;
  }
  return `Đã loại ${source.discarded} đoạn lời thoại lặp bất thường. Lời thoại còn 0 đoạn để đối chiếu. Bạn có thể thêm phụ đề SRT/VTT hoặc nhập câu quảng cáo có mốc thời gian.`;
}

export function screenSavedEvidence(clip: Clip): Clip {
  const removed = { audio: 0, frame: 0 };
  const cleanSpeech = keepSpeechEvidence(clip.evidence);
  removed.audio = clip.evidence.length - cleanSpeech.length;
  const evidence = cleanSpeech.flatMap(row => {
    if (row.source !== 'frame' || row.corrected) return [row];
    // Older OCR results have no confidence scores. Only drop clearly unreadable lines.
    const filtered = screenOcrLines(row.text.split('\n').map(text => ({ text, confidence: 100 })));
    removed.frame += filtered.discarded;
    if (!filtered.discarded) return [row];
    return filtered.text ? [{ ...row, text: filtered.text }] : [];
  });
  if (!removed.audio && !removed.frame) return clip;
  let lastScan: ScanReceipt | undefined = clip.lastScan;
  if (lastScan) {
    const sources = { ...lastScan.sources };
    for (const source of ['audio', 'frame'] as const) {
      if (!removed[source]) continue;
      sources[source] = screenedSource(source, evidence.filter(row => row.source === source && !referenceOnly(row)).length,
        removed[source] + (sources[source]?.discarded ?? 0));
    }
    const hasMachineEvidence = evidence.some(row => (row.source === 'audio' || row.source === 'frame') && !referenceOnly(row));
    lastScan = {
      ...lastScan, sources, state: hasMachineEvidence ? 'partial' : 'empty',
      detail: Object.values(sources).map(outcome => outcome.detail).join(' ').slice(0, 1600),
    };
  }
  return { ...clip, evidence, lastScan };
}
