import RNFS from 'react-native-fs';
import { FileEncryptor, FileMeta } from '@/crypto/cipher';
import { DEFAULT_CHUNK_SIZE } from '@/crypto/format';
import { S3_PART_MIN } from '@/config';
import { BucketCredentials } from '@/crypto/keychain';
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  uploadPart,
} from './client';

export interface UploadOptions {
  master: Buffer;
  localPath: string;
  remoteKey: string;
  meta: FileMeta;
  creds: BucketCredentials;
  onProgress?: (sent: number, total: number) => void;
}

/**
 * ローカルファイルをチャンク単位で読み込み、暗号化してマルチパートでS3にアップロード。
 * メモリ常駐は1チャンク分のみ。
 */
export async function encryptAndUpload(opts: UploadOptions): Promise<void> {
  const usageMod = require('@/state/usage');
  const usage = await usageMod.computeUsage(opts.creds.mode);
  usageMod.assertUploadAllowed(usage);
  const stat = await RNFS.stat(opts.localPath);
  const total = Number(stat.size);
  const enc = new FileEncryptor({
    master: opts.master,
    meta: { ...opts.meta, size: total },
  });

  const uploadId = await createMultipartUpload(opts.creds, opts.remoteKey);
  const parts: { partNumber: number; etag: string }[] = [];

  try {
    // 複数チャンクをまとめて S3 マルチパート最小サイズに合わせて送る。
    const PART_MIN = S3_PART_MIN;
    let buffer: Buffer = enc.emitHeader();
    let offset = 0;
    let partNumber = 1;
    let sent = 0;

    while (offset < total) {
      const readSize = Math.min(DEFAULT_CHUNK_SIZE, total - offset);
      const b64 = await RNFS.read(opts.localPath, readSize, offset, 'base64');
      const plain = Buffer.from(b64, 'base64');
      offset += readSize;

      const ctChunk = enc.encryptChunk(plain);
      buffer = Buffer.concat([buffer, ctChunk]);

      if (buffer.length >= PART_MIN || offset >= total) {
        const isLast = offset >= total;
        // 最後以外は PART_MIN 単位で切り出し
        const sendSize = isLast ? buffer.length : Math.floor(buffer.length / PART_MIN) * PART_MIN;
        const toSend = buffer.slice(0, sendSize);
        buffer = buffer.slice(sendSize);
        const etag = await uploadPart(
          opts.creds,
          opts.remoteKey,
          uploadId,
          partNumber,
          toSend,
        );
        parts.push({ partNumber, etag });
        partNumber++;
        sent += toSend.length;
        opts.onProgress?.(sent, total);
      }
    }

    await completeMultipartUpload(opts.creds, opts.remoteKey, uploadId, parts);
  } catch (e) {
    await abortMultipartUpload(opts.creds, opts.remoteKey, uploadId).catch(() => {});
    throw e;
  }
}
