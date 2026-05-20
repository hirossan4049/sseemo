import type { Env } from './types';

export interface QuotaSnapshot {
  usedBytes: number;
  limitBytes: number;
  reservedBytes: number;
}

export async function ensureUser(env: Env, sub: string, email?: string): Promise<void> {
  const now = Date.now();
  const limit = Number(env.FREE_LIMIT_BYTES);
  await env.DB.prepare(
    `INSERT INTO users (id, email, created_at, used_bytes, limit_bytes)
     VALUES (?1, ?2, ?3, 0, ?4)
     ON CONFLICT(id) DO UPDATE SET email=COALESCE(excluded.email, users.email)`,
  )
    .bind(sub, email ?? null, now, limit)
    .run();
}

export async function snapshot(env: Env, userId: string): Promise<QuotaSnapshot> {
  await sweepReservations(env);
  const u = await env.DB.prepare(
    'SELECT used_bytes, limit_bytes FROM users WHERE id=?1',
  )
    .bind(userId)
    .first<{ used_bytes: number; limit_bytes: number }>();
  if (!u) throw new Error('quota: user not found');
  const r = await env.DB.prepare(
    'SELECT COALESCE(SUM(bytes),0) AS s FROM reservations WHERE user_id=?1',
  )
    .bind(userId)
    .first<{ s: number }>();
  return {
    usedBytes: u.used_bytes,
    limitBytes: u.limit_bytes,
    reservedBytes: r?.s ?? 0,
  };
}

/** Throws if adding `bytes` would exceed the user's quota. */
export async function reserve(
  env: Env,
  userId: string,
  key: string,
  bytes: number,
  ttlSeconds = 900,
): Promise<string> {
  const snap = await snapshot(env, userId);
  if (snap.usedBytes + snap.reservedBytes + bytes > snap.limitBytes) {
    throw new QuotaExceeded(
      `quota exceeded: used=${snap.usedBytes} reserved=${snap.reservedBytes} add=${bytes} limit=${snap.limitBytes}`,
    );
  }
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO reservations (id, user_id, key, bytes, expires_at, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  )
    .bind(id, userId, key, bytes, now + ttlSeconds * 1000, now)
    .run();
  return id;
}

/** Convert reservation -> committed used_bytes (after PUT/multipart complete). */
export async function commitReservation(env: Env, reservationId: string): Promise<void> {
  const r = await env.DB.prepare(
    'SELECT user_id, bytes FROM reservations WHERE id=?1',
  )
    .bind(reservationId)
    .first<{ user_id: string; bytes: number }>();
  if (!r) return;
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET used_bytes = used_bytes + ?1 WHERE id=?2').bind(
      r.bytes,
      r.user_id,
    ),
    env.DB.prepare('DELETE FROM reservations WHERE id=?1').bind(reservationId),
  ]);
}

export async function releaseReservation(env: Env, reservationId: string): Promise<void> {
  await env.DB.prepare('DELETE FROM reservations WHERE id=?1').bind(reservationId).run();
}

export async function recordDelete(
  env: Env,
  userId: string,
  bytes: number,
): Promise<void> {
  await env.DB.prepare(
    'UPDATE users SET used_bytes = MAX(0, used_bytes - ?1) WHERE id=?2',
  )
    .bind(bytes, userId)
    .run();
}

async function sweepReservations(env: Env): Promise<void> {
  await env.DB.prepare('DELETE FROM reservations WHERE expires_at < ?1')
    .bind(Date.now())
    .run();
}

export class QuotaExceeded extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'QuotaExceeded';
  }
}
