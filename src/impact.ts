import { changedSkus, runAudit } from './audit';
import { displayDateTime, kindLabels, safeLink, timestamp } from './domain';
import type { Clip, Finding, Workspace } from './domain';
import { reviewOpen } from './workflow';

export interface HandoffRow {
  clip: Clip;
  finding: Finding;
}

interface AffectedClip {
  clip: Clip;
  findings: Finding[];
}

export interface OfferImpact {
  version: number;
  checkedAt: string;
  skuCount: number;
  clipCount: number;
  raised: AffectedClip[];
  cleared: AffectedClip[];
  pending: HandoffRow[];
}

const needsAttention = (finding: Finding) => finding.verdict === 'action' || finding.verdict === 'review';

export function latestOfferImpact(workspace: Workspace): OfferImpact | undefined {
  const { audit, versions, clips, reviews } = workspace;
  const previous = versions.at(-2);
  const current = versions.at(-1);
  if (!previous || !current || !audit || audit.versionId !== current.id) return;

  const changed = changedSkus(previous.offers, current.offers);
  const affected = clips.filter(clip => changed.has(clip.sku));
  const before = new Map(runAudit(affected, versions.slice(0, -1), audit.checkedAt).results
    .map(row => [row.clipId, row.findings.filter(needsAttention)]));
  const after = new Map(audit.results.map(row => [row.clipId, row.findings]));
  const raised: AffectedClip[] = [];
  const cleared: AffectedClip[] = [];
  for (const clip of affected) {
    const oldFindings = before.get(clip.id) ?? [];
    const oldIds = new Set(oldFindings.map(finding => finding.id));
    const currentFindings = after.get(clip.id) ?? [];
    const issues = currentFindings.filter(needsAttention);
    const newIssues = issues.filter(finding => !oldIds.has(finding.id));
    if (newIssues.length) raised.push({ clip, findings: newIssues.sort((a, b) => Number(b.verdict === 'action') - Number(a.verdict === 'action')) });
    if (oldFindings.length && currentFindings.length && currentFindings.every(finding => finding.verdict === 'clear')) {
      cleared.push({ clip, findings: currentFindings });
    }
  }
  raised.sort((a, b) =>
    Number(b.findings[0].verdict === 'action') - Number(a.findings[0].verdict === 'action') ||
    (b.clip.stats?.orders ?? -1) - (a.clip.stats?.orders ?? -1));
  const pending = raised.flatMap(({ clip, findings }) =>
    findings.filter(finding => reviewOpen(reviews[finding.id])).map(finding => ({ clip, finding })));
  return { version: versions.length, checkedAt: audit.checkedAt, skuCount: changed.size, clipCount: affected.length, raised, cleared, pending };
}

export function groupHandoff(rows: HandoffRow[]) {
  const groups = new Map<string, HandoffRow[]>();
  for (const row of rows) {
    const name = row.clip.creator?.trim() || '';
    const items = groups.get(name) ?? [];
    items.push(row);
    groups.set(name, items);
  }
  return [...groups.entries()].sort(([a], [b]) => Number(!a) - Number(!b) || a.localeCompare(b, 'vi'));
}

export function handoffText(rows: HandoffRow[], version: number, checkedAt: string) {
  const clips = new Map<Clip['id'], AffectedClip>();
  for (const { clip, finding } of rows) {
    const item = clips.get(clip.id) ?? { clip, findings: [] };
    item.findings.push(finding);
    clips.set(clip.id, item);
  }
  const intro = `Nhờ anh/chị kiểm tra các video sau theo bảng ưu đãi v${version}, rà lúc ${displayDateTime(checkedAt)} (giờ Việt Nam).`;
  const items = [...clips.values()].map(({ clip, findings }, index) => {
    const link = safeLink(clip.link);
    const lines = [`${index + 1}. ${clip.title}${clip.sku ? ` (${clip.sku})` : ''}`];
    if (link) lines.push(link);
    for (const finding of findings) {
      const time = finding.evidence ? `${timestamp(finding.evidence.start)} · ` : '';
      lines.push(`• ${time}${kindLabels[finding.kind]} · ${finding.claim}`, `  ${finding.reason}`);
      if (finding.reference) lines.push(`  Theo bảng v${version} · ${finding.reference}`);
    }
    return lines.join('\n');
  });
  return [intro, ...items, 'Anh/chị xem lại đoạn gốc và báo giúp khi đã xử lý.'].join('\n\n');
}
