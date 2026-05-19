import { deriveMasterKey } from '@/crypto/kdf';
import { mnemonicToSeed } from '@/crypto/mnemonic';
import { loadMnemonic } from '@/crypto/keychain';

let cachedMaster: Buffer | null = null;

export async function unlock(): Promise<Buffer | null> {
  if (cachedMaster) return cachedMaster;
  const m = await loadMnemonic();
  if (!m) return null;
  cachedMaster = deriveMasterKey(mnemonicToSeed(m));
  return cachedMaster;
}

export function lock(): void {
  if (cachedMaster) cachedMaster.fill(0);
  cachedMaster = null;
}

export function getMaster(): Buffer | null {
  return cachedMaster;
}
