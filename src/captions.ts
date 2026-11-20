import type { Evidence } from './domain';
import { referenceOnly } from './claims';

function cueTime(seconds: number) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const [hours, minutes, remaining] = [
    Math.floor(milliseconds / 3600000), Math.floor(milliseconds / 60000) % 60, (milliseconds % 60000) / 1000,
  ];
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${remaining.toFixed(3).padStart(6, '0')}`;
}

export function captionsFor(evidence: Evidence[]) {
  const timed = evidence.filter(row => !row.untimed && row.text.trim() && !referenceOnly(row));
  const source = ['subtitle', 'audio', 'manual'].find(source => timed.some(row => row.source === source));
  if (!source) return '';
  const rows = timed.filter(row => row.source === source).sort((a, b) => a.start - b.start);
  const cues = rows.map((row, index) => {
    const next = rows[index + 1]?.start;
    const end = row.end ?? Math.min(row.start + 3, next !== undefined && next > row.start ? next : Infinity);
    const text = row.text.trim().replace(/\s+/g, ' ').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    return `${cueTime(row.start)} --> ${cueTime(Math.max(row.start + 0.1, end))}\n${text}`;
  });
  return 'WEBVTT\n\n' + cues.join('\n\n') + '\n';
}
