import { launchImageLibrary, Asset } from 'react-native-image-picker';
import { encryptAndUpload } from '@/s3/upload';
import { getMaster } from '@/state/keyStore';
import { getActiveBucket } from '@/state/bucketStore';
import { addEntry } from '@/storage';

/**
 * MVP: ユーザー選択ベースのインポート。
 * 自動取り込み（CameraRoll監視 + バックグラウンド）は v0.2 で追加。
 */
export async function pickAndImport(): Promise<number> {
  const master = getMaster();
  const bucket = await getActiveBucket();
  if (!master || !bucket) throw new Error('locked or no bucket');

  const res = await launchImageLibrary({
    mediaType: 'photo',
    selectionLimit: 0,
  });
  if (!res.assets) return 0;

  let count = 0;
  for (const a of res.assets) {
    await importAsset(a, master, bucket);
    count++;
  }
  return count;
}

async function importAsset(a: Asset, master: Buffer, bucket: any): Promise<void> {
  if (!a.uri) return;
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const remoteKey = `photos/${id}.ssf`;
  await encryptAndUpload({
    master,
    localPath: a.uri.replace('file://', ''),
    remoteKey,
    creds: bucket,
    meta: {
      name: a.fileName ?? `${id}.jpg`,
      mime: a.type ?? 'image/jpeg',
      size: a.fileSize ?? 0,
      ctime: Date.now(),
      mtime: Date.now(),
      parentId: null,
    },
  });
  await addEntry({
    id,
    remoteKey,
    name: a.fileName ?? `${id}.jpg`,
    mime: a.type,
    size: a.fileSize ?? 0,
    plainSize: a.fileSize ?? 0,
    parentId: null,
    isFolder: false,
    ctime: Date.now(),
    mtime: Date.now(),
    bucketId: bucket.id,
  });
}
