const {
  CLOUD_BASE_URL,
  safeConfig,
  reserveAnimalTotal,
  rankRecord,
  leaderboardRow,
  CloudServiceController
} = require("../js/cloudService");

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function main() {
  let now = 1000000;
  const storage = {};
  const calls = [];
  const runtime = {
    getStorageSync(key) { return storage[key] || null; },
    setStorageSync(key, value) { storage[key] = JSON.parse(JSON.stringify(value)); },
    login(options) { options.success({ code: "wechat_code_123456" }); },
    authorize(options) { assert(options.scope === "scope.interactedUserInfo", "relation friends must use the approved interacted-user scope"); options.success({}); },
    getRelationFriendList(options) { options.success({ encryptedData: "encrypted-relation-data", iv: "relation-iv" }); },
    request(options) {
      calls.push(options);
      if (options.url === `${CLOUD_BASE_URL}/v1/config`) {
        assert(options.enableCache === false, "config refresh must disable native HTTP cache so WeChat DETECT does not treat 304 as an error");
        assert(!(options.header || {})["if-none-match"], "config refresh must not send If-None-Match");
        options.success({ statusCode: 200, data: { ok: true, config: {
          version: 3,
          features: { worldLeaderboard: true, socialTrade: true, reciprocalTrade: true, telemetry: true, cloudSave: false, remoteBalance: true },
          balance: { emergencySupplyDailyLimit: 2, eventUploadSampleRate: 1 }
        } }, header: { etag: '"config-v2"' } });
      } else if (options.url === `${CLOUD_BASE_URL}/v1/auth/wechat`) {
        options.success({ statusCode: 200, data: { ok: true, token: "signed-session-token", publicId: "pubid0123456789abcd", friendMatchKey: "ab".repeat(32), expiresIn: 3600 } });
      } else if (options.url === `${CLOUD_BASE_URL}/v1/leaderboard/score`) {
        assert(options.header.authorization === "Bearer signed-session-token", "score upload must use the backend session token");
        assert(options.data.profileVersion === 2 && options.data.level === 3 && options.data.animals === 197 && options.data.shield === 42 && options.data.style === "稳定保护站", "world sync must upload the complete ecological population used by the detail panel");
        assert(options.data.score === 8946, "world sync must derive valuation from level 3 and 197 live animals");
        options.success({ statusCode: 200, data: { ok: true, score: 8946, rank: 7 } });
      } else if (options.url.indexOf(`${CLOUD_BASE_URL}/v1/leaderboard?`) === 0) {
        const overflowRows = Array.from({ length: 105 }, (_, index) => ({
          id: `overflow-${index}`,
          displayName: `玩家${index + 1}的林地${index + 1}`,
          ownerName: `玩家${index + 1}`,
          reserveName: `林地${index + 1}`,
          rank: index + 3,
          score: 1200 - index,
          level: 1,
          animals: 20,
          shield: 30,
          mine: false
        }));
        options.success({ statusCode: 200, data: { ok: true, leaderboard: [
          { id: "mine-id", displayName: "卫士·MINE的苔原哨站", ownerName: "卫士·MINE", reserveName: "苔原哨站", rank: 2, score: 1353, updatedAt: 10, mine: true },
          { id: "other-id", displayName: "Nicole.英的河湾哨站", ownerName: "Nicole.英", reserveName: "河湾哨站", rank: 1, score: 1400, level: 2, animals: 31, shield: 48, style: "水源经营", updatedAt: 11, mine: false, friend: true, friendMatchKey: "ab".repeat(32) }
        ].concat(overflowRows) } });
      } else if (options.url === `${CLOUD_BASE_URL}/v1/friends/import`) {
        assert(options.header.authorization === "Bearer signed-session-token", "friend relation payload must go only to the authenticated backend");
        assert(options.data.encryptedData === "encrypted-relation-data" && options.data.iv === "relation-iv", "client must forward encrypted relation data without reading friend openids");
        options.success({ statusCode: 200, data: { ok: true, relationCount: 2, linked: 2, matched: 1, pending: 1, friends: [
          { id: "friend-public-id", displayName: "好友英的河湾哨站", ownerName: "好友英", reserveName: "河湾哨站", score: 1288, updatedAt: 12, registered: true },
          { id: "pending-public-id", displayName: "微信同玩好友", score: 0, updatedAt: 13, registered: false }
        ] } });
      } else if (options.url === `${CLOUD_BASE_URL}/v1/trades/exchange`) {
        options.success({ statusCode: 200, data: { ok: true, trade: { tradeId: "trade-1", clientTradeId: options.data.clientTradeId, partnerCredit: 2 } } });
      } else if (options.url === `${CLOUD_BASE_URL}/v1/trades/history?limit=50`) {
        options.success({ statusCode: 200, data: { ok: true, sent: [
          { tradeId: "trade-1", direction: "sent", scope: "friends", itemId: "resin_tinder", itemLabel: "松脂火绒片", partnerName: "好友河湾", partnerCredit: 2, createdAt: 20, claimed: true }
        ], received: [
          { tradeId: "incoming-1", direction: "received", scope: "friends", itemId: "reed_cord", itemLabel: "芦苇纤维束", partnerName: "远方好友", partnerCredit: 2, createdAt: 21, claimed: true }
        ] } });
      } else if (options.url === `${CLOUD_BASE_URL}/v1/trades/inbox/claim`) {
        options.success({ statusCode: 200, data: { ok: true, trades: [{ tradeId: "incoming-1", partnerCredit: 2 }] } });
      } else if (options.url === `${CLOUD_BASE_URL}/v1/events`) {
        options.success({ statusCode: 202, data: { ok: true } });
      } else {
        options.fail({ errMsg: "unexpected request" });
      }
      return { abort() {} };
    }
  };
  let changes = 0;
  const controller = new CloudServiceController(runtime, { now: () => now, random: () => 0.25, onChange: () => { changes += 1; } });
  const reserve = { base: { name: "苔原哨站", rating: 1353, shield: 42, protectedAnimals: { deer: 15, antelope: 12, boar: 5 } }, ecology: { predators: { wolf: 4 }, herbivores: { deer: 35, antelope: 45, zebra: 40, boar: 15, hare: 50 }, birds: { crow: 8 } }, progression: { level: 3, title: "稳定保护站" } };
  await controller.bootstrap(reserve);
  assert(controller.authStatus === "authenticated" && controller.status === "online", "bootstrap should complete silent WeChat login");
  assert(controller.session.friendMatchKey === "ab".repeat(32) && controller.session.publicId === "pubid0123456789abcd", "login should cache the opaque friend match key for hosted identity writes");
  assert(controller.rows[0].friendMatchKey === "ab".repeat(32), "world rows should keep opaque match keys from an authenticated leaderboard");
  const leaderboardCall = calls.find((call) => String(call.url || "").indexOf("/v1/leaderboard?") >= 0);
  assert(leaderboardCall && leaderboardCall.header.authorization === "Bearer signed-session-token", "logged-in world ranking must send the session so the server can attach match keys");
  assert(controller.feature("worldLeaderboard") && controller.config().version === 3, "remote feature flags should use the allowlisted server config");
  assert(controller.feature("socialTrade") && controller.feature("reciprocalTrade"), "reciprocal material exchange should require an explicit server capability flag");
  assert(controller.myRank === 7 && controller.myScore === 8946, "score upload should retain the server-derived valuation and authoritative world rank");
  assert(controller.rows.length === 100 && controller.rows[0].name === "Nicole.英的河湾哨站" && controller.rows[0].owner === "Nicole.英" && controller.rows[0].rank === 1 && controller.rows[0].level === 2 && controller.rows[0].animals === 31 && controller.rows[0].shield === 48 && controller.rows[0].profileComplete && controller.rows[0].source === "cloud" && controller.rows[0].friend, "world rows should preserve real player details, friend identity, exclude my duplicate row and cap the cached list at one hundred players");
  assert(calls.some((call) => call.url === `${CLOUD_BASE_URL}/v1/leaderboard?limit=100`), "world leaderboard should request up to one hundred real players");
  assert(storage.wild_guard_cloud_session_v1.token === "signed-session-token", "session token should be cached locally");
  assert(storage.wild_guard_remote_config_v1.etag === '"config-v2"', "remote config should cache its ETag");
  assert(/^wg_/.test(storage.wild_guard_install_id_v1), "telemetry should use a stable anonymous install id");
  assert(changes > 0, "async cloud state changes should request a UI refresh");

  const friends = await controller.refreshRelationFriends(true);
  assert(friends.length === 2 && friends[0].name === "好友英的河湾哨站" && friends[0].scope === "friends" && friends[0].source === "wechat", "encrypted relation friends should map server players into exchange targets");
  assert(friends[1].name === "微信同玩好友 2" && friends[1].registered === false && controller.friendRelationCount === 2 && controller.friendMatchedCount === 1 && controller.friendPendingCount === 1, "unregistered relation friends should remain available as pending, privacy-safe exchange targets");
  assert(controller.rows.some((row) => row.friend === true) && calls.filter((call) => call.url === `${CLOUD_BASE_URL}/v1/leaderboard?limit=100`).length >= 2, "importing WeChat relations should immediately refresh world rows and preserve friend markers");
  const receipt = await controller.exchangeMaterial({ targetId: "friend-public-id", scope: "friends", itemId: "resin_tinder", itemLabel: "松脂火绒片", valuePoints: 1, clientTradeId: "client-trade-1" });
  assert(receipt.tradeId === "trade-1", "material exchange should wait for an authoritative server receipt");
  const inbox = await controller.claimTradeInbox();
  assert(inbox.length === 1 && inbox[0].tradeId === "incoming-1", "incoming exchange receipts should be claimable on login");
  const mailbox = await controller.refreshTradeMailbox(true);
  assert(mailbox.sent.length === 1 && mailbox.sent[0].partnerName === "好友河湾" && mailbox.sent[0].itemLabel === "松脂火绒片", "the outbox should retain the sent item and recipient");
  assert(mailbox.received.length === 1 && mailbox.received[0].partnerName === "远方好友" && mailbox.received[0].itemLabel === "芦苇纤维束", "the inbox should retain the received item and sender");

  assert((await controller.syncScore(reserve)) === false, "unchanged scores should not be uploaded on every render");
  now += 61000;
  await controller.refreshConfig(true);
  const configCalls = calls.filter((call) => call.url.endsWith("/v1/config"));
  assert(configCalls.length === 2, "forced config refresh after the local TTL should request again");
  assert(configCalls.every((call) => call.enableCache === false && !(call.header || {})["if-none-match"]), "config refresh must keep returning 200 instead of a DETECT-flagged 304");

  const sanitized = safeConfig({
    version: -2,
    maintenance: "yes",
    features: { worldLeaderboard: 1, telemetry: true },
    balance: { emergencySupplyDailyLimit: 100, eventUploadSampleRate: -4 },
    messages: { maintenance: "x".repeat(200) }
  });
  assert(sanitized.version === 1 && sanitized.maintenance === false && sanitized.features.worldLeaderboard === false && sanitized.features.reciprocalTrade === false && sanitized.features.friendContracts === false && sanitized.features.worldPatrols === false, "remote config types must not be coerced into privileged flags");
  const enabledRoutes = safeConfig({ features: { socialTrade: true, worldLeaderboard: true, friendContracts: true, worldPatrols: true } });
  assert(enabledRoutes.features.friendContracts === true && enabledRoutes.features.worldPatrols === true, "friend contracts and world patrols stay off until the server config explicitly enables them");
  const legacyRoutes = safeConfig({ features: { socialTrade: true, worldLeaderboard: true } });
  assert(legacyRoutes.features.friendContracts === false && legacyRoutes.features.worldPatrols === false, "an older server config must not imply the new contract and patrol routes");
  assert(sanitized.balance.emergencySupplyDailyLimit === 5 && sanitized.balance.eventUploadSampleRate === 0 && sanitized.messages.maintenance.length === 80, "remote numbers and copy must remain bounded");
  assert(rankRecord({ base: { name: "  ", rating: 10000001 } }).score === 1800, "legacy rating must not leak into the new valuation");
  assert(rankRecord({ base: { name: "苔原哨站", rating: 1216 } }, 6232).score === 1800, "callers must not override the level-and-animal valuation");
  assert(rankRecord({ base: { name: "苔原哨站保护区", ownerName: "leo.liu", rating: 1216 } }).displayName === "leo.liu的苔原哨站", "score records should combine the real player name and de-duplicated reserve name");
  assert(reserveAnimalTotal(reserve) === 197 && rankRecord(reserve).animals === 197 && rankRecord(reserve).score === 8946, "rank records must count the live ecology and price it with the shared formula");
  const row = leaderboardRow({ id: "stable", displayName: "云端保护区", score: 1234 }, 0);
  assert(row.id === "cloud_stable" && row.worldPlayerId === "stable" && row.name === "STAB的云端" && row.valuation === 1234 && row.rating === 1234 && row.simulated === false, "cloud rows should map real public identity and valuation without a guardian prefix");
  const legacyGuardian = leaderboardRow({ id: "legacy", displayName: "卫士·YXNY的苔原哨站", ownerName: "卫士·YXNY", score: 1220 }, 1);
  assert(legacyGuardian.name === "YXNY的苔原哨站" && legacyGuardian.owner === "YXNY", "cached legacy leaderboard names should also remove the guardian prefix");
  const legacyZero = leaderboardRow({ id: "old", displayName: "OLD1的苔原哨站", score: 6000, level: 1, animals: 0, shield: 0 }, 2);
  assert(!legacyZero.profileComplete && legacyZero.animals > 0 && legacyZero.shield > 0, "legacy zero placeholders must be marked incomplete while retaining safe internal action values");

  const offlineStorage = {
    wild_guard_remote_config_v1: storage.wild_guard_remote_config_v1
  };
  const offline = new CloudServiceController({
    getStorageSync(key) { return offlineStorage[key] || null; },
    setStorageSync() {},
    request(options) { options.fail({ errMsg: "request:fail timeout" }); }
  }, { now: () => now });
  await offline.refreshConfig(true);
  assert(offline.configStatus === "cached" && offline.feature("worldLeaderboard"), "network failure should retain the last known safe config");

  const publicCalls = [];
  const unauthenticated = new CloudServiceController({
    getStorageSync() { return null; },
    setStorageSync() {},
    login(options) { options.fail({ errMsg: "login:fail" }); },
    request(options) {
      publicCalls.push(options.url);
      if (options.url === `${CLOUD_BASE_URL}/v1/config`) {
        options.success({ statusCode: 200, data: { ok: true, config: {
          version: 3,
          features: { worldLeaderboard: true, socialTrade: true, reciprocalTrade: true, telemetry: false }
        } }, header: { etag: '"config-public"' } });
      } else if (options.url.indexOf(`${CLOUD_BASE_URL}/v1/leaderboard?`) === 0) {
        assert(!options.header || !options.header.authorization, "public world list must not require a WeChat session");
        options.success({ statusCode: 200, data: { ok: true, leaderboard: [
          { id: "other-id", displayName: "Nicole.英的河湾哨站", ownerName: "Nicole.英", reserveName: "河湾哨站", rank: 1, score: 1400, level: 2, animals: 31, shield: 48, mine: false }
        ] } });
      } else options.fail({ errMsg: "unexpected request" });
      return { abort() {} };
    }
  }, { now: () => now + 1 });
  await unauthenticated.bootstrap();
  assert(unauthenticated.authStatus === "offline" && unauthenticated.rows.length === 1, "world list should still load when wx.login fails in the simulator");
  assert(publicCalls.some((url) => url.indexOf("/v1/leaderboard?") >= 0), "unauthenticated bootstrap must request the public world leaderboard");

  const beforeOptionalRoutes = calls.length;
  await controller.refreshFriendContractMailbox(true);
  await controller.refreshWorldHoundPatrolHistory(true);
  assert(!calls.slice(beforeOptionalRoutes).some((call) => /friend-contracts|world-patrols/.test(call.url)), "friend contracts and world patrols must not be requested until the server config enables them");

  let patrolCalls = 0;
  const staged = new CloudServiceController({
    getStorageSync() { return null; },
    setStorageSync() {},
    login(options) { options.success({ code: "wechat_code_123456" }); },
    request(options) {
      if (options.url === `${CLOUD_BASE_URL}/v1/config`) {
        options.success({ statusCode: 200, data: { ok: true, config: {
          version: 4,
          features: { worldLeaderboard: true, socialTrade: true, friendContracts: true, worldPatrols: true }
        } } });
      } else if (options.url === `${CLOUD_BASE_URL}/v1/auth/wechat`) {
        options.success({ statusCode: 200, data: { ok: true, token: "signed-session-token", publicId: "pubid0123456789abcd", expiresIn: 3600 } });
      } else if (/friend-contracts|world-patrols/.test(options.url)) {
        patrolCalls += 1;
        options.success({ statusCode: 404, data: {} });
      } else options.fail({ errMsg: "unexpected request" });
      return { abort() {} };
    }
  }, { now: () => now + 2 });
  await staged.refreshConfig(true);
  await staged.login();
  await staged.refreshFriendContractMailbox(true);
  await staged.refreshFriendContractMailbox(true);
  await staged.refreshWorldHoundPatrolHistory(true);
  await staged.refreshWorldHoundPatrolHistory(true);
  assert(patrolCalls === 2 && staged.friendContractMailboxStatus === "unavailable" && staged.worldHoundPatrolMailboxStatus === "unavailable", "a 404 from an undeployed contract or patrol route should be remembered and not requested again");

  const backoffNow = now + 3;
  const backoff = new CloudServiceController({
    getStorageSync() { return null; },
    setStorageSync() {},
    login(options) { options.fail({ errMsg: "should not login while session is valid" }); },
    request() { return { abort() {} }; }
  }, { now: () => backoffNow });
  backoff.session = {
    token: "keep-me",
    publicId: "pubid0123456789abcd",
    friendMatchKey: "ab".repeat(32),
    expiresAt: backoffNow + 120000
  };
  backoff.networkBackoffUntil = backoffNow + 60000;
  assert(await backoff.login() === true, "a still-valid session must not be blocked by network backoff");

  const patrolStartCalls = [];
  const patrolReady = new CloudServiceController({
    getStorageSync() { return null; },
    setStorageSync() {},
    login(options) { options.success({ code: "wechat_code_123456" }); },
    request(options) {
      patrolStartCalls.push(options);
      if (options.url === `${CLOUD_BASE_URL}/v1/config`) {
        options.success({ statusCode: 200, data: { ok: true, config: {
          version: 4,
          features: { worldLeaderboard: true, socialTrade: true }
        } } });
      } else if (options.url === `${CLOUD_BASE_URL}/v1/auth/wechat`) {
        options.success({ statusCode: 200, data: { ok: true, token: "signed-session-token", publicId: "pubid0123456789abcd", friendMatchKey: "ab".repeat(32), expiresIn: 3600 } });
      } else if (options.url === `${CLOUD_BASE_URL}/v1/world-patrols`) {
        options.success({ statusCode: 200, data: { ok: true, patrol: { patrolId: "p1", settleAt: backoffNow + 300000 } } });
      } else options.fail({ errMsg: "unexpected request" });
      return { abort() {} };
    }
  }, { now: () => backoffNow + 4 });
  await patrolReady.refreshConfig(true);
  assert(patrolReady.feature("worldPatrols") === false, "cached or legacy config may omit worldPatrols");
  await patrolReady.login();
  const started = await patrolReady.startWorldHoundPatrol("targetid0123456789", 100, "hound_1", { actorChapter: 7 });
  assert(started && started.patrolId === "p1", "leaderboard-ready clients should POST patrols even if worldPatrols is still cached false");
  assert(patrolReady.feature("worldPatrols") === true, "a successful patrol should locally enable worldPatrols");
  assert(patrolStartCalls.some((call) => call.url === `${CLOUD_BASE_URL}/v1/world-patrols` && call.method === "POST"), "world patrol start must actually POST /v1/world-patrols");

  let missingPatrolPosts = 0;
  const missing = new CloudServiceController({
    getStorageSync() { return null; },
    setStorageSync() {},
    login(options) { options.success({ code: "wechat_code_123456" }); },
    request(options) {
      if (options.url === `${CLOUD_BASE_URL}/v1/config`) {
        options.success({ statusCode: 200, data: { ok: true, config: {
          version: 4,
          features: { worldLeaderboard: true }
        } } });
      } else if (options.url === `${CLOUD_BASE_URL}/v1/auth/wechat`) {
        options.success({ statusCode: 200, data: { ok: true, token: "signed-session-token", publicId: "pubid0123456789abcd", friendMatchKey: "ab".repeat(32), expiresIn: 3600 } });
      } else if (options.url === `${CLOUD_BASE_URL}/v1/world-patrols`) {
        missingPatrolPosts += 1;
        options.success({ statusCode: 404, data: {} });
      } else options.fail({ errMsg: "unexpected request" });
      return { abort() {} };
    }
  }, { now: () => backoffNow + 5 });
  await missing.refreshConfig(true);
  await missing.login();
  let missingError = "";
  try {
    await missing.startWorldHoundPatrol("targetid0123456789", 100, "hound_missing");
  } catch (error) {
    missingError = String(error && error.message || "");
  }
  assert(missingPatrolPosts === 1 && /HTTP_404|NOT_FOUND/.test(missingError), "first undeployed patrol POST should surface the 404");
  missingError = "";
  try {
    await missing.startWorldHoundPatrol("targetid0123456789", 100, "hound_missing_2");
  } catch (error) {
    missingError = String(error && error.message || "");
  }
  assert(missingPatrolPosts === 1 && missingError === "WORLD_PATROLS_UNAVAILABLE", "a remembered 404 must not POST world patrols again");

  console.log("cloud service check ok");
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
