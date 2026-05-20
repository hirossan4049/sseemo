# sseemo

S3互換ストレージ向け E2E 暗号化バックアップアプリ (React Native / iOS)。

> 鍵はあなたが持っていてください。アプリがなくなっても、データは取り出せます。

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
  auth/        端末バインドの匿名サインイン (/auth/device)
  iap/         App Store IAP (¥480/月/バケット)
  photos/      写真ライブラリ取り込み + サムネイル生成
  navigation/  3タブ + オンボーディング
  screens/     UI
cli/
  decrypt.ts   アプリ非依存の復号 CLI
server/        マネージドモード用 Cloudflare Workers (別 README)
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

> 注: 暗号化フォーマットの HKDF salt 識別子は `"SecStorage/v1"` のまま固定。
> 既存ユーザーデータの互換性のため、アプリ名のリブランドに合わせては変更しない。

## ネイティブ側セットアップ状態

| 項目 | 状態 |
| --- | --- |
| `NSPhotoLibraryUsageDescription` / `NSFaceIDUsageDescription` | ✅ `ios/SecStorage/Info.plist` |
| In-App Purchase capability | ✅ `ios/SecStorage/SecStorage.entitlements` |
| `UIBackgroundModes` (`fetch` / `processing`) | ✅ Info.plist |
| `BGTaskSchedulerPermittedIdentifiers` (`app.secstorage.autoimport`) | ✅ Info.plist |
| URL Scheme (`secstorage` / `secstoragedev`) | ✅ Info.plist |
| バックグラウンドアップロード (`react-native-background-upload` / NSURLSession) | ✅ Podfile + Info.plist `UIBackgroundModes` |
| IAP product ID 登録 (`app.secstorage.bucket.monthly`) | 🟡 App Store Connect 側で登録（外部作業） |
| マネージドモードのサーバー側 API | ✅ `server/`（Cloudflare Workers + R2 + D1） |

詳細手順は [`ios/SETUP.md`](ios/SETUP.md) を参照。

## 信頼の核

- 暗号化フォーマット公開 (SSF1)
- アプリ非依存の復号 CLI を同梱
- 鍵 (12語ニーモニック) はユーザー自身が紙で保管
- 運営はパスフレーズ・マスター鍵を一切保持しない
