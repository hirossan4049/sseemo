import AsyncStorage from '@react-native-async-storage/async-storage';
import { openGcm, sealGcm } from '@/crypto/cipher';
import { deriveIndexKey } from '@/crypto/kdf';
import { getMaster } from '@/state/keyStore';

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

async function dropLegacyPlaintext(): Promise<void> {
  // 旧バージョンが書いた平文 JSON を残しておくと spec §5 違反のままに
  // なるので積極的に消す。
  try {
    await AsyncStorage.removeItem(KEY_V1_LEGACY);
  } catch {
    /* ignore */
  }
}

export async function loadIndex(): Promise<IndexEntry[]> {
  const master = getMaster();
  if (!master) return [];
  const raw = await AsyncStorage.getItem(KEY_V2);
  if (!raw) {
    await dropLegacyPlaintext();
    return [];
  }
  try {
    const blob = Buffer.from(raw, 'base64');
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
  await AsyncStorage.setItem(KEY_V2, blob.toString('base64'));
  await dropLegacyPlaintext();
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
