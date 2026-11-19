import { runAudit, validateOffers } from './audit';
import { clipFormats, safeLink } from './domain';
import type {
  Audit, AuditSnapshot, AuditTrigger, CampaignDraft, Clip, ClipFormat, ClipSummary, Evidence, EvidenceMask,
  Finding, Kind, Offer, OfferVersion, Review, Verdict, Workspace,
} from './domain';
import type { MediaChange } from './storage';
import { parseVietnamTime } from './time';

const MAGIC = 'RACLIP1\n';
const PREFIX = 12;
const MAX_HEADER = 20 * 1024 * 1024;
const MAX_MEDIA = 150 * 1024 * 1024;
const MAX_BACKUP = 1024 * 1024 * 1024;
const sourceNames = ['audio', 'frame', 'subtitle', 'manual'] as const;
const kinds = ['code', 'price', 'gift', 'coverage'] as const;
const statuses = ['action', 'review', 'dated', 'clear'] as const;
const reviewValues = ['new', 'known', 'wrong', 'done'] as const;
const triggers = ['manual', 'offers', 'clips', 'evidence', 'batch', 'baseline'] as const;

interface FileEntry { id: string; size: number; type: string }

const malformed = () => Error('Bản sao lưu bị hỏng hoặc chứa dữ liệu ngoài định dạng Rà Clip.');
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw malformed();
  return value as Record<string, unknown>;
}
function array(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw malformed();
  return value;
}
function string(value: unknown, max = 4000): string {
  if (typeof value !== 'string' || value.length > max) throw malformed();
  return value;
}
function numeric(value: unknown, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) throw malformed();
  return value;
}
function oneOf<T extends string>(value: unknown, choices: readonly T[]): T {
  if (!choices.includes(value as T)) throw malformed();
  return value as T;
}
function date(value: unknown, optional = false) {
  const label = string(value, 32);
  if ((label || !optional) && parseVietnamTime(label) === null) throw malformed();
  return label;
}
function optionalRecord(value: unknown = {}) { return object(value); }

function readEvidence(value: unknown): Evidence {
  const row = object(value);
  const start = numeric(row.start, 7200);
  const end = row.end === null ? null : numeric(row.end, 7200);
  if (end !== null && end < start) throw malformed();
  return { start, end, text: string(row.text, 50_000), source: oneOf(row.source, sourceNames), corrected: row.corrected === true };
}
function readMask(value: unknown): EvidenceMask {
  const row = object(value);
  const start = numeric(row.start, 7200);
  const end = row.end === null ? null : numeric(row.end, 7200);
  if (end !== null && end < start) throw malformed();
  return { start, end, source: oneOf(row.source, ['audio', 'frame'] as const) };
}

function readScan(value: unknown) {
  const row = object(value);
  const rawSources = optionalRecord(row.sources);
  const sources = Object.fromEntries((['audio', 'frame'] as const).flatMap(source => {
    if (!rawSources[source]) return [];
    const item = object(rawSources[source]);
    return [[source, { state: oneOf(item.state, ['done', 'empty', 'failed'] as const), detail: string(item.detail, 1600) }]];
  }));
  return { at: date(row.at), detail: string(row.detail, 1600), audio: row.audio === true, frame: row.frame === true,
    sources: row.sources ? sources : undefined,
    state: oneOf(row.state, ['ready', 'partial', 'empty', 'failed'] as const) };
}

function readOffer(value: unknown): Offer {
  const row = object(value);
  return {
    sku: string(row.sku, 200), name: string(row.name), code: string(row.code, 100),
    price: row.price === null ? null : numeric(row.price, Number.MAX_SAFE_INTEGER),
    gift: string(row.gift), start: date(row.start, true), end: date(row.end, true), condition: string(row.condition),
  };
}

export async function makeBackup(draft: CampaignDraft, workspace: Workspace, mediaReader: (id: string) => Promise<Blob | undefined>) {
  const files: FileEntry[] = [];
  const blobs: Blob[] = [];
  let total = 0;
  for (const clip of workspace.clips) {
    if (!clip.localMedia) continue;
    const blob = await mediaReader(clip.id);
    if (!blob?.size) throw Error(`Thiếu file video của “${clip.title}”.`);
    total += blob.size;
    if (total > MAX_BACKUP || blob.size > MAX_MEDIA) throw Error('Bản sao lưu vượt giới hạn 1 GB hoặc có clip quá 150 MB.');
    files.push({ id: clip.id, size: blob.size, type: blob.type });
    blobs.push(blob);
  }
  const { revision: _, audit: __, ...state } = workspace;
  const manifest = new TextEncoder().encode(JSON.stringify({ draft, state, files }));
  if (manifest.length > MAX_HEADER || (manifest.length + PREFIX + total) > MAX_BACKUP) throw Error('Bản sao lưu vượt giới hạn 1 GB hoặc chứa quá nhiều dữ liệu báo cáo.');
  const header = new Uint8Array(PREFIX);
  header.set(new TextEncoder().encode(MAGIC));
  new DataView(header.buffer).setUint32(8, manifest.byteLength, true);
  return new Blob([header, manifest, ...blobs], { type: 'application/octet-stream' });
}

export async function readBackup(blob: Blob): Promise<{ draft: CampaignDraft; workspace: Workspace; media: MediaChange[] }> {
  if (blob.size < PREFIX || blob.size > MAX_BACKUP) throw Error('Chọn bản sao lưu .raclip có dung lượng tối đa 1 GB.');
  const header = await blob.slice(0, PREFIX).arrayBuffer();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  if (decoder.decode(header.slice(0, 8)) !== MAGIC) throw malformed();
  const size = new DataView(header).getUint32(8, true);
  if (size === 0 || size > MAX_HEADER || (PREFIX + size) > blob.size) throw malformed();
  const raw = object(JSON.parse(decoder.decode(await blob.slice(PREFIX, PREFIX + size).arrayBuffer())));
  const info = object(raw.draft);
  const draft = { name: string(info.name, 80).trim(), shop: string(info.shop, 80).trim() };
  if (!draft.name) throw malformed();
  const rawState = object(raw.state);
  if (rawState.demo !== false) throw malformed();

  const ids = new Map<string, string>();
  function newId(rawId: unknown) {
    const id = string(rawId, 140);
    if (!id) throw malformed();
    const existing = ids.get(id);
    if (existing) return existing;
    const replacement = crypto.randomUUID();
    ids.set(id, replacement);
    return replacement;
  }
  function clipBasics(row: Record<string, unknown>): ClipSummary {
    const metadata = row.stats ? object(row.stats) : undefined;
    const count = (value: unknown) => {
      const result = numeric(value, Number.MAX_SAFE_INTEGER);
      if (!Number.isInteger(result)) throw malformed();
      return result;
    };
    return {
      id: newId(row.id), title: string(row.title, 140), sku: string(row.sku, 200), link: safeLink(string(row.link, 4000)),
      videoId: row.videoId ? string(row.videoId, 25) : undefined,
      creator: row.creator ? string(row.creator, 100) : undefined,
      stats: metadata ? { views: metadata.views === undefined ? undefined : count(metadata.views),
        orders: metadata.orders === undefined ? undefined : count(metadata.orders) } : undefined,
    };
  }
  function findingId(value: unknown) {
    const key = array(JSON.parse(string(value, 15_000)), 16);
    if (key.length < 2) throw malformed();
    const [id, ...parts] = key;
    return JSON.stringify([newId(id), ...parts]);
  }
  function readFinding(value: unknown): Finding {
    const row = object(value);
    return {
      id: findingId(row.id), clipId: newId(row.clipId),
      kind: oneOf<Kind>(row.kind, kinds), verdict: oneOf<Verdict>(row.verdict, statuses),
      claim: string(row.claim), reference: string(row.reference, 8000), reason: string(row.reason),
      evidence: row.evidence ? readEvidence(row.evidence) : undefined,
    };
  }
  const reviews = (value: unknown) => Object.fromEntries(Object.entries(optionalRecord(value))
    .map(([key, state]) => [findingId(key), oneOf<Review>(state, reviewValues)]));
  const notes = (value: unknown) => Object.fromEntries(Object.entries(optionalRecord(value))
    .map(([key, note]) => [findingId(key), string(note, 500)]));
  const clips: Clip[] = array(rawState.clips, 4000).map(value => {
    const row = object(value);
    return {
      ...clipBasics(row), published: date(row.published, true),
      format: row.format ? oneOf<ClipFormat>(row.format, Object.keys(clipFormats) as ClipFormat[]) : undefined,
      localMedia: row.localMedia === true, mediaRevision: crypto.randomUUID(),
      lastScan: row.lastScan ? readScan(row.lastScan) : undefined,
      evidence: array(row.evidence, 1500).map(readEvidence),
      masks: array(row.masks ?? [], 2000).map(readMask),
    };
  });
  if (new Set(clips.map(clip => clip.id)).size !== clips.length) throw malformed();
  const versions: OfferVersion[] = array(rawState.versions, 300).map(value => {
    const row = object(value);
    return { id: string(row.id, 140), at: date(row.at), offers: validateOffers(array(row.offers, 2000).map(readOffer)) };
  });
  if (new Set(versions.map(version => version.id)).size !== versions.length) throw malformed();

  function readAudit(value: unknown): Audit {
    const row = object(value);
    return {
      versionId: string(row.versionId, 140), checkedAt: date(row.checkedAt),
      refreshed: array(row.refreshed, 4000).map(newId),
      results: array(row.results, 4000).map(value => {
        const item = object(value);
        return { clipId: newId(item.clipId), signature: '', findings: array(item.findings, 4500).map(readFinding) };
      }),
    };
  }
  const snapshots: AuditSnapshot[] = array(rawState.snapshots ?? [], 40).map(value => {
    const row = object(value);
    const audit = readAudit(row.audit);
    const versionNumber = versions.findIndex(version => version.id === audit.versionId) + 1;
    if (!versionNumber) throw malformed();
    return {
      id: crypto.randomUUID(), trigger: oneOf<AuditTrigger>(row.trigger, triggers), recordedAt: date(row.recordedAt),
      versionNumber, audit, clips: array(row.clips, 4000).map(item => clipBasics(object(item))),
      reviews: reviews(row.reviews), notes: notes(row.notes),
    };
  });
  const checkedAt = date(rawState.checkedAt);
  const workspace: Workspace = {
    demo: false, checkedAt, clips, versions, snapshots, reviews: reviews(rawState.reviews), notes: notes(rawState.notes),
    audit: versions.length ? runAudit(clips, versions, checkedAt) : null,
  };
  let offset = PREFIX + size;
  const expected = new Set(clips.filter(clip => clip.localMedia).map(clip => clip.id));
  const media = array(raw.files, 4000).map(value => {
    const entry = object(value);
    const id = newId(entry.id);
    const length = numeric(entry.size, MAX_MEDIA);
    const type = string(entry.type, 100);
    if (!expected.delete(id) || !Number.isInteger(length) || !length || offset + length > blob.size) throw malformed();
    const chunk = blob.slice(offset, offset + length, /^video\/[a-z0-9.+-]+$/i.test(type) ? type : '');
    offset += length;
    return { id, blob: chunk };
  });
  if (offset !== blob.size || expected.size) throw malformed();
  return { draft, workspace, media };
}
