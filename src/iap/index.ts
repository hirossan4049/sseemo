/**
 * App Store IAP wrapper.
 * 商品: ¥480/月/バケット, productId: "app.secstorage.bucket.monthly"
 *
 * 実機 + sandbox tester アカウントで動作確認が必要。
 */
import {
  initConnection,
  endConnection,
  getSubscriptions,
  requestSubscription,
  getAvailablePurchases,
  Subscription,
  Purchase,
} from 'react-native-iap';

export const SUBSCRIPTION_SKU = 'app.secstorage.bucket.monthly';

export async function init(): Promise<void> {
  await initConnection();
}

export async function teardown(): Promise<void> {
  await endConnection();
}

export async function fetchProducts(): Promise<Subscription[]> {
  return getSubscriptions({ skus: [SUBSCRIPTION_SKU] });
}

export async function subscribe(): Promise<void> {
  await requestSubscription({ sku: SUBSCRIPTION_SKU });
}

export async function activePurchases(): Promise<Purchase[]> {
  return getAvailablePurchases();
}
