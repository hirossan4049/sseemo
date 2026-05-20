/**
 * Managed-mode S3 client.
 *
 * Talks to the sseemo backend (`server/`) for short-lived presigned URLs
 * against R2 instead of signing requests locally. Exposes the same API as the
 * BYO `client.ts` so the rest of the app doesn't have to know the difference.
 */

import { BucketCredentials } from '@/crypto/keychain';
import type { S3Object } from './client';

function base(creds: BucketCredentials): string {
  const u = creds.backendUrl;
  if (!u) throw new Error('managed: backendUrl missing');
  return u.replace(/\/$/, '');
}

function authHeaders(creds: BucketCredentials): Record<string, string> {
  if (!creds.sessionToken) throw new Error('managed: sessionToken missing');
  return { authorization: `Bearer ${creds.sessionToken}` };
}

async function jsonPost<T>(
  creds: BucketCredentials,
  path: string,
  body: unknown,
): Promise<T> {
  const r = await fetch(`${base(creds)}${path}`, {
    method: 'POST',
    headers: { ...authHeaders(creds), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`${path} failed: ${r.status} ${t}`);
  }
  return (await r.json()) as T;
}

interface PresignResp {
  url: string;
  key: string;
  reservationId?: string;
  expiresInSec: number;
}

export async function headBucket(_: BucketCredentials): Promise<boolean> {
  // For managed mode there's no per-bucket connection test; auth presence is
  // the equivalent. Caller already has a JWT by the time we get here.
  return true;
}

/**
 * Managed mode keeps the authoritative listing on the server; clients use the
 * encrypted index (`/index`) instead. We expose listObjects for shape parity
 * but it returns an empty array.
 */
export async function listObjects(
  _: BucketCredentials,
  __ = '',
): Promise<S3Object[]> {
  return [];
}

export async function putObject(
  creds: BucketCredentials,
  key: string,
  body: Buffer,
  contentType = 'application/octet-stream',
): Promise<void> {
  const p = await jsonPost<PresignResp>(creds, '/storage/presign', {
    op: 'put',
    key,
    contentLength: body.length,
  });
  const r = await fetch(p.url, {
    method: 'PUT',
    headers: { 'content-type': contentType, 'content-length': String(body.length) },
    body: body as any,
  });
  if (!r.ok) {
    await jsonPost(creds, '/storage/commit', {
      op: 'abort',
      reservationId: p.reservationId,
    }).catch(() => {});
    throw new Error(`managed put failed: ${r.status}`);
  }
  await jsonPost(creds, '/storage/commit', {
    op: 'put',
    reservationId: p.reservationId,
  });
}

export async function getObject(
  creds: BucketCredentials,
  key: string,
  range?: [number, number],
): Promise<Buffer> {
  const p = await jsonPost<PresignResp>(creds, '/storage/presign', {
    op: 'get',
    key,
  });
  const headers: Record<string, string> = {};
  if (range) headers.range = `bytes=${range[0]}-${range[1]}`;
  const r = await fetch(p.url, { method: 'GET', headers });
  if (!r.ok) throw new Error(`managed get failed: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

export async function deleteObject(
  creds: BucketCredentials,
  key: string,
): Promise<void> {
  // We don't know the original size from here; the server tracks usage on
  // its own (it can reconcile by listing R2), so just call delete.
  const p = await jsonPost<PresignResp>(creds, '/storage/presign', {
    op: 'delete',
    key,
  });
  const r = await fetch(p.url, { method: 'DELETE' });
  if (!r.ok && r.status !== 404) throw new Error(`managed delete failed: ${r.status}`);
  await jsonPost(creds, '/storage/commit', { op: 'delete', bytes: 0 }).catch(() => {});
}

/* ---------- multipart ---------- */

interface InitResp {
  initiateUrl: string;
  key: string;
  reservationId: string;
}

export async function createMultipartUpload(
  creds: BucketCredentials,
  key: string,
  contentLength: number,
): Promise<{ uploadId: string; reservationId: string }> {
  const init = await jsonPost<InitResp>(creds, '/storage/multipart/init', {
    key,
    contentLength,
  });
  const r = await fetch(init.initiateUrl, { method: 'POST' });
  if (!r.ok) throw new Error(`managed mpu init failed: ${r.status}`);
  const xml = await r.text();
  const m = xml.match(/<UploadId>([^<]+)<\/UploadId>/);
  if (!m) throw new Error('managed mpu: no UploadId in response');
  return { uploadId: m[1], reservationId: init.reservationId };
}

export async function uploadPart(
  creds: BucketCredentials,
  key: string,
  uploadId: string,
  partNumber: number,
  body: Buffer,
): Promise<string> {
  const p = await jsonPost<{ url: string }>(creds, '/storage/multipart/sign', {
    key,
    uploadId,
    partNumber,
  });
  const r = await fetch(p.url, { method: 'PUT', body: body as any });
  if (!r.ok) throw new Error(`managed uploadPart failed: ${r.status}`);
  return (r.headers.get('etag') ?? '').replace(/"/g, '');
}

export async function completeMultipartUpload(
  creds: BucketCredentials,
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
  reservationId?: string,
): Promise<void> {
  const p = await jsonPost<{ completeUrl: string }>(
    creds,
    '/storage/multipart/complete',
    { key, uploadId, reservationId },
  );
  const xmlBody =
    '<CompleteMultipartUpload>' +
    parts
      .map(
        x =>
          `<Part><PartNumber>${x.partNumber}</PartNumber><ETag>"${x.etag}"</ETag></Part>`,
      )
      .join('') +
    '</CompleteMultipartUpload>';
  const r = await fetch(p.completeUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/xml' },
    body: xmlBody,
  });
  if (!r.ok) throw new Error(`managed mpu complete failed: ${r.status}`);
}

export async function abortMultipartUpload(
  _creds: BucketCredentials,
  _key: string,
  _uploadId: string,
): Promise<void> {
  // No presign for abort in the current API; rely on reservation TTL to
  // release the quota. Server-side reconcile sweeps orphaned multiparts.
}

/* ---------- managed-only endpoints ---------- */

export async function putIndex(creds: BucketCredentials, blob: Buffer): Promise<void> {
  const r = await fetch(`${base(creds)}/index`, {
    method: 'PUT',
    headers: { ...authHeaders(creds), 'content-type': 'application/octet-stream' },
    body: blob as any,
  });
  if (!r.ok) throw new Error(`index put failed: ${r.status}`);
}

export async function getIndex(creds: BucketCredentials): Promise<Buffer | null> {
  const r = await fetch(`${base(creds)}/index`, {
    method: 'GET',
    headers: authHeaders(creds),
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`index get failed: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

export async function getServerUsage(
  creds: BucketCredentials,
): Promise<{ usedBytes: number; limitBytes: number; reservedBytes: number }> {
  const r = await fetch(`${base(creds)}/usage`, { headers: authHeaders(creds) });
  if (!r.ok) throw new Error(`usage get failed: ${r.status}`);
  return r.json() as any;
}

export async function verifyIapReceipt(
  creds: BucketCredentials,
  receipt: string,
): Promise<{ active: boolean; expiresAtMs: number }> {
  return jsonPost(creds, '/iap/verify', { receipt });
}

export async function deleteAccount(creds: BucketCredentials): Promise<void> {
  const r = await fetch(`${base(creds)}/account`, {
    method: 'DELETE',
    headers: authHeaders(creds),
  });
  if (!r.ok) throw new Error(`account delete failed: ${r.status}`);
}

export async function authApple(
  backendUrl: string,
  identityToken: string,
): Promise<{ token: string; userId: string }> {
  const r = await fetch(`${backendUrl.replace(/\/$/, '')}/auth/apple`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identityToken }),
  });
  if (!r.ok) throw new Error(`auth/apple failed: ${r.status}`);
  return r.json() as any;
}
