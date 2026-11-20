import { describe, expect, it } from 'vitest';
import { auditDraft } from '../src/audit';
import { captionsFor } from '../src/captions';
import type { Clip, Evidence, Offer } from '../src/domain';
import { auditCsv } from '../src/files';
import { makeOfferBrief, readOfferBrief } from '../src/offer-brief';
import { milestoneTime, offerMilestones, previewMilestone } from '../src/offer-milestones';

const offer: Offer = {
  sku: 'GIAY-6', name: 'Khăn giấy', price: 129000, code: 'SALE129', gift: '',
  start: '2026-12-12', end: '2026-12-12', condition: '',
};
const time = '2026-12-12T10:00';
const clip: Clip = {
  id: 'giay', title: 'Combo giấy', sku: offer.sku, published: '2026-12-12', link: '', localMedia: false,
  evidence: [{ start: 4, end: null, text: 'Giá 129k khi áp mã SALE129.', source: 'manual' }],
};

describe('tools', () => {
  it('round-trips one offer and rejects invalid price types', async () => {
    await expect(readOfferBrief(makeOfferBrief(offer))).resolves.toEqual(offer);
    const raw = JSON.parse(await makeOfferBrief(offer).text());
    raw.offer.price = '129000';
    await expect(readOfferBrief(new Blob([JSON.stringify(raw)]))).rejects.toThrow('không đúng định dạng');
  });

  it('previews the first second after expiry and only audits affected SKUs', () => {
    const version = { id: 'v1', at: time, offers: [offer] };
    const [starts, ends] = offerMilestones([offer]);
    expect(milestoneTime(starts.at)).toBe('2026-12-12T00:00:00');
    expect(milestoneTime(ends.at)).toBe('2026-12-13T00:00:00');
    const previews = previewMilestone([clip, { ...clip, id: 'khac', sku: 'KHAC' }], [version], ends);
    expect(previews.count).toBe(1);
    expect(previews.raised[0]).toMatchObject({
      clip: { id: clip.id },
      findings: expect.arrayContaining([expect.objectContaining({ verdict: 'action', kind: 'price' })]),
    });
    expect(previewMilestone([clip], [version], starts).cleared).toEqual([clip]);
  });

  it('flags a missing voucher on an untimed script and leaves the time blank in exports', () => {
    const evidence: Evidence = { source: 'manual', start: 0, end: null, text: 'Combo giá 129k.', untimed: true };
    const draft = { ...clip, evidence: [evidence] };
    const audit = auditDraft(draft, offer, time);
    expect(audit.results[0].findings).toMatchObject([{ kind: 'price', verdict: 'review', reason: expect.stringContaining('SALE129') }]);
    expect(captionsFor(draft.evidence)).toBe('');
    const exported = auditCsv(audit, [draft], {});
    expect(exported).toContain('"Kịch bản","Combo giá 129k."');
    expect(exported).not.toContain('"00:00"');
  });
});
