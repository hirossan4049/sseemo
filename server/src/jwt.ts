/**
 * Compact HS256 JWT signer/verifier and Apple identityToken (RS256) verifier
 * using JWKS from `appleid.apple.com/auth/keys`.
 *
 * Pure WebCrypto so it runs on Workers without any deps.
 */

const enc = new TextEncoder();

function b64uEncode(bytes: Uint8Array | string): string {
  const b = typeof bytes === 'string' ? enc.encode(bytes) : bytes;
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64uDecode(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function b64uDecodeStr(s: string): string {
  return new TextDecoder().decode(b64uDecode(s));
}

export async function signSessionJWT(
  payload: Record<string, unknown>,
  secret: string,
  ttlSeconds = 60 * 60 * 24 * 30,
): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const full = { iat: now, exp: now + ttlSeconds, ...payload };
  const headPart = b64uEncode(JSON.stringify(header));
  const bodyPart = b64uEncode(JSON.stringify(full));
  const signingInput = `${headPart}.${bodyPart}`;
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(signingInput));
  return `${signingInput}.${b64uEncode(new Uint8Array(sig))}`;
}

export async function verifySessionJWT(
  token: string,
  secret: string,
): Promise<Record<string, any>> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('jwt: malformed');
  const [h, p, s] = parts;
  const signingInput = `${h}.${p}`;
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const ok = await crypto.subtle.verify(
    'HMAC',
    key,
    b64uDecode(s),
    enc.encode(signingInput),
  );
  if (!ok) throw new Error('jwt: bad signature');
  const payload = JSON.parse(b64uDecodeStr(p));
  if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('jwt: expired');
  }
  return payload;
}

interface JWK {
  kid: string;
  kty: 'RSA';
  n: string;
  e: string;
  alg?: string;
  use?: string;
}

let jwksCache: { url: string; at: number; keys: JWK[] } | null = null;

async function loadJWKS(url: string): Promise<JWK[]> {
  if (jwksCache && jwksCache.url === url && Date.now() - jwksCache.at < 3600_000) {
    return jwksCache.keys;
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error('jwks: fetch failed');
  const j = (await r.json()) as { keys: JWK[] };
  jwksCache = { url, at: Date.now(), keys: j.keys };
  return j.keys;
}

/** For tests: inject a JWKS instead of fetching. */
export function __setJWKSForTest(url: string, keys: JWK[]): void {
  jwksCache = { url, at: Date.now(), keys };
}

export interface AppleIdentityClaims {
  sub: string;
  email?: string;
  aud: string;
  iss: string;
  exp: number;
}

export async function verifyAppleIdentityToken(
  token: string,
  jwksUrl: string,
  expectedAudience: string,
): Promise<AppleIdentityClaims> {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) throw new Error('apple: malformed');
  const header = JSON.parse(b64uDecodeStr(h));
  const payload = JSON.parse(b64uDecodeStr(p));
  if (header.alg !== 'RS256') throw new Error('apple: bad alg');
  const keys = await loadJWKS(jwksUrl);
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) throw new Error('apple: no matching JWK');
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true } as JsonWebKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64uDecode(s),
    enc.encode(`${h}.${p}`),
  );
  if (!ok) throw new Error('apple: bad signature');
  if (payload.iss !== 'https://appleid.apple.com') throw new Error('apple: bad iss');
  if (payload.aud !== expectedAudience) throw new Error('apple: bad aud');
  if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('apple: expired');
  }
  return payload as AppleIdentityClaims;
}
