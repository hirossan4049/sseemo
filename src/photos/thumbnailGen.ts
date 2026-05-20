import RNFS from 'react-native-fs';
import { b64decode } from '@/crypto/base64';

/**
 * ローカルパスから縮小済み JPEG バイト列を生成する。
 * - 画像: @bam.tech/react-native-image-resizer (長辺 512px / JPEG 70)
 * - 動画: react-native-create-thumbnail (1秒目のフレームを JPEG)
 *
 * 取り込み失敗時は null を返してサムネイル無しとして扱う。
 */
export async function generateThumbnail(
  localPath: string,
  mime: string,
): Promise<Buffer | null> {
  const path = localPath.startsWith('file://') ? localPath : `file://${localPath}`;
  let outPath: string | null = null;
  try {
    if (mime.startsWith('image/')) {
      const Resizer = require('@bam.tech/react-native-image-resizer').default;
      const r = await Resizer.createResizedImage(
        path,
        512,
        512,
        'JPEG',
        70,
        0,
        undefined,
        false,
        { mode: 'contain', onlyScaleDown: true },
      );
      outPath = r.path ?? r.uri;
    } else if (mime.startsWith('video/')) {
      const { createThumbnail } = require('react-native-create-thumbnail');
      const r = await createThumbnail({
        url: path,
        timeStamp: 1000,
        format: 'jpeg',
        quality: 70,
        cacheName: `ssf-thumb-${Date.now()}`,
      });
      outPath = r.path;
    } else {
      return null;
    }
    if (!outPath) return null;
    const clean = outPath.replace('file://', '');
    const b64 = await RNFS.readFile(clean, 'base64');
    await RNFS.unlink(clean).catch(() => {});
    return b64decode(b64);
  } catch (e) {
    console.warn('thumbnailGen failed', e);
    return null;
  }
}
