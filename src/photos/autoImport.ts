import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { encryptAndUpload } from '@/s3/upload';
import { getMaster } from '@/state/keyStore';
import { getActiveBucket } from '@/state/bucketStore';
import { addEntry } from '@/storage';
import { pushIndex } from '@/storage/encryptedIndex';
import { loadIndex } from '@/storage';

/**
 * 写真ライブラリ自動取り込み (バックグラウンド対応).
 * - 取り込み済み asset の最新タイムスタンプを保存
 * - 新着のみアップロード
 *
 * iOS バックグラウンドフェッチ有効化は AppDelegate 側で実施 (Info.plist UIBackgroundModes: fetch)
 */

const CURSOR_KEY = '@secstorage/photos/cursor';

export async function runAutoImport(limit = 50): Promise<number> {
  const master = getMaster();
  const bucket = await getActiveBucket();
  if (!master || !bucket) return 0;

  const cursor = await AsyncStorage.getItem(CURSOR_KEY);
  const since = cursor ? parseInt(cursor, 10) : 0;

  const photos = await CameraRoll.getPhotos({
    first: limit,
    assetType: 'Photos',
    fromTime: since,
  });

  let imported = 0;
  let maxTs = since;
  for (const e of photos.edges) {
    const a = e.node;
    const ts = Math.floor((a.timestamp ?? Date.now() / 1000) * 1000);
    if (ts <= since) continue;
    const id = `${ts}-${Math.random().toString(36).slice(2, 8)}`;
    const remoteKey = `photos/${id}.ssf`;
    const uri = a.image.uri.replace('file://', '');
    try {
      await encryptAndUpload({
        master,
        localPath: uri,
        remoteKey,
        creds: bucket,
        meta: {
          name: a.image.filename ?? `${id}.jpg`,
          mime: 'image/jpeg',
          size: a.image.fileSize ?? 0,
          ctime: ts,
          mtime: ts,
          parentId: null,
        },
      });
      await addEntry({
        id,
        remoteKey,
        name: a.image.filename ?? `${id}.jpg`,
        mime: 'image/jpeg',
        size: a.image.fileSize ?? 0,
        plainSize: a.image.fileSize ?? 0,
        parentId: null,
        isFolder: false,
        ctime: ts,
        mtime: ts,
        bucketId: bucket.id,
      });
      imported++;
      if (ts > maxTs) maxTs = ts;
    } catch (e) {
      console.warn('import failed', e);
    }
  }
  if (imported > 0) {
    await AsyncStorage.setItem(CURSOR_KEY, String(maxTs));
    await pushIndex(master, bucket, await loadIndex()).catch(() => {});
  }
  return imported;
}
