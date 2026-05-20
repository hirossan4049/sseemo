/**
 * End-to-end test against the live managed-mode backend.
 *
 * Only runs when E2E_BACKEND_URL is set; otherwise the suite is skipped so it
 * never slows local CI. The test reimplements the SSF1 chunked-sidecar format
 * in pure Node (crypto + fetch + fs) so it can exercise the same on-wire
 * contract the React Native client speaks, without pulling RN-only modules
 * (react-native-quick-crypto, react-native-fs) into Jest.
 *
 * Auth: requires a session JWT. In the temporary E2E setup we mint one via
 * `/debug/mint-jwt` (nonce-gated). Provide either E2E_SESSION_TOKEN directly
 * or E2E_DEBUG_NONCE so the test can mint its own.
 *
 * Coverage:
 *   - small text (11B), small JPEG (~100KB), small PDF (~50KB),
 *     5 MiB binary (multi-chunk manifest),
 *     32 MiB random (large but kept under multipart-threshold for putObject;
 *     each sidecar chunk is its own PUT so we still cross the >1 MiB chunk
 *     boundary many times),
 *     unicode-named markdown.
 *   - each file round-trips via presigned PUTs + manifest PUT + index PUT,
 *     then is fetched back via presigned GETs and decrypted byte-for-byte.
 *   - CLI decrypt (cli/decrypt.ts --manifest) is invoked on the
 *     downloaded artefacts to prove the offline decrypt path works on
 *     backend-served data.
 *   - /usage is within ±1% of sum(encrypted bytes).
 *   - DELETE /account wipes the user; subsequent /usage is rejected.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { mnemonicToSeedSync } from '@scure/bip39';

const BACKEND = process.env.E2E_BACKEND_URL;
const DEBUG_NONCE = process.env.E2E_DEBUG_NONCE;
const SESSION_TOKEN = process.env.E2E_SESSION_TOKEN;

const maybe = BACKEND ? describe : describe.skip;

// ---------------- crypto primitives (mirrors src/crypto/*.ts) ----------------

const MAGIC = Buffer.from('SSF1', 'ascii');
const HEADER_SIZE = 64;
const NONCE_SIZE = 12;
const TAG_SIZE = 16;
const FILE_SALT_SIZE = 16;
const DEFAULT_CHUNK_SIZE = 1024 * 1024;

function hkdf(ikm: Buffer, salt: Buffer, info: Buffer, length: number): Buffer {
  const prk = createHmac('sha256', salt).update(ikm).digest();
  const out = Buffer.alloc(length);
  let prev: Buffer = Buffer.alloc(0);
  let pos = 0;
  for (let i = 1; pos < length; i++) {
    prev = createHmac('sha256', prk)
      .update(Buffer.concat([prev, info, Buffer.from([i])]))
      .digest();
    prev.copy(out, pos);
    pos += prev.length;
  }
  return out.slice(0, length);
}

function chunkNonce(prefix: Buffer, counter: number): Buffer {
  const n = Buffer.alloc(NONCE_SIZE);
  prefix.copy(n, 0);
  n.writeBigUInt64LE(BigInt(counter), 4);
  return n;
}

function gcmEnc(key: Buffer, nonce: Buffer, p: Buffer): Buffer {
  const c = createCipheriv('aes-256-gcm', key, nonce);
  const ct = Buffer.concat([c.update(p), c.final()]);
  return Buffer.concat([ct, c.getAuthTag()]);
}
function gcmDec(key: Buffer, nonce: Buffer, ctTag: Buffer): Buffer {
  const ct = ctTag.slice(0, ctTag.length - TAG_SIZE);
  const tag = ctTag.slice(ctTag.length - TAG_SIZE);
  const d = createDecipheriv('aes-256-gcm', key, nonce);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}
function sealGcm(key: Buffer, p: Buffer): Buffer {
  const n = randomBytes(NONCE_SIZE);
  return Buffer.concat([n, gcmEnc(key, n, p)]);
}
function openGcm(key: Buffer, blob: Buffer): Buffer {
  return gcmDec(key, blob.slice(0, NONCE_SIZE), blob.slice(NONCE_SIZE));
}

interface Manifest {
  version: 1;
  header: string; // base64 SSF1 header + encrypted meta
  chunkSize: number;
  plainSize: number;
  chunks: { index: number; key: string; size: number }[];
}

function encryptToManifest(
  master: Buffer,
  plain: Buffer,
  meta: { name: string; mime?: string },
  chunkSize: number,
  remotePrefix: string,
): { manifest: Manifest; chunkBlobs: Buffer[]; fileKey: Buffer } {
  const fileSalt = randomBytes(FILE_SALT_SIZE);
  const fileKey = hkdf(master, fileSalt, Buffer.from('SSF1/file'), 32);
  const noncePrefix = randomBytes(4);

  const metaPlain = Buffer.from(
    JSON.stringify({ ...meta, size: plain.length }),
    'utf8',
  );
  const metaNonce = chunkNonce(noncePrefix, 0);
  const metaBlob = Buffer.concat([metaNonce, gcmEnc(fileKey, metaNonce, metaPlain)]);

  const header = Buffer.alloc(HEADER_SIZE);
  MAGIC.copy(header, 0);
  header.writeUInt8(1, 4);
  header.writeUInt8(1, 5);
  fileSalt.copy(header, 8);
  header.writeUInt32LE(chunkSize, 24);
  header.writeBigUInt64LE(BigInt(plain.length), 28);
  header.writeUInt32LE(metaBlob.length, 36);

  const chunkBlobs: Buffer[] = [];
  const chunks: Manifest['chunks'] = [];
  let counter = 1;
  let idx = 0;
  for (let off = 0; off < plain.length; off += chunkSize) {
    const slice = plain.slice(off, Math.min(off + chunkSize, plain.length));
    const nonce = chunkNonce(noncePrefix, counter++);
    const blob = Buffer.concat([nonce, gcmEnc(fileKey, nonce, slice)]);
    chunkBlobs.push(blob);
    chunks.push({ index: idx, key: `${remotePrefix}/${idx}.c`, size: blob.length });
    idx++;
  }
  // Edge: empty file still wants a single chunk of length 0 so download has
  // something to fetch. None of our test inputs are empty.
  const manifest: Manifest = {
    version: 1,
    header: Buffer.concat([header, metaBlob]).toString('base64'),
    chunkSize,
    plainSize: plain.length,
    chunks,
  };
  return { manifest, chunkBlobs, fileKey };
}

function decryptManifest(master: Buffer, manifest: Manifest, chunkBlobs: Buffer[]): Buffer {
  const hm = Buffer.from(manifest.header, 'base64');
  if (!hm.slice(0, 4).equals(MAGIC)) throw new Error('bad magic');
  const fileSalt = hm.slice(8, 24);
  const metaLen = hm.readUInt32LE(36);
  const fileKey = hkdf(master, fileSalt, Buffer.from('SSF1/file'), 32);
  // meta sanity-check (decrypt or throw)
  const mb = hm.slice(HEADER_SIZE, HEADER_SIZE + metaLen);
  gcmDec(fileKey, mb.slice(0, NONCE_SIZE), mb.slice(NONCE_SIZE));
  const out: Buffer[] = [];
  for (const b of chunkBlobs) {
    out.push(gcmDec(fileKey, b.slice(0, NONCE_SIZE), b.slice(NONCE_SIZE)));
  }
  return Buffer.concat(out);
}

// ---------------- backend client ----------------

class Client {
  constructor(public base: string, public token: string) {}
  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { authorization: `Bearer ${this.token}`, ...extra };
  }
  async post<T>(path: string, body: unknown): Promise<T> {
    const r = await fetch(`${this.base}${path}`, {
      method: 'POST',
      headers: this.headers({ 'content-type': 'application/json' }),
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error(`POST ${path} ${r.status}: ${t}`);
    }
    return (await r.json()) as T;
  }
  async presignPut(key: string, contentLength: number) {
    return this.post<{ url: string; reservationId: string }>('/storage/presign', {
      op: 'put',
      key,
      contentLength,
    });
  }
  async presignGet(key: string) {
    return this.post<{ url: string }>('/storage/presign', { op: 'get', key });
  }
  async commitPut(reservationId: string) {
    await this.post('/storage/commit', { op: 'put', reservationId });
  }
  async putBlob(key: string, body: Buffer, contentType = 'application/octet-stream') {
    const p = await this.presignPut(key, body.length);
    const r = await fetch(p.url, {
      method: 'PUT',
      headers: {
        'content-type': contentType,
        'content-length': String(body.length),
      },
      body: body as any,
    });
    if (!r.ok) throw new Error(`PUT ${key} ${r.status}: ${await r.text().catch(() => '')}`);
    await this.commitPut(p.reservationId);
  }
  async getBlob(key: string): Promise<Buffer> {
    const p = await this.presignGet(key);
    const r = await fetch(p.url);
    if (!r.ok) throw new Error(`GET ${key} ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }
  async putIndex(blob: Buffer) {
    const r = await fetch(`${this.base}/index`, {
      method: 'PUT',
      headers: this.headers({ 'content-type': 'application/octet-stream' }),
      body: blob as any,
    });
    if (!r.ok) throw new Error(`PUT /index ${r.status}`);
  }
  async getIndex(): Promise<Buffer | null> {
    const r = await fetch(`${this.base}/index`, { headers: this.headers() });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`GET /index ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }
  async usage(): Promise<{ usedBytes: number; reservedBytes: number; limitBytes: number }> {
    const r = await fetch(`${this.base}/usage`, { headers: this.headers() });
    if (!r.ok) throw new Error(`GET /usage ${r.status}`);
    return (await r.json()) as any;
  }
  async deleteAccount() {
    const r = await fetch(`${this.base}/account`, {
      method: 'DELETE',
      headers: this.headers(),
    });
    if (!r.ok) throw new Error(`DELETE /account ${r.status}`);
  }
}

async function mintJwt(base: string, nonce: string, sub: string): Promise<string> {
  const r = await fetch(`${base}/debug/mint-jwt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-debug-nonce': nonce },
    body: JSON.stringify({ sub }),
  });
  if (!r.ok) throw new Error(`mint ${r.status}: ${await r.text().catch(() => '')}`);
  const j = (await r.json()) as { token: string };
  return j.token;
}

// ---------------- test ----------------

interface Fixture {
  label: string;
  name: string;
  bytes: Buffer;
}

function makeFixtures(): Fixture[] {
  const out: Fixture[] = [];
  out.push({
    label: 'tiny.txt',
    name: 'tiny.txt',
    bytes: Buffer.from('hello world', 'utf8'),
  });
  // JPEG: SOI + APP0 (JFIF) + random body + EOI. ~100 KB.
  const jpegHeader = Buffer.from(
    'ffd8ffe000104a46494600010100000100010000',
    'hex',
  );
  const jpegEOI = Buffer.from('ffd9', 'hex');
  const jpegBody = randomBytes(100 * 1024);
  out.push({
    label: 'image.jpg',
    name: 'image.jpg',
    bytes: Buffer.concat([jpegHeader, jpegBody, jpegEOI]),
  });
  // PDF: %PDF-1.4 header + body + %%EOF.
  const pdfHeader = Buffer.from('%PDF-1.4\n', 'utf8');
  const pdfTrailer = Buffer.from('\n%%EOF\n', 'utf8');
  out.push({
    label: 'doc.pdf',
    name: 'doc.pdf',
    bytes: Buffer.concat([pdfHeader, randomBytes(50 * 1024), pdfTrailer]),
  });
  out.push({
    label: 'bigbinary.bin',
    name: 'bigbinary.bin',
    bytes: randomBytes(5 * 1024 * 1024),
  });
  out.push({
    label: 'largevideo.mov',
    name: 'largevideo.mov',
    bytes: randomBytes(32 * 1024 * 1024),
  });
  out.push({
    label: 'unicode-名前.md',
    name: 'unicode-名前.md',
    bytes: Buffer.from('# 日本語タイトル\n' + 'あいうえお'.repeat(100), 'utf8'),
  });
  return out;
}

function sha256(b: Buffer): string {
  return createHash('sha256').update(b).digest('hex');
}

maybe('E2E managed backend round-trip', () => {
  jest.setTimeout(10 * 60 * 1000);

  const base = (BACKEND as string).replace(/\/$/, '');
  const sub = `e2e-test-${Date.now()}`;
  let client: Client;
  let master: Buffer;
  let tmpRoot: string;
  // collected for the final usage assertion
  const uploadedBytes: { label: string; encryptedBytes: number }[] = [];

  beforeAll(async () => {
    let token = SESSION_TOKEN;
    if (!token) {
      if (!DEBUG_NONCE) {
        throw new Error('E2E_SESSION_TOKEN or E2E_DEBUG_NONCE must be set');
      }
      token = await mintJwt(base, DEBUG_NONCE, sub);
    }
    client = new Client(base, token);
    // Deterministic mnemonic so the real cli/decrypt.ts can rederive the
    // master key from a mnemonic file (its only supported input).
    const MNEMONIC =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const seed = Buffer.from(mnemonicToSeedSync(MNEMONIC, ''));
    master = hkdf(seed, Buffer.from('SecStorage/v1'), Buffer.from('master'), 32);
    tmpRoot = mkdtempSync(join(tmpdir(), 'ssf-e2e-'));
    writeFileSync(join(tmpRoot, 'mnemonic.txt'), MNEMONIC);
  });

  afterAll(() => {
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
  });

  const fixtures = makeFixtures();
  const remoteByLabel = new Map<string, string>();

  test.each(fixtures.map(f => [f.label, f]))(
    'round-trips %s',
    async (_label, f: Fixture) => {
      const id = `file-${(f as Fixture).label.replace(/[^a-zA-Z0-9._-]/g, '_')}-${randomBytes(
        4,
      ).toString('hex')}`;
      const prefix = `files/${id}`;
      remoteByLabel.set((f as Fixture).label, prefix);

      const { manifest, chunkBlobs } = encryptToManifest(
        master,
        (f as Fixture).bytes,
        { name: (f as Fixture).name },
        DEFAULT_CHUNK_SIZE,
        prefix,
      );

      // Upload chunks via individual presigned PUTs.
      for (let i = 0; i < chunkBlobs.length; i++) {
        await client.putBlob(manifest.chunks[i].key, chunkBlobs[i]);
      }
      const manifestBuf = Buffer.from(JSON.stringify(manifest), 'utf8');
      await client.putBlob(`${prefix}/manifest.json`, manifestBuf, 'application/json');

      const encryptedBytes =
        chunkBlobs.reduce((s, b) => s + b.length, 0) + manifestBuf.length;
      uploadedBytes.push({ label: (f as Fixture).label, encryptedBytes });

      // Download via presigned GETs.
      const downloadedManifestBuf = await client.getBlob(`${prefix}/manifest.json`);
      const downloadedManifest = JSON.parse(
        downloadedManifestBuf.toString('utf8'),
      ) as Manifest;
      expect(downloadedManifest.chunks.length).toBe(manifest.chunks.length);

      const downloadedChunks: Buffer[] = [];
      for (const c of downloadedManifest.chunks) {
        const blob = await client.getBlob(c.key);
        expect(blob.length).toBe(c.size);
        downloadedChunks.push(blob);
      }
      const decrypted = decryptManifest(master, downloadedManifest, downloadedChunks);
      expect(decrypted.length).toBe((f as Fixture).bytes.length);
      expect(decrypted.equals((f as Fixture).bytes)).toBe(true);
      expect(sha256(decrypted)).toBe(sha256((f as Fixture).bytes));

      // Magic-bytes sanity for the structured formats.
      if ((f as Fixture).label === 'image.jpg') {
        expect(decrypted.slice(0, 3).toString('hex')).toBe('ffd8ff');
        expect(decrypted.slice(-2).toString('hex')).toBe('ffd9');
      }
      if ((f as Fixture).label === 'doc.pdf') {
        expect(decrypted.slice(0, 5).toString('utf8')).toBe('%PDF-');
        expect(decrypted.slice(-6).toString('utf8')).toBe('%%EOF\n');
      }
    },
  );

  test('cli/decrypt.ts --manifest decrypts backend-served data', async () => {
    // Pick the bigbinary fixture; multi-chunk and exercises the loop.
    const fixture = fixtures.find(f => f.label === 'bigbinary.bin')!;
    const prefix = remoteByLabel.get(fixture.label)!;
    const work = mkdtempSync(join(tmpRoot, 'cli-'));
    // Fetch manifest + chunks into a flat dir matching the CLI's expected layout.
    const manifestBuf = await client.getBlob(`${prefix}/manifest.json`);
    const manifest = JSON.parse(manifestBuf.toString('utf8')) as Manifest;
    const manifestPath = join(work, 'manifest.json');
    writeFileSync(manifestPath, manifestBuf);
    for (const c of manifest.chunks) {
      const blob = await client.getBlob(c.key);
      writeFileSync(join(work, `${c.index}.c`), blob);
    }

    const cliPath = join(__dirname, '..', 'cli', 'decrypt.ts');
    const tsconfigPath = join(__dirname, '..', 'cli', 'tsconfig.json');
    const outPath = join(work, 'decrypted.bin');
    const mnemonicPath = join(tmpRoot, 'mnemonic.txt');
    execFileSync(
      'npx',
      [
        'ts-node',
        '--project',
        tsconfigPath,
        cliPath,
        mnemonicPath,
        '--manifest',
        manifestPath,
        outPath,
      ],
      { stdio: 'pipe' },
    );
    const decrypted = readFileSync(outPath);
    expect(decrypted.length).toBe(fixture.bytes.length);
    expect(sha256(decrypted)).toBe(sha256(fixture.bytes));
  });

  test('encrypted index round-trip carries unicode filenames', async () => {
    // Build a small encrypted index mirroring src/storage/encryptedIndex.ts.
    const indexKey = hkdf(master, Buffer.from('SecStorage/v1'), Buffer.from('index'), 32);
    const entries = fixtures.map(f => ({
      id: f.label,
      name: f.name,
      size: f.bytes.length,
      remoteKey: remoteByLabel.get(f.label) ?? null,
    }));
    const blob = sealGcm(indexKey, Buffer.from(JSON.stringify(entries), 'utf8'));
    await client.putIndex(blob);
    const back = await client.getIndex();
    expect(back).not.toBeNull();
    const decoded = JSON.parse(openGcm(indexKey, back as Buffer).toString('utf8'));
    expect(decoded).toEqual(entries);
    const unicode = decoded.find((e: any) => e.id === 'unicode-名前.md');
    expect(unicode.name).toBe('unicode-名前.md');
  });

  test('usage reflects encrypted bytes within ±1%', async () => {
    // include the index blob too (small constant overhead)
    const indexBlob = await client.getIndex();
    const expected =
      uploadedBytes.reduce((s, x) => s + x.encryptedBytes, 0) +
      (indexBlob ? indexBlob.length : 0);
    const u = await client.usage();
    // R2 may report exact bytes; quota counts reservations as committed, so
    // expect very tight match. ±1% guards against any rounding/manifest
    // accounting drift.
    const drift = Math.abs(u.usedBytes - expected) / expected;
    // eslint-disable-next-line no-console
    console.error(`usage expected=${expected} got=${u.usedBytes} drift=${drift}`);
    expect(drift).toBeLessThan(0.01);
  });

  test('DELETE /account wipes user', async () => {
    await client.deleteAccount();
    // /usage looks up the user row and throws if missing; expect a 500.
    const r = await fetch(`${base}/usage`, {
      headers: { authorization: `Bearer ${client.token}` },
    });
    expect(r.ok).toBe(false);
  });
});
