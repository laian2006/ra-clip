import type { Clip, Evidence, Offer, Workspace } from './domain';
import { localTime } from './domain';
import { runAudit } from './audit';

const segment = (start: number, text: string, source: Evidence['source'] = 'subtitle'): Evidence =>
  ({ start, end: start + 3, text, source });

const offers: Offer[] = [
  { sku: 'BINH-500', name: 'Bình giữ nhiệt · 500 ml', code: 'SALE99', price: 99000, gift: '',
    start: '2026-11-09', end: '2026-11-11T23:59', condition: '' },
  { sku: 'BINH-500', name: 'Bình giữ nhiệt · 500 ml', code: '', price: 149000, gift: '',
    start: '2026-11-12', end: '', condition: '' },
  { sku: 'TUI-KEM', name: 'Túi canvas · Kem', code: '', price: 129000, gift: '',
    start: '2026-11-09', end: '', condition: '' },
];

const clips: Clip[] = [
  { id: 'sample-one', title: 'Bình giữ nhiệt 500 ml', sku: 'BINH-500', link: '', published: '2026-11-10',
    localMedia: false, demoMedia: true, evidence: [segment(5, 'Còn 99k khi áp mã SALE99.', 'frame')] },
  { id: 'sample-two', title: 'Mở hộp bình giữ nhiệt', sku: 'BINH-500', link: '', published: '2026-11-12',
    localMedia: false, evidence: [segment(8, 'Tặng kèm một lõi thay.', 'manual')] },
  { id: 'sample-three', title: 'Túi canvas đi học', sku: 'TUI-KEM', link: '', published: '2026-11-12',
    localMedia: false, evidence: [segment(12, 'Túi canvas giá 129 nghìn.', 'manual')] },
  { id: 'sample-four', title: 'Deal bình giữ nhiệt 11.11', sku: 'BINH-500', link: '', published: '2026-11-10',
    localMedia: false, evidence: [segment(8, '99k với mã SALE99, chỉ ngày 11/11.', 'manual')] },
  { id: 'sample-five', title: 'Túi tote – video affiliate', sku: 'TUI-KEM', link: '', published: '2026-11-12',
    localMedia: false, evidence: [] },
];

export function emptyWorkspace(): Workspace {
  return { demo: false, clips: [], versions: [], checkedAt: localTime(), audit: null, reviews: {} };
}

export function sampleWorkspace(): Workspace {
  const checkedAt = '2026-11-12T09:00';
  const previous = offers.map(offer => offer.sku === 'BINH-500' && !offer.code ? { ...offer, gift: 'lõi thay' } : offer);
  const versions = [
    { id: 'sample-v1', at: '2026-11-10T09:00', offers: previous },
    { id: 'sample-v2', at: '2026-11-12T08:30', offers },
  ];
  return { demo: true, clips, versions, checkedAt, audit: runAudit(clips, versions, checkedAt), reviews: {} };
}
