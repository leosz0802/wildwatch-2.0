# Wild Guard API

Small, dependency-free Node.js service for the first production backend slice.

Endpoints:

- `GET /health`
- `GET /v1/config`
- `POST /v1/events`
- `POST /v1/auth/wechat`
- `GET /v1/leaderboard`
- `POST /v1/leaderboard/score`
- `GET /v1/moderation/leaderboard`（审核队列与最近审核历史；仅服务端管理员）
- `POST /v1/moderation/leaderboard/status`（复核、屏蔽、下架或恢复榜单账号；仅服务端管理员）
- `POST /v1/friends/import`（服务器解密互动好友关系；不保存原始 OpenID，并为尚未登录服务器的真实好友创建待激活交换席位）
- `GET /v1/friends`
- `POST /v1/trades/exchange`（幂等真实玩家交换）
- `GET /v1/trades/history`（当前玩家最近的收件箱与发件箱记录）
- `POST /v1/trades/inbox/claim`

The service binds to `127.0.0.1:3117`. Nginx owns public TLS. WeChat authentication and score writes remain unavailable until `WX_APP_ID` and `WX_APP_SECRET` are stored in `/etc/wild-guard-api.env` on the server.

Leaderboard player and reserve names are generated deterministically by the server from the authenticated user id. Client-provided `ownerName`, `reserveName` and `displayName` values are ignored, while the public operating style is restricted to a server-owned allowlist. Existing databases are migrated to the same safe identities at startup.

Leaderboard valuation is also server-owned. The API ignores the submitted `score` when ranking and recalculates it from the submitted level and live animal total using `level-animal-v1`; score-only legacy records receive the Lv.1/zero-population baseline until a complete profile arrives. Existing scores are recalculated during startup migration.

Set a separate random `WILD_MODERATION_SECRET` of at least 32 characters in `/etc/wild-guard-api.env`. Moderation requests must send it in `X-Moderation-Key`; player bearer tokens never grant moderation access. `review`, `block` and `takedown` immediately remove an account from public and friend ranking results, and later score uploads do not restore it. Only an audited `restore` action makes it visible again. Reasons are restricted to `policy_risk`, `player_report`, `manual_review`, `false_positive`, `appeal_approved` or `other`.

Example moderation request:

```sh
curl -X POST https://wild.hubao.tv/v1/moderation/leaderboard/status \
  -H "Content-Type: application/json" \
  -H "X-Moderation-Key: $WILD_MODERATION_SECRET" \
  --data '{"targetId":"PUBLIC_PLAYER_ID","action":"review","reason":"player_report"}'
```

Dynamic art can be enabled without a client release by uploading the reviewed atlas below `https://wild.hubao.tv/` and setting `assets.artAtlas.url` plus a new `assets.artAtlas.version` in `config/default.json`. The client validates the host and extension, downloads into WeChat user storage, and keeps bundled art as the offline fallback.

The survival catalog uses `assets.wildernessMaterialAtlas`. Copy `assets/wilderness-materials-atlas-v1.webp` to `/var/lib/wild-guard-api/assets/`, keep the configured URL on `wild.hubao.tv`, and bump its version whenever the atlas changes. The client crops the atlas as four columns by three rows and falls back to twelve distinct Canvas symbols while offline.

Animal portraits use `assets.animalPortraitAtlas` and `assets/animal-portraits-atlas-v4.jpg`. They are cached separately; the built-in Canvas animal heads remain the offline fallback.

Premium interface textures use `assets.premiumUiAtlas`. The checked-in deployment asset `assets/premium-ui-v1.jpg` is a 1536×512 strip containing three 512×512 tiles in this order: parchment, forest leather and brass. Deploy it to `/var/lib/wild-guard-api/assets/premium-ui-v1.jpg` together with the matching remote config version. The client caches it independently from the gameplay art atlas and uses Canvas material rendering as the offline fallback.

The production Nginx config serves reviewed files from `/var/lib/wild-guard-api/assets/` as `https://wild.hubao.tv/assets/...` with immutable caching. Create that directory as root, make it readable by Nginx, and add `https://wild.hubao.tv` to both the WeChat request-domain and download-file-domain allowlists before enabling a non-empty asset URL.

Production paths:

- application: `/opt/wild-guard-api`
- database: `/var/lib/wild-guard-api/wild.sqlite`
- secrets: `/etc/wild-guard-api.env`
- service: `wild-guard-api.service`
