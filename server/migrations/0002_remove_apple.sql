-- Remove Sign in with Apple. Switch to device-bound anonymous auth.
--
-- The `users.id` column previously held the Apple `sub` claim. It now holds
-- `device:<deviceTag>` strings issued by POST /auth/device. We don't migrate
-- existing rows (there were none in prod with real Apple `sub`s during the
-- SIWA-disabled window); we just relax the comment-level semantics and drop
-- the `email` column's UNIQUE-ish role since no two device users share an
-- email (it's always NULL).
--
-- The schema itself is already permissive (`id TEXT PRIMARY KEY`, `email TEXT`
-- nullable). The migration is intentionally a no-op DDL plus a sentinel row
-- so wrangler records that it ran, which keeps `wrangler d1 migrations list`
-- aligned with the source tree.

-- Sentinel: insert-or-ignore a marker row so this migration is observable.
INSERT OR IGNORE INTO users (id, email, created_at, used_bytes, limit_bytes)
VALUES ('migration:0002_remove_apple', NULL, 0, 0, 0);
