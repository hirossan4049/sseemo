import QuickCrypto from 'react-native-quick-crypto';
const { randomBytes, createCipheriv, createDecipheriv } = QuickCrypto;
import { deriveIndexKey } from '@/crypto/kdf';
import { NONCE_SIZE, TAG_SIZE } from '@/crypto/format';
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
  const key = deriveIndexKey(master);
  const nonce = Buffer.from(randomBytes(NONCE_SIZE) as any);
  const plain = Buffer.from(JSON.stringify(entries), 'utf8');
  const c = createCipheriv('aes-256-gcm', key, nonce);
  const ct = Buffer.concat([c.update(plain), c.final()]);
  const tag = c.getAuthTag();
  const blob = Buffer.concat([nonce, ct, tag]);
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
  const key = deriveIndexKey(master);
  const nonce = blob.slice(0, NONCE_SIZE);
  const tag = blob.slice(blob.length - TAG_SIZE);
  const ct = blob.slice(NONCE_SIZE, blob.length - TAG_SIZE);
  const d = createDecipheriv('aes-256-gcm', key, nonce);
  d.setAuthTag(tag);
  const plain = Buffer.concat([d.update(ct), d.final()]);
  return JSON.parse(plain.toString('utf8'));
}
