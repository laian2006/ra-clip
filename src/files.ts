import { validateOffers } from './audit';
import { fold } from './claims';
import { kindLabels, reviewLabels, sourceLabels, timestamp, verdictLabels } from './domain';
import type { Audit, ClipSummary, Evidence, Offer, Review } from './domain';
import { dateInput } from './time';

const headers = ['sku', 'name', 'voucher', 'price', 'gift', 'start', 'end', 'condition'];
const MAX_SHEET_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 2000;
const aliases: Record<string, string> = {
  ma_sku: 'sku', ma_phan_loai: 'sku', ma_san_pham: 'sku',
  ten_san_pham: 'name', ma_voucher: 'voucher', ma_uu_dai: 'voucher', code: 'voucher',
  gia: 'price', gia_vnd: 'price', qua_tang: 'gift',
  bat_dau: 'start', ket_thuc: 'end', dieu_kien: 'condition',
};

function delimiter(text: string) {
  const heading = text.split(/\r?\n/, 1)[0].replace(/"[^"]*"/g, '');
  const choices = [',', ';', '\t'];
  return choices.sort((a, b) => heading.split(b).length - heading.split(a).length)[0];
}

export function readDelimited(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const sep = delimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === sep) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      if (ch === '\r' && text[i + 1] === '\n') i++;
      if (rows.length > MAX_ROWS + 1) throw Error(`Bảng chứa hơn ${MAX_ROWS} dòng.`);
    } else field += ch;
  }
  if (quoted) throw Error('File CSV có một ô chưa đóng dấu ngoặc kép.');
  if (row.length || field.length) rows.push([...row, field]);
  return rows;
}

function sheetText(value: unknown) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw Error('Ngày trong Excel không hợp lệ.');
    const iso = value.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.slice(0, 19);
  }
  if (typeof value === 'number' || typeof value === 'string') return String(value);
  if (value && typeof value === 'object') {
    if ('result' in value) return sheetText(value.result);
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map(part => String(part.text ?? '')).join('');
    }
    if ('text' in value && typeof value.text === 'string') return value.text;
  }
  return '';
}

export function readPrice(raw: string) {
  const compact = fold(raw).trim().replace(/\s*(?:vnd|dong|d)$/, '').trim();
  if (!compact) return null;
  const thousands = compact.match(/^(\d+)\s*k$/);
  if (thousands) return Number(thousands[1]) * 1000;
  if (/^\d+$/.test(compact)) return Number(compact);
  if (/^\d{1,3}(?:[., ]\d{3})+$/.test(compact)) return Number(compact.replace(/[., ]/g, ''));
  throw Error(`Giá không hợp lệ: ${raw}`);
}

export function rowsToOffers(rows: unknown[][]) {
  if (rows.length > MAX_ROWS + 1) throw Error(`Bảng chứa hơn ${MAX_ROWS} dòng.`);
  const [heading, ...body] = rows;
  if (!heading) throw Error('Bảng trống.');
  const index = new Map<string, number>();
  heading.forEach((value, i) => {
    const key = fold(sheetText(value)).trim().replace(/[^a-z0-9]+/g, '_');
    const name = aliases[key] ?? key;
    if (!headers.includes(name)) return;
    if (index.has(name)) throw Error(`Cột bị trùng: ${name}`);
    index.set(name, i);
  });
  if (!index.has('sku')) throw Error('Thiếu cột sku. Hãy dùng mẫu để giữ đúng tiêu đề cột.');
  return validateOffers(body.flatMap((row, i) => {
    if (!row.some(value => sheetText(value).trim())) return [];
    const get = (name: string) => {
      const column = index.get(name);
      return column === undefined ? '' : sheetText(row[column]).trim();
    };
    try {
      return [{
        sku: get('sku'), name: get('name'), code: get('voucher'), price: readPrice(get('price')),
        gift: get('gift'), start: dateInput(get('start')), end: dateInput(get('end'), true),
        condition: get('condition'),
      }];
    } catch (error) {
      throw Error(`Dòng ${i + 2}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }));
}

export async function importOffers(file: File) {
  if (file.size > MAX_SHEET_BYTES) throw Error('Bảng ưu đãi vượt quá 5 MB.');
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import('read-excel-file/browser');
    const rows = await readSheet(file);
    if (!rows.length) throw Error('Trang tính đầu tiên đang trống.');
    if (rows.length > MAX_ROWS + 1 || rows.some(row => row.length > 100)) throw Error('Giảm bảng xuống 2.000 dòng và 100 cột.');
    return rowsToOffers(rows);
  }
  if (!/\.(csv|tsv)$/i.test(file.name)) throw Error('Chọn file .xlsx, .csv hoặc .tsv.');
  return rowsToOffers(readDelimited(await file.text()));
}

function cueTime(label: string): number | null {
  const parts = label.replace(',', '.').split(':').map(Number);
  if ((parts.length !== 2 && parts.length !== 3) || parts.some(part => !Number.isFinite(part) || part < 0)) return null;
  if (parts.at(-1)! >= 60 || (parts.length === 3 && parts[1] >= 60)) return null;
  return parts.reduce((sum, part) => sum * 60 + part);
}

export function readSubtitles(input: string, source: Evidence['source'] = 'subtitle'): Evidence[] {
  const cleaned = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!cleaned) throw Error('Phụ đề đang trống.');
  const evidence: Evidence[] = [];
  const range = /^((?:\d+:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)(?:\s.*)?$/;
  for (const block of cleaned.split(/\n\s*\n/)) {
    const lines = block.split('\n').map(line => line.trim());
    const i = lines.findIndex(line => range.test(line));
    if (i === -1) continue;
    const [, inTime, outTime] = lines[i].match(range)!;
    const start = cueTime(inTime);
    const end = cueTime(outTime);
    const text = lines.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').trim();
    if (start !== null && end !== null && end >= start && text) evidence.push({ start, end, text, source });
  }
  if (!evidence.length && !cleaned.includes('-->')) {
    for (const line of cleaned.split('\n')) {
      const match = line.trim().match(/^\[?((?:\d+:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\]?\s+[-–—]?\s*(\S.*)$/);
      const start = match ? cueTime(match[1]) : null;
      if (match && start !== null) evidence.push({ start, end: null, text: match[2], source });
    }
  }
  if (!evidence.length) throw Error('Thiếu mốc thời gian. Dùng SRT, VTT hoặc mẫu “00:05 Nội dung lời thoại”.');
  if (evidence.length > 1000) throw Error('Dùng tối đa 1.000 đoạn phụ đề cho một clip.');
  return evidence.sort((a, b) => a.start - b.start);
}

export function csv(rows: (string | number | null)[][], protectFormulas = true) {
  return '\uFEFF' + rows.map(row => row.map(value => {
    const text = String(value ?? '');
    const safe = protectFormulas && typeof value === 'string' && /^[\s\u0000-\u001f]*[=+@-]/.test(text) ? "'" + text : text;
    return '"' + safe.replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n') + '\r\n';
}

export const templateRows = [
  headers,
  ['BINH-500', 'Bình giữ nhiệt 500 ml', 'SALE99', 99000, '', '2026-11-09', '2026-11-11T23:59', ''],
  ['BINH-500', 'Bình giữ nhiệt 500 ml', '', 149000, 'Lõi thay', '2026-11-12', '', ''],
];

export function offersCsv(offers: Offer[]) {
  return csv([headers, ...offers.map(row => [
    row.sku, row.name, row.code, row.price, row.gift, row.start, row.end, row.condition,
  ])]);
}

export function auditCsv(audit: Audit, clips: ClipSummary[], reviews: Record<string, Review>, notes: Record<string, string> = {}) {
  const index = new Map(clips.map(row => [row.id, row]));
  const rows = audit.results.flatMap(result => {
    const clip = index.get(result.clipId);
    if (!clip) return [];
    return result.findings.map(finding => [
      clip.title, clip.sku, clip.link, finding.evidence ? timestamp(finding.evidence.start) : '',
      kindLabels[finding.kind], verdictLabels[finding.verdict], finding.claim,
      finding.evidence ? sourceLabels[finding.evidence.source] : '', finding.evidence?.text ?? '',
      finding.reference, finding.reason, reviews[finding.id] ? reviewLabels[reviews[finding.id]] : '', notes[finding.id] ?? '', audit.checkedAt,
    ]);
  });
  return csv([['Video', 'SKU', 'Link', 'Mốc thời gian', 'Nhóm', 'Kết quả', 'Thông tin trong clip',
    'Nguồn', 'Bằng chứng', 'Bảng ưu đãi', 'Lý do', 'Phản hồi', 'Ghi chú', 'Thời điểm rà (UTC+7)'], ...rows]);
}

export function download(text: string, name: string) {
  downloadBlob(new Blob([text], { type: 'text/csv;charset=utf-8' }), name);
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
