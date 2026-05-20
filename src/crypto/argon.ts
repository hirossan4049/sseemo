import argon2 from 'react-native-argon2';
import { ARGON2 } from '@/config';

/**
 * Argon2id でパスフレーズ -> 32byte 鍵を導出。
 * spec §5 「鍵導出: Argon2id」要件。パラメータは `src/config.ts` 参照。
 *
 * Implementation: `react-native-argon2` ネイティブモジュール (iOS は Argon2Swift
 * 経由でリファレンス実装を呼び出す)。JS フォールバックは存在しない —
 * モジュールが見つからない場合は import 時点で例外になる。
 */
export async function argon2idDerive(
  passphrase: string,
  salt: Buffer,
): Promise<Buffer> {
  // ネイティブブリッジは文字列しか受け付けないため、salt は hex で渡す。
  const saltHex = Buffer.from(salt).toString('hex');
  const res = await argon2(passphrase, saltHex, {
    iterations: ARGON2.time,
    memory: ARGON2.memKiB,
    parallelism: ARGON2.parallelism,
    hashLength: ARGON2.hashLen,
    mode: 'argon2id',
    saltEncoding: 'hex',
  });
  // rawHash は hex 文字列。
  return Buffer.from(res.rawHash, 'hex');
}
