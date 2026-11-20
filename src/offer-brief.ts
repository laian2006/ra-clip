import { validateOffers } from './audit';
import { displayDate, money } from './domain';
import type { Offer } from './domain';

const format = 'ra-clip-offer';
const maxBytes = 64 * 1024;

export function offerTimeLabel(value: string) {
  return displayDate(value) + (value.length > 10 ? `, ${value.slice(11)}` : '');
}

export function offerBriefText(offer: Offer) {
  return [
    `Ưu đãi cho ${offer.name || offer.sku}`,
    `Mã sản phẩm: ${offer.sku}`,
    offer.price !== null && `Giá áp dụng: ${money(offer.price)}`,
    offer.code && `Mã voucher: ${offer.code}`,
    offer.gift && `Quà tặng: ${offer.gift}`,
    offer.start && `Bắt đầu: ${offerTimeLabel(offer.start)} (giờ Việt Nam)`,
    offer.end && `Đến hết: ${offerTimeLabel(offer.end)} (giờ Việt Nam)`,
    offer.condition && `Điều kiện: ${offer.condition}`,
  ].filter(Boolean).join('\n');
}

export function makeOfferBrief(offer: Offer) {
  const [checked] = validateOffers([offer]);
  const file = new Blob([JSON.stringify({ format, version: 1, offer: checked }, null, 2)], { type: 'application/json' });
  if (file.size > maxBytes) throw Error('Phiếu ưu đãi vượt quá 64 KB. Rút gọn mô tả trước khi tải.');
  return file;
}

export async function readOfferBrief(file: Blob): Promise<Offer> {
  if (!file.size || file.size > maxBytes) throw Error('Chọn phiếu ưu đãi có dung lượng dưới 64 KB.');
  const invalid = 'Tệp không đúng định dạng phiếu ưu đãi của Rà Clip.';
  let data: unknown;
  try { data = JSON.parse(await file.text()); }
  catch { throw Error(invalid); }
  if (!data || typeof data !== 'object' || !('format' in data) || data.format !== format ||
    !('version' in data) || data.version !== 1 || !('offer' in data) || !data.offer || typeof data.offer !== 'object') {
    throw Error(invalid);
  }
  const { sku, name, code, price, gift, start, end, condition } = data.offer as Partial<Offer>;
  if (typeof sku !== 'string' || typeof name !== 'string' || typeof code !== 'string' ||
    (typeof price !== 'number' && price !== null) || typeof gift !== 'string' ||
    typeof start !== 'string' || typeof end !== 'string' || typeof condition !== 'string') throw Error(invalid);
  return validateOffers([{ sku, name, code, price, gift, start, end, condition }])[0];
}
