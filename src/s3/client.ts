import aws4 from 'aws4';
import { BucketCredentials } from '@/crypto/keychain';
import * as managed from './managedClient';

export interface S3Object {
  key: string;
  size: number;
  etag: string;
  lastModified: string;
}

const isManaged = (c: BucketCredentials) => c.mode === 'managed';

function endpointHost(creds: BucketCredentials): string {
  return creds.endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function buildQuery(query?: Record<string, string>): string {
  if (!query) return '';
  return (
    '?' +
    Object.entries(query)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')
  );
}

function signedFetch(
  creds: BucketCredentials,
  method: string,
  path: string,
  query?: Record<string, string>,
  body?: Buffer | string,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const host = endpointHost(creds);
  const opts: aws4.Request = {
    host,
    path: `/${creds.bucket}${path}${buildQuery(query)}`,
    method,
    service: 's3',
    region: creds.region,
    body: body as any,
    headers: extraHeaders,
  };
  aws4.sign(opts, {
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
  });
  return fetch(`https://${host}${opts.path}`, {
    method,
    headers: opts.headers as any,
    body: body as any,
  });
}

async function ensureOk(r: Response, op: string): Promise<Response> {
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    throw new Error(`${op} failed: ${r.status}${detail ? ` ${detail}` : ''}`);
  }
  return r;
}

const encodeKey = (key: string) => `/${encodeURI(key)}`;

export async function headBucket(creds: BucketCredentials): Promise<boolean> {
  if (isManaged(creds)) return managed.headBucket(creds);
  const r = await signedFetch(creds, 'HEAD', '/');
  return r.ok;
}

export async function listObjects(
  creds: BucketCredentials,
  prefix = '',
): Promise<S3Object[]> {
  if (isManaged(creds)) return managed.listObjects(creds, prefix);
  const r = await ensureOk(
    await signedFetch(creds, 'GET', '/', { 'list-type': '2', prefix }),
    'list',
  );
  const xml = await r.text();
  // 最低限のXMLパース (Contents 要素の抽出)
  const out: S3Object[] = [];
  const re =
    /<Contents>\s*<Key>([^<]+)<\/Key>\s*<LastModified>([^<]+)<\/LastModified>\s*<ETag>"?([^"<]+)"?<\/ETag>\s*<Size>(\d+)<\/Size>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    out.push({
      key: m[1],
      lastModified: m[2],
      etag: m[3],
      size: parseInt(m[4], 10),
    });
  }
  return out;
}

export async function putObject(
  creds: BucketCredentials,
  key: string,
  body: Buffer,
  contentType = 'application/octet-stream',
): Promise<void> {
  if (isManaged(creds)) return managed.putObject(creds, key, body, contentType);
  await ensureOk(
    await signedFetch(creds, 'PUT', encodeKey(key), undefined, body, {
      'content-type': contentType,
      'content-length': String(body.length),
    }),
    'put',
  );
}

export async function getObject(
  creds: BucketCredentials,
  key: string,
  range?: [number, number],
): Promise<Buffer> {
  if (isManaged(creds)) return managed.getObject(creds, key, range);
  const headers: Record<string, string> = {};
  if (range) headers.range = `bytes=${range[0]}-${range[1]}`;
  const r = await ensureOk(
    await signedFetch(creds, 'GET', encodeKey(key), undefined, undefined, headers),
    'get',
  );
  return Buffer.from(await r.arrayBuffer());
}

export async function deleteObject(
  creds: BucketCredentials,
  key: string,
): Promise<void> {
  if (isManaged(creds)) return managed.deleteObject(creds, key);
  await ensureOk(
    await signedFetch(creds, 'DELETE', encodeKey(key)),
    'delete',
  );
}

/* ---------- マルチパートアップロード ---------- */

// Managed mode needs to remember the reservationId between createMpu and
// completeMpu so it can release/commit quota. We stash it keyed by uploadId.
const managedMpuReservations = new Map<string, string>();

export async function createMultipartUpload(
  creds: BucketCredentials,
  key: string,
  contentLength?: number,
): Promise<string> {
  if (isManaged(creds)) {
    if (!contentLength) throw new Error('createMultipartUpload: contentLength required in managed mode');
    const { uploadId, reservationId } = await managed.createMultipartUpload(
      creds,
      key,
      contentLength,
    );
    managedMpuReservations.set(uploadId, reservationId);
    return uploadId;
  }
  const r = await ensureOk(
    await signedFetch(creds, 'POST', encodeKey(key), { uploads: '' }),
    'createMultipart',
  );
  const xml = await r.text();
  const m = xml.match(/<UploadId>([^<]+)<\/UploadId>/);
  if (!m) throw new Error('no UploadId');
  return m[1];
}

export async function uploadPart(
  creds: BucketCredentials,
  key: string,
  uploadId: string,
  partNumber: number,
  body: Buffer,
): Promise<string> {
  if (isManaged(creds)) {
    return managed.uploadPart(creds, key, uploadId, partNumber, body);
  }
  const r = await ensureOk(
    await signedFetch(
      creds,
      'PUT',
      encodeKey(key),
      { partNumber: String(partNumber), uploadId },
      body,
    ),
    'uploadPart',
  );
  const etag = r.headers.get('etag') ?? '';
  return etag.replace(/"/g, '');
}

export async function completeMultipartUpload(
  creds: BucketCredentials,
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
): Promise<void> {
  if (isManaged(creds)) {
    const reservationId = managedMpuReservations.get(uploadId);
    managedMpuReservations.delete(uploadId);
    return managed.completeMultipartUpload(creds, key, uploadId, parts, reservationId);
  }
  const body =
    '<CompleteMultipartUpload>' +
    parts
      .map(
        p =>
          `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>"${p.etag}"</ETag></Part>`,
      )
      .join('') +
    '</CompleteMultipartUpload>';
  await ensureOk(
    await signedFetch(creds, 'POST', encodeKey(key), { uploadId }, body),
    'complete',
  );
}

export async function abortMultipartUpload(
  creds: BucketCredentials,
  key: string,
  uploadId: string,
): Promise<void> {
  if (isManaged(creds)) {
    managedMpuReservations.delete(uploadId);
    return managed.abortMultipartUpload(creds, key, uploadId);
  }
  await signedFetch(creds, 'DELETE', encodeKey(key), { uploadId });
}
