/**
 * SecStorage managed-mode Worker.
 *
 * Auth: every request except `/auth/apple` and `/health` requires
 * `Authorization: Bearer <sessionJwt>`. The JWT is HS256-signed by us and
 * carries the Apple `sub` as the subject.
 *
 * Bytes stored in R2 are already E2E-encrypted client-side. The server only
 * presigns the URLs, tracks per-user quota, and stores the encrypted index.
 */

import type { Env, SessionClaims } from './types';
import {
  signSessionJWT,
  verifySessionJWT,
  verifyAppleIdentityToken,
} from './jwt';
import {
  ensureUser,
  snapshot,
  reserve,
  commitReservation,
  releaseReservation,
  recordDelete,
  QuotaExceeded,
} from './quota';
import { presign } from './sigv4';
import { verifyReceipt } from './iap';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(req.url);
      return await route(req, env, url);
    } catch (e: any) {
      if (e instanceof QuotaExceeded) return json({ error: e.message }, 402);
      const msg = e?.message ?? String(e);
      const status = msg.startsWith('auth:') || msg.startsWith('jwt:') ? 401 : 500;
      return json({ error: msg }, status);
    }
  },
} satisfies ExportedHandler<Env>;

async function route(req: Request, env: Env, url: URL): Promise<Response> {
  const p = url.pathname;

  if (p === '/health') return json({ ok: true });

  if (req.method === 'POST' && p === '/auth/apple') return authApple(req, env);

  // E2E debug: mint a session JWT for a test user, gated by DEBUG_MINT_NONCE.
  // This route is added temporarily for end-to-end verification and removed
  // immediately afterwards. The shared secret is set via `wrangler secret put`
  // and never committed.
  if (req.method === 'POST' && p === '/debug/mint-jwt') return debugMintJwt(req, env);

  // Everything below requires auth.
  const claims = await requireAuth(req, env);

  if (req.method === 'POST' && p === '/iap/verify') return iapVerify(req, env, claims);
  if (req.method === 'GET' && p === '/usage') return usageGet(env, claims);
  if (req.method === 'POST' && p === '/usage/report') return usageReport(req, env, claims);

  if (req.method === 'POST' && p === '/storage/presign') return storagePresign(req, env, claims);
  if (req.method === 'POST' && p === '/storage/commit') return storageCommit(req, env, claims);
  if (req.method === 'POST' && p === '/storage/multipart/init')
    return multipartInit(req, env, claims);
  if (req.method === 'POST' && p === '/storage/multipart/sign')
    return multipartSign(req, env, claims);
  if (req.method === 'POST' && p === '/storage/multipart/complete')
    return multipartComplete(req, env, claims);

  if (req.method === 'PUT' && p === '/index') return indexPut(req, env, claims);
  if (req.method === 'GET' && p === '/index') return indexGet(env, claims);

  if (req.method === 'DELETE' && p === '/account') return accountDelete(env, claims);

  return json({ error: 'not found' }, 404);
}

/* ---------------- helpers ---------------- */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function requireAuth(req: Request, env: Env): Promise<SessionClaims> {
  const h = req.headers.get('authorization') ?? '';
  const m = /^Bearer (.+)$/.exec(h);
  if (!m) throw new Error('auth: missing bearer');
  const payload = await verifySessionJWT(m[1], env.JWT_SECRET);
  if (!payload.sub) throw new Error('auth: no sub');
  return payload as SessionClaims;
}

/** Per-user key prefix in R2. */
function userKey(claims: SessionClaims, sub: string): string {
  if (!/^[A-Za-z0-9._\-/]+$/.test(sub)) throw new Error('bad key');
  return `users/${claims.sub}/${sub}`;
}

function r2Path(env: Env, key: string): string {
  return `/${env.R2_BUCKET}/${key}`;
}

/* ---------------- handlers ---------------- */

async function authApple(req: Request, env: Env): Promise<Response> {
  const { identityToken } = (await req.json()) as { identityToken: string };
  if (!identityToken) return json({ error: 'identityToken required' }, 400);
  const claims = await verifyAppleIdentityToken(
    identityToken,
    env.APPLE_JWKS_URL,
    env.APPLE_AUDIENCE,
  );
  await ensureUser(env, claims.sub, claims.email);
  const jwt = await signSessionJWT(
    { sub: claims.sub, email: claims.email },
    env.JWT_SECRET,
  );
  return json({ token: jwt, userId: claims.sub });
}

async function debugMintJwt(req: Request, env: Env): Promise<Response> {
  const expected = (env as any).DEBUG_MINT_NONCE as string | undefined;
  if (!expected) return json({ error: 'disabled' }, 404);
  const got = req.headers.get('x-debug-nonce') ?? '';
  if (got !== expected) return json({ error: 'forbidden' }, 403);
  const { sub, email } = (await req.json()) as { sub: string; email?: string };
  if (!sub || !/^[A-Za-z0-9._\-]+$/.test(sub)) return json({ error: 'bad sub' }, 400);
  await ensureUser(env, sub, email);
  const jwt = await signSessionJWT({ sub, email }, env.JWT_SECRET);
  return json({ token: jwt, userId: sub });
}

async function iapVerify(req: Request, env: Env, c: SessionClaims): Promise<Response> {
  const { receipt } = (await req.json()) as { receipt: string };
  if (!receipt) return json({ error: 'receipt required' }, 400);
  const r = await verifyReceipt(env, receipt);
  if (r.active) {
    await env.DB.prepare(
      `INSERT INTO subscriptions (user_id, product_id, original_transaction_id, active_until, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(user_id) DO UPDATE SET
         product_id=excluded.product_id,
         original_transaction_id=excluded.original_transaction_id,
         active_until=excluded.active_until,
         updated_at=excluded.updated_at`,
    )
      .bind(
        c.sub,
        r.productId ?? '',
        r.originalTransactionId,
        r.expiresAtMs,
        Date.now(),
      )
      .run();
    // Active subscribers get effectively unlimited storage; set to a huge cap.
    await env.DB.prepare('UPDATE users SET limit_bytes=?1 WHERE id=?2')
      .bind(1024 * 1024 * 1024 * 1024, c.sub)
      .run();
  }
  return json({ active: r.active, expiresAtMs: r.expiresAtMs });
}

async function usageGet(env: Env, c: SessionClaims): Promise<Response> {
  const s = await snapshot(env, c.sub);
  return json({
    usedBytes: s.usedBytes,
    reservedBytes: s.reservedBytes,
    limitBytes: s.limitBytes,
  });
}

/**
 * BYO-mode delta report. Managed mode trusts server-side accounting and
 * shouldn't call this; if it does, the server simply records the value.
 */
async function usageReport(req: Request, env: Env, c: SessionClaims): Promise<Response> {
  const { used } = (await req.json()) as { used: number };
  if (typeof used !== 'number' || used < 0) return json({ error: 'bad used' }, 400);
  await env.DB.prepare('UPDATE users SET used_bytes=?1 WHERE id=?2')
    .bind(used, c.sub)
    .run();
  return json({ ok: true });
}

async function storagePresign(
  req: Request,
  env: Env,
  c: SessionClaims,
): Promise<Response> {
  const body = (await req.json()) as {
    op: 'put' | 'get' | 'delete';
    key: string;
    contentLength?: number;
  };
  const key = userKey(c, body.key);
  const ttl = Number(env.PRESIGN_TTL_SECONDS);
  let reservationId: string | undefined;
  let method: 'PUT' | 'GET' | 'DELETE';
  if (body.op === 'put') {
    if (typeof body.contentLength !== 'number' || body.contentLength <= 0) {
      return json({ error: 'contentLength required' }, 400);
    }
    reservationId = await reserve(env, c.sub, key, body.contentLength, ttl);
    method = 'PUT';
  } else if (body.op === 'get') {
    method = 'GET';
  } else if (body.op === 'delete') {
    // Decrement happens at /storage/commit with op=delete + bytes.
    method = 'DELETE';
  } else {
    return json({ error: 'bad op' }, 400);
  }
  const url = await presign({
    method,
    endpoint: env.R2_ENDPOINT,
    path: r2Path(env, key),
    region: env.R2_REGION,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    expiresSec: ttl,
  });
  return json({ url, key, reservationId, expiresInSec: ttl });
}

/**
 * Client reports the result of a presigned operation so we can adjust quota.
 * For `put` we commit the reservation; for `delete` we subtract bytes.
 */
async function storageCommit(req: Request, env: Env, c: SessionClaims): Promise<Response> {
  const body = (await req.json()) as {
    op: 'put' | 'delete' | 'abort';
    reservationId?: string;
    bytes?: number;
  };
  if (body.op === 'put') {
    if (!body.reservationId) return json({ error: 'reservationId required' }, 400);
    await commitReservation(env, body.reservationId);
  } else if (body.op === 'abort') {
    if (body.reservationId) await releaseReservation(env, body.reservationId);
  } else if (body.op === 'delete') {
    await recordDelete(env, c.sub, body.bytes ?? 0);
  } else {
    return json({ error: 'bad op' }, 400);
  }
  return json({ ok: true });
}

async function multipartInit(
  req: Request,
  env: Env,
  c: SessionClaims,
): Promise<Response> {
  const body = (await req.json()) as { key: string; contentLength: number };
  const key = userKey(c, body.key);
  if (typeof body.contentLength !== 'number' || body.contentLength <= 0) {
    return json({ error: 'contentLength required' }, 400);
  }
  const reservationId = await reserve(
    env,
    c.sub,
    key,
    body.contentLength,
    Number(env.PRESIGN_TTL_SECONDS) * 4, // multipart sessions live longer
  );
  // Presign the CreateMultipartUpload (POST ?uploads=).
  const url = await presign({
    method: 'POST',
    endpoint: env.R2_ENDPOINT,
    path: r2Path(env, key),
    region: env.R2_REGION,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    expiresSec: Number(env.PRESIGN_TTL_SECONDS),
    query: { uploads: '' },
  });
  return json({ initiateUrl: url, key, reservationId });
}

async function multipartSign(
  req: Request,
  env: Env,
  c: SessionClaims,
): Promise<Response> {
  const body = (await req.json()) as {
    key: string;
    uploadId: string;
    partNumber: number;
  };
  const key = userKey(c, body.key);
  const url = await presign({
    method: 'PUT',
    endpoint: env.R2_ENDPOINT,
    path: r2Path(env, key),
    region: env.R2_REGION,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    expiresSec: Number(env.PRESIGN_TTL_SECONDS),
    query: { partNumber: String(body.partNumber), uploadId: body.uploadId },
  });
  return json({ url });
}

async function multipartComplete(
  req: Request,
  env: Env,
  c: SessionClaims,
): Promise<Response> {
  const body = (await req.json()) as {
    key: string;
    uploadId: string;
    reservationId: string;
  };
  const key = userKey(c, body.key);
  const url = await presign({
    method: 'POST',
    endpoint: env.R2_ENDPOINT,
    path: r2Path(env, key),
    region: env.R2_REGION,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    expiresSec: Number(env.PRESIGN_TTL_SECONDS),
    query: { uploadId: body.uploadId },
  });
  // Client will POST the CompleteMultipartUpload XML to this URL. The
  // reservation commit happens here because we know they're calling complete.
  await commitReservation(env, body.reservationId);
  return json({ completeUrl: url });
}

async function indexPut(req: Request, env: Env, c: SessionClaims): Promise<Response> {
  const buf = await req.arrayBuffer();
  if (buf.byteLength > 16 * 1024 * 1024) return json({ error: 'index too large' }, 413);
  await env.USER_DATA.put(`users/${c.sub}/index.bin`, buf);
  return json({ ok: true, bytes: buf.byteLength });
}

async function indexGet(env: Env, c: SessionClaims): Promise<Response> {
  const obj = await env.USER_DATA.get(`users/${c.sub}/index.bin`);
  if (!obj) return new Response('', { status: 404 });
  return new Response(await obj.arrayBuffer(), {
    headers: { 'content-type': 'application/octet-stream' },
  });
}

async function accountDelete(env: Env, c: SessionClaims): Promise<Response> {
  // Wipe R2 prefix in batches.
  let cursor: string | undefined;
  for (let i = 0; i < 1000; i++) {
    const listed = await env.USER_DATA.list({
      prefix: `users/${c.sub}/`,
      cursor,
      limit: 1000,
    });
    if (listed.objects.length) {
      await env.USER_DATA.delete(listed.objects.map(o => o.key));
    }
    if (!listed.truncated) break;
    cursor = listed.cursor;
  }
  await env.DB.prepare('DELETE FROM users WHERE id=?1').bind(c.sub).run();
  return json({ ok: true });
}
