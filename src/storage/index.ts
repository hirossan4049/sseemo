import AsyncStorage from '@react-native-async-storage/async-storage';

export interface IndexEntry {
  id: string;
  remoteKey: string;
  name: string;
  mime?: string;
  size: number; // 暗号化後サイズ
  plainSize: number;
  parentId: string | null;
  isFolder: boolean;
  ctime: number;
  mtime: number;
  bucketId: string;
}

const KEY = '@secstorage/index/v1';

export async function loadIndex(): Promise<IndexEntry[]> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function saveIndex(entries: IndexEntry[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(entries));
}

export async function addEntry(e: IndexEntry): Promise<void> {
  const all = await loadIndex();
  all.push(e);
  await saveIndex(all);
}

export async function removeEntry(id: string): Promise<void> {
  const all = await loadIndex();
  await saveIndex(all.filter(x => x.id !== id));
}

export async function childrenOf(parentId: string | null): Promise<IndexEntry[]> {
  const all = await loadIndex();
  return all.filter(e => e.parentId === parentId);
}
