import { launchImageLibrary, Asset } from 'react-native-image-picker';
import { encryptAndUpload } from '@/s3/upload';
import { encryptAndUploadChunked } from '@/s3/chunkedUpload';
import { getMaster } from '@/state/keyStore';
import { getActiveBucket } from '@/state/bucketStore';
import { addEntry, syncIndex } from '@/storage';
import { generateThumbnail } from '@/photos/thumbnailGen';
import { saveThumb } from '@/photos/thumbnail';

/** これより大きいファイルはチャンク分割 + サイドカー方式で送る */
const CHUNKED_THRESHOLD = 32 * 1024 * 1024; // 32 MiB

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

/**
 * 任意ファイル種別のインポート (react-native-document-picker).
 * 画像/動画以外 (PDF, zip, etc) もここから入る。
 */
export async function pickAndImportDocuments(
  parentId: string | null = null,
): Promise<number> {
  const master = getMaster();
  const bucket = await getActiveBucket();
  if (!master || !bucket) throw new Error('locked or no bucket');

  let DocumentPicker: any;
  try {
    DocumentPicker = require('react-native-document-picker');
  } catch {
    throw new Error('react-native-document-picker not installed');
  }
  const res = await DocumentPicker.pickMultiple({
    type: [DocumentPicker.types.allFiles],
    copyTo: 'cachesDirectory',
  });
  let count = 0;
  for (const f of res) {
    const localUri = (f.fileCopyUri ?? f.uri) as string;
    const asset = {
      uri: localUri,
      fileName: f.name,
      type: f.type ?? 'application/octet-stream',
      fileSize: f.size ?? 0,
    } as Asset;
    await importAsset(asset, master, bucket, parentId);
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
  const localPath = a.uri.replace('file://', '');
  const name = a.fileName ?? `${id}.bin`;
  const mime = a.type ?? 'application/octet-stream';
  const size = a.fileSize ?? 0;
  const isLarge = size >= CHUNKED_THRESHOLD;
  const remoteKey = isLarge ? `files/${id}` : `files/${id}.ssf`;
  const meta = {
    name,
    mime,
    size,
    ctime: Date.now(),
    mtime: Date.now(),
    parentId,
  };
  if (isLarge) {
    await encryptAndUploadChunked({
      master,
      localPath,
      remotePrefix: remoteKey,
      meta,
      creds: bucket,
      useBackground: true,
    });
  } else {
    await encryptAndUpload({
      master,
      localPath,
      remoteKey,
      creds: bucket,
      meta,
    });
  }
  // 画像ならサムネイル生成 (動画も RNCT が対応するなら同様)
  try {
    const thumb = await generateThumbnail(localPath, mime);
    if (thumb) await saveThumb(master, bucket, id, thumb);
  } catch (e) {
    console.warn('thumb failed', e);
  }
  await addEntry({
    id,
    remoteKey,
    name,
    mime,
    size,
    plainSize: size,
    parentId,
    isFolder: false,
    ctime: Date.now(),
    mtime: Date.now(),
    bucketId: bucket.id,
  });
}
