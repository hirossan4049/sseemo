import AsyncStorage from '@react-native-async-storage/async-storage';
import { deriveMasterKey, deriveMasterKeyWithPassphrase } from '@/crypto/kdf';
import { mnemonicToSeed } from '@/crypto/mnemonic';
import { loadMnemonic } from '@/crypto/keychain';
import { argon2idDerive } from '@/crypto/argon';
import { b64decode } from '@/crypto/base64';

const PP_SALT_KEY = '@secstorage/pp/salt';
const PP_ENABLED_KEY = '@secstorage/pp/enabled';
const AUTOLOCK_KEY = '@secstorage/autolock/seconds';

let cachedMaster: Buffer | null = null;
let lastActivity = Date.now();

export async function isPassphraseEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(PP_ENABLED_KEY)) === '1';
}

export async function setPassphrase(passphrase: string): Promise<void> {
  const salt = Buffer.from(
    Array.from({ length: 16 }, () => Math.floor(Math.random() * 256)),
  );
  await AsyncStorage.setItem(PP_SALT_KEY, salt.toString('base64'));
  await AsyncStorage.setItem(PP_ENABLED_KEY, '1');
  await unlock(passphrase);
}

export async function unlock(passphrase?: string): Promise<Buffer | null> {
  if (cachedMaster) return cachedMaster;
  const m = await loadMnemonic();
  if (!m) return null;
  const seed = mnemonicToSeed(m);
  if (await isPassphraseEnabled()) {
    if (!passphrase) return null;
    const saltB64 = await AsyncStorage.getItem(PP_SALT_KEY);
    if (!saltB64) throw new Error('passphrase salt missing');
    const salt = b64decode(saltB64);
    const argKey = await argon2idDerive(passphrase, salt);
    cachedMaster = deriveMasterKeyWithPassphrase(seed, argKey);
  } else {
    cachedMaster = deriveMasterKey(seed);
  }
  lastActivity = Date.now();
  return cachedMaster;
}

export function touch(): void {
  lastActivity = Date.now();
}

export async function maybeAutoLock(): Promise<boolean> {
  const v = await AsyncStorage.getItem(AUTOLOCK_KEY);
  const secs = v ? parseInt(v, 10) : 300;
  if (secs <= 0) return false;
  if (Date.now() - lastActivity > secs * 1000) {
    lock();
    return true;
  }
  return false;
}

export async function setAutoLockSeconds(s: number): Promise<void> {
  await AsyncStorage.setItem(AUTOLOCK_KEY, String(s));
}

export function lock(): void {
  if (cachedMaster) cachedMaster.fill(0);
  cachedMaster = null;
}

export function getMaster(): Buffer | null {
  return cachedMaster;
}
