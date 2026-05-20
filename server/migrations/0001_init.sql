-- SecStorage managed-mode schema.

CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,           -- Apple `sub` claim
  email        TEXT,
  created_at   INTEGER NOT NULL,
  used_bytes   INTEGER NOT NULL DEFAULT 0,
  limit_bytes  INTEGER NOT NULL DEFAULT 5368709120,
  deleted_at   INTEGER
);

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id                 TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  product_id              TEXT NOT NULL,
  original_transaction_id TEXT,
  active_until            INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL
);

-- Pending PUT reservations so concurrent uploads can't blow past the quota.
-- TTL'd: server sweeps rows older than `expires_at` whenever it touches the table.
CREATE TABLE IF NOT EXISTS reservations (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  bytes       INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS reservations_user_idx ON reservations(user_id);
CREATE INDEX IF NOT EXISTS reservations_expires_idx ON reservations(expires_at);
