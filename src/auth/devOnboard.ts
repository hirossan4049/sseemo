/**
 * Dev-only programmatic onboarding + managed-backend roundtrip verifier.
 *
 * Used by the simulator E2E flow: Sign in with Apple is unreliable on the
 * simulator, so we drive onboarding via a deeplink that carries the shared
 * DEV_AUTH_TOKEN nonce. The endpoint (POST /auth/dev) on the backend is gated
 * by env (`ALLOW_DEV_AUTH=true`) so this is safe to ship; flip the env off
 * and the path goes cold.
 *
 * The code stays in the repo permanently because the dev button on
 * WelcomeScreen is gated by `__DEV__`, and the backend gate is server-side.
 */

import RNFS from 'react-native-fs';
import QuickCrypto from 'react-native-quick-crypto';
// Use pure-JS base64 conversion for the verify helper. The app's global
// Buffer (craftzdog's react-native-buffer) delegates toString('base64')
// to a native TurboModule (NativeQuickBase64.base64FromArrayBuffer)
// that isn't auto-linked in this iOS build. RNFS only accepts base64
// strings for binary writes, so we route the verify fixture I/O through
// base64-js directly to avoid that gap. The encryption + upload +
// index code paths remain unchanged; they read base64 from RNFS and
// feed bytes into the same chunked encryptor/decryptor the real app
// uses.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const base64js: {
  fromByteArray: (u: Uint8Array) => string;
  toByteArray: (s: string) => Uint8Array;
} = require('base64-js');
import { BucketCredentials, saveMnemonic, loadMnemonic } from '@/crypto/keychain';
import { addBucket } from '@/state/bucketStore';
import { generate12WordMnemonic } from '@/crypto/mnemonic';
import { unlock, getMaster } from '@/state/keyStore';
import {
  putObject,
  getObject,
  getServerUsage,
  deleteAccount,
} from '@/s3/managedClient';
import { encryptAndUploadChunked } from '@/s3/chunkedUpload';
import { downloadAndDecryptChunked } from '@/s3/chunkedDownload';
import { pushIndex, pullIndex } from '@/storage/encryptedIndex';
import { IndexEntry } from '@/storage/index';
import { MANAGED_BACKEND_URL } from '@/config';

export interface DevOnboardParams {
  backendUrl?: string;
  token: string;
  deviceTag?: string;
  /** If true, run the single 200KB upload/download/verify roundtrip. */
  verify?: boolean;
  /** If true, run the 6-fixture multi-file matrix (encrypted index too). */
  verifyMulti?: boolean;
  /** If true, call DELETE /account at the end (cleans the test user). */
  cleanup?: boolean;
}

/** Calls POST /auth/dev to mint a session JWT. */
export async function authDev(
  backendUrl: string,
  token: string,
  deviceTag: string,
): Promise<{ token: string; userId: string }> {
  const r = await fetch(`${backendUrl.replace(/\/$/, '')}/auth/dev`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, deviceTag }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`auth/dev failed: ${r.status} ${t}`);
  }
  return r.json() as any;
}

/**
 * Drive the entire onboarding + (optional) roundtrip programmatically.
 * Logs progress with `[VERIFY] ...` lines so the simulator log stream can be
 * grepped for `[VERIFY] managed roundtrip OK`.
 */
export async function runDevOnboard(p: DevOnboardParams): Promise<void> {
  const backendUrl = p.backendUrl ?? MANAGED_BACKEND_URL;
  const deviceTag = p.deviceTag ?? 'sim';
  console.log(`[VERIFY] devOnboard start backend=${backendUrl} tag=${deviceTag}`);

  const { token: jwt, userId } = await authDev(backendUrl, p.token, deviceTag);
  console.log(`[VERIFY] devOnboard authed userId=${userId}`);

  const creds: BucketCredentials = {
    id: `managed-${userId}`,
    mode: 'managed',
    endpoint: backendUrl,
    region: 'auto',
    bucket: 'managed',
    accessKeyId: '',
    secretAccessKey: '',
    backendUrl,
    sessionToken: jwt,
  };
  await addBucket(creds);
  console.log('[VERIFY] devOnboard bucket saved');

  if (!(await loadMnemonic())) {
    const mnemonic = generate12WordMnemonic();
    await saveMnemonic(mnemonic);
    await unlock();
    console.log('[VERIFY] devOnboard mnemonic generated');
  }

  if (p.verify) {
    await runManagedRoundtrip(creds);
  }
  if (p.verifyMulti) {
    await runMultiFileRoundtrip(creds);
  }
  if (p.cleanup) {
    await deleteAccount(creds);
    console.log('[VERIFY] devOnboard account deleted');
  }
}

/**
 * Generates a random in-memory blob, uploads via the managed client, fetches
 * /usage, downloads, asserts the bytes match, then logs the canonical
 * `[VERIFY] managed roundtrip OK bytes=<n>` line.
 */
export async function runManagedRoundtrip(creds: BucketCredentials): Promise<void> {
  const size = 200 * 1024;
  const buf = Buffer.alloc(size);
  for (let i = 0; i < size; i++) buf[i] = (i * 1103515245 + 12345) & 0xff;
  const key = `verify-${Date.now()}.bin`;

  const before = await getServerUsage(creds);
  console.log(`[VERIFY] usage before=${JSON.stringify(before)}`);

  await putObject(creds, key, buf, 'application/octet-stream');
  console.log(`[VERIFY] uploaded key=${key} bytes=${size}`);

  const after = await getServerUsage(creds);
  console.log(`[VERIFY] usage after=${JSON.stringify(after)}`);
  if (after.usedBytes < before.usedBytes + size) {
    throw new Error(
      `[VERIFY] usage did not grow: before=${before.usedBytes} after=${after.usedBytes}`,
    );
  }

  const got = await getObject(creds, key);
  if (got.length !== size) {
    throw new Error(`[VERIFY] size mismatch: ${got.length} != ${size}`);
  }
  for (let i = 0; i < size; i++) {
    if (got[i] !== buf[i]) throw new Error(`[VERIFY] byte mismatch @ ${i}`);
  }

  console.log(`[VERIFY] managed roundtrip OK bytes=${size}`);
}

/* ------------------------------------------------------------------ *
 * Multi-file matrix verifier.
 *
 * Mirrors the Node E2E fixture coverage (tiny.txt, image.jpg, doc.pdf,
 * 5MiB binary, 32MiB binary, unicode-named markdown) but runs end-to-end
 * inside the iOS simulator JS runtime, hitting the exact same crypto +
 * chunked-upload + presign + R2 PUT + commit + presign-GET + decrypt
 * code paths an interactive user upload would take.
 * ------------------------------------------------------------------ */

interface Fixture {
  label: string;
  name: string;
  bytes: Buffer;
  mime?: string;
}

function jpegHeader(): Buffer {
  return Buffer.from('ffd8ffe000104a46494600010100000100010000', 'hex');
}
function pseudoRandom(size: number, seed: number): Buffer {
  // LCG: avoids huge true-RNG calls in the JS runtime and gives us
  // deterministic bytes. The actual encryption/transport is real.
  const b = Buffer.alloc(size);
  let s = seed >>> 0;
  for (let i = 0; i < size; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    b[i] = s & 0xff;
  }
  return b;
}

function makeFixtures(): Fixture[] {
  const out: Fixture[] = [];
  out.push({
    label: 'tiny.txt',
    name: 'tiny.txt',
    bytes: Buffer.from('hello world', 'utf8'),
    mime: 'text/plain',
  });
  out.push({
    label: 'image.jpg',
    name: 'image.jpg',
    bytes: Buffer.concat([
      jpegHeader(),
      pseudoRandom(100 * 1024, 0xa11ce),
      Buffer.from('ffd9', 'hex'),
    ]),
    mime: 'image/jpeg',
  });
  out.push({
    label: 'doc.pdf',
    name: 'doc.pdf',
    bytes: Buffer.concat([
      Buffer.from('%PDF-1.4\n', 'utf8'),
      pseudoRandom(50 * 1024, 0xbeef),
      Buffer.from('\n%%EOF\n', 'utf8'),
    ]),
    mime: 'application/pdf',
  });
  out.push({
    label: 'bigbinary.bin',
    name: 'bigbinary.bin',
    bytes: pseudoRandom(5 * 1024 * 1024, 0xc0ffee),
    mime: 'application/octet-stream',
  });
  out.push({
    label: 'largevideo.mov',
    name: 'largevideo.mov',
    bytes: pseudoRandom(32 * 1024 * 1024, 0xd00d),
    mime: 'video/quicktime',
  });
  out.push({
    label: 'unicode-名前.md',
    name: 'unicode-名前.md',
    bytes: Buffer.from('# 日本語タイトル\n' + 'あいうえお'.repeat(100), 'utf8'),
    mime: 'text/markdown',
  });
  return out;
}

function sha256Hex(b: Buffer): string {
  const h = QuickCrypto.createHash('sha256');
  h.update(b);
  return (h.digest('hex') as unknown) as string;
}

function toBase64Pure(buf: Uint8Array): string {
  // Force a fresh Uint8Array view so base64-js sees a clean ArrayBuffer
  // range regardless of which Buffer flavor the caller produced.
  const u8 =
    buf instanceof Uint8Array && buf.byteOffset === 0 && buf.byteLength === buf.buffer.byteLength
      ? buf
      : new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return base64js.fromByteArray(u8);
}

async function writeBufferToTmp(buf: Buffer, suffix: string): Promise<string> {
  const dir = `${RNFS.CachesDirectoryPath}/ssf-verify`;
  await RNFS.mkdir(dir).catch(() => {});
  const p = `${dir}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${suffix}`;
  await RNFS.writeFile(p, toBase64Pure(buf), 'base64');
  return p;
}

async function readFileToBuffer(path: string): Promise<Buffer> {
  const b64 = await RNFS.readFile(path, 'base64');
  const u8 = base64js.toByteArray(b64);
  return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);
}

export async function runMultiFileRoundtrip(creds: BucketCredentials): Promise<void> {
  const master = getMaster();
  if (!master) throw new Error('[VERIFY] multi: master key not unlocked');

  const fixtures = makeFixtures();
  let passing = 0;
  const indexEntries: IndexEntry[] = [];

  for (let i = 0; i < fixtures.length; i++) {
    const f = fixtures[i];
    const caseNum = i + 1;
    const expectedSha = sha256Hex(f.bytes);
    try {
      console.log(
        `[VERIFY] case=${caseNum} name=${f.label} bytes=${f.bytes.length} starting sha256=${expectedSha}`,
      );
      const id = `verify-${caseNum}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const remotePrefix = `files/${id}`;

      const inPath = await writeBufferToTmp(f.bytes, 'in.bin');
      // Real chunked upload: encrypts in 1MiB chunks, presigns each sidecar
      // PUT, posts /storage/commit on the manifest. Same path PhotoImport uses.
      const manifest = await encryptAndUploadChunked({
        master,
        localPath: inPath,
        remotePrefix,
        meta: { name: f.name, mime: f.mime, size: f.bytes.length },
        creds,
      });

      const outPath = `${RNFS.CachesDirectoryPath}/ssf-verify/out-${id}.bin`;
      await downloadAndDecryptChunked({
        master,
        creds,
        remotePrefix,
        localPath: outPath,
      });
      const got = await readFileToBuffer(outPath);
      const gotSha = sha256Hex(got);
      const ok = got.length === f.bytes.length && gotSha === expectedSha;
      if (!ok) {
        console.log(
          `[VERIFY] case=${caseNum} name=${f.label} bytes=${got.length} sha256=${gotSha} ok=false reason=size_or_sha_mismatch expected=${expectedSha}`,
        );
        // cleanup tmp files (best-effort)
        await RNFS.unlink(inPath).catch(() => {});
        await RNFS.unlink(outPath).catch(() => {});
        continue;
      }
      console.log(
        `[VERIFY] case=${caseNum} name=${f.label} bytes=${got.length} sha256=${gotSha} ok=true chunks=${manifest.chunks.length}`,
      );

      indexEntries.push({
        id,
        remoteKey: remotePrefix,
        name: f.name,
        mime: f.mime,
        size: manifest.chunks.reduce((s, c) => s + c.size, 0),
        plainSize: f.bytes.length,
        parentId: null,
        isFolder: false,
        ctime: Date.now(),
        mtime: Date.now(),
        bucketId: creds.id,
      });
      passing++;
      await RNFS.unlink(inPath).catch(() => {});
      await RNFS.unlink(outPath).catch(() => {});
    } catch (e: any) {
      console.log(
        `[VERIFY] case=${caseNum} name=${f.label} bytes=${f.bytes.length} ok=false reason=${e?.message ?? e}`,
      );
    }
  }

  // Encrypted index roundtrip — proves unicode filenames survive the
  // round-trip through /index (the same blob put/get the real app uses).
  try {
    await pushIndex(master, creds, indexEntries);
    const back = await pullIndex(master, creds);
    const unicode = back.find(e => e.name === 'unicode-名前.md');
    console.log(
      `[VERIFY] encrypted index entries=${back.length} unicodeNameOk=${
        unicode ? 'true' : 'false'
      }`,
    );
  } catch (e: any) {
    console.log(`[VERIFY] encrypted index failed: ${e?.message ?? e}`);
  }

  try {
    const usage = await getServerUsage(creds);
    console.log(`[VERIFY] final usage=${JSON.stringify(usage)}`);
  } catch (e: any) {
    console.log(`[VERIFY] final usage failed: ${e?.message ?? e}`);
  }

  try {
    await deleteAccount(creds);
    console.log('[VERIFY] account deleted (multi cleanup)');
  } catch (e: any) {
    console.log(`[VERIFY] account delete failed: ${e?.message ?? e}`);
  }

  if (passing === fixtures.length) {
    console.log(`[VERIFY] multi roundtrip ALL OK cases=${fixtures.length}`);
  } else {
    console.log(
      `[VERIFY] multi roundtrip FAILED passing=${passing}/${fixtures.length}`,
    );
  }
}
