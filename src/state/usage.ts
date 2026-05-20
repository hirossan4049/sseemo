import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadIndex } from '@/storage';
import { FREE_LIMIT_BYO, FREE_LIMIT_MANAGED } from '@/config';

const NOTIFY_KEY = '@secstorage/usage/notified';
const PAID_KEY = '@secstorage/usage/paid';
const REPORT_ENDPOINT_KEY = '@secstorage/usage/reportUrl';
const REPORT_TOKEN_KEY = '@secstorage/usage/reportToken';

/**
 * spec §10: BYO 構成ではクライアント側で計測 → サーバー報告。
 * 報告先URLが未設定なら no-op。サーバー実装側は { used, mode, ts } を受け取る。
 */
export async function reportUsage(u: UsageStatus, mode: 'managed' | 'byo'): Promise<void> {
  const url = await AsyncStorage.getItem(REPORT_ENDPOINT_KEY);
  if (!url) return;
  const token = (await AsyncStorage.getItem(REPORT_TOKEN_KEY)) ?? '';
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ used: u.used, mode, ts: Date.now() }),
    });
  } catch {
    // best-effort
  }
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
  const idx = await loadIndex();
  const used = idx.reduce((a, b) => a + b.size, 0);
  const limit = mode === 'managed' ? FREE_LIMIT_MANAGED : FREE_LIMIT_BYO;
  const paid = await isPaid();
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
