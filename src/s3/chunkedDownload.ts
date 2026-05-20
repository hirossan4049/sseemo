import RNFS from 'react-native-fs';
import { FileDecryptor } from '@/crypto/cipher';
import { BucketCredentials } from '@/crypto/keychain';
import { getObject } from './client';
import { ChunkManifest } from './chunkedUpload';

export interface ChunkedDownloadOptions {
  master: Buffer;
  creds: BucketCredentials;
  remotePrefix: string;
  localPath: string;
  onProgress?: (recv: number, total: number) => void;
}

export async function downloadAndDecryptChunked(
  opts: ChunkedDownloadOptions,
): Promise<void> {
  const manifestBuf = await getObject(
    opts.creds,
    `${opts.remotePrefix}/manifest.json`,
  );
  const manifest: ChunkManifest = JSON.parse(manifestBuf.toString('utf8'));
  const header = Buffer.from(manifest.header, 'base64');

  const dec = new FileDecryptor();
  dec.init(opts.master, header);

  await RNFS.writeFile(opts.localPath, '', 'base64');
  let written = 0;
  for (const c of manifest.chunks) {
    const blob = await getObject(opts.creds, c.key);
    const plain = dec.decryptChunk(blob);
    await RNFS.appendFile(opts.localPath, plain.toString('base64'), 'base64');
    written += plain.length;
    opts.onProgress?.(written, manifest.plainSize);
  }
}
