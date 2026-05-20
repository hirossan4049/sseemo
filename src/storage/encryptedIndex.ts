import { openGcm, sealGcm } from '@/crypto/cipher';
import { deriveIndexKey } from '@/crypto/kdf';
import { BucketCredentials } from '@/crypto/keychain';
import { getObject, putObject } from '@/s3/client';
import { IndexEntry } from './index';

const INDEX_KEY = '__secstorage__/index.bin';

/**
 * インデックス(ファイル名・サイズ・ツリー構造) を暗号化してS3に保存。
 * ローカル AsyncStorage には平文を置かない。マネージドサーバーからも見えない。
 */
export async function pushIndex(
  master: Buffer,
  creds: BucketCredentials,
  entries: IndexEntry[],
): Promise<void> {
  const plain = Buffer.from(JSON.stringify(entries), 'utf8');
  const blob = sealGcm(deriveIndexKey(master), plain);
  await putObject(creds, INDEX_KEY, blob, 'application/octet-stream');
}

export async function pullIndex(
  master: Buffer,
  creds: BucketCredentials,
): Promise<IndexEntry[]> {
  let blob: Buffer;
  try {
    blob = await getObject(creds, INDEX_KEY);
  } catch {
    return [];
  }
  const plain = openGcm(deriveIndexKey(master), blob);
  return JSON.parse(plain.toString('utf8'));
}
