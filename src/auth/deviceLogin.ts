/**
 * Device-bound anonymous auth.
 *
 * Replaces Sign in with Apple. On first launch we mint a random 128-bit hex
 * `deviceTag`, persist it to the iOS Keychain under service
 * `app.secstorage.deviceId`, and POST it to `/auth/device` to receive a
 * session JWT. The JWT is stored in the bucket credential blob the rest of
 * the app already uses, exactly the way the old Apple flow stored its token.
 *
 * The deviceTag is the only credential; it never leaves the device's secure
 * Keychain except as the body of `/auth/device`. Reinstalling the app wipes
 * the Keychain on iOS, which is equivalent to "signing out".
 */
import * as Keychain from 'react-native-keychain';
import QuickCrypto from 'react-native-quick-crypto';
import { BucketCredentials } from '@/crypto/keychain';
import { addBucket } from '@/state/bucketStore';
import { MANAGED_BACKEND_URL } from '@/config';

const DEVICE_ID_SERVICE = 'app.secstorage.deviceId';

/** Returns the device tag, generating + persisting one on first call. */
export async function ensureDeviceTag(): Promise<string> {
  const existing = await Keychain.getGenericPassword({ service: DEVICE_ID_SERVICE });
  if (existing && existing.password) return existing.password;
  // 128 bits of entropy, hex-encoded.
  const buf = QuickCrypto.randomBytes(16) as unknown as Buffer;
  const tag = buf.toString('hex');
  await Keychain.setGenericPassword('device-id', tag, {
    service: DEVICE_ID_SERVICE,
    accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  return tag;
}

export interface AuthDeviceResponse {
  token: string;
  userId: string;
}

/** Calls POST /auth/device. */
export async function authDevice(
  backendUrl: string,
  deviceTag: string,
): Promise<AuthDeviceResponse> {
  const r = await fetch(`${backendUrl.replace(/\/$/, '')}/auth/device`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceTag }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`auth/device failed: ${r.status} ${t}`);
  }
  return (await r.json()) as AuthDeviceResponse;
}

/**
 * Onboarding entrypoint used by WelcomeScreen / BucketSetupScreen. Mints (or
 * retrieves) the device tag, hits /auth/device, and stores the resulting JWT
 * inside a managed BucketCredentials row so the rest of the app
 * (managedClient.ts) can read it like the old Apple-issued token.
 */
export async function deviceLogin(
  backendUrl: string = MANAGED_BACKEND_URL,
): Promise<BucketCredentials> {
  const tag = await ensureDeviceTag();
  const { token, userId } = await authDevice(backendUrl, tag);
  const creds: BucketCredentials = {
    id: `managed-${userId}`,
    mode: 'managed',
    endpoint: backendUrl,
    region: 'auto',
    bucket: 'managed',
    accessKeyId: '',
    secretAccessKey: '',
    backendUrl,
    sessionToken: token,
  };
  await addBucket(creds);
  return creds;
}
