import { openDB, type DBSchema } from 'idb';
import { localTime } from './domain';
import type { Campaign, CampaignDraft, Workspace } from './domain';
import { queueEntries, reviewOpen } from './workflow';

interface ClipDatabase extends DBSchema {
  workspace: { key: string; value: Workspace };
  media: { key: string; value: Blob };
  campaigns: { key: string; value: Campaign };
}

let database: ReturnType<typeof openDB<ClipDatabase>> | undefined;

function open() {
  if (database) return database;
  let connection: Awaited<ReturnType<typeof openDB<ClipDatabase>>> | undefined;
  database = openDB<ClipDatabase>('ra-clip', 2, {
    upgrade(db, oldVersion) {
      if (oldVersion === 0) {
        db.createObjectStore('workspace');
        db.createObjectStore('media');
      }
      if (oldVersion < 2) db.createObjectStore('campaigns');
    },
    blocked() {
      window.dispatchEvent(new Event('ra-clip-storage-blocked'));
    },
    blocking() {
      connection?.close();
      database = undefined;
    },
    terminated() { database = undefined; },
  }).then(db => {
    connection = db;
    return db;
  }).catch((error: unknown) => {
    database = undefined;
    throw error;
  });
  return database;
}

export const defaultCampaign = (workspace?: Workspace): Campaign => ({
  id: 'shop', name: 'Không gian của shop', shop: '', createdAt: '', updatedAt: '',
  clipCount: workspace?.clips.length ?? 0,
  todoCount: workspace ? queueEntries(workspace).filter(item => reviewOpen(item.review)).length : 0,
});

function draftValues(draft: CampaignDraft) {
  const name = draft.name.trim();
  const shop = draft.shop.trim();
  if (!name || name.length > 80 || shop.length > 80) throw Error('Nhập tên chiến dịch và giữ mỗi tên tối đa 80 ký tự.');
  return { name, shop };
}

export interface MediaChange { id: string; blob: Blob | null }

export async function listCampaigns() {
  const db = await open();
  const items = await db.getAll('campaigns');
  if (!items.some(item => item.id === 'shop')) items.push(defaultCampaign(await db.get('workspace', 'shop')));
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name, 'vi'));
}

export async function loadWorkspace(id: string) {
  return (await open()).get('workspace', id);
}

export async function loadMedia(id: string) {
  return (await open()).get('media', id);
}

export async function createCampaign(draft: CampaignDraft, workspace: Workspace, media: MediaChange[] = []) {
  const db = await open();
  const id = crypto.randomUUID();
  const now = localTime();
  const campaign: Campaign = {
    id, ...draftValues(draft), createdAt: now, updatedAt: now,
    clipCount: workspace.clips.length,
    todoCount: queueEntries(workspace).filter(item => reviewOpen(item.review)).length,
  };
  const transaction = db.transaction(['campaigns', 'workspace', 'media'], 'readwrite');
  await Promise.all([
    transaction.objectStore('campaigns').add(campaign, id),
    transaction.objectStore('workspace').add({ ...workspace, demo: false, revision: crypto.randomUUID() }, id),
    ...media.filter(item => item.blob).map(item => transaction.objectStore('media').add(item.blob!, item.id)),
    transaction.done,
  ]);
  return campaign;
}

export async function renameCampaign(id: string, draft: CampaignDraft) {
  if (id === 'demo') throw Error('Dùng chiến dịch của shop để đổi tên.');
  const values = draftValues(draft);
  const db = await open();
  const transaction = db.transaction(['campaigns', 'workspace'], 'readwrite');
  const store = transaction.objectStore('campaigns');
  const old = await store.get(id) ?? (id === 'shop' ? defaultCampaign(await transaction.objectStore('workspace').get(id)) : undefined);
  if (!old) throw Error('Chiến dịch này không còn tồn tại.');
  const now = localTime();
  await Promise.all([store.put({ ...old, ...values, createdAt: old.createdAt || now, updatedAt: now }, id), transaction.done]);
}

export async function saveWorkspace(id: string, workspace: Workspace, media: MediaChange[] = []) {
  const db = await open();
  const transaction = db.transaction(['workspace', 'media', 'campaigns'], 'readwrite');
  const workspaces = transaction.objectStore('workspace');
  const existing = await workspaces.get(id);
  if (existing?.revision !== workspace.revision) throw Error('Dữ liệu vừa thay đổi ở tab khác. Tải lại trang để tiếp tục.');
  const saved = { ...workspace, revision: crypto.randomUUID() };
  const changes: Promise<unknown>[] = [workspaces.put(saved, id), transaction.done];
  const files = transaction.objectStore('media');
  for (const item of media) changes.push(item.blob ? files.put(item.blob, item.id) : files.delete(item.id));
  if (id !== 'demo') {
    const campaigns = transaction.objectStore('campaigns');
    const previous = await campaigns.get(id) ?? defaultCampaign(existing);
    const now = localTime();
    changes.push(campaigns.put({
      ...previous, id, createdAt: previous.createdAt || now, updatedAt: now,
      clipCount: saved.clips.length,
      todoCount: queueEntries(saved).filter(item => reviewOpen(item.review)).length,
    }, id));
  }
  await Promise.all(changes);
  return saved;
}
