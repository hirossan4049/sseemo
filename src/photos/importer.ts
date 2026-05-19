import { launchImageLibrary, Asset } from 'react-native-image-picker';
import { encryptAndUpload } from '@/s3/upload';
import { getMaster } from '@/state/keyStore';
import { getActiveBucket } from '@/state/bucketStore';
import { addEntry, syncIndex } from '@/storage';

/**
 * ユーザー選択ベースのインポート。
 * 写真・動画両対応 (mediaType='mixed').
 * parentId を渡せば現在のフォルダ配下に格納。
 */
export async function pickAndImport(parentId: string | null = null): Promise<number> {
  const master = getMaster();
  const bucket = await getActiveBucket();
  if (!master || !bucket) throw new Error('locked or no bucket');

  const res = await launchImageLibrary({
    mediaType: 'mixed',
    selectionLimit: 0,
  });
  if (!res.assets) return 0;

  let count = 0;
  for (const a of res.assets) {
    await importAsset(a, master, bucket, parentId);
    count++;
  }
  if (count > 0) await syncIndex();
  return count;
}

async function importAsset(
  a: Asset,
  master: Buffer,
  bucket: any,
  parentId: string | null,
): Promise<void> {
  if (!a.uri) return;
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const remoteKey = `files/${id}.ssf`;
  const name = a.fileName ?? `${id}.bin`;
  const mime = a.type ?? 'application/octet-stream';
  await encryptAndUpload({
    master,
    localPath: a.uri.replace('file://', ''),
    remoteKey,
    creds: bucket,
    meta: {
      name,
      mime,
      size: a.fileSize ?? 0,
      ctime: Date.now(),
      mtime: Date.now(),
      parentId,
    },
  });
  await addEntry({
    id,
    remoteKey,
    name,
    mime,
    size: a.fileSize ?? 0,
    plainSize: a.fileSize ?? 0,
    parentId,
    isFolder: false,
    ctime: Date.now(),
    mtime: Date.now(),
    bucketId: bucket.id,
  });
}
