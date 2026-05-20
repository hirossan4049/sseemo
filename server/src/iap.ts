/**
 * App Store receipt verification using the *legacy* verifyReceipt endpoint
 * (sandbox + prod fallback). This is the simpler, well-understood path; the
 * modern App Store Server API (JWS) requires P8 key material and is out of
 * scope here per the task brief.
 */

import type { Env } from './types';

const VERIFY_PROD = 'https://buy.itunes.apple.com/verifyReceipt';
const VERIFY_SANDBOX = 'https://sandbox.itunes.apple.com/verifyReceipt';

export interface VerifyResult {
  active: boolean;
  expiresAtMs: number;
  productId: string | null;
  originalTransactionId: string | null;
}

interface AppleResp {
  status: number;
  latest_receipt_info?: {
    product_id: string;
    expires_date_ms: string;
    original_transaction_id: string;
  }[];
}

export async function verifyReceipt(env: Env, receiptB64: string): Promise<VerifyResult> {
  const body = JSON.stringify({
    'receipt-data': receiptB64,
    password: env.APP_STORE_SHARED_SECRET,
    'exclude-old-transactions': true,
  });
  let r = await postJson(VERIFY_PROD, body);
  // 21007 = this is a sandbox receipt, retry on sandbox.
  if (r.status === 21007) r = await postJson(VERIFY_SANDBOX, body);
  if (r.status !== 0) {
    return { active: false, expiresAtMs: 0, productId: null, originalTransactionId: null };
  }
  const latest = r.latest_receipt_info ?? [];
  let best = { exp: 0, pid: null as string | null, otx: null as string | null };
  for (const t of latest) {
    const exp = Number(t.expires_date_ms);
    if (exp > best.exp) best = { exp, pid: t.product_id, otx: t.original_transaction_id };
  }
  return {
    active: best.exp > Date.now(),
    expiresAtMs: best.exp,
    productId: best.pid,
    originalTransactionId: best.otx,
  };
}

async function postJson(url: string, body: string): Promise<AppleResp> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
  return (await r.json()) as AppleResp;
}
