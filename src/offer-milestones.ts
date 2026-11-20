import { runAudit } from './audit';
import type { Clip, Finding, Offer, OfferVersion } from './domain';
import { parseVietnamTime } from './time';

export interface OfferMilestone {
  at: number;
  changes: { offer: Offer; type: 'start' | 'end' }[];
}

export function milestoneTime(at: number) {
  return new Date(at + 7 * 3_600_000).toISOString().slice(0, 19);
}

export function offerMilestones(offers: Offer[]): OfferMilestone[] {
  const times = new Map<number, OfferMilestone>();
  function add(at: number, offer: Offer, type: 'start' | 'end') {
    const time = times.get(at) ?? { at, changes: [] };
    time.changes.push({ offer, type });
    times.set(at, time);
  }
  for (const offer of offers) {
    const starts = parseVietnamTime(offer.start);
    const ends = parseVietnamTime(offer.end, true);
    if (starts !== null) add(starts, offer, 'start');
    if (ends !== null) add(ends + 1_000, offer, 'end');
  }
  return [...times.values()].sort((a, b) => a.at - b.at);
}

export function previewMilestone(clips: Clip[], versions: OfferVersion[], milestone: OfferMilestone) {
  const skus = new Set(milestone.changes.map(({ offer }) => offer.sku));
  const related = clips.filter(clip => skus.has(clip.sku));
  const before = runAudit(related, versions, milestoneTime(milestone.at - 1_000));
  const after = runAudit(related, versions, milestoneTime(milestone.at));
  const raised: { clip: Clip; findings: Finding[] }[] = [];
  const cleared: Clip[] = [];
  const missing: Clip[] = [];
  const needsAttention = (finding: Finding) => finding.verdict === 'action' || finding.verdict === 'review';
  for (const [i, clip] of related.entries()) {
    const previous = before.results[i].findings;
    const current = after.results[i].findings;
    const priorIds = new Set(previous.map(row => row.id));
    const nextIssues = current.filter(needsAttention);
    const newIssues = nextIssues.filter(row => !priorIds.has(row.id));
    if (newIssues.length) raised.push({ clip, findings: newIssues });
    if (previous.some(needsAttention) && current.every(row => row.verdict === 'clear')) cleared.push(clip);
    if (!current.some(row => row.kind !== 'coverage')) missing.push(clip);
  }
  raised.sort((a, b) =>
    Number(b.findings.some(row => row.verdict === 'action')) - Number(a.findings.some(row => row.verdict === 'action')) ||
    (b.clip.stats?.orders ?? -1) - (a.clip.stats?.orders ?? -1));
  return { count: related.length, raised, cleared, missing };
}
