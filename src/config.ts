/**
 * アプリ全体で散らばっていた数値・SKU・KDF パラメータの単一参照点。
 * 暗号フォーマット定数 (HEADER_SIZE 等) は wire-format 関連なので
 * `crypto/format.ts` に残し、こちらにはアプリ仕様(課金・無料枠)を集める。
 */

/** App Store IAP プロダクト: ¥480/月/バケット (spec §4) */
export const SUBSCRIPTION_SKU = 'app.secstorage.bucket.monthly';

/** 無料枠 (spec §3) — マネージド: 5GB, BYO: 10GB。アカウント単位で合算。 */
export const FREE_LIMIT_MANAGED = 5 * 1024 ** 3;
export const FREE_LIMIT_BYO = 10 * 1024 ** 3;

/** Argon2id (OWASP 2024 推奨, spec §5) */
export const ARGON2 = {
  time: 3,
  memKiB: 64 * 1024,
  parallelism: 4,
  hashLen: 32,
} as const;

/** S3 マルチパート最小パートサイズ (5 MiB) */
export const S3_PART_MIN = 5 * 1024 * 1024;

/**
 * Managed mode backend (Cloudflare Worker) origin. Read from app.json extra
 * if present, else fallback. Override per-build with:
 *   "expo": { "extra": { "managedBackendUrl": "https://api.example.com" } }
 */
function readManagedBackendUrl(): string {
  // app.json extras aren't statically importable here without breaking RN
  // bundling; consumers can override via setManagedBackendUrl().
  return (
    (globalThis as any).__SECSTORAGE_MANAGED_BACKEND_URL__ ??
    'https://api.example.com'
  );
}

export const MANAGED_BACKEND_URL = readManagedBackendUrl();
