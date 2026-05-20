import argon2 from 'argon2-browser';
import { ARGON2 } from '@/config';

/**
 * Argon2id でパスフレーズ -> 32byte 鍵を導出。
 * spec §5 「鍵導出: Argon2id」要件。パラメータは `src/config.ts` 参照。
 */
export async function argon2idDerive(
  passphrase: string,
  salt: Buffer,
): Promise<Buffer> {
  const res = await argon2.hash({
    pass: passphrase,
    salt: new Uint8Array(salt),
    type: argon2.ArgonType.Argon2id,
    time: ARGON2.time,
    mem: ARGON2.memKiB,
    parallelism: ARGON2.parallelism,
    hashLen: ARGON2.hashLen,
  });
  return Buffer.from(res.hash);
}
