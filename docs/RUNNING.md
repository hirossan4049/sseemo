# RUNNING — 開発・実行手順

このリポジトリ (`secstorage_s3_rn`) は React Native (Expo dev-client) アプリと Cloudflare Worker サーバから成る。本ドキュメントは「ローカルで動かす」「E2E を回す」「サーバを触る」までを一枚に集約する。

## 1. セットアップ前提

- macOS + Xcode 15 以上、iOS Simulator (iPhone 16 / iOS 18.x で動作確認済み)
- Node.js 20.x、npm 10.x
- Ruby 3 + Bundler (`gem install bundler`) — CocoaPods 用
- Homebrew で:
  - `brew install cocoapods` (もしくは `bundle install` 経由)
  - `brew install maestro` (E2E)
  - `brew install cloudflare-wrangler2` (もしくは `npx wrangler`)

初回のみ:

```bash
npm install
cd ios && bundle install && bundle exec pod install && cd ..
```

## 2. 初回ビルド (iOS)

```bash
npm run ios     # = expo run:ios — Xcode ビルド + シミュレータ起動 + Metro
```

初回は数分かかる。成功すると iPhone 16 シミュレータが立ち上がり、Welcome 画面が表示される。

## 3. 日常開発

ネイティブを触っていない限り Metro だけ動かせばよい。

```bash
npm start            # Metro bundler
# 別ターミナル or Metro 内で:
#   i  → iOS シミュレータでリロード
#   r  → Reload JS
```

Fast Refresh は ON。`@/` 始まりの import は `babel-plugin-module-resolver` で `src/` を指す。

## 4. バックエンド (server/)

Cloudflare Workers + R2 + D1。リポジトリルートから:

```bash
npm run server:dev              # wrangler dev (ローカル)
npm run server:deploy           # 本番デプロイ
npm run server:migrate          # D1 (remote) マイグレーション
npm run server:migrate:local    # D1 (local) マイグレーション
```

主要リソース:

- Worker URL: `https://secstorage-server.crap.workers.dev`
- R2 bucket: `secstorage-user-data` (endpoint: `https://c380b51a9bfc184312b108c9d79b45c1.r2.cloudflarestorage.com`)
- D1 database: `secstorage` (id `9744bc3a-5335-443d-ac34-23679caa95f8`)

シークレットは `wrangler secret put <KEY>` で投入。設定すべきキー一覧は `server/wrangler.toml` の末尾コメント参照。

## 5. テスト & E2E

### Jest (ユニット)

```bash
npm test            # crypto / chunked roundtrip など (4 pass / 10 skip 想定)
npm run tsc         # 型チェック
```

### Node E2E (実バックエンドに対して chunked sidecar の正当性を検証)

```bash
npm run test:e2e:node
# E2E_BACKEND_URL を上書きしたい場合は環境変数で指定
```

スキップしたいときは `E2E_BACKEND_URL=` を空にして実行 (suite が skip される)。

### Multi-file roundtrip (アプリ内ロジック経由)

シミュレータが起動 & アプリインストール済みである必要がある。

```bash
npm run e2e:multi
# 内部で secstoragedev://onboard?tag=...&verify=multi を叩き、
# シミュレータの os_log を tail して [VERIFY] managed multi roundtrip OK を待つ
```

タイムアウトは `E2E_MULTI_TIMEOUT=300` (秒) で調整可能。32 MiB の upload を含むので回線によっては数分かかる。

### Maestro (UI E2E)

```bash
npm run maestro          # 4 flows 全部
npm run maestro:onboard  # オンボードのみ
```

フローは `.maestro/flows/`。共有サブフローは `.maestro/subflows/`。

**既知の制約 — Apple Account サインインダイアログ:**

`clearKeychain: true` した直後の iOS シミュレータは「Apple Account にサインイン」ダイアログを出す。これは SpringBoard レベルのアラートで Maestro の accessibility query では掴めない。`.maestro/subflows/dismiss_storekit.yaml` でベストエフォート dismiss を試みているが、確実ではない。

回避手順:
1. シミュレータ起動直後に手動で `キャンセル` を一度押す。以降そのセッションでは再表示されない。
2. もしくは Settings → App Store でテスト用 Apple ID にサインインしておく。

## 6. トラブルシュート

| 症状 | 対処 |
|------|------|
| `Port 8081 already in use` | `lsof -i :8081` で旧 Metro を kill |
| Pod install で `[Codegen] warn` | 害なし。無視 |
| `Cannot find native module 'RNSVG...'` | `cd ios && bundle exec pod install` → `npm run ios` で再ビルド |
| Maestro が welcome-screen を見つけない | Apple Account ダイアログを手動 dismiss (上記) |
| シミュレータが固まる | `xcrun simctl shutdown all && xcrun simctl boot "iPhone 16" && open -a Simulator` |
| ts-jest 警告 | 害なし |
| `wrangler` 未認証 | `npx wrangler login` |

## 7. 一括検証

```bash
npm run verify:all    # tsc → jest → maestro
```

CI 用途には maestro を除いた `npm run tsc && npm test` を推奨 (Maestro は実機シミュレータ依存)。
