import { Platform } from 'react-native';
import { activePurchases } from './index';
import { setPaid } from '@/state/usage';
import { getActiveBucket } from '@/state/bucketStore';
import { verifyIapReceipt } from '@/s3/managedClient';

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
    // In managed mode, forward the receipt to our backend so the server-side
    // quota is lifted. Client-side `setPaid` is just UX, not enforcement.
    const bucket = await getActiveBucket();
    if (active && bucket?.mode === 'managed') {
      const receipt = (purchases[0] as any)?.transactionReceipt as string | undefined;
      if (receipt) {
        await verifyIapReceipt(bucket, receipt).catch(() => {});
      }
    }
    return active;
  } catch {
    return false;
  }
}
