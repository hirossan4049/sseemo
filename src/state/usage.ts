import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadIndex } from '@/storage';
import { FREE_LIMIT_BYO, FREE_LIMIT_MANAGED } from '@/config';
import { getActiveBucket } from '@/state/bucketStore';
import { getServerUsage } from '@/s3/managedClient';
import { loadReportToken, saveReportToken, clearReportToken } from '@/crypto/keychain';

const NOTIFY_KEY = '@secstorage/usage/notified';
const PAID_KEY = '@secstorage/usage/paid';
const REPORT_ENDPOINT_KEY = '@secstorage/usage/reportUrl';
const REPORT_LAST_AT_KEY = '@secstorage/usage/reportLastAt';
const REPORT_THROTTLE_MS = 60_000;

export async function getReportEndpoint(): Promise<string | null> {
  return AsyncStorage.getItem(REPORT_ENDPOINT_KEY);
}

export async function setReportEndpoint(url: string | null): Promise<void> {
  if (!url) {
    await AsyncStorage.removeItem(REPORT_ENDPOINT_KEY);
  } else {
    await AsyncStorage.setItem(REPORT_ENDPOINT_KEY, url);
  }
}

export async function setReportToken(token: string | null): Promise<void> {
  if (!token) await clearReportToken();
  else await saveReportToken(token);
}

export async function hasReportToken(): Promise<boolean> {
  return (await loadReportToken()) !== null;
}

/**
 * spec §10: BYO 構成ではクライアント側で計測 → サーバー報告。
 * managed では server-side bucket listing を信頼するため no-op。
 *
 * 60秒スロットル: 連続アップロードでサーバを叩き続けないため、最後に成功した
 * 時刻を AsyncStorage に保持し、その範囲内なら no-op。
 */
export async function reportUsage(u: UsageStatus, mode: 'managed' | 'byo'): Promise<void> {
  if (mode === 'managed') return; // server is authoritative
  const url = await AsyncStorage.getItem(REPORT_ENDPOINT_KEY);
  if (!url) return;
  const lastRaw = await AsyncStorage.getItem(REPORT_LAST_AT_KEY);
  const last = lastRaw ? parseInt(lastRaw, 10) : 0;
  if (Date.now() - last < REPORT_THROTTLE_MS) return;
  const token = (await loadReportToken()) ?? '';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ used: u.used, mode, ts: Date.now() }),
    });
    if (res.ok) {
      await AsyncStorage.setItem(REPORT_LAST_AT_KEY, String(Date.now()));
    }
  } catch {
    // best-effort
  }
}

/**
 * 上記の thin wrapper. アップロード/削除の直後に呼ぶ用。
 * mode は呼出元 bucket から決定する。
 */
export async function reportUsageNow(): Promise<void> {
  const bucket = await getActiveBucket();
  if (!bucket || bucket.mode === 'managed') return;
  const u = await computeUsage(bucket.mode);
  await reportUsage(u, bucket.mode);
}

export interface UsageStatus {
  used: number;
  limit: number;
  pct: number;
  paid: boolean;
  hardStopped: boolean;
}

export async function isPaid(): Promise<boolean> {
  return (await AsyncStorage.getItem(PAID_KEY)) === '1';
}

export async function setPaid(v: boolean): Promise<void> {
  await AsyncStorage.setItem(PAID_KEY, v ? '1' : '0');
}

export async function computeUsage(mode: 'managed' | 'byo'): Promise<UsageStatus> {
  const paid = await isPaid();
  if (mode === 'managed') {
    try {
      const bucket = await getActiveBucket();
      if (bucket?.mode === 'managed') {
        const s = await getServerUsage(bucket);
        const pct = (s.usedBytes / s.limitBytes) * 100;
        return {
          used: s.usedBytes,
          limit: s.limitBytes,
          pct,
          paid,
          hardStopped: !paid && s.usedBytes >= s.limitBytes,
        };
      }
    } catch {
      // fall through to local estimate
    }
  }
  const idx = await loadIndex();
  const used = idx.reduce((a, b) => a + b.size, 0);
  const limit = mode === 'managed' ? FREE_LIMIT_MANAGED : FREE_LIMIT_BYO;
  const pct = (used / limit) * 100;
  return { used, limit, pct, paid, hardStopped: !paid && used >= limit };
}

/**
 * 80% / 95% 通知。1度通知したら同じレベルは再通知しない。
 * 課金後はリセット。
 */
export async function checkAndNotify(
  u: UsageStatus,
  notify: (level: 80 | 95) => void,
): Promise<void> {
  const prev = await AsyncStorage.getItem(NOTIFY_KEY);
  const last = prev ? parseInt(prev, 10) : 0;
  if (u.pct >= 95 && last < 95) {
    notify(95);
    await AsyncStorage.setItem(NOTIFY_KEY, '95');
  } else if (u.pct >= 80 && last < 80) {
    notify(80);
    await AsyncStorage.setItem(NOTIFY_KEY, '80');
  } else if (u.pct < 80 && last > 0) {
    await AsyncStorage.removeItem(NOTIFY_KEY);
  }
}

export function assertUploadAllowed(u: UsageStatus): void {
  if (u.hardStopped) {
    throw new Error(
      '容量上限です。閲覧・DLは可能ですが、新規アップロードには課金が必要です。',
    );
  }
}
