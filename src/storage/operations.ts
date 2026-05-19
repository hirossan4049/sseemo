import { IndexEntry, loadIndex, saveIndex } from './index';

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
}

export async function deleteEntries(ids: string[]): Promise<void> {
  const all = await loadIndex();
  await saveIndex(all.filter(e => !ids.includes(e.id)));
}

export async function searchEntries(q: string): Promise<IndexEntry[]> {
  const lower = q.toLowerCase();
  const all = await loadIndex();
  return all.filter(e => e.name.toLowerCase().includes(lower));
}
