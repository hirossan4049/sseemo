import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import { clearMnemonic, loadBucket } from '@/crypto/keychain';
import { lock } from '@/state/keyStore';
import { listBucketIds } from '@/state/bucketStore';
import { deleteObject, listObjects } from '@/s3/client';
import { deleteAccount as managedDeleteAccount } from '@/s3/managedClient';

/**
 * App Store 要件: アプリ内アカウント削除導線。
 * - 登録済みすべてのバケット (managed + BYO複数) を、それぞれの creds で wipe
 * - ローカル全消去 (Keychain / AsyncStorage / Cache)
 * - サブスク解約は App Store 側設定で行う旨を案内
 */
export async function deleteAccount(): Promise<void> {
  const ids = await listBucketIds();
  for (const id of ids) {
    // 旧実装は常に active bucket を読んでいたため、BYO 複数構成だと
    // active 以外のバケットがクラウドに残り続けた。各 id ごとに loadBucket
    // して **そのバケット固有の creds** を delete 系へ渡す。
    const bucket = await loadBucket(id).catch(() => null);
    if (!bucket) continue;
    if (bucket.mode === 'managed') {
      await managedDeleteAccount(bucket).catch(() => {});
    } else {
      const objects = await listObjects(bucket).catch(() => []);
      for (const o of objects) {
        await deleteObject(bucket, o.key).catch(() => {});
      }
    }
  }
  await clearMnemonic();
  await AsyncStorage.clear();
  lock();
  if (await RNFS.exists(`${RNFS.CachesDirectoryPath}/thumbs`)) {
    await RNFS.unlink(`${RNFS.CachesDirectoryPath}/thumbs`).catch(() => {});
  }
}
