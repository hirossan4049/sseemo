import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'react-native-quick-crypto';
import {
  ALGO_AES_256_GCM,
  DEFAULT_CHUNK_SIZE,
  FILE_SALT_SIZE,
  FileHeader,
  HEADER_SIZE,
  NONCE_SIZE,
  TAG_SIZE,
  VERSION,
  chunkNonce,
  decodeHeader,
  encodeHeader,
} from './format';
import { deriveFileKey } from './kdf';

export interface FileMeta {
  name: string;
  mime?: string;
  size: number;
  ctime?: number;
  mtime?: number;
  parentId?: string | null;
  tags?: string[];
}

function gcmEncrypt(key: Buffer, nonce: Buffer, plaintext: Buffer): Buffer {
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([ct, tag]);
}

function gcmDecrypt(key: Buffer, nonce: Buffer, ctAndTag: Buffer): Buffer {
  const ct = ctAndTag.slice(0, ctAndTag.length - TAG_SIZE);
  const tag = ctAndTag.slice(ctAndTag.length - TAG_SIZE);
  const dec = createDecipheriv('aes-256-gcm', key, nonce);
  dec.setAuthTag(tag);
  return Buffer.concat([dec.update(ct), dec.final()]);
}

export interface EncryptStreamOptions {
  master: Buffer;
  meta: FileMeta;
  chunkSize?: number;
}

/**
 * チャンクを逐次受け取って暗号化済みバイト列を吐き出すストリーミング暗号化器。
 * メモリにファイル全体を載せない。
 */
export class FileEncryptor {
  private fileKey: Buffer;
  private noncePrefix: Buffer;
  private counter = 0;
  private chunkSize: number;
  private headerEmitted = false;
  private header: FileHeader;
  private metaCipher: Buffer;

  constructor(opts: EncryptStreamOptions) {
    const fileSalt = randomBytes(FILE_SALT_SIZE) as Buffer;
    this.fileKey = deriveFileKey(opts.master, fileSalt);
    this.noncePrefix = randomBytes(4) as Buffer;
    this.chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;

    const metaPlain = Buffer.from(JSON.stringify(opts.meta), 'utf8');
    const metaNonce = chunkNonce(this.noncePrefix, 0);
    const metaCT = gcmEncrypt(this.fileKey, metaNonce, metaPlain);
    this.metaCipher = Buffer.concat([metaNonce, metaCT]);
    this.counter = 1; // 0 はメタに使用

    this.header = {
      version: VERSION,
      algo: ALGO_AES_256_GCM,
      fileSalt,
      chunkSize: this.chunkSize,
      plainSize: opts.meta.size,
      metaLen: this.metaCipher.length,
    };
  }

  /** ヘッダ + メタ。最初に1回だけ出力 */
  emitHeader(): Buffer {
    if (this.headerEmitted) throw new Error('header already emitted');
    this.headerEmitted = true;
    return Buffer.concat([encodeHeader(this.header), this.metaCipher]);
  }

  /** 平文チャンク -> 暗号化チャンク (nonce || ct || tag) */
  encryptChunk(plain: Buffer): Buffer {
    const nonce = chunkNonce(this.noncePrefix, this.counter++);
    const ctTag = gcmEncrypt(this.fileKey, nonce, plain);
    return Buffer.concat([nonce, ctTag]);
  }
}

export interface DecryptResult {
  meta: FileMeta;
  header: FileHeader;
}

export class FileDecryptor {
  private fileKey!: Buffer;
  header!: FileHeader;
  meta!: FileMeta;

  /** ヘッダ + メタを与えて初期化 */
  init(master: Buffer, headerAndMeta: Buffer): DecryptResult {
    this.header = decodeHeader(headerAndMeta.slice(0, HEADER_SIZE));
    this.fileKey = deriveFileKey(master, this.header.fileSalt);
    const metaBlob = headerAndMeta.slice(
      HEADER_SIZE,
      HEADER_SIZE + this.header.metaLen,
    );
    const metaNonce = metaBlob.slice(0, NONCE_SIZE);
    const metaCT = metaBlob.slice(NONCE_SIZE);
    const metaPlain = gcmDecrypt(this.fileKey, metaNonce, metaCT);
    this.meta = JSON.parse(metaPlain.toString('utf8'));
    return { header: this.header, meta: this.meta };
  }

  /** 暗号化チャンク (nonce || ct || tag) -> 平文 */
  decryptChunk(blob: Buffer): Buffer {
    const nonce = blob.slice(0, NONCE_SIZE);
    const ctTag = blob.slice(NONCE_SIZE);
    return gcmDecrypt(this.fileKey, nonce, ctTag);
  }
}

export const __cryptoInternals = { gcmEncrypt, gcmDecrypt };
