import { Platform } from 'react-native';
import { activePurchases } from './index';
import { setPaid } from '@/state/usage';

/**
 * レシート検証。
 * 厳密にはサーバー側で App Store の verifyReceipt API を叩く必要があるが、
 * MVP ではクライアント側で「有効な購入が存在する」までを確認し、
 * サーバー検証は別リポジトリに譲る。
 */
export async function refreshSubscriptionStatus(): Promise<boolean> {
  if (Platform.OS !== 'ios') {
    await setPaid(false);
    return false;
  }
  try {
    const purchases = await activePurchases();
    const active = purchases.some(p => !!p.transactionId);
    await setPaid(active);
    return active;
  } catch {
    return false;
  }
}
