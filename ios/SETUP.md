# iOS ネイティブ側セットアップ

`npx react-native init` で生成される `ios/SecStorage.xcodeproj` 一式を上書きする前提で、
手動セットアップ項目をここに集約。

> Xcode プロジェクト名 (`SecStorage.xcodeproj`) と Bundle ID
> (`com.secstorage.app`) はアプリ名リブランド (sseemo) 後も互換のため据え置き。
> ユーザーから見える表示名は `app.json` の `displayName` で「sseemo」に切替。

## Info.plist 追加

```xml
<key>NSPhotoLibraryUsageDescription</key>
<string>写真をE2E暗号化してバックアップするために、写真ライブラリへのアクセスが必要です。</string>
<key>NSFaceIDUsageDescription</key>
<string>アプリのロック解除に Face ID を使用します。</string>
<key>UIBackgroundModes</key>
<array>
  <string>fetch</string>
  <string>processing</string>
</array>
<key>BGTaskSchedulerPermittedIdentifiers</key>
<array>
  <string>app.secstorage.autoimport</string>
</array>
```

## Xcode で有効化する Capability

- Sign in with Apple
- Background Modes (Background fetch / Background processing)
- Keychain Sharing (不要だがチーム共有する場合)
- In-App Purchase

## CocoaPods

`ios/Podfile` に以下が必要 (RN テンプレートが概ね生成):

```ruby
pod 'react-native-quick-crypto', :path => '../node_modules/react-native-quick-crypto'
pod 'RNKeychain', :path => '../node_modules/react-native-keychain'
pod 'RNCAsyncStorage', :path => '../node_modules/@react-native-async-storage/async-storage'
pod 'RNFS', :path => '../node_modules/react-native-fs'
pod 'RNIap', :path => '../node_modules/react-native-iap'
pod 'RNImagePicker', :path => '../node_modules/react-native-image-picker'
pod 'react-native-background-upload', :path => '../node_modules/react-native-background-upload'
pod 'RNAppleAuthentication', :path => '../node_modules/@invertase/react-native-apple-authentication'
pod 'react-native-camera-roll', :path => '../node_modules/@react-native-camera-roll/camera-roll'
```

実行: `cd ios && pod install`

## App Store Connect

- Bundle ID: `app.secstorage.ios`
- IAP product ID: `app.secstorage.bucket.monthly` (auto-renewable subscription, ¥480/月)
- 小規模事業者枠を申請すれば手数料 15%

## マネージドモード用サーバー (別リポジトリ)

- Apple サインインのトークン検証
- App Store Server API でレシート/サブスクリプション検証
- 使用量計測 (各ユーザーの prefix オブジェクトを定期集計)
- 80% / 95% 通知配信
- ハード停止: STS / バケットポリシーでアクセス制御

これらはアプリ側の責任範囲外。
