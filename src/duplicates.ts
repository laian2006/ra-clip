import { linkKey, tiktokId } from './catalog';
import type { Clip } from './domain';
import { loadMedia } from './storage';

export class DuplicateVideo extends Error {
  constructor(readonly index: number, readonly title: string, readonly existing?: Clip) {
    super(`Video trùng với “${title}”.`);
  }
}

export type DuplicateChoice = { separate: Set<number>; replace?: Clip };

async function fingerprint(file: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return `${file.size}:${hex}`;
}

interface IncomingVideo { title: string; file: File | null; link: string }

export async function inspectUploads(drafts: IncomingVideo[], clips: Clip[], separate: Set<number>, signal: AbortSignal) {
  const hashes: (string | undefined)[] = [];
  const cache = new Map<string, string>();
  for (const [index, draft] of drafts.entries()) {
    signal.throwIfAborted();
    const hash = draft.file ? await fingerprint(draft.file) : undefined;
    hashes.push(hash);
    if (separate.has(index)) continue;
    const link = linkKey(draft.link);
    const videoId = tiktokId(draft.link);
    for (const clip of clips) {
      signal.throwIfAborted();
      if ((link && link === linkKey(clip.link)) || (videoId && videoId === (clip.videoId || tiktokId(clip.link)))) {
        throw new DuplicateVideo(index, clip.title, clip);
      }
      if (!hash || !clip.localMedia) continue;
      if (clip.fileHash === hash) throw new DuplicateVideo(index, clip.title, clip);
      if (clip.fileHash || !draft.file) continue;
      let previous = cache.get(clip.id);
      if (previous === undefined) {
        const blob = await loadMedia(clip.id);
        previous = blob && blob.size === draft.file.size ? await fingerprint(blob) : '';
        // A different incoming file can have a different size.
        if (previous || !blob) cache.set(clip.id, previous);
      }
      if (previous === hash) throw new DuplicateVideo(index, clip.title, clip);
    }
    if (!hash) continue;
    const earlier = hashes.indexOf(hash);
    if (earlier < index) throw new DuplicateVideo(index, drafts[earlier].title);
  }
  signal.throwIfAborted();
  return hashes;
}

export async function findDuplicateVideos(clips: Clip[], signal: AbortSignal) {
  const seen = new Map<string, string>();
  const matches = new Set<string>();
  const media = new Map<number, { id: string; hash?: string; blob?: Blob }[]>();
  function check(key: string, id: string) {
    const first = seen.get(key);
    if (first && first !== id) { matches.add(first); matches.add(id); }
    else seen.set(key, id);
  }
  for (const clip of clips) {
    signal.throwIfAborted();
    const link = linkKey(clip.link);
    const videoId = clip.videoId || tiktokId(clip.link);
    if (link) check(`link:${link}`, clip.id);
    if (videoId) check(`id:${videoId}`, clip.id);
    if (!clip.localMedia) continue;
    const blob = clip.fileHash ? undefined : await loadMedia(clip.id);
    const size = blob?.size ?? Number(clip.fileHash?.split(':')[0]);
    if (!size) continue;
    const group = media.get(size) ?? [];
    group.push({ id: clip.id, hash: clip.fileHash, blob });
    media.set(size, group);
  }
  for (const group of media.values()) {
    if (group.length < 2) continue;
    for (const { id, hash, blob } of group) {
      signal.throwIfAborted();
      const digest = hash ?? (blob ? await fingerprint(blob) : '');
      if (digest) check(`file:${digest}`, id);
    }
  }
  signal.throwIfAborted();
  return matches;
}
