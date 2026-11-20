export const maxVideoSeconds = 5 * 60;
export const maxVideoBytes = 150 * 1024 * 1024;
export const shortVideoSeconds = 120;
export const videoFileHint = 'MP4, WebM, MOV, M4V · tối đa 5 phút và 150 MB mỗi clip';

export function scanFrameCount(duration: number) {
  const limit = Math.max(48, Math.ceil(duration * 48 / shortVideoSeconds));
  return Math.max(1, Math.min(limit, Math.ceil(duration / 2)));
}
