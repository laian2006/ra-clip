import type { Clip, Workspace } from './domain';
import type { HandoffRow } from './impact';
import { queueEntries, reviewOpen } from './workflow';

export const creatorKey = (clip: Clip) => clip.creator?.trim() || '';

export interface CreatorGroup {
  name: string;
  clips: Clip[];
  pending: HandoffRow[];
  done: number;
  wrong: number;
  missing: number;
}

export function creatorWork(workspace: Workspace) {
  const groups = new Map<string, CreatorGroup>();
  const known = new Set(workspace.versions.at(-1)?.offers.map(offer => offer.sku));
  const unrated = new Set(workspace.audit?.results.filter(result =>
    result.findings.every(finding => finding.kind === 'coverage')).map(result => result.clipId));
  for (const clip of workspace.clips) {
    const name = creatorKey(clip);
    const group = groups.get(name) ?? { name, clips: [], pending: [], done: 0, wrong: 0, missing: 0 };
    group.clips.push(clip);
    if (!known.has(clip.sku) || !clip.evidence.length || unrated.has(clip.id)) group.missing++;
    groups.set(name, group);
  }
  for (const { clip, finding, review } of queueEntries(workspace)) {
    const group = groups.get(creatorKey(clip))!;
    if (reviewOpen(review)) group.pending.push({ clip, finding });
    else if (review === 'done') group.done++;
    else if (review === 'wrong') group.wrong++;
  }
  return [...groups.values()].sort((a, b) => b.pending.length - a.pending.length || a.name.localeCompare(b.name, 'vi'));
}

export function assignCreator(clips: Clip[], ids: string[], creator: string | undefined) {
  const name = creator?.trim() || undefined;
  if (name && name.length > 100) throw Error('Tên người đăng tối đa 100 ký tự.');
  const selected = new Set(ids);
  if (!selected.size) throw Error('Chọn ít nhất một video.');
  if (clips.filter(clip => selected.has(clip.id)).length !== selected.size) {
    throw Error('Danh sách video đã thay đổi. Mở lại danh sách trước khi gán.');
  }
  return clips.map(clip => selected.has(clip.id) ? { ...clip, creator: name } : clip);
}
