import { fold } from './claims';

const words = /[\p{L}\p{N}\p{M}]+(?:[-_][\p{L}\p{N}\p{M}]+)*/gu;

function oneLetterApart(left: string, right: string) {
  if (left.length > right.length) return oneLetterApart(right, left);
  if (right.length - left.length > 1 || /\d/.test(left + right)) return false;
  let first = 0;
  while (first < left.length && left[first] === right[first]) first++;
  if (!/[a-z]/.test(right[first] ?? '')) return false;
  return left.slice(first + Number(left.length === right.length)) === right.slice(first + 1);
}

export function suggestShopTerm(text: string, terms: string[]) {
  const tokens = [...text.matchAll(words)];
  let best: { from: string; to: string; text: string; start: number; distance: number } | undefined;
  let ambiguous = false;
  for (const to of new Set(terms.map(term => term.trim()))) {
    const count = [...to.matchAll(words)].length;
    const term = fold(to).replace(/\s+/g, ' ');
    if (!count || count > 7 || term.length < 5 || term.length > 64) continue;
    for (let index = 0; index + count <= tokens.length; index++) {
      const start = tokens[index].index;
      const last = tokens[index + count - 1];
      const end = last.index + last[0].length;
      const from = text.slice(start, end);
      if (from.normalize('NFC').toLocaleLowerCase('vi') === to.normalize('NFC').toLocaleLowerCase('vi')) continue;
      const candidate = fold(from).replace(/\s+/g, ' ');
      const distance = candidate === term ? 0 : term.length >= 8 &&
        /^[\p{L}\p{N}_ -]+$/u.test(candidate) && oneLetterApart(candidate, term) ? 1 : 2;
      if (distance > 1) continue;
      if (!best || distance < best.distance || (distance === best.distance && start < best.start)) {
        best = { from, to, start, distance, text: text.slice(0, start) + to + text.slice(end) };
        ambiguous = false;
      } else if (distance === best.distance && start === best.start &&
        to.normalize('NFC').toLocaleLowerCase('vi') !== best.to.normalize('NFC').toLocaleLowerCase('vi')) {
        ambiguous = true;
      }
    }
  }
  return ambiguous ? undefined : best;
}
