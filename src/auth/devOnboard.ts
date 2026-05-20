/**
 * Dev-only programmatic onboarding + managed-backend roundtrip verifier.
 *
 * Used by the simulator E2E flow: Sign in with Apple is unreliable on the
 * simulator, so we drive onboarding via a deeplink that carries the shared
 * DEV_AUTH_TOKEN nonce. The endpoint (POST /auth/dev) on the backend is gated
 * by env (`ALLOW_DEV_AUTH=true`) so this is safe to ship; flip the env off
 * and the path goes cold.
 *
 * The code stays in the repo permanently because the dev button on
 * WelcomeScreen is gated by `__DEV__`, and the backend gate is server-side.
 */

import { BucketCredentials, saveMnemonic, loadMnemonic } from '@/crypto/keychain';
import { addBucket } from '@/state/bucketStore';
import { generate12WordMnemonic } from '@/crypto/mnemonic';
import { unlock } from '@/state/keyStore';
import {
  putObject,
  getObject,
  getServerUsage,
  deleteAccount,
} from '@/s3/managedClient';
import { MANAGED_BACKEND_URL } from '@/config';

export interface DevOnboardParams {
  backendUrl?: string;
  token: string;
  deviceTag?: string;
  /** If true, run the upload/download/verify roundtrip after onboarding. */
  verify?: boolean;
  /** If true, call DELETE /account at the end (cleans the test user). */
  cleanup?: boolean;
}

/** Calls POST /auth/dev to mint a session JWT. */
export async function authDev(
  backendUrl: string,
  token: string,
  deviceTag: string,
): Promise<{ token: string; userId: string }> {
  const r = await fetch(`${backendUrl.replace(/\/$/, '')}/auth/dev`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, deviceTag }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`auth/dev failed: ${r.status} ${t}`);
  }
  return r.json() as any;
}

/**
 * Drive the entire onboarding + (optional) roundtrip programmatically.
 * Logs progress with `[VERIFY] ...` lines so the simulator log stream can be
 * grepped for `[VERIFY] managed roundtrip OK`.
 */
export async function runDevOnboard(p: DevOnboardParams): Promise<void> {
  const backendUrl = p.backendUrl ?? MANAGED_BACKEND_URL;
  const deviceTag = p.deviceTag ?? 'sim';
  console.log(`[VERIFY] devOnboard start backend=${backendUrl} tag=${deviceTag}`);

  const { token: jwt, userId } = await authDev(backendUrl, p.token, deviceTag);
  console.log(`[VERIFY] devOnboard authed userId=${userId}`);

  const creds: BucketCredentials = {
    id: `managed-${userId}`,
    mode: 'managed',
    endpoint: backendUrl,
    region: 'auto',
    bucket: 'managed',
    accessKeyId: '',
    secretAccessKey: '',
    backendUrl,
    sessionToken: jwt,
  };
  await addBucket(creds);
  console.log('[VERIFY] devOnboard bucket saved');

  if (!(await loadMnemonic())) {
    const mnemonic = generate12WordMnemonic();
    await saveMnemonic(mnemonic);
    await unlock();
    console.log('[VERIFY] devOnboard mnemonic generated');
  }

  if (p.verify) {
    await runManagedRoundtrip(creds);
  }
  if (p.cleanup) {
    await deleteAccount(creds);
    console.log('[VERIFY] devOnboard account deleted');
  }
}

/**
 * Generates a random in-memory blob, uploads via the managed client, fetches
 * /usage, downloads, asserts the bytes match, then logs the canonical
 * `[VERIFY] managed roundtrip OK bytes=<n>` line.
 */
export async function runManagedRoundtrip(creds: BucketCredentials): Promise<void> {
  const size = 200 * 1024;
  const buf = Buffer.alloc(size);
  for (let i = 0; i < size; i++) buf[i] = (i * 1103515245 + 12345) & 0xff;
  const key = `verify-${Date.now()}.bin`;

  const before = await getServerUsage(creds);
  console.log(`[VERIFY] usage before=${JSON.stringify(before)}`);

  await putObject(creds, key, buf, 'application/octet-stream');
  console.log(`[VERIFY] uploaded key=${key} bytes=${size}`);

  const after = await getServerUsage(creds);
  console.log(`[VERIFY] usage after=${JSON.stringify(after)}`);
  if (after.usedBytes < before.usedBytes + size) {
    throw new Error(
      `[VERIFY] usage did not grow: before=${before.usedBytes} after=${after.usedBytes}`,
    );
  }

  const got = await getObject(creds, key);
  if (got.length !== size) {
    throw new Error(`[VERIFY] size mismatch: ${got.length} != ${size}`);
  }
  for (let i = 0; i < size; i++) {
    if (got[i] !== buf[i]) throw new Error(`[VERIFY] byte mismatch @ ${i}`);
  }

  console.log(`[VERIFY] managed roundtrip OK bytes=${size}`);
}
