import BackgroundUpload from 'react-native-background-upload';
import aws4 from 'aws4';
import { BucketCredentials } from '@/crypto/keychain';

/**
 * NSURLSession Background で送るための薄いラッパ。
 * 注意: ライブラリは「ローカルファイルをそのまま」送る前提なので、
 * 暗号化済みバイト列をいったんローカル一時ファイルに書き出した上で投入する必要がある。
 *
 * 大ファイルの「暗号化しながらNSURLSession Backgroundへ流し込む」は
 * 真の意味のストリーミングが必要で、ネイティブモジュールに踏み込む案件。
 * MVPでは「暗号化済みファイル全体を NSURLSession Background に渡す」で割り切る。
 */
export async function backgroundPutObject(
  creds: BucketCredentials,
  key: string,
  localPath: string,
  contentType = 'application/octet-stream',
): Promise<string> {
  const host = creds.endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const path = `/${creds.bucket}/${encodeURI(key)}`;
  const req: aws4.Request = {
    host,
    path,
    method: 'PUT',
    service: 's3',
    region: creds.region,
    headers: { 'content-type': contentType },
  };
  aws4.sign(req, {
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
  });
  const uploadId = await BackgroundUpload.startUpload({
    url: `https://${host}${path}`,
    path: localPath,
    method: 'PUT',
    type: 'raw',
    headers: req.headers as Record<string, string>,
    notification: { enabled: true },
  });
  return uploadId;
}
