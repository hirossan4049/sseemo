import { launchImageLibrary, Asset } from 'react-native-image-picker';
import RNFS from 'react-native-fs';
import QuickCrypto from 'react-native-quick-crypto';
import { encryptAndUpload } from '@/s3/upload';
import { encryptAndUploadChunked } from '@/s3/chunkedUpload';
import { getMaster } from '@/state/keyStore';
import { getActiveBucket } from '@/state/bucketStore';
import { addEntry, syncIndex } from '@/storage';
import { generateThumbnail } from '@/photos/thumbnailGen';
import { saveThumb } from '@/photos/thumbnail';

/**
 * 16バイト乱数を hex 化したファイル名を返す (拡張子なし)。
 * spec §5: 原本ファイル名がローカルディスクに残らないよう、
 * インポート時に一旦この opaque id でリネームしてから暗号化する。
 */
function randomOpaqueId(): string {
  const b = QuickCrypto.randomBytes(16) as any;
  return Buffer.from(b).toString('hex');
}

/**
 * RNFS.unlink で生ファイルを物理削除する。ベストエフォート: 失敗しても暗号化済み
 * オブジェクトは既にアップロード済みなので致命傷ではない。
 */
async function shredPath(path: string): Promise<void> {
  try {
    if (await RNFS.exists(path)) {
      await RNFS.unlink(path);
    }
  } catch {
    /* ignore */
  }
}

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
  const res = await DocumentPicker.pick({
    type: [DocumentPicker.types.allFiles],
    copyTo: 'cachesDirectory',
    allowMultiSelection: true,
  });
  let count = 0;
  for (const f of res) {
    const srcUri = (f.fileCopyUri ?? f.uri) as string;
    const srcPath = srcUri.replace('file://', '');
    // 元ファイル名を含むパスは即座に opaque 名へ rename し、原本名はメモリ上のみで保持
    const opaqueId = randomOpaqueId();
    const opaqueDir = `${RNFS.CachesDirectoryPath}/ssf-import`;
    await RNFS.mkdir(opaqueDir).catch(() => {});
    const opaquePath = `${opaqueDir}/${opaqueId}.bin`;
    try {
      // f.fileCopyUri は picker がコピーしたキャッシュ内のファイルなので move が安全
      await RNFS.moveFile(srcPath, opaquePath);
    } catch {
      // move 不可ならコピー→元を削除
      await RNFS.copyFile(srcPath, opaquePath);
      await shredPath(srcPath);
    }
    const asset = {
      uri: `file://${opaquePath}`,
      fileName: f.name, // 暗号化メタへ入れる原本名 (永続化はしない)
      type: f.type ?? 'application/octet-stream',
      fileSize: f.size ?? 0,
    } as Asset;
    try {
      await importAsset(asset, master, bucket, parentId);
      count++;
    } finally {
      // 暗号化済みオブジェクトをアップロードしたら平文 temp を確実に shred
      await shredPath(opaquePath);
    }
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
  // remoteKey に使う id は CSPRNG ベースの opaque 値。timestamp 由来は使わない
  // (タイムスタンプはメタデータ漏れになるため spec §5 で禁止)。
  const id = randomOpaqueId();
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
