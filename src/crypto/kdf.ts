import QuickCrypto from 'react-native-quick-crypto';
const { createHmac } = QuickCrypto;

/**
 * HKDF-SHA256 (RFC 5869)
 */
export function hkdf(
  ikm: Buffer,
  salt: Buffer,
  info: Buffer,
  length: number,
): Buffer {
  const prk = Buffer.from(
    createHmac('sha256', salt).update(ikm).digest() as any,
  );
  const out = Buffer.alloc(length);
  let prev: Buffer = Buffer.alloc(0);
  let pos = 0;
  for (let i = 1; pos < length; i++) {
    prev = Buffer.from(
      createHmac('sha256', prk)
        .update(Buffer.concat([prev, info, Buffer.from([i])]))
        .digest() as any,
    );
    prev.copy(out, pos);
    pos += prev.length;
  }
  return out.slice(0, length);
}

export function deriveMasterKey(seed: Buffer): Buffer {
  return hkdf(seed, Buffer.from('SecStorage/v1'), Buffer.from('master'), 32);
}

/**
 * パスフレーズ追加保護: Argon2id(passphrase) を salt として
 * BIP39 seed と組み合わせる。パスフレーズ未設定なら従来通り。
 */
export function deriveMasterKeyWithPassphrase(
  seed: Buffer,
  argonKey: Buffer,
): Buffer {
  return hkdf(seed, argonKey, Buffer.from('master+pp'), 32);
}

export function deriveIndexKey(master: Buffer): Buffer {
  return hkdf(master, Buffer.from('SecStorage/v1'), Buffer.from('index'), 32);
}

export function deriveThumbKey(master: Buffer): Buffer {
  return hkdf(master, Buffer.from('SecStorage/v1'), Buffer.from('thumb'), 32);
}

export function deriveFileKey(master: Buffer, fileSalt: Buffer): Buffer {
  return hkdf(master, fileSalt, Buffer.from('SSF1/file'), 32);
}
