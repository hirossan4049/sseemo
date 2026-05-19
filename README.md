# SecStorage

S3互換ストレージ向け E2E 暗号化バックアップアプリ (React Native / iOS)。

## 構成

```
src/
  crypto/      暗号化コア (BIP39, HKDF, AES-256-GCM ストリーミング)
    format.ts  ファイル形式 SSF1 の公開仕様
    cipher.ts  FileEncryptor / FileDecryptor
    keychain.ts iOS Keychain ラッパ
  s3/          S3互換クライアント (SigV4) + マルチパート
  storage/     暗号化済みインデックス (AsyncStorage)
  state/       鍵 / バケット状態
  auth/        Sign in with Apple
  iap/         App Store IAP (¥480/月/バケット)
  photos/      写真ライブラリ取り込み
  navigation/  3タブ + オンボーディング
  screens/     UI
cli/
  decrypt.ts   アプリ非依存の復号 CLI
```

## セットアップ

```bash
npm install
cd ios && pod install && cd ..
npm run ios
```

## 暗号化フォーマット SSF1

`src/crypto/format.ts` 参照。鍵さえあれば `cli/decrypt.ts` で復号できる。

```bash
echo "abandon ability ... about" > mnemonic.txt
npx ts-node cli/decrypt.ts mnemonic.txt photo.ssf photo.jpg
```

## 残作業 (ネイティブ側)

- `ios/Info.plist` に `NSPhotoLibraryUsageDescription` を追加
- Sign in with Apple capability を Xcode で有効化
- IAP product ID `app.secstorage.bucket.monthly` を App Store Connect 登録
- バックグラウンドアップロードは `react-native-background-upload` で iOS NSURLSession Background を利用 (Info.plist に `UIBackgroundModes`)
- マネージドモードのサーバー側 API (使用量計測 / 課金検証) は別リポジトリ

## 信頼の核

- 暗号化フォーマット公開 (SSF1)
- アプリ非依存の復号 CLI を同梱
- 鍵 (12語ニーモニック) はユーザー自身が紙で保管
- 運営はパスフレーズ・マスター鍵を一切保持しない
