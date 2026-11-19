import type { Clip, ClipFormat, Evidence, Offer, Workspace } from './domain';
import { localTime } from './domain';
import { runAudit } from './audit';
import { prepareWorkspace, updatedReport } from './workflow';

const pack = 2;
const checkedAt = '2026-11-12T09:00';
const segment = (start: number, text: string, source: Evidence['source'] = 'subtitle', duration = 3): Evidence =>
  ({ start, end: source === 'frame' ? null : start + duration, text, source });

const expiry = '2026-11-11T23:59';
const row = (sku: string, name: string, price: number, patch: Partial<Offer> = {}): Offer =>
  ({ sku, name, code: '', price, gift: '', start: '2026-11-09', end: '', condition: '', ...patch });

const offers: Offer[] = [
  row('BINH-500', 'Bình giữ nhiệt · 500 ml', 99000, { code: 'SALE99', end: expiry }),
  row('BINH-500', 'Bình giữ nhiệt · 500 ml', 149000, { start: '2026-11-12' }),
  row('TUI-KEM', 'Túi canvas · Kem', 129000),
  row('QUAT-MINT', 'Quạt cầm tay · Xanh mint', 79000, { code: 'LIVE79', end: expiry, condition: 'đơn từ 199k' }),
  row('LY-DOI', 'Bộ 2 ly gốm xanh', 119000),
  row('CHUOT-DEN', 'Chuột có dây · Đen', 139000),
  row('DEN-KEM', 'Đèn bàn · Kem', 89000, { code: 'DEN89', start: '2026-11-11', end: expiry }),
  row('TUI-DL', 'Túi đựng đồ du lịch', 59000, { code: 'TRAVEL59', condition: 'khách mới' }),
  row('TUI-DL', 'Túi đựng đồ du lịch', 69000, { code: 'TRAVEL69', condition: 'đơn từ 199k' }),
  row('AO-NAVY', 'Áo cotton · Xanh navy', 159000, { start: '2026-11-12' }),
  row('XA-PHONG', 'Xà phòng rửa tay', 69000, { code: 'TAY25', gift: 'một túi refill', end: expiry }),
];

function prior(row: Offer): Offer {
  if (row.sku === 'BINH-500' && !row.code) return { ...row, gift: 'lõi thay' };
  if (row.sku === 'LY-DOI') return { ...row, gift: 'một đế lót ly' };
  if (row.sku === 'AO-NAVY') return { ...row, price: 139000, start: '2026-11-09' };
  return row;
}

const demoFormats: Record<string, ClipFormat> = {
  canvas: 'review', fan: 'live', cups: 'combo', mouse: 'unbox',
  lamp: 'promo', pouch: 'review', tee: 'affiliate', soap: 'promo',
};
const demoClip = (media: string, title: string, sku: string, evidence: Evidence[], published = '2026-11-11'): Clip =>
  ({ id: `demo-${media}`, title, sku, link: '', published, format: demoFormats[media], evidence, localMedia: false, demoMedia: media });

const clips: Clip[] = [
  { id: 'sample-one', title: 'Bình giữ nhiệt 500 ml', sku: 'BINH-500', link: '', published: '2026-11-10',
    localMedia: false, demoMedia: true, format: 'affiliate', evidence: [segment(5, 'Còn 99k khi áp mã SALE99.', 'frame')] },
  demoClip('canvas', 'Review túi canvas đi học', 'TUI-KEM', [
    segment(1, 'Túi canvas màu kem, bên trong có một ngăn lớn.'),
    segment(5, 'Túi canvas giá 129 nghìn.', 'frame'),
  ]),
  demoClip('fan', 'Cắt livestream · Quạt cầm tay', 'QUAT-MINT', [
    segment(1, 'Đây là mẫu quạt mini màu xanh mint.'),
    segment(5, 'Giá 79k khi áp mã LIVE79.', 'frame'),
    segment(9, 'Áp dụng cho đơn từ 199k.'),
  ]),
  demoClip('cups', 'Combo 2 ly gốm · Có quà kèm', 'LY-DOI', [
    segment(2, 'Combo hai ly gốm giá 119k.', 'frame'),
    segment(7, 'Tặng kèm một đế lót ly.', 'frame'),
  ]),
  demoClip('mouse', 'Mở hộp chuột tím · Gắn sai phân loại', 'CHUOT-TIM', [
    segment(1, 'Mình mở hộp chuột có dây, đây là bản màu tím.'),
    segment(6, 'Tặng kèm một tấm lót chuột.', 'frame'),
  ]),
  demoClip('lamp', 'Đèn bàn · Sale có ghi ngày', 'DEN-KEM', [
    segment(1, 'Đây là đèn bàn ánh sáng vàng.'),
    segment(5, 'Mã DEN89 còn 89k, chỉ ngày 11/11.', 'frame'),
  ]),
  demoClip('pouch', 'Túi du lịch · Giá có voucher', 'TUI-DL', [
    segment(1, 'Bộ túi này dùng để đựng đồ vệ sinh cá nhân.'),
    segment(5, 'Còn 59k khi áp voucher.', 'frame'),
  ]),
  demoClip('tee', 'Video gắn giỏ · Áo cotton xanh navy', 'AO-NAVY', [
    segment(1, 'Áo cotton xanh navy, size M.'),
    segment(5, 'Áo cotton giá 139k.', 'frame'),
  ]),
  demoClip('soap', 'Xà phòng · Ưu đãi chỉ hôm nay', 'XA-PHONG', [
    segment(1, 'Đây là chai xà phòng rửa tay loại vòi nhấn.'),
    segment(5, 'Chỉ hôm nay, mã TAY25 tặng kèm một túi refill.', 'frame'),
  ], ''),
];

export function demoAsset(clip: Clip) {
  if (clip.demoMedia === true) return `${import.meta.env.BASE_URL}binh-500`;
  return clip.demoMedia ? `${import.meta.env.BASE_URL}demo/${clip.demoMedia}` : '';
}

export function emptyWorkspace(): Workspace {
  return { demo: false, clips: [], versions: [], checkedAt: localTime(), audit: null, reviews: {}, notes: {}, snapshots: [] };
}

export function sampleWorkspace(): Workspace {
  const first = { id: 'sample-v1', at: '2026-11-10T09:00', offers: offers.map(prior) };
  const second = { id: 'sample-v2', at: '2026-11-12T08:30', offers };
  const baseline = prepareWorkspace({
    demo: true, demoPack: pack, clips, versions: [first], checkedAt,
    audit: runAudit(clips, [first], checkedAt), reviews: {},
  });
  const current = updatedReport({ ...baseline, versions: [first, second] }, 'offers');
  return { ...current, snapshots: current.snapshots?.map((record, i) => i ? { ...record, recordedAt: checkedAt } : record) };
}

export function refreshDemo(saved?: Workspace): Workspace {
  if (!saved) return sampleWorkspace();
  if ((saved.demoPack ?? 0) >= pack) return saved;
  const workspace = prepareWorkspace(saved);
  const sample = sampleWorkspace();
  const demoClips = new Set(workspace.clips.map(clip => clip.id));
  const known = new Set(workspace.versions.flatMap(version => version.offers.map(offer => offer.sku)));
  const versions = workspace.versions.length ? workspace.versions.map(version => ({
    ...version, offers: [...version.offers, ...(version.id === 'sample-v1' ? offers.map(prior) : offers).filter(offer => !known.has(offer.sku))],
  })) : sample.versions;
  return updatedReport({
    ...workspace, demoPack: pack, versions,
    clips: [...workspace.clips, ...clips.filter(clip => clip.id !== 'sample-one' && !demoClips.has(clip.id))],
    audit: null,
  }, 'clips');
}
