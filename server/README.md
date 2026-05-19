# SecStorage マネージドモード サーバー (スタブ仕様)

E2Eなのでサーバーは**復号鍵を一切持たない**。担当するのは以下のみ:

## 責務

1. **Sign in with Apple** トークン検証 (Apple JWK)
2. **App Store IAP レシート検証** (App Store Server API V2)
3. **使用量計測**: 各ユーザーの `users/<sub>/*` プレフィックス内オブジェクトを定期集計
4. **ハード停止**: 無料枠超過 & 未課金ユーザーに対して、STS 短期クレデンシャルの PUT 権限を剥奪
5. **80% / 95% 通知**: APNs プッシュ
6. **アカウント削除**: ユーザー要求に応じてバケット内のユーザー prefix を全削除

## API (例)

```
POST /auth/apple                # SIWA トークン交換 → セッションJWT
POST /iap/verify                { receipt } → { active, expiresAt }
POST /sts/upload                { bucket } → STS creds (write許可)
POST /sts/download              { bucket } → STS creds (read許可)
GET  /usage                     → { used, limit, paid, hardStopped }
DELETE /account                 → 200
```

## 実装スタック (推奨)

- TypeScript + Hono / Fastify
- AWS SDK v3 で S3互換ストレージ (運営バケット) を操作
- App Store Server SDK
- Postgres でユーザー / サブスク状態
- Cloudflare R2 / Backblaze B2 等が運営バケット候補

## このリポジトリには含まれない

クライアント側で `assertUploadAllowed` を呼んでローカルでも停止判定を行うが、
サーバー側 STS 制御を併用することで「クライアント改造による回避」を防ぐ。
