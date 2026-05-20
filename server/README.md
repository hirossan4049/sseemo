# sseemo managed-mode server

Cloudflare Worker that issues short-lived presigned URLs against an R2 bucket
for clients running in managed mode. The server never sees plaintext: all data
is E2E-encrypted client-side, including the index blob.

## Architecture

- Cloudflare Workers (TypeScript)
- R2 (S3-compatible) bucket for user objects and the encrypted index blob
- D1 for users / subscriptions / quota reservations
- HS256 session JWTs (24h default); Apple identityToken (RS256) verified at sign-in via JWKS

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/auth/apple` | Body `{ identityToken }`. Verifies JWKS, upserts user, returns `{ token, userId }`. |
| POST | `/iap/verify` | Body `{ receipt }`. App Store legacy verifyReceipt (prod+sandbox fallback). |
| GET  | `/usage` | `{ usedBytes, reservedBytes, limitBytes }` for current user. |
| POST | `/usage/report` | BYO-only delta report; no-op for managed. |
| POST | `/storage/presign` | `{ op, key, contentLength? }`. Returns presigned R2 URL + reservation id. |
| POST | `/storage/commit` | `{ op: put|delete|abort, reservationId?, bytes? }`. Commit/abort the reservation, decrement on delete. |
| POST | `/storage/multipart/init` | Presigns CreateMultipartUpload + reserves quota. |
| POST | `/storage/multipart/sign` | Presigns one UploadPart URL. |
| POST | `/storage/multipart/complete` | Presigns CompleteMultipartUpload and commits the reservation. |
| PUT/GET | `/index` | Stores/retrieves `users/<uid>/index.bin` (the client-encrypted file index). |
| DELETE | `/account` | Deletes the R2 prefix and the user row. |

All endpoints except `/health` and `/auth/apple` require
`Authorization: Bearer <session-jwt>`.

## One-time setup

```sh
# 1. install deps and log in
npm install
npx wrangler login

# 2. create resources
npx wrangler r2 bucket create secstorage-user-data
npx wrangler d1 create secstorage
# copy the printed database_id into wrangler.toml -> d1_databases[0].database_id

# 3. create an R2 access key from the Cloudflare dashboard
#    (R2 -> Manage API Tokens -> Create API token, Object Read & Write)

# 4. push secrets
npx wrangler secret put JWT_SECRET                # any high-entropy string
npx wrangler secret put R2_ACCESS_KEY_ID          # from step 3
npx wrangler secret put R2_SECRET_ACCESS_KEY      # from step 3
npx wrangler secret put APP_STORE_SHARED_SECRET   # from App Store Connect

# 5. edit wrangler.toml [vars]
#    set R2_ENDPOINT to https://<your-account-id>.r2.cloudflarestorage.com
#    set APPLE_AUDIENCE to your iOS bundle id (default com.secstorage.app)

# 6. apply migrations (remote D1)
npm run migrate
# or for local dev:
npm run migrate:local

# 7. deploy
npm run deploy
```

## Local dev

```sh
npm run dev       # wrangler dev with --local D1/R2
npm test          # vitest
npm run tsc       # typecheck
```

## Quota model

`users.used_bytes` is the committed total. `reservations` rows hold
in-flight PUT/multipart byte budgets with a TTL (default 15m for simple PUT,
1h for multipart). Each `/storage/presign` PUT or `/storage/multipart/init`
inserts a reservation that's checked against `limit_bytes - used_bytes -
reservedBytes`; the client commits with `/storage/commit` (or
`/storage/multipart/complete`) after a successful upload, which folds the
bytes into `used_bytes` and clears the reservation. Expired reservations are
swept lazily on every quota read. IAP-active users get a 1 TiB `limit_bytes`.

## Apple receipt verification

Uses the legacy `verifyReceipt` endpoint (prod, falling back to sandbox on
status `21007`). Modern App Store Server API JWS verification is intentionally
out of scope; swap in when you provision a P8 in-app-purchase key.
