import aws4 from 'aws4';
import { BucketCredentials } from '@/crypto/keychain';

export interface S3Object {
  key: string;
  size: number;
  etag: string;
  lastModified: string;
}

function endpointHost(creds: BucketCredentials): string {
  return creds.endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '');
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
  const qs = query
    ? '?' +
      Object.entries(query)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&')
    : '';
  const opts: aws4.Request = {
    host,
    path: `/${creds.bucket}${path}${qs}`,
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

export async function headBucket(creds: BucketCredentials): Promise<boolean> {
  const r = await signedFetch(creds, 'HEAD', '/');
  return r.ok;
}

export async function listObjects(
  creds: BucketCredentials,
  prefix = '',
): Promise<S3Object[]> {
  const r = await signedFetch(creds, 'GET', '/', {
    'list-type': '2',
    prefix,
  });
  if (!r.ok) throw new Error(`list failed: ${r.status}`);
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
  const r = await signedFetch(creds, 'PUT', `/${encodeURI(key)}`, undefined, body, {
    'content-type': contentType,
    'content-length': String(body.length),
  });
  if (!r.ok) throw new Error(`put failed: ${r.status} ${await r.text()}`);
}

export async function getObject(
  creds: BucketCredentials,
  key: string,
  range?: [number, number],
): Promise<Buffer> {
  const headers: Record<string, string> = {};
  if (range) headers.range = `bytes=${range[0]}-${range[1]}`;
  const r = await signedFetch(creds, 'GET', `/${encodeURI(key)}`, undefined, undefined, headers);
  if (!r.ok) throw new Error(`get failed: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

export async function deleteObject(
  creds: BucketCredentials,
  key: string,
): Promise<void> {
  const r = await signedFetch(creds, 'DELETE', `/${encodeURI(key)}`);
  if (!r.ok) throw new Error(`delete failed: ${r.status}`);
}

/* ---------- マルチパートアップロード ---------- */

export async function createMultipartUpload(
  creds: BucketCredentials,
  key: string,
): Promise<string> {
  const r = await signedFetch(creds, 'POST', `/${encodeURI(key)}`, { uploads: '' });
  if (!r.ok) throw new Error(`createMultipart failed: ${r.status}`);
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
  const r = await signedFetch(
    creds,
    'PUT',
    `/${encodeURI(key)}`,
    { partNumber: String(partNumber), uploadId },
    body,
  );
  if (!r.ok) throw new Error(`uploadPart failed: ${r.status}`);
  const etag = r.headers.get('etag') ?? '';
  return etag.replace(/"/g, '');
}

export async function completeMultipartUpload(
  creds: BucketCredentials,
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
): Promise<void> {
  const body =
    '<CompleteMultipartUpload>' +
    parts
      .map(
        p =>
          `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>"${p.etag}"</ETag></Part>`,
      )
      .join('') +
    '</CompleteMultipartUpload>';
  const r = await signedFetch(
    creds,
    'POST',
    `/${encodeURI(key)}`,
    { uploadId },
    body,
  );
  if (!r.ok) throw new Error(`complete failed: ${r.status}`);
}

export async function abortMultipartUpload(
  creds: BucketCredentials,
  key: string,
  uploadId: string,
): Promise<void> {
  await signedFetch(creds, 'DELETE', `/${encodeURI(key)}`, { uploadId });
}
