import { openDB, type DBSchema } from 'idb';
import type { Workspace } from './domain';

interface ClipDatabase extends DBSchema {
  workspace: { key: string; value: Workspace };
  media: { key: string; value: Blob };
}

let database: ReturnType<typeof openDB<ClipDatabase>> | undefined;

function open() {
  database ??= openDB<ClipDatabase>('ra-clip', 1, {
    upgrade(db) {
      db.createObjectStore('workspace');
      db.createObjectStore('media');
    },
  }).catch((error: unknown) => {
    database = undefined;
    throw error;
  });
  return database;
}

const key = (demo: boolean) => demo ? 'demo' : 'shop';

export interface MediaChange { id: string; blob: Blob | null }

export async function loadWorkspace(demo: boolean) {
  return (await open()).get('workspace', key(demo));
}

export async function loadMedia(id: string) {
  return (await open()).get('media', id);
}

export async function saveWorkspace(workspace: Workspace, media: MediaChange[] = []) {
  const db = await open();
  const transaction = db.transaction(['workspace', 'media'], 'readwrite');
  const changes: Promise<unknown>[] = [
    transaction.objectStore('workspace').put(workspace, key(workspace.demo)),
    transaction.done,
  ];
  const store = transaction.objectStore('media');
  for (const item of media) {
    changes.push(item.blob ? store.put(item.blob, item.id) : store.delete(item.id));
  }
  await Promise.all(changes);
}
