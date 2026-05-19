import { IndexEntry, loadIndex, saveIndex, syncIndex } from './index';
import { getActiveBucket } from '@/state/bucketStore';
import { deleteObject } from '@/s3/client';

export async function createFolder(
  name: string,
  parentId: string | null,
  bucketId: string,
): Promise<IndexEntry> {
  const e: IndexEntry = {
    id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    remoteKey: '',
    name,
    size: 0,
    plainSize: 0,
    parentId,
    isFolder: true,
    ctime: Date.now(),
    mtime: Date.now(),
    bucketId,
  };
  const all = await loadIndex();
  all.push(e);
  await saveIndex(all);
  await syncIndex();
  return e;
}

export async function moveEntries(
  ids: string[],
  newParentId: string | null,
): Promise<void> {
  const all = await loadIndex();
  for (const e of all) {
    if (ids.includes(e.id)) {
      e.parentId = newParentId;
      e.mtime = Date.now();
    }
  }
  await saveIndex(all);
  await syncIndex();
}

export async function deleteEntries(ids: string[]): Promise<void> {
  const all = await loadIndex();
  const targets = all.filter(e => ids.includes(e.id));
  const bucket = await getActiveBucket();
  if (bucket) {
    for (const t of targets) {
      if (!t.isFolder && t.remoteKey) {
        await deleteObject(bucket, t.remoteKey).catch(() => {});
        await deleteObject(bucket, `thumbs/${t.id}.t`).catch(() => {});
      }
    }
  }
  await saveIndex(all.filter(e => !ids.includes(e.id)));
  await syncIndex();
}

export async function searchEntries(q: string): Promise<IndexEntry[]> {
  const lower = q.toLowerCase();
  const all = await loadIndex();
  return all.filter(e => e.name.toLowerCase().includes(lower));
}
