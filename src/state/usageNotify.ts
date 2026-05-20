import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { computeUsage } from '@/state/usage';

/**
 * spec §4: 80% / 95% 容量到達時にローカル通知を出す (リモート APNs 不要)。
 *
 * - Settings 画面を開いていなくても気づけるよう、expo-notifications の
 *   scheduleNotificationAsync({ trigger: null }) で即時 fire する
 * - 同一閾値を二度送らないように `last-notified` を AsyncStorage に保持
 * - 課金で限度が拡張 (pct が下がる) されたらフラグをリセットして再武装
 *
 * 失敗 (permission denied / 未インストール) は best-effort 扱い。
 */

const LAST_NOTIFIED_KEY = '@secstorage/usage/notifyLevel';
const PERM_REQUESTED_KEY = '@secstorage/usage/notifyPermRequested';

type Notifications = {
  requestPermissionsAsync: () => Promise<{ granted: boolean; status: string }>;
  getPermissionsAsync: () => Promise<{ granted: boolean; status: string }>;
  scheduleNotificationAsync: (input: {
    content: { title: string; body: string };
    trigger: null;
  }) => Promise<string>;
  setNotificationHandler?: (h: any) => void;
};

let cached: Notifications | null | undefined;
function loadModule(): Notifications | null {
  if (cached !== undefined) return cached;
  // expo-notifications relies on expo-modules-core's native module bridge,
  // which isn't installed in this RN-CLI project. require() throws
  // synchronously ("Cannot find native module 'ExpoPushTokenManager'") and
  // the error also surfaces in LogBox even with a try/catch around the call
  // site. We therefore short-circuit unless an env flag explicitly enables
  // the dynamic require for ad-hoc testing.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g: any = globalThis as any;
  if (!g.__SECSTORAGE_ENABLE_NOTIFICATIONS__) {
    cached = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-notifications');
    cached = mod as Notifications;
    return cached;
  } catch {
    cached = null;
    return null;
  }
}

let permissionEnsured = false;
async function ensurePermission(): Promise<boolean> {
  if (permissionEnsured) return true;
  const N = loadModule();
  if (!N) return false;
  try {
    const cur = await N.getPermissionsAsync();
    if (cur.granted) {
      permissionEnsured = true;
      return true;
    }
    // オンボーディング時に既に求めた場合は黙って失敗
    const asked = await AsyncStorage.getItem(PERM_REQUESTED_KEY);
    if (asked && !cur.granted) return false;
    await AsyncStorage.setItem(PERM_REQUESTED_KEY, '1');
    const r = await N.requestPermissionsAsync();
    permissionEnsured = r.granted;
    return r.granted;
  } catch {
    return false;
  }
}

/**
 * オンボーディング step 5 から呼ぶ用の公開エントリ。
 */
export async function requestNotificationPermissionOnce(): Promise<boolean> {
  return ensurePermission();
}

/**
 * upload/delete などで使用量が変わったあとに呼ぶ。閾値を新規にまたいだら通知。
 */
export async function notifyOnThreshold(mode: 'managed' | 'byo'): Promise<void> {
  const u = await computeUsage(mode);
  const prevRaw = await AsyncStorage.getItem(LAST_NOTIFIED_KEY);
  const prev = prevRaw ? parseInt(prevRaw, 10) : 0;

  let level: 80 | 95 | 0 = 0;
  if (u.pct >= 95) level = 95;
  else if (u.pct >= 80) level = 80;

  if (level === 0) {
    if (prev > 0 && u.pct < 80) {
      await AsyncStorage.removeItem(LAST_NOTIFIED_KEY);
    }
    return;
  }
  if (level <= prev) return; // 同じ or 下位の閾値は再通知しない

  const ok = await ensurePermission();
  if (!ok) return;
  const N = loadModule();
  if (!N) return;

  try {
    await N.scheduleNotificationAsync({
      content: {
        title:
          level === 95
            ? 'sseemo: もうすぐいっぱいです'
            : 'sseemo: 残りが少なくなってきました',
        body:
          level === 95
            ? 'もうすぐいっぱいです。お支払いに進むか、いらないものを片付けてみてください。'
            : '残り20%を切りました。そろそろ整理を考えてみてください。',
      },
      trigger: null,
    });
    await AsyncStorage.setItem(LAST_NOTIFIED_KEY, String(level));
  } catch {
    // best-effort
  }
  // Android (将来) でも一応 no-op で通過させる
  void Platform.OS;
}
