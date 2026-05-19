#!/usr/bin/env node
/**
 * SecStorage 復号 CLI (アプリ非依存)
 *
 * 使用法:
 *   ts-node cli/decrypt.ts <mnemonic-file> <encrypted-file> <output-file>
 *
 * mnemonic-file: 12語スペース区切りのテキスト
 *
 * RN依存を持たない Node 標準 crypto のみで復号できることが、
 * 「鍵さえあればアプリ無しでも復号可能」という信頼の核を担保する。
 */
import { createHmac, createDecipheriv } from 'crypto';
import { readFileSync, writeFileSync, openSync, readSync, closeSync, statSync } from 'fs';
import { mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

const MAGIC = Buffer.from('SSF1', 'ascii');
const HEADER_SIZE = 64;
const NONCE_SIZE = 12;
const TAG_SIZE = 16;

function hkdf(ikm: Buffer, salt: Buffer, info: Buffer, length: number): Buffer {
  const prk = createHmac('sha256', salt).update(ikm).digest();
  const out = Buffer.alloc(length);
  let prev = Buffer.alloc(0);
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

function gcmDecrypt(key: Buffer, nonce: Buffer, blob: Buffer): Buffer {
  const ct = blob.slice(0, blob.length - TAG_SIZE);
  const tag = blob.slice(blob.length - TAG_SIZE);
  const d = createDecipheriv('aes-256-gcm', key, nonce);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

function main() {
  const [, , mnemonicPath, encPath, outPath] = process.argv;
  if (!mnemonicPath || !encPath || !outPath) {
    console.error('usage: decrypt.ts <mnemonic-file> <encrypted> <output>');
    process.exit(1);
  }
  const mnemonic = readFileSync(mnemonicPath, 'utf8').trim().toLowerCase();
  if (!mnemonic.match(/^[a-z]+( [a-z]+){11,23}$/)) throw new Error('bad mnemonic');
  const seed = Buffer.from(mnemonicToSeedSync(mnemonic, ''));
  const master = hkdf(seed, Buffer.from('SecStorage/v1'), Buffer.from('master'), 32);

  const fd = openSync(encPath, 'r');
  const size = statSync(encPath).size;
  const header = Buffer.alloc(HEADER_SIZE);
  readSync(fd, header, 0, HEADER_SIZE, 0);
  if (!header.slice(0, 4).equals(MAGIC)) throw new Error('bad magic');

  const fileSalt = header.slice(8, 24);
  const chunkSize = header.readUInt32LE(24);
  const metaLen = header.readUInt32LE(36);
  const fileKey = hkdf(master, fileSalt, Buffer.from('SSF1/file'), 32);

  const metaBuf = Buffer.alloc(metaLen);
  readSync(fd, metaBuf, 0, metaLen, HEADER_SIZE);
  const metaNonce = metaBuf.slice(0, NONCE_SIZE);
  const metaCT = metaBuf.slice(NONCE_SIZE);
  const meta = JSON.parse(gcmDecrypt(fileKey, metaNonce, metaCT).toString('utf8'));
  console.error('meta:', meta);

  writeFileSync(outPath, '');
  let pos = HEADER_SIZE + metaLen;
  const ctSize = NONCE_SIZE + chunkSize + TAG_SIZE;
  const fs = require('fs');
  const outFd = openSync(outPath, 'w');
  while (pos < size) {
    const take = Math.min(ctSize, size - pos);
    const blob = Buffer.alloc(take);
    readSync(fd, blob, 0, take, pos);
    const nonce = blob.slice(0, NONCE_SIZE);
    const ctTag = blob.slice(NONCE_SIZE);
    const plain = gcmDecrypt(fileKey, nonce, ctTag);
    fs.writeSync(outFd, plain);
    pos += take;
  }
  closeSync(outFd);
  closeSync(fd);
  console.error(`ok -> ${outPath}`);
}

main();
