import RNFS from 'react-native-fs';
import { FileEncryptor, FileMeta } from '@/crypto/cipher';
import { DEFAULT_CHUNK_SIZE, HEADER_SIZE } from '@/crypto/format';
import { BucketCredentials } from '@/crypto/keychain';
import { putObject } from './client';
import { backgroundPutObject } from './backgroundUpload';

/**
 * 大ファイル向け: 真のストリーミング暗号化アップロード。
 *
 * - 入力ファイルを {chunkSize} 単位で逐次読み込み、各チャンクを独立に AES-256-GCM 暗号化
 * - 1チャンク = 1サイドカーファイルとして書き出す
 * - 各サイドカーは NSURLSession Background (react-native-background-upload) で個別アップロード
 * - 復号に必要なヘッダ・メタ・チャンクキー一覧は JSON manifest にして同梱
 *
 * これにより
 *   - メモリ常駐は 1 チャンク分のみ (spec §12 ストリーミング暗号化)
 *   - 各チャンク独立認証 (spec §5)
 *   - バックグラウンドでも個別ファイルとして OS が継続送信可能
 *
 * オブジェクトレイアウト:
 *   <remotePrefix>/manifest.json        - sidecar manifest (暗号ヘッダ + メタ + chunkキー配列)
 *   <remotePrefix>/<index>.c            - 各暗号化チャンク (nonce||ct||tag)
 *
 * ヘッダは従来の SSF1 形式と互換。CLI でも復号できるよう、
 * manifest.json から1本の .ssf ファイルへ結合可能なフォーマットを採用。
 */

export interface ChunkedUploadOptions {
  master: Buffer;
  localPath: string;
  remotePrefix: string; // e.g. "files/<id>"
  meta: FileMeta;
  creds: BucketCredentials;
  chunkSize?: number;
  useBackground?: boolean;
  onProgress?: (sent: number, total: number) => void;
}

export interface ChunkManifest {
  version: 1;
  /** SSF1 ヘッダ + 暗号化メタ (base64) */
  header: string;
  chunkSize: number;
  plainSize: number;
  chunks: { index: number; key: string; size: number }[];
}

export async function encryptAndUploadChunked(
  opts: ChunkedUploadOptions,
): Promise<ChunkManifest> {
  const usageMod = require('@/state/usage');
  const usage = await usageMod.computeUsage(opts.creds.mode);
  usageMod.assertUploadAllowed(usage);

  const stat = await RNFS.stat(opts.localPath);
  const total = Number(stat.size);
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const enc = new FileEncryptor({
    master: opts.master,
    meta: { ...opts.meta, size: total },
    chunkSize,
  });

  const tmpDir = `${RNFS.CachesDirectoryPath}/ssf-chunks/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  await RNFS.mkdir(tmpDir);

  const headerBlob = enc.emitHeader();
  const manifest: ChunkManifest = {
    version: 1,
    header: headerBlob.toString('base64'),
    chunkSize,
    plainSize: total,
    chunks: [],
  };

  let offset = 0;
  let sent = 0;
  let index = 0;
  try {
    while (offset < total) {
      const readSize = Math.min(chunkSize, total - offset);
      const b64 = await RNFS.read(opts.localPath, readSize, offset, 'base64');
      const plain = Buffer.from(b64, 'base64');
      offset += readSize;

      const ctChunk = enc.encryptChunk(plain);
      const chunkKey = `${opts.remotePrefix}/${index}.c`;
      const chunkPath = `${tmpDir}/${index}.c`;
      await RNFS.writeFile(chunkPath, ctChunk.toString('base64'), 'base64');

      if (opts.useBackground) {
        await backgroundPutObject(opts.creds, chunkKey, chunkPath);
      } else {
        await putObject(opts.creds, chunkKey, ctChunk);
        await RNFS.unlink(chunkPath).catch(() => {});
      }

      manifest.chunks.push({ index, key: chunkKey, size: ctChunk.length });
      sent += ctChunk.length;
      opts.onProgress?.(sent, total);
      index++;
    }

    const manifestBuf = Buffer.from(JSON.stringify(manifest), 'utf8');
    await putObject(
      opts.creds,
      `${opts.remotePrefix}/manifest.json`,
      manifestBuf,
      'application/json',
    );
    return manifest;
  } finally {
    if (!opts.useBackground) {
      await RNFS.unlink(tmpDir).catch(() => {});
    }
  }
}

/** manifest を含むサイドカー群を 1 本の SSF1 ファイルに連結 (CLI 互換) */
export function assembleSSF1(
  manifest: ChunkManifest,
  chunkBlobs: Buffer[],
): Buffer {
  if (chunkBlobs.length !== manifest.chunks.length)
    throw new Error('chunk count mismatch');
  const header = Buffer.from(manifest.header, 'base64');
  if (header.length < HEADER_SIZE) throw new Error('bad header');
  return Buffer.concat([header, ...chunkBlobs]);
}
