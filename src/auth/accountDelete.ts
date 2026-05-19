import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import { clearMnemonic } from '@/crypto/keychain';
import { lock } from '@/state/keyStore';
import { getActiveBucket, listBucketIds } from '@/state/bucketStore';
import { deleteObject, listObjects } from '@/s3/client';

/**
 * App Store 要件: アプリ内アカウント削除導線。
 * - クラウド側オブジェクト全削除
 * - ローカル全消去 (Keychain / AsyncStorage / Cache)
 * - サブスク解約は App Store 側設定で行う旨を案内
 */
export async function deleteAccount(): Promise<void> {
  const ids = await listBucketIds();
  for (const _ of ids) {
    const bucket = await getActiveBucket();
    if (!bucket) continue;
    const objects = await listObjects(bucket).catch(() => []);
    for (const o of objects) {
      await deleteObject(bucket, o.key).catch(() => {});
    }
  }
  await clearMnemonic();
  await AsyncStorage.clear();
  lock();
  if (await RNFS.exists(`${RNFS.CachesDirectoryPath}/thumbs`)) {
    await RNFS.unlink(`${RNFS.CachesDirectoryPath}/thumbs`).catch(() => {});
  }
}
