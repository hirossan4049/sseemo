import RNFS from 'react-native-fs';
import { FileDecryptor } from '@/crypto/cipher';
import {
  DEFAULT_CHUNK_SIZE,
  HEADER_SIZE,
  NONCE_SIZE,
  TAG_SIZE,
} from '@/crypto/format';
import { BucketCredentials } from '@/crypto/keychain';
import { getObject } from './client';
import { b64encode } from '@/crypto/base64';

export interface DownloadOptions {
  master: Buffer;
  remoteKey: string;
  localPath: string;
  creds: BucketCredentials;
  onProgress?: (recv: number, total: number) => void;
}

/**
 * 暗号化済みS3オブジェクトを範囲取得しつつ復号、ローカルに書き出す。
 */
export async function downloadAndDecrypt(opts: DownloadOptions): Promise<void> {
  const dec = new FileDecryptor();
  // ヘッダ+メタを先読み（とりあえず 8KiB）
  const head = await getObject(opts.creds, opts.remoteKey, [0, 8 * 1024 - 1]);
  const { header } = dec.init(opts.master, head);
  const metaEnd = HEADER_SIZE + header.metaLen;

  await RNFS.writeFile(opts.localPath, '', 'base64');

  let offset = metaEnd;
  let written = 0;
  const ctChunkSize = NONCE_SIZE + header.chunkSize + TAG_SIZE;
  // 既に head にいくつかチャンクが含まれているかも
  let buffered = head.slice(metaEnd);
  let eof = head.length < 8 * 1024;

  while (!eof || buffered.length > 0) {
    if (buffered.length < ctChunkSize && !eof) {
      const fetched = await getObject(opts.creds, opts.remoteKey, [
        offset + buffered.length - (head.length - metaEnd) + metaEnd,
        offset + buffered.length - (head.length - metaEnd) + metaEnd + ctChunkSize * 4 - 1,
      ]).catch(() => null);
      if (!fetched || fetched.length === 0) {
        eof = true;
      } else {
        buffered = Buffer.concat([buffered, fetched]);
        offset += fetched.length;
      }
      continue;
    }
    const take = Math.min(ctChunkSize, buffered.length);
    const blob = buffered.slice(0, take);
    buffered = buffered.slice(take);
    const plain = dec.decryptChunk(blob);
    await RNFS.appendFile(opts.localPath, b64encode(plain), 'base64');
    written += plain.length;
    opts.onProgress?.(written, header.plainSize);
    if (eof && buffered.length === 0) break;
  }
}
