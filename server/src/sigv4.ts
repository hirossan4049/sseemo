/**
 * Minimal AWS SigV4 query-string presigner.
 *
 * Targets Cloudflare R2's S3-compatible endpoint
 * (`https://<accountid>.r2.cloudflarestorage.com/<bucket>/<key>`)
 * but is generic SigV4 so any S3-compatible host works.
 *
 * Only implements what we need: presigned URLs for PUT/GET/DELETE and
 * for multipart sub-ops (CreateMultipartUpload via POST?uploads, UploadPart,
 * CompleteMultipartUpload, AbortMultipartUpload). Uses UNSIGNED-PAYLOAD so
 * the client can stream bytes without us hashing them.
 */

export interface PresignInput {
  method: 'GET' | 'PUT' | 'DELETE' | 'POST' | 'HEAD';
  /** Full origin like `https://accountid.r2.cloudflarestorage.com` */
  endpoint: string;
  /** Path segments AFTER the origin, leading slash required. e.g. `/bucket/key` */
  path: string;
  region: string;
  service?: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Seconds, max 604800 (7 days). R2 follows the S3 cap. */
  expiresSec: number;
  /** Extra query params to include in the canonical request. */
  query?: Record<string, string>;
  /** Wall-clock time in ms. Defaults to Date.now(). Override for tests. */
  nowMs?: number;
  /** Extra signed headers (host is always signed). */
  signedHeaders?: Record<string, string>;
}

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}

async function sha256(data: string | Uint8Array): Promise<ArrayBuffer> {
  const bytes = typeof data === 'string' ? enc.encode(data) : data;
  return crypto.subtle.digest('SHA-256', bytes);
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', k, enc.encode(data));
}

function amzDate(d: Date): { date: string; dateTime: string } {
  const iso = d.toISOString().replace(/[-:]|\.\d{3}/g, '');
  return { dateTime: iso, date: iso.slice(0, 8) };
}

/** RFC3986 component-safe encode. AWS requires this for path & query. */
function uriEncode(s: string, encodeSlash = true): string {
  let out = '';
  for (const ch of s) {
    if (/[A-Za-z0-9\-_.~]/.test(ch)) out += ch;
    else if (ch === '/') out += encodeSlash ? '%2F' : '/';
    else {
      const bytes = enc.encode(ch);
      for (const b of bytes) out += '%' + b.toString(16).toUpperCase().padStart(2, '0');
    }
  }
  return out;
}

function canonicalQuery(q: Record<string, string>): string {
  const keys = Object.keys(q).sort();
  return keys
    .map(k => `${uriEncode(k)}=${uriEncode(q[k])}`)
    .join('&');
}

async function deriveKey(
  secret: string,
  date: string,
  region: string,
  service: string,
): Promise<ArrayBuffer> {
  const kDate = await hmac(enc.encode('AWS4' + secret), date);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

export async function presign(input: PresignInput): Promise<string> {
  const service = input.service ?? 's3';
  const now = new Date(input.nowMs ?? Date.now());
  const { date, dateTime } = amzDate(now);
  const host = new URL(input.endpoint).host;
  const credentialScope = `${date}/${input.region}/${service}/aws4_request`;
  const signedHeaderEntries: [string, string][] = [['host', host]];
  if (input.signedHeaders) {
    for (const [k, v] of Object.entries(input.signedHeaders)) {
      signedHeaderEntries.push([k.toLowerCase(), v.trim()]);
    }
  }
  signedHeaderEntries.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const signedHeaderList = signedHeaderEntries.map(([k]) => k).join(';');
  const canonicalHeaders =
    signedHeaderEntries.map(([k, v]) => `${k}:${v}`).join('\n') + '\n';

  const baseQuery: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${input.accessKeyId}/${credentialScope}`,
    'X-Amz-Date': dateTime,
    'X-Amz-Expires': String(input.expiresSec),
    'X-Amz-SignedHeaders': signedHeaderList,
    ...(input.query ?? {}),
  };
  const cq = canonicalQuery(baseQuery);

  // path is already pre-quoted but we want to ensure it's correctly encoded.
  // We re-encode each segment, keeping '/' as separator.
  const encodedPath = input.path
    .split('/')
    .map(seg => uriEncode(seg, true))
    .join('/');

  const canonicalRequest = [
    input.method,
    encodedPath || '/',
    cq,
    canonicalHeaders,
    signedHeaderList,
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const crHash = toHex(await sha256(canonicalRequest));
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    dateTime,
    credentialScope,
    crHash,
  ].join('\n');

  const signingKey = await deriveKey(input.secretAccessKey, date, input.region, service);
  const signature = toHex(await hmac(signingKey, stringToSign));

  const url = `${input.endpoint}${encodedPath}?${cq}&X-Amz-Signature=${signature}`;
  return url;
}
