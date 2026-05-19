import argon2 from 'argon2-browser';

/**
 * Argon2id でパスフレーズ -> 32byte 鍵を導出。
 * spec §5 「鍵導出: Argon2id」要件。
 *
 * パラメータは OWASP 推奨 (2024): t=3, m=64MiB, p=4
 */
export async function argon2idDerive(
  passphrase: string,
  salt: Buffer,
): Promise<Buffer> {
  const res = await argon2.hash({
    pass: passphrase,
    salt: new Uint8Array(salt),
    type: argon2.ArgonType.Argon2id,
    time: 3,
    mem: 64 * 1024,
    parallelism: 4,
    hashLen: 32,
  });
  return Buffer.from(res.hash);
}
