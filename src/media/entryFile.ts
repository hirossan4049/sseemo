import { Alert, Platform, Share } from 'react-native';
import RNFS from 'react-native-fs';
import QuickCrypto from 'react-native-quick-crypto';
import { IndexEntry } from '@/storage';
import { getMaster } from '@/state/keyStore';
import { getActiveBucket } from '@/state/bucketStore';
import { downloadAndDecrypt } from '@/s3/download';
import { downloadAndDecryptChunked } from '@/s3/chunkedDownload';

const PREVIEW_DIR = `${RNFS.CachesDirectoryPath}/ssf-preview`;
const SHARE_DIR = `${RNFS.CachesDirectoryPath}/ssf-share`;

export function canPreviewEntry(entry: IndexEntry): boolean {
  const mime = entry.mime ?? '';
  return mime.startsWith('image/') || mime.startsWith('video/');
}

export function isVideoEntry(entry: IndexEntry): boolean {
  return !!entry.mime?.startsWith('video/');
}

export function isImageEntry(entry: IndexEntry): boolean {
  return !!entry.mime?.startsWith('image/');
}

export async function materializeEntry(
  entry: IndexEntry,
  kind: 'preview' | 'share' = 'preview',
): Promise<string> {
  const master = getMaster();
  const bucket = await getActiveBucket();
  if (!master || !bucket) {
    throw new Error('ロック中またはバケット未設定');
  }

  const dir = kind === 'preview' ? PREVIEW_DIR : SHARE_DIR;
  await RNFS.mkdir(dir).catch(() => {});
  const opaqueId = Buffer.from(QuickCrypto.randomBytes(16) as any).toString('hex');
  const out = `${dir}/${opaqueId}${extensionOf(entry.name)}`;
  const isChunked = !entry.remoteKey.endsWith('.ssf');

  if (isChunked) {
    await downloadAndDecryptChunked({
      master,
      creds: bucket,
      remotePrefix: entry.remoteKey,
      localPath: out,
    });
  } else {
    await downloadAndDecrypt({
      master,
      creds: bucket,
      remoteKey: entry.remoteKey,
      localPath: out,
    });
  }

  try {
    if (Platform.OS === 'ios' && (RNFS as any).setReadable) {
      await (RNFS as any).setReadable?.(out, false);
    }
  } catch {
    /* ignore */
  }
  return out;
}

export async function shareEntry(entry: IndexEntry): Promise<void> {
  let out: string | null = null;
  try {
    out = await materializeEntry(entry, 'share');
    await Share.share(
      Platform.OS === 'ios'
        ? { url: `file://${out}` }
        : { url: `file://${out}`, message: entry.name, title: entry.name },
    );
  } catch (e: any) {
    Alert.alert('失敗', e.message);
  } finally {
    if (out) {
      const ttlMs = Platform.OS === 'android' ? 5000 : 0;
      setTimeout(() => {
        RNFS.unlink(out!).catch(() => {});
      }, ttlMs);
    }
  }
}

export function cleanupMaterialized(path: string | null): void {
  if (!path) return;
  RNFS.unlink(path).catch(() => {});
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return '';
  const ext = name.slice(dot).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 16);
  return ext.length > 1 ? ext : '';
}
