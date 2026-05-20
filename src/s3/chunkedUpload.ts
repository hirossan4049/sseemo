import RNFS from 'react-native-fs';
import { FileEncryptor, FileMeta } from '@/crypto/cipher';
import { DEFAULT_CHUNK_SIZE } from '@/crypto/format';
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

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const base64js: {
    fromByteArray: (u: Uint8Array) => string;
    toByteArray: (s: string) => Uint8Array;
  } = require('base64-js');
  const toB64 = (b: Uint8Array): string => {
    const u =
      b.byteOffset === 0 && b.byteLength === b.buffer.byteLength
        ? new Uint8Array(b.buffer)
        : new Uint8Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    return base64js.fromByteArray(u);
  };

  const headerBlob = enc.emitHeader();
  const manifest: ChunkManifest = {
    version: 1,
    header: toB64(headerBlob),
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
      const plainU8 = base64js.toByteArray(b64);
      const plain = Buffer.from(plainU8.buffer, plainU8.byteOffset, plainU8.byteLength);
      offset += readSize;

      const ctChunk = enc.encryptChunk(plain);
      const chunkKey = `${opts.remotePrefix}/${index}.c`;

      if (opts.useBackground) {
        // Background uploader needs a file on disk it can hand to
        // NSURLSession. Materialize the chunk only on this path; the
        // in-memory PUT below feeds putObject directly so we skip the
        // base64 round-trip that drags in the (currently unlinked)
        // native quick-base64 turbomodule.
        const chunkPath = `${tmpDir}/${index}.c`;
        await RNFS.writeFile(chunkPath, toB64(ctChunk), 'base64');
        await backgroundPutObject(opts.creds, chunkKey, chunkPath);
      } else {
        await putObject(opts.creds, chunkKey, ctChunk);
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
    try {
      await usageMod.reportUsageNow();
    } catch {
      /* best-effort */
    }
    try {
      const { notifyOnThreshold } = require('@/state/usageNotify');
      await notifyOnThreshold(opts.creds.mode);
    } catch {
      /* best-effort */
    }
    return manifest;
  } finally {
    if (!opts.useBackground) {
      await RNFS.unlink(tmpDir).catch(() => {});
    }
  }
}

