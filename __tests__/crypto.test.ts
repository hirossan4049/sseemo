/**
 * 暗号化ラウンドトリップ (Node 標準 crypto を使うCLIロジック相当でテスト).
 * RN ネイティブ依存を踏まずに HKDF / AES-256-GCM の整合性を検証する。
 */
import { createHmac, createCipheriv, createDecipheriv, randomBytes } from 'crypto';

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

describe('crypto round trip', () => {
  test('HKDF deterministic', () => {
    const a = hkdf(Buffer.from('seed'), Buffer.from('salt'), Buffer.from('info'), 32);
    const b = hkdf(Buffer.from('seed'), Buffer.from('salt'), Buffer.from('info'), 32);
    expect(a.equals(b)).toBe(true);
    expect(a.length).toBe(32);
  });

  test('AES-256-GCM chunk roundtrip', () => {
    const key = randomBytes(32);
    const nonce = randomBytes(12);
    const plain = Buffer.from('hello secstorage');
    const c = createCipheriv('aes-256-gcm', key, nonce);
    const ct = Buffer.concat([c.update(plain), c.final()]);
    const tag = c.getAuthTag();
    const d = createDecipheriv('aes-256-gcm', key, nonce);
    d.setAuthTag(tag);
    const back = Buffer.concat([d.update(ct), d.final()]);
    expect(back.toString()).toBe(plain.toString());
  });

  test('tampered ciphertext fails', () => {
    const key = randomBytes(32);
    const nonce = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', key, nonce);
    const ct = Buffer.concat([c.update(Buffer.from('x')), c.final()]);
    const tag = c.getAuthTag();
    ct[0] ^= 0xff;
    const d = createDecipheriv('aes-256-gcm', key, nonce);
    d.setAuthTag(tag);
    expect(() => Buffer.concat([d.update(ct), d.final()])).toThrow();
  });
});
