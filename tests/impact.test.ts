import { describe, expect, it } from 'vitest';
import { sampleWorkspace } from '../src/demo';
import { groupHandoff, handoffText, latestOfferImpact } from '../src/impact';
import { updatedReport } from '../src/workflow';

describe('Effects of offer changes', () => {
  it('includes changed warnings and skips an existing expired promotion', () => {
    const impact = latestOfferImpact(sampleWorkspace())!;
    expect(impact.skuCount).toBe(3);
    expect(impact.raised.map(({ clip }) => clip.id)).toEqual(['demo-tee', 'demo-cups']);
    expect(impact.raised.find(row => row.clip.id === 'demo-tee')?.findings[0]).toMatchObject({
      claim: '139.000 đ', reference: '159.000 đ',
    });
    expect(impact.pending.map(({ clip }) => clip.id)).not.toContain('sample-one');
  });

  it('tracks clips that match again and leaves completed issues out of the handoff', () => {
    const workspace = sampleWorkspace();
    const [first] = workspace.versions;
    const previous = latestOfferImpact(workspace)!;
    const resolved = updatedReport({ ...workspace, versions: [...workspace.versions, { ...first, id: 'restored' }] }, 'offers');
    expect(latestOfferImpact(resolved)?.cleared.map(({ clip }) => clip.id)).toEqual(['demo-cups', 'demo-tee']);
    const firstIssue = previous.pending[0].finding;
    workspace.reviews[firstIssue.id] = 'done';
    expect(latestOfferImpact(workspace)?.pending.some(({ finding }) => finding.id === firstIssue.id)).toBe(false);
  });

  it('groups active work by creator and prints only known links and checked evidence', () => {
    const impact = latestOfferImpact(sampleWorkspace())!;
    const row = impact.pending[0];
    const groups = groupHandoff([
      { ...row, clip: { ...row.clip, creator: 'Lan', link: 'https://example.com/video' } },
      { ...row, clip: { ...row.clip, creator: '', link: 'javascript:example' } },
    ]);
    expect(groups.map(([name]) => name)).toEqual(['Lan', '']);
    const lan = handoffText(groups[0][1], impact.version, impact.checkedAt);
    expect(lan).toContain('https://example.com/video');
    expect(lan).toContain('00:05 · Giá bán · 139.000 đ');
    expect(lan).toContain('Theo bảng v2 · 159.000 đ');
    expect(handoffText(groups[1][1], impact.version, impact.checkedAt)).not.toContain('javascript:');
  });
});
