import { auditRulesVersion, runAudit } from './audit';
import { localTime } from './domain';
import type {
  AuditSnapshot, AuditTrigger, Clip, Evidence, EvidenceMask, Finding, Review, Verdict, Workspace,
} from './domain';
import { screenSavedEvidence } from './evidence-quality';

export const verdicts: Verdict[] = ['action', 'review', 'dated', 'clear'];

export function leadVerdict(findings: Finding[]) {
  return verdicts.find(verdict => findings.some(row => row.verdict === verdict));
}

export const triggerLabels: Record<AuditTrigger, string> = {
  manual: 'Rà soát thủ công', offers: 'Đổi bảng ưu đãi', clips: 'Cập nhật kho video',
  evidence: 'Cập nhật đoạn trích', batch: 'Quét video hàng loạt', baseline: 'Bản rà trước đây',
};

export function reviewOpen(value: Review | undefined) {
  return value !== 'done' && value !== 'wrong';
}

export function queueEntries(workspace: Workspace) {
  const clips = new Map(workspace.clips.map(clip => [clip.id, clip]));
  return (workspace.audit?.results ?? []).flatMap(result => {
    const clip = clips.get(result.clipId);
    if (!clip) return [];
    return result.findings.filter(row => row.verdict === 'action' || row.verdict === 'review').map(finding => ({
      clip, finding, review: workspace.reviews[finding.id], note: workspace.notes?.[finding.id] ?? '',
    }));
  });
}

function snapshot(workspace: Workspace, trigger: AuditTrigger, recordedAt: string): AuditSnapshot {
  const audit = workspace.audit!;
  const ids = new Set(audit.results.flatMap(row => row.findings.map(finding => finding.id)));
  return {
    id: crypto.randomUUID(), trigger, recordedAt,
    versionNumber: workspace.versions.findIndex(version => version.id === audit.versionId) + 1,
    audit: { ...audit, results: audit.results.map(row => ({ ...row, signature: '' })) },
    clips: workspace.clips.map(({ id, title, sku, link, videoId, creator, stats }) => ({ id, title, sku, link, videoId, creator, stats })),
    reviews: Object.fromEntries(Object.entries(workspace.reviews).filter(([id]) => ids.has(id))),
    notes: Object.fromEntries(Object.entries(workspace.notes ?? {}).filter(([id]) => ids.has(id))),
  };
}

export function prepareWorkspace(workspace: Workspace): Workspace {
  const upgraded = workspace.audit?.rulesVersion === auditRulesVersion ? workspace : {
    ...workspace, clips: workspace.clips.map(screenSavedEvidence),
  };
  if (upgraded !== workspace && upgraded.versions.length) {
    upgraded.audit = runAudit(upgraded.clips, upgraded.versions, upgraded.checkedAt);
  }
  if (upgraded.snapshots) return upgraded;
  const baseline = upgraded.audit && upgraded.audit.results.length
    ? [snapshot(upgraded, 'baseline', upgraded.audit.checkedAt)] : [];
  return { ...upgraded, snapshots: baseline, notes: upgraded.notes ?? {} };
}

export function recordAudit(workspace: Workspace, trigger: AuditTrigger): Workspace {
  const history = workspace.snapshots ?? [];
  if (!workspace.audit || (!workspace.clips.length && !history.length)) return workspace;
  return { ...workspace, snapshots: [...history.slice(-39), snapshot(workspace, trigger, localTime())] };
}

export function updatedReport(workspace: Workspace, trigger: AuditTrigger, keepSnapshot = true): Workspace {
  if (!workspace.versions.length) return { ...workspace, audit: null };
  const audit = runAudit(workspace.clips, workspace.versions, workspace.checkedAt, trigger === 'manual' ? null : workspace.audit);
  const next = { ...workspace, audit };
  return keepSnapshot ? recordAudit(next, trigger) : next;
}

export function setReviews(workspace: Workspace, ids: string[], review: Review | '') {
  const active = new Set(workspace.audit?.results.flatMap(row => row.findings.map(item => item.id)));
  const reviews = { ...workspace.reviews };
  for (const id of ids) {
    if (!active.has(id)) continue;
    if (review) reviews[id] = review;
    else delete reviews[id];
  }
  return { ...workspace, reviews };
}

export function setFindingNote(workspace: Workspace, id: string, raw: string) {
  const note = raw.trim();
  if (note.length > 500) throw Error('Ghi chú tối đa 500 ký tự.');
  if (!workspace.audit?.results.some(row => row.findings.some(item => item.id === id))) {
    throw Error('Phát hiện này đã thay đổi. Mở lại kết quả hiện tại.');
  }
  const notes = { ...workspace.notes };
  if (note) notes[id] = note;
  else delete notes[id];
  return { ...workspace, notes };
}

function toMask(segment: Evidence): EvidenceMask | undefined {
  if (segment.source !== 'audio' && segment.source !== 'frame') return undefined;
  return { source: segment.source, start: segment.start, end: segment.end };
}

export function changeEvidence(clip: Clip, index: number | null, row: Pick<Evidence, 'start' | 'end' | 'text'> | null): Clip {
  if (index !== null && !clip.evidence[index]) throw Error('Đoạn trích đã thay đổi. Mở lại clip.');
  const previous = index === null ? undefined : clip.evidence[index];
  const output = [...clip.evidence];
  const masks = [...(clip.masks ?? [])];
  const removed = previous && toMask(previous);
  if (removed && !masks.some(mask => mask.source === removed.source && mask.start === removed.start && mask.end === removed.end)) {
    masks.push(removed);
  }

  if (row) {
    const text = row.text.trim();
    if (!text || text.length > 4000) throw Error('Nội dung đoạn trích cần từ 1 đến 4.000 ký tự.');
    if (!Number.isFinite(row.start) || row.start < 0 || row.start > 7200 ||
      (row.end !== null && (!Number.isFinite(row.end) || row.end < row.start || row.end > 7200))) {
      throw Error('Mốc thời gian chưa hợp lệ.');
    }
    const edited: Evidence = { ...row, text, source: previous?.source ?? 'manual', corrected: !!previous };
    if (index === null) output.push(edited);
    else output[index] = edited;
  } else if (index !== null) output.splice(index, 1);

  if (output.length > 1000) throw Error('Mỗi clip hỗ trợ tối đa 1.000 đoạn trích.');
  return { ...clip, evidence: output.sort((a, b) => a.start - b.start), masks };
}

function matchesMask(mask: EvidenceMask, row: Evidence) {
  if (mask.source !== row.source) return false;
  if (row.source === 'frame') return Math.abs(mask.start - row.start) <= 0.8;
  if (Math.abs(mask.start - row.start) <= 1) return true;
  if (mask.end === null || row.end === null) return false;
  const overlap = Math.min(mask.end, row.end) - Math.max(mask.start, row.start);
  return overlap > (row.end - row.start) / 2;
}

export function mergeScan(clip: Clip, incoming: Evidence[]) {
  const sources = new Set(incoming.map(row => row.source));
  const preserved = clip.evidence.filter(row => row.corrected || !sources.has(row.source));
  const masks = clip.masks ?? [];
  const added = incoming.filter(row => !masks.some(mask => matchesMask(mask, row)));
  return { ...clip, evidence: [...preserved, ...added].sort((a, b) => a.start - b.start) };
}

export function snapshotDelta(old: AuditSnapshot | undefined, next: AuditSnapshot) {
  if (!old) return { added: [], cleared: [] };
  const unresolved = (record: AuditSnapshot) => new Set(record.audit.results.flatMap(row =>
    row.findings.some(finding => finding.verdict === 'action' || finding.verdict === 'review') ? [row.clipId] : []));
  const before = unresolved(old);
  const after = unresolved(next);
  const stillPresent = new Set(next.clips.map(clip => clip.id));
  return {
    added: next.clips.filter(clip => after.has(clip.id) && !before.has(clip.id)),
    cleared: old.clips.filter(clip => before.has(clip.id) && stillPresent.has(clip.id) && !after.has(clip.id)),
  };
}
