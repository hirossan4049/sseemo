/**
 * SecStorage E2E ファイル形式 v1 (公開仕様)
 *
 * Header (固定 64 bytes):
 *   magic       4   "SSF1"
 *   version     1   0x01
 *   algo        1   0x01 = AES-256-GCM
 *   reserved    2
 *   fileSalt    16  ファイル鍵導出用ソルト (per-file)
 *   chunkSize   4   little-endian, default 1MiB
 *   plainSize   8   little-endian (推定値、0 ならストリーミング)
 *   metaLen     4   暗号化メタデータ長 (filename, mime, ctime 等)
 *   reserved2   24
 *
 * Meta (metaLen bytes):
 *   nonce(12) || ciphertext || tag(16)
 *   平文は JSON: { name, mime, size, ctime, mtime, parentId, ... }
 *
 * Chunks (繰り返し):
 *   nonce(12) || ciphertext(<= chunkSize) || tag(16)
 *   nonce は per-chunk: prefix(4 random per file) || counter(8 LE)
 *
 * すべてのチャンクは独立に認証付き暗号化。途中で停止しても部分復号可能。
 *
 * ファイル鍵導出:
 *   fileKey = HKDF-SHA256(masterKey, salt=fileSalt, info="SSF1/file", L=32)
 *
 * マスター鍵導出:
 *   seed     = BIP39(mnemonic, passphrase="")
 *   master   = HKDF-SHA256(seed, salt="SecStorage/v1", info="master", L=32)
 */

export const MAGIC = Buffer.from('SSF1', 'ascii');
export const VERSION = 0x01;
export const ALGO_AES_256_GCM = 0x01;
export const HEADER_SIZE = 64;
export const DEFAULT_CHUNK_SIZE = 1024 * 1024; // 1 MiB
export const NONCE_SIZE = 12;
export const TAG_SIZE = 16;
export const KEY_SIZE = 32;
export const FILE_SALT_SIZE = 16;

export interface FileHeader {
  version: number;
  algo: number;
  fileSalt: Buffer;
  chunkSize: number;
  plainSize: number;
  metaLen: number;
}

export function encodeHeader(h: FileHeader): Buffer {
  const buf = Buffer.alloc(HEADER_SIZE);
  MAGIC.copy(buf, 0);
  buf.writeUInt8(h.version, 4);
  buf.writeUInt8(h.algo, 5);
  // reserved 6..7
  h.fileSalt.copy(buf, 8, 0, FILE_SALT_SIZE);
  buf.writeUInt32LE(h.chunkSize, 24);
  buf.writeBigUInt64LE(BigInt(h.plainSize), 28);
  buf.writeUInt32LE(h.metaLen, 36);
  // reserved2 40..63
  return buf;
}

export function decodeHeader(buf: Buffer): FileHeader {
  if (buf.length < HEADER_SIZE) throw new Error('header too short');
  if (!buf.slice(0, 4).equals(MAGIC)) throw new Error('bad magic');
  return {
    version: buf.readUInt8(4),
    algo: buf.readUInt8(5),
    fileSalt: buf.slice(8, 8 + FILE_SALT_SIZE),
    chunkSize: buf.readUInt32LE(24),
    plainSize: Number(buf.readBigUInt64LE(28)),
    metaLen: buf.readUInt32LE(36),
  };
}

export function chunkNonce(prefix: Buffer, counter: number): Buffer {
  if (prefix.length !== 4) throw new Error('bad nonce prefix');
  const n = Buffer.alloc(NONCE_SIZE);
  prefix.copy(n, 0);
  n.writeBigUInt64LE(BigInt(counter), 4);
  return n;
}
