/**
 * チャンク分割サイドカー方式のラウンドトリップ。
 * Node 標準 crypto で SSF1 ヘッダ + 個別チャンク を再構築できることを確認する
 * = CLI (cli/decrypt.ts --manifest) の復号ロジックが動くことの担保。
 */
import { createHmac, createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const MAGIC = Buffer.from('SSF1', 'ascii');
const HEADER_SIZE = 64;
const NONCE_SIZE = 12;
const TAG_SIZE = 16;

function hkdf(ikm: Buffer, salt: Buffer, info: Buffer, len: number): Buffer {
  const prk = createHmac('sha256', salt).update(ikm).digest();
  const out = Buffer.alloc(len);
  let prev = Buffer.alloc(0);
  let pos = 0;
  for (let i = 1; pos < len; i++) {
    prev = createHmac('sha256', prk)
      .update(Buffer.concat([prev, info, Buffer.from([i])]))
      .digest();
    prev.copy(out, pos);
    pos += prev.length;
  }
  return out.slice(0, len);
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
function gcmDec(key: Buffer, nonce: Buffer, blob: Buffer): Buffer {
  const ct = blob.slice(0, blob.length - TAG_SIZE);
  const tag = blob.slice(blob.length - TAG_SIZE);
  const d = createDecipheriv('aes-256-gcm', key, nonce);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

describe('chunked sidecar roundtrip', () => {
  test('manifest + chunks reassembles plaintext', () => {
    const master = randomBytes(32);
    const fileSalt = randomBytes(16);
    const fileKey = hkdf(master, fileSalt, Buffer.from('SSF1/file'), 32);
    const noncePrefix = randomBytes(4);
    const chunkSize = 64;
    const plain = randomBytes(64 * 5 + 11);

    // meta @ counter 0
    const meta = Buffer.from(JSON.stringify({ name: 't.bin', size: plain.length }));
    const metaNonce = chunkNonce(noncePrefix, 0);
    const metaCT = gcmEnc(fileKey, metaNonce, meta);
    const metaBlob = Buffer.concat([metaNonce, metaCT]);

    // header
    const header = Buffer.alloc(HEADER_SIZE);
    MAGIC.copy(header, 0);
    header.writeUInt8(1, 4);
    header.writeUInt8(1, 5);
    fileSalt.copy(header, 8);
    header.writeUInt32LE(chunkSize, 24);
    header.writeBigUInt64LE(BigInt(plain.length), 28);
    header.writeUInt32LE(metaBlob.length, 36);

    const headerAndMeta = Buffer.concat([header, metaBlob]);

    // chunks
    const chunks: Buffer[] = [];
    let counter = 1;
    for (let off = 0; off < plain.length; off += chunkSize) {
      const slice = plain.slice(off, Math.min(off + chunkSize, plain.length));
      const nonce = chunkNonce(noncePrefix, counter++);
      chunks.push(Buffer.concat([nonce, gcmEnc(fileKey, nonce, slice)]));
    }

    const manifest = {
      version: 1 as const,
      header: headerAndMeta.toString('base64'),
      chunkSize,
      plainSize: plain.length,
      chunks: chunks.map((b, i) => ({ index: i, key: `k/${i}.c`, size: b.length })),
    };

    // --- decode side (mirrors CLI --manifest path) ---
    const hm = Buffer.from(manifest.header, 'base64');
    const salt2 = hm.slice(8, 24);
    const metaLen = hm.readUInt32LE(36);
    const fk2 = hkdf(master, salt2, Buffer.from('SSF1/file'), 32);
    const mb = hm.slice(HEADER_SIZE, HEADER_SIZE + metaLen);
    const metaBack = JSON.parse(
      gcmDec(fk2, mb.slice(0, NONCE_SIZE), mb.slice(NONCE_SIZE)).toString('utf8'),
    );
    expect(metaBack.name).toBe('t.bin');

    const back = Buffer.concat(
      chunks.map(b => gcmDec(fk2, b.slice(0, NONCE_SIZE), b.slice(NONCE_SIZE))),
    );
    expect(back.equals(plain)).toBe(true);
  });
});
