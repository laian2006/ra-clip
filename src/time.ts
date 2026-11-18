export function parseVietnamTime(value: string, endOfDay = false): number | null {
  const pattern = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;
  const match = value.trim().match(pattern);
  if (!match) return null;
  const [, y, m, d, h, min, s] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const hour = h === undefined ? (endOfDay ? 23 : 0) : Number(h);
  const minute = min === undefined ? (endOfDay ? 59 : 0) : Number(min);
  const second = s === undefined ? (endOfDay ? 59 : 0) : Number(s);
  const raw = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    raw.getUTCFullYear() !== year || raw.getUTCMonth() !== month - 1 ||
    raw.getUTCDate() !== day || raw.getUTCHours() !== hour ||
    raw.getUTCMinutes() !== minute || raw.getUTCSeconds() !== second
  ) return null;
  return raw.getTime() - 7 * 3_600_000;
}

export function dateInput(value: string, endOfDay = false) {
  const normalized = value.trim();
  if (!normalized) return '';
  const match = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) {
    if (parseVietnamTime(normalized, endOfDay) === null) throw Error(`Ngày không hợp lệ: ${value}`);
    return normalized.replace(' ', 'T');
  }
  const [, day, month, year, hour, minute, second] = match;
  const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const iso = hour === undefined ? isoDate : `${isoDate}T${hour.padStart(2, '0')}:${minute}${second ? ':' + second : ''}`;
  if (parseVietnamTime(iso, endOfDay) === null) throw Error(`Ngày không hợp lệ: ${value}`);
  return iso;
}
