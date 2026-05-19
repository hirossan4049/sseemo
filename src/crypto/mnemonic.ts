import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

export function generate12WordMnemonic(): string {
  return generateMnemonic(wordlist, 128);
}

export function isValidMnemonic(m: string): boolean {
  return validateMnemonic(m.trim().toLowerCase(), wordlist);
}

export function mnemonicToSeed(m: string): Buffer {
  return Buffer.from(mnemonicToSeedSync(m.trim().toLowerCase(), ''));
}
