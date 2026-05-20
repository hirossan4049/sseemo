import RNFS from 'react-native-fs';
import { FileDecryptor } from '@/crypto/cipher';
import { BucketCredentials } from '@/crypto/keychain';
import { getObject } from './client';
import { ChunkManifest } from './chunkedUpload';

// Pure-JS base64 for the disk-write hop. The app's global Buffer
// (craftzdog's react-native-buffer) routes toString('base64') through
// a native TurboModule that isn't auto-linked here.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const base64js: {
  fromByteArray: (u: Uint8Array) => string;
  toByteArray: (s: string) => Uint8Array;
} = require('base64-js');

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
  const headerU8 = base64js.toByteArray(manifest.header);
  const header = Buffer.from(headerU8.buffer, headerU8.byteOffset, headerU8.byteLength);

  const dec = new FileDecryptor();
  dec.init(opts.master, header);

  await RNFS.writeFile(opts.localPath, '', 'base64');
  let written = 0;
  for (const c of manifest.chunks) {
    const blob = await getObject(opts.creds, c.key);
    const plain = dec.decryptChunk(blob);
    const u8 =
      plain.byteOffset === 0 && plain.byteLength === plain.buffer.byteLength
        ? new Uint8Array(plain.buffer)
        : new Uint8Array(plain.buffer.slice(plain.byteOffset, plain.byteOffset + plain.byteLength));
    await RNFS.appendFile(opts.localPath, base64js.fromByteArray(u8), 'base64');
    written += plain.length;
    opts.onProgress?.(written, manifest.plainSize);
  }
}
