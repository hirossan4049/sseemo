export interface Env {
  USER_DATA: R2Bucket;
  DB: D1Database;
  JWT_SECRET: string;
  APPLE_JWKS_URL: string;
  APPLE_AUDIENCE: string;
  FREE_LIMIT_BYTES: string;
  R2_ENDPOINT: string;
  R2_BUCKET: string;
  R2_REGION: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  PRESIGN_TTL_SECONDS: string;
  APP_STORE_SHARED_SECRET: string;
}

export interface SessionClaims {
  sub: string; // user id (Apple sub)
  email?: string;
  iat: number;
  exp: number;
}
