"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { createApiServer, issueToken, verifyToken, sanitizeDisplayName, serverGeneratedIdentity, serverOwnedStyle, clientIp, RateLimiter, calculateReserveValuation } = require("./server");

async function main() {
  assert.equal(clientIp({ socket: { remoteAddress: "127.0.0.1" }, headers: { "x-real-ip": "203.0.113.8", "x-forwarded-for": "198.51.100.9, 203.0.113.8" } }), "203.0.113.8", "the trusted proxy's real client address should be used");
  assert.equal(clientIp({ socket: { remoteAddress: "127.0.0.1" }, headers: { "x-real-ip": "not-an-ip", "x-forwarded-for": "198.51.100.9" } }), "127.0.0.1", "an invalid proxy address must not become a limiter key");
  assert.equal(clientIp({ socket: { remoteAddress: "192.0.2.5" }, headers: { "x-real-ip": "203.0.113.8" } }), "192.0.2.5", "headers from an untrusted direct client must be ignored");
  const boundedLimiter = new RateLimiter(100);
  for (let index = 0; index < 250; index += 1) boundedLimiter.consume(`rotating:${index}`, 1, 60000, 1000);
  assert.equal(boundedLimiter.entries.size, 100, "rotating limiter keys must remain under the hard memory cap");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "wild-api-"));
  const secret = "test-secret-that-is-longer-than-thirty-two-characters";
  const moderationSecret = "moderation-secret-that-is-longer-than-thirty-two-characters";
  const relationKey = Buffer.from("0123456789abcdef");
  const server = createApiServer({
    dbPath: path.join(temp, "test.sqlite"),
    configPath: path.join(__dirname, "config", "default.json"),
    sessionSecret: secret,
    moderationSecret,
    wxAppId: "wx-test-app",
    wxAppSecret: "test-secret",
    wechatCodeExchange(appId, appSecret, code) {
      const openids = {
        wechat_user_two: "openid-user-two",
        wechat_user_three: "openid-user-three"
      };
      return Promise.resolve({
        openid: openids[code] || "openid-user-one",
        session_key: relationKey.toString("base64")
      });
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    let response = await fetch(`${base}/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);

    response = await fetch(`${base}/v1/config`);
    const configEtag = response.headers.get("etag");
    assert.equal(response.status, 200);
    const remoteConfig = (await response.json()).config;
    assert.equal(remoteConfig.features.telemetry, true);
    assert.equal(remoteConfig.features.reciprocalTrade, true, "clients must only expose barter after the server advertises reciprocal escrow support");
    response = await fetch(`${base}/v1/config`, { headers: { "if-none-match": configEtag } });
    assert.equal(response.status, 304);

    response = await fetch(`${base}/v1/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "game.boot", installId: "device-test", properties: { ms: 420 } })
    });
    assert.equal(response.status, 202);

    response = await fetch(`${base}/v1/auth/wechat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "wechat_user_one" })
    });
    assert.equal(response.status, 200);
    const userOneAuth = await response.json();
    const userOneToken = userOneAuth.token;
    assert.equal(userOneAuth.friendMatchKey, crypto.createHash("sha256").update("wild-friend-v1:openid-user-one").digest("hex"));
    assert.match(String(userOneAuth.publicId || ""), /^[a-zA-Z0-9_-]{1,20}$/);
    response = await fetch(`${base}/v1/auth/wechat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "wechat_user_two" })
    });
    assert.equal(response.status, 200);
    const userTwoToken = (await response.json()).token;

    response = await fetch(`${base}/v1/leaderboard`);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).leaderboard, []);

    response = await fetch(`${base}/v1/leaderboard/score`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ score: 100 })
    });
    assert.equal(response.status, 401);

    const token = issueToken(secret, "test-user");
    const testIdentity = serverGeneratedIdentity("test-user");
    assert.equal(verifyToken(secret, token).sub, "test-user");
    assert.equal(verifyToken("different-secret-that-is-also-long-enough", token), null);
    assert.equal(sanitizeDisplayName("\u0000  林间守护者  "), "林间守护者");
    assert.deepEqual(serverGeneratedIdentity("test-user"), testIdentity, "server identities must remain stable across reads");
    assert.equal(serverOwnedStyle("<script>违规经营类型</script>"), "综合守护", "public styles must come from the server allowlist");

    response = await fetch(`${base}/v1/leaderboard/score`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ score: 1353, displayName: "<script>违规保护区</script>", ownerName: "违规玩家名", reserveName: "违规保护区", level: 3, animals: 52, shield: 61, style: "<script>违规经营类型</script>" })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, score: 6336, rank: 1, visible: true });
    response = await fetch(`${base}/v1/leaderboard`, { headers: { authorization: `Bearer ${token}` } });
    const safeRanked = (await response.json()).leaderboard[0];
    assert.equal(safeRanked.displayName, testIdentity.title, "client-provided player and reserve names must never reach the public response");
    assert.equal(safeRanked.style, "综合守护", "an untrusted operating style must fall back to the server allowlist");
    assert(!JSON.stringify(safeRanked).includes("违规"), "the public leaderboard must contain no rejected client content");

    response = await fetch(`${base}/v1/leaderboard/score`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ score: 900, displayName: "苔原哨站", ownerName: "leo.liu", reserveName: "苔原哨站保护区", level: 4, animals: 55, shield: 64, style: "水源经营" })
    });
    assert.equal((await response.json()).score, 8190, "leaderboard score must be recalculated from level 4 and 55 animals");

    response = await fetch(`${base}/v1/leaderboard`, { headers: { authorization: `Bearer ${token}` } });
    const ranked = await response.json();
    assert.equal(ranked.identitySource, "server");
    assert.equal(ranked.leaderboard[0].displayName, testIdentity.title);
    assert.equal(ranked.leaderboard[0].ownerName, testIdentity.ownerName);
    assert.equal(ranked.leaderboard[0].reserveName, testIdentity.reserveName);
    assert.equal(ranked.leaderboard[0].rank, 1);
    assert.equal(ranked.scoring, "level-animal-v1");
    assert.equal(ranked.leaderboard[0].score, 8190);
    assert.equal(ranked.leaderboard[0].level, 4);
    assert.equal(ranked.leaderboard[0].animals, 55);
    assert.equal(ranked.leaderboard[0].shield, 64);
    assert.equal(ranked.leaderboard[0].style, "水源经营");
    assert.equal(ranked.leaderboard[0].profileComplete, true);
    assert.equal(ranked.leaderboard[0].mine, true);
    assert.match(ranked.leaderboard[0].id, /^[a-zA-Z0-9_-]{1,20}$/);

    for (const [tokenValue, score, displayName] of [[userOneToken, 1200, "松林保护区"], [userTwoToken, 1100, "河湾保护区"]]) {
      response = await fetch(`${base}/v1/leaderboard/score`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${tokenValue}` },
        body: JSON.stringify({ score, displayName })
      });
      assert.equal(response.status, 200);
    }
    response = await fetch(`${base}/v1/leaderboard`, { headers: { authorization: `Bearer ${userOneToken}` } });
    const authedBeforeImport = await response.json();
    const userTwoMatchKey = crypto.createHash("sha256").update("wild-friend-v1:openid-user-two").digest("hex");
    const userTwoWorldRow = authedBeforeImport.leaderboard.find((entry) => entry.friendMatchKey === userTwoMatchKey);
    assert(userTwoWorldRow && userTwoWorldRow.friend !== true, "logged-in world ranking should carry opaque match keys before relation import");
    response = await fetch(`${base}/v1/leaderboard`);
    const userOneIdentity = serverGeneratedIdentity(verifyToken(secret, userOneToken).sub);
    const legacyProfile = (await response.json()).leaderboard.find((entry) => entry.displayName === userOneIdentity.title);
    assert.equal(legacyProfile.score, 1800, "score-only clients must receive the level-1 zero-population baseline instead of their submitted score");
    assert.equal(legacyProfile.profileComplete, false, "score-only clients must not be presented as complete profiles");
    assert.equal(legacyProfile.animals, null, "missing legacy animal data must not be rendered as a real zero");

    response = await fetch(`${base}/v1/moderation/leaderboard`);
    assert.equal(response.status, 401, "the moderation queue must not be publicly readable");
    response = await fetch(`${base}/v1/moderation/leaderboard/status`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-moderation-key": moderationSecret },
      body: JSON.stringify({ targetId: legacyProfile.id, action: "review", reason: "player_report" })
    });
    assert.deepEqual(await response.json(), { ok: true, targetId: legacyProfile.id, moderationStatus: "pending_review", reason: "player_report", visible: false });
    response = await fetch(`${base}/v1/leaderboard`);
    assert(!(await response.json()).leaderboard.some((entry) => entry.id === legacyProfile.id), "reviewed entries must disappear from the public leaderboard immediately");
    response = await fetch(`${base}/v1/leaderboard/score`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${userOneToken}` },
      body: JSON.stringify({ score: 1210, displayName: "重新上传违规名称" })
    });
    const hiddenScore = await response.json();
    assert.equal(hiddenScore.visible, false, "a score upload must not reactivate an entry under review");
    assert.equal(hiddenScore.rank, null, "hidden entries must not receive a public rank");
    response = await fetch(`${base}/v1/moderation/leaderboard?status=pending_review&targetId=${encodeURIComponent(legacyProfile.id)}`, {
      headers: { "x-moderation-key": moderationSecret }
    });
    const reviewQueue = await response.json();
    assert.equal(reviewQueue.entries.length, 1);
    assert.equal(reviewQueue.entries[0].moderationStatus, "pending_review");
    assert.equal(reviewQueue.entries[0].displayName, serverGeneratedIdentity(verifyToken(secret, userOneToken).sub).title);
    assert.equal(reviewQueue.history[0].action, "review", "moderation decisions must retain an audit trail");
    for (const action of ["block", "takedown", "restore"]) {
      response = await fetch(`${base}/v1/moderation/leaderboard/status`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-moderation-key": moderationSecret },
        body: JSON.stringify({ targetId: legacyProfile.id, action, reason: action === "restore" ? "appeal_approved" : "policy_risk" })
      });
      assert.equal(response.status, 200);
    }
    response = await fetch(`${base}/v1/leaderboard`);
    assert((await response.json()).leaderboard.some((entry) => entry.id === legacyProfile.id), "an explicit reviewed restore must return the entry to the leaderboard");

    response = await fetch(`${base}/v1/leaderboard/score`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ score: 850, displayName: "苔原哨站" })
    });
    assert.equal(response.status, 200);
    response = await fetch(`${base}/v1/leaderboard`, { headers: { authorization: `Bearer ${token}` } });
    const preservedProfile = (await response.json()).leaderboard.find((entry) => entry.mine);
    assert.equal(preservedProfile.animals, 55, "an old score-only update must not erase a previously synced population");
    assert.equal(preservedProfile.score, 8190, "an old score-only update must not replace a complete server-calculated valuation");
    assert.equal(preservedProfile.profileComplete, true);
    assert.equal(calculateReserveValuation(7, 1020), 24860, "server valuation should retain diminishing animal bands at the maximum level");

    const iv = Buffer.from("abcdef0123456789");
    const cipher = crypto.createCipheriv("aes-128-cbc", relationKey, iv);
    const relationBody = Buffer.concat([cipher.update(JSON.stringify({ list: [{ openid: "openid-user-two" }, { openid: "openid-user-three" }], watermark: { appid: "wx-test-app" } })), cipher.final()]).toString("base64");
    response = await fetch(`${base}/v1/friends/import`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${userOneToken}` },
      body: JSON.stringify({ encryptedData: relationBody, iv: iv.toString("base64") })
    });
    assert.equal(response.status, 200);
    const imported = await response.json();
    assert.equal(imported.relationCount, 2);
    assert.equal(imported.linked, 2);
    assert.equal(imported.matched, 1);
    assert.equal(imported.pending, 1);
    assert.equal(imported.friends.length, 2);
    const userTwoIdentity = serverGeneratedIdentity(verifyToken(secret, userTwoToken).sub);
    assert.equal(imported.friends[0].displayName, userTwoIdentity.title);
    assert.equal(imported.friends[0].reserveName, userTwoIdentity.reserveName);
    assert.equal(imported.friends[0].registered, true);
    assert.equal(imported.friends[0].friendMatchKey, crypto.createHash("sha256").update("wild-friend-v1:openid-user-two").digest("hex"));
    assert.equal(imported.friends.find((friend) => !friend.registered).displayName, "微信同玩好友", "an unregistered relation friend should receive a privacy-safe pending exchange seat");
    response = await fetch(`${base}/v1/leaderboard`, { headers: { authorization: `Bearer ${userOneToken}` } });
    const worldAfterFriendImport = await response.json();
    const linkedWorldFriend = worldAfterFriendImport.leaderboard.find((entry) => entry.id === imported.friends[0].id);
    assert(linkedWorldFriend && linkedWorldFriend.friend === true, "a linked WeChat friend in the world top list must be marked for the current viewer");
    assert.equal(linkedWorldFriend.friendMatchKey, crypto.createHash("sha256").update("wild-friend-v1:openid-user-two").digest("hex"));
    const publicWorld = await (await fetch(`${base}/v1/leaderboard`)).json();
    assert(publicWorld.leaderboard.every(entry => !entry.friendMatchKey), "anonymous requests must never receive friend match keys");
    assert(worldAfterFriendImport.leaderboard.filter((entry) => entry.friend === true).length === 1, "world friend markers must only identify the viewer's linked accounts");

    response = await fetch(`${base}/v1/friend-contracts`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${userOneToken}` },
      body: JSON.stringify({ targetId: imported.friends[0].id, objectiveId: "patrol_note", clientContractId: "friend-contract-api-001" })
    });
    assert.equal(response.status, 200);
    const sentContract = (await response.json()).contract;
    assert.equal(sentContract.direction, "sent");
    assert.equal(sentContract.status, "pending");
    response = await fetch(`${base}/v1/friend-contracts`, { headers: { authorization: `Bearer ${userTwoToken}` } });
    const receiverContracts = await response.json();
    assert.equal(receiverContracts.received.length, 1, "真实好友应在收件箱看到发来的合同");
    assert.equal(receiverContracts.received[0].status, "pending");
    response = await fetch(`${base}/v1/friend-contracts/${sentContract.contractId}/complete`, {
      method: "POST",
      headers: { authorization: `Bearer ${userTwoToken}` },
      body: "{}"
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).contract.status, "completed");
    response = await fetch(`${base}/v1/friend-contracts`, { headers: { authorization: `Bearer ${userOneToken}` } });
    const senderContracts = await response.json();
    assert.equal(senderContracts.sent[0].status, "completed", "发起方历史应同步好友执行结果");
    response = await fetch(`${base}/v1/friend-contracts/${sentContract.contractId}/complete`, {
      method: "POST",
      headers: { authorization: `Bearer ${userOneToken}` },
      body: "{}"
    });
    assert.equal(response.status, 403, "发起方不能代替好友执行收到的合同");
    response = await fetch(`${base}/v1/friend-contracts`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ targetId: imported.friends[0].id, objectiveId: "patrol_note", clientContractId: "friend-contract-not-friend" })
    });
    assert.equal(response.status, 403, "非好友不能发起好友合同");
    for (let index = 0; index < 5; index += 1) {
      response = await fetch(`${base}/v1/friend-contracts`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${userOneToken}` },
        body: JSON.stringify({ targetId: imported.friends[0].id, objectiveId: "patrol_note", clientContractId: `friend-contract-limit-${index}` })
      });
      assert.equal(response.status, 200, "五份进行中的好友合同都应允许发起");
    }
    response = await fetch(`${base}/v1/friend-contracts`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${userOneToken}` },
      body: JSON.stringify({ targetId: imported.friends[0].id, objectiveId: "patrol_note", clientContractId: "friend-contract-limit-six" })
    });
    assert.equal(response.status, 409, "第六份进行中的好友合同必须被限制");

    const clientTradeId = "client-trade-real-1";
    const tradeBody = { targetId: imported.friends[0].id, scope: "friends", itemId: "resin_tinder", itemLabel: "伪造高价值素材", valuePoints: 20, clientTradeId };
    response = await fetch(`${base}/v1/trades/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${userOneToken}` },
      body: JSON.stringify(tradeBody)
    });
    assert.equal(response.status, 200);
    const trade = (await response.json()).trade;
    assert.equal(trade.partnerCredit, 2, "friend exchanges should deliver double the server-owned catalog value, ignoring client inflation");
    response = await fetch(`${base}/v1/trades/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${userOneToken}` },
      body: JSON.stringify(tradeBody)
    });
    assert.equal((await response.json()).trade.tradeId, trade.tradeId, "client trade ids should make exchanges idempotent");

    const pendingFriend = imported.friends.find((friend) => !friend.registered);
    response = await fetch(`${base}/v1/trades/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${userOneToken}` },
      body: JSON.stringify({ targetId: pendingFriend.id, scope: "friends", itemId: "reed_cord", clientTradeId: "client-trade-pending-1" })
    });
    assert.equal(response.status, 200, "a verified relation friend should accept an exchange before their next server login");
    response = await fetch(`${base}/v1/auth/wechat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "wechat_user_three" })
    });
    const userThreeToken = (await response.json()).token;
    response = await fetch(`${base}/v1/trades/inbox/claim`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${userThreeToken}` },
      body: "{}"
    });
    assert.equal((await response.json()).trades.length, 1, "the pending exchange receipt should survive until the friend first logs in");

    response = await fetch(`${base}/v1/trades/inbox/claim`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${userTwoToken}` },
      body: "{}"
    });
    const claimed = await response.json();
    assert.equal(claimed.trades.length, 1);
    assert.equal(claimed.trades[0].partnerCredit, 2);
    assert.equal(claimed.trades[0].claimed, true);
    assert(claimed.trades[0].claimedAt > 0, "claim receipts should immediately carry the final inbox status");
    response = await fetch(`${base}/v1/trades/inbox/claim`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${userTwoToken}` },
      body: "{}"
    });
    assert.deepEqual((await response.json()).trades, [], "claimed exchange receipts should not be rewarded twice");

    response = await fetch(`${base}/v1/trades/history?limit=20`, {
      headers: { authorization: `Bearer ${userOneToken}` }
    });
    const senderMailbox = await response.json();
    assert.equal(response.status, 200);
    assert.equal(senderMailbox.sent.length, 2, "the sender outbox should retain both real exchanges");
    assert.equal(senderMailbox.received.length, 0);
    assert.deepEqual(senderMailbox.sent.map((entry) => entry.itemLabel).sort(), ["松脂火绒片", "芦苇纤维束"]);
    assert(senderMailbox.sent.every((entry) => entry.partnerName && entry.direction === "sent"), "outbox rows should identify every recipient");

    response = await fetch(`${base}/v1/trades/history?limit=20`, {
      headers: { authorization: `Bearer ${userTwoToken}` }
    });
    const receiverMailbox = await response.json();
    assert.equal(receiverMailbox.received.length, 1);
    assert.equal(receiverMailbox.received[0].itemLabel, "松脂火绒片");
    assert.equal(receiverMailbox.received[0].partnerName, serverGeneratedIdentity(verifyToken(secret, userOneToken).sub).title);
    assert.equal(receiverMailbox.received[0].claimed, true, "inbox history should distinguish received and already claimed material");

    const barterOffer = { scope: "world", itemId: "resin_tinder", wantedItemId: "reed_cord", motive: "shortfall", clientTradeId: "barter-user-one-001" };
    response = await fetch(`${base}/v1/trades/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${userOneToken}` },
      body: JSON.stringify(barterOffer)
    });
    assert.equal(response.status, 200);
    const openBarter = (await response.json()).trade;
    assert.equal(openBarter.mode, "barter_v1");
    assert.equal(openBarter.status, "open", "the first reciprocal offer should remain safely in escrow");
    assert.equal(openBarter.itemLabel, "松脂火绒片");
    assert.equal(openBarter.requestedItemLabel, "芦苇纤维束");
    response = await fetch(`${base}/v1/trades/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${userOneToken}` },
      body: JSON.stringify(barterOffer)
    });
    assert.equal((await response.json()).trade.tradeId, openBarter.tradeId, "escrow offers must remain idempotent");

    response = await fetch(`${base}/v1/trades/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${userTwoToken}` },
      body: JSON.stringify({ scope: "world", itemId: "reed_cord", wantedItemId: "resin_tinder", motive: "surplus", clientTradeId: "barter-user-two-001" })
    });
    assert.equal(response.status, 200);
    const matchedBarter = (await response.json()).trade;
    assert.equal(matchedBarter.status, "matched", "opposite real-player needs should settle as one atomic match");
    assert.equal(matchedBarter.partnerName, serverGeneratedIdentity(verifyToken(secret, userOneToken).sub).title);

    response = await fetch(`${base}/v1/trades/inbox/claim`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${userOneToken}` },
      body: "{}"
    });
    const userOneBarterInbox = await response.json();
    assert.equal(userOneBarterInbox.trades.length, 1);
    assert.equal(userOneBarterInbox.trades[0].itemLabel, "芦苇纤维束");
    assert.equal(userOneBarterInbox.trades[0].requestedItemLabel, "松脂火绒片", "inbox accounting must state the material already deposited by this player");
    assert.equal(userOneBarterInbox.trades[0].tradeMode, "barter_v1");
    response = await fetch(`${base}/v1/trades/inbox/claim`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${userTwoToken}` },
      body: "{}"
    });
    const userTwoBarterInbox = await response.json();
    assert.equal(userTwoBarterInbox.trades.length, 1);
    assert.equal(userTwoBarterInbox.trades[0].itemLabel, "松脂火绒片");

    for (const [index, pair] of [[2, ["feather_wind_tag", "track_cast"]], [3, ["track_cast", "feather_wind_tag"]]]) {
      response = await fetch(`${base}/v1/trades/exchange`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${userOneToken}` },
        body: JSON.stringify({ scope: "world", itemId: pair[0], wantedItemId: pair[1], clientTradeId: `barter-user-one-00${index}` })
      });
      assert.equal(response.status, 200);
    }
    response = await fetch(`${base}/v1/trades/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${userOneToken}` },
      body: JSON.stringify({ scope: "world", itemId: "resin_tinder", wantedItemId: "reed_cord", clientTradeId: "barter-user-one-004" })
    });
    assert.equal(response.status, 429);
    assert.equal((await response.json()).code, "DAILY_TRADE_LIMIT", "each player may deposit at most three exchange offers per UTC day");

    response = await fetch(`${base}/v1/trades/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${userTwoToken}` },
      body: JSON.stringify({ scope: "world", itemId: "resin_tinder", wantedItemId: "gourd_container", clientTradeId: "barter-unfair-value" })
    });
    assert.equal(response.status, 400, "the server must reject value bands that would trivialize rare-material progression");

    const spoofedStatuses = [];
    for (let index = 0; index < 11; index += 1) {
      response = await fetch(`${base}/v1/auth/wechat`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-real-ip": "203.0.113.77",
          "x-forwarded-for": `198.51.100.${index + 1}, 203.0.113.77`
        },
        body: JSON.stringify({ code: "bad" })
      });
      spoofedStatuses.push(response.status);
    }
    assert.equal(spoofedStatuses[0], 400);
    assert.equal(spoofedStatuses[10], 429, "rotating a client-controlled forwarded chain must not bypass the real-IP rate limit");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  }
  console.log("wild api test ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
