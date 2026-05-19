import RNFS from 'react-native-fs';
import QuickCrypto from 'react-native-quick-crypto';
const { createCipheriv, createDecipheriv, randomBytes } = QuickCrypto;
import { NONCE_SIZE, TAG_SIZE } from '@/crypto/format';
import { deriveThumbKey } from '@/crypto/kdf';
import { BucketCredentials } from '@/crypto/keychain';
import { getObject, putObject } from '@/s3/client';

/**
 * サムネイル: 別途暗号化保存。
 * - ローカルキャッシュ (CachesDirectory/thumbs/<id>) で高速表示
 * - S3 にも暗号化アップロード (twins/<id>.t)
 *
 * iOS 側で実画像を縮小生成するのはネイティブモジュール責務。
 * ここでは「縮小済み JPEG バイト列」を入力に取り、暗号化I/Oを扱う。
 */

const CACHE_DIR = `${RNFS.CachesDirectoryPath}/thumbs`;

async function ensureCache(): Promise<void> {
  if (!(await RNFS.exists(CACHE_DIR))) {
    await RNFS.mkdir(CACHE_DIR);
  }
}

export async function saveThumb(
  master: Buffer,
  creds: BucketCredentials,
  id: string,
  smallJpeg: Buffer,
): Promise<void> {
  await ensureCache();
  const key = deriveThumbKey(master);
  const nonce = Buffer.from(randomBytes(NONCE_SIZE) as any);
  const c = createCipheriv('aes-256-gcm', key, nonce);
  const ct = Buffer.concat([c.update(smallJpeg), c.final()]);
  const tag = c.getAuthTag();
  const blob = Buffer.concat([nonce, ct, tag]);
  await RNFS.writeFile(
    `${CACHE_DIR}/${id}`,
    blob.toString('base64'),
    'base64',
  );
  await putObject(creds, `thumbs/${id}.t`, blob, 'application/octet-stream');
}

export async function loadThumb(
  master: Buffer,
  creds: BucketCredentials,
  id: string,
): Promise<Buffer | null> {
  await ensureCache();
  const cachePath = `${CACHE_DIR}/${id}`;
  let blob: Buffer;
  if (await RNFS.exists(cachePath)) {
    blob = Buffer.from(await RNFS.readFile(cachePath, 'base64'), 'base64');
  } else {
    try {
      blob = await getObject(creds, `thumbs/${id}.t`);
      await RNFS.writeFile(cachePath, blob.toString('base64'), 'base64');
    } catch {
      return null;
    }
  }
  const key = deriveThumbKey(master);
  const nonce = blob.slice(0, NONCE_SIZE);
  const tag = blob.slice(blob.length - TAG_SIZE);
  const ct = blob.slice(NONCE_SIZE, blob.length - TAG_SIZE);
  const d = createDecipheriv('aes-256-gcm', key, nonce);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}
