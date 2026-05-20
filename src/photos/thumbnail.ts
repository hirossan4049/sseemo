import RNFS from 'react-native-fs';
import { openGcm, sealGcm } from '@/crypto/cipher';
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
  const blob = sealGcm(deriveThumbKey(master), smallJpeg);
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
  return openGcm(deriveThumbKey(master), blob);
}
