import AsyncStorage from '@react-native-async-storage/async-storage';
import { openGcm, sealGcm } from '@/crypto/cipher';
import { deriveIndexKey } from '@/crypto/kdf';
import { getMaster } from '@/state/keyStore';
import { b64decode, b64encode } from '@/crypto/base64';

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

/**
 * AsyncStorage 上のローカルインデックスも spec §5 「ファイル名・パス・
 * メタデータも暗号化」要件に従い暗号化する。v2 から base64(seal blob)
 * を保存する。旧 v1 平文 JSON は読まずに空として扱う (個人バックアップ
 * 用途なので破棄しても許容)。
 */
const KEY_V2 = '@secstorage/index/v2';
const KEY_V1_LEGACY = '@secstorage/index/v1';
const MIGRATION_FLAG = '@secstorage/index/v1MigratedAt';

/**
 * v1 (平文 JSON) → v2 (sealGcm) 1-shot 移行。
 * - 起動直後の `loadIndex()` 1回だけ呼ばれることを想定
 * - 平文をパースできれば再暗号化して書き戻し → v1 を unlink
 * - パース不能なら警告ログのみ。次回以降は MIGRATION_FLAG により再試行しない
 */
async function migrateV1IfNeeded(): Promise<IndexEntry[] | null> {
  const done = await AsyncStorage.getItem(MIGRATION_FLAG);
  if (done) return null;
  const v1 = await AsyncStorage.getItem(KEY_V1_LEGACY);
  if (!v1) {
    await AsyncStorage.setItem(MIGRATION_FLAG, String(Date.now()));
    return null;
  }
  const master = getMaster();
  if (!master) {
    // 鍵未解錠時は移行不能。フラグは立てない (次回再試行)。
    return null;
  }
  try {
    const parsed = JSON.parse(v1) as IndexEntry[];
    if (!Array.isArray(parsed)) throw new Error('v1 index not array');
    const blob = sealGcm(deriveIndexKey(master), Buffer.from(JSON.stringify(parsed), 'utf8'));
    await AsyncStorage.setItem(KEY_V2, b64encode(blob));
    await AsyncStorage.removeItem(KEY_V1_LEGACY);
    await AsyncStorage.setItem(MIGRATION_FLAG, String(Date.now()));
    return parsed;
  } catch (e) {
    // パース失敗 = 既に壊れている。リカバーは remote からの再構築に任せる。
    console.warn('[storage/index] v1 migration skipped (parse failed)', e);
    await AsyncStorage.removeItem(KEY_V1_LEGACY).catch(() => {});
    await AsyncStorage.setItem(MIGRATION_FLAG, String(Date.now()));
    return null;
  }
}

export async function loadIndex(): Promise<IndexEntry[]> {
  const master = getMaster();
  if (!master) return [];
  // v1 平文があれば先に v2 へ昇格
  const migrated = await migrateV1IfNeeded();
  const raw = await AsyncStorage.getItem(KEY_V2);
  if (!raw) {
    return migrated ?? [];
  }
  try {
    const blob = b64decode(raw);
    const plain = openGcm(deriveIndexKey(master), blob);
    return JSON.parse(plain.toString('utf8'));
  } catch {
    // 鍵不一致 or 改ざん。ローカルキャッシュは remote から再構築可能なので
    // 黙って空に倒す。
    return [];
  }
}

export async function saveIndex(entries: IndexEntry[]): Promise<void> {
  const master = getMaster();
  if (!master) {
    throw new Error('cannot save index while locked');
  }
  const plain = Buffer.from(JSON.stringify(entries), 'utf8');
  const blob = sealGcm(deriveIndexKey(master), plain);
  await AsyncStorage.setItem(KEY_V2, b64encode(blob));
  // v1 が残っていたら確実に消す (save 経路でも保険)
  await AsyncStorage.removeItem(KEY_V1_LEGACY).catch(() => {});
}

export async function addEntry(e: IndexEntry): Promise<void> {
  const all = await loadIndex();
  all.push(e);
  await saveIndex(all);
}

export async function childrenOf(parentId: string | null): Promise<IndexEntry[]> {
  const all = await loadIndex();
  return all.filter(e => e.parentId === parentId);
}

/**
 * ローカルインデックスを暗号化して S3 にプッシュ (best-effort).
 * 鍵 or バケット未設定なら no-op。失敗してもユーザー操作はブロックしない。
 */
export async function syncIndex(): Promise<void> {
  const { getActiveBucket } = require('@/state/bucketStore');
  const { pushIndex } = require('./encryptedIndex');
  const master = getMaster();
  const bucket = await getActiveBucket();
  if (!master || !bucket) return;
  const all = await loadIndex();
  await pushIndex(master, bucket, all).catch(() => {});
}
