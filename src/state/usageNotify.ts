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

function loadModule(): Notifications | null {
  try {
    // require だと metro が静的に解決できないと落ちるため try/catch で握り潰す
    // (devClient 環境では存在するが Jest 等の Node 単体テストでは存在しない)。
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-notifications');
    return mod as Notifications;
  } catch {
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
            ? 'SecStorage: 容量 95% 超過'
            : 'SecStorage: 容量 80% 超過',
        body:
          level === 95
            ? '間もなくハード停止します。課金または不要ファイルの削除をご検討ください。'
            : '容量が 80% を超えました。残り容量にご注意ください。',
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
