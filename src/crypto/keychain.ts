import * as Keychain from 'react-native-keychain';

const MNEMONIC_SERVICE = 'app.secstorage.mnemonic';
const BUCKET_SERVICE = 'app.secstorage.bucket';

export async function saveMnemonic(mnemonic: string): Promise<void> {
  await Keychain.setGenericPassword('mnemonic', mnemonic, {
    service: MNEMONIC_SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE,
  });
}

export async function loadMnemonic(): Promise<string | null> {
  const r = await Keychain.getGenericPassword({ service: MNEMONIC_SERVICE });
  return r ? r.password : null;
}

export async function clearMnemonic(): Promise<void> {
  await Keychain.resetGenericPassword({ service: MNEMONIC_SERVICE });
}

export interface BucketCredentials {
  id: string;
  mode: 'managed' | 'byo';
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  label?: string;
}

export async function saveBucket(creds: BucketCredentials): Promise<void> {
  await Keychain.setGenericPassword(creds.id, JSON.stringify(creds), {
    service: `${BUCKET_SERVICE}.${creds.id}`,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function loadBucket(id: string): Promise<BucketCredentials | null> {
  const r = await Keychain.getGenericPassword({
    service: `${BUCKET_SERVICE}.${id}`,
  });
  return r ? JSON.parse(r.password) : null;
}
