"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
  PATROL_COST_MIN,
  PATROL_COST_MAX,
  PATROL_SETTLE_DELAY_MS,
  PATROL_DAILY_LIMIT,
  PATROL_HISTORY_LIMIT,
  PATROL_POPULATION_REWARD_SCALE,
  PATROL_ANIMAL_REWARD_SCALE,
  localDayKey,
  normalizePatrolState,
  patrolAlreadyClaimed,
  calculatePatrolOutcome,
  chapterPatrolNeed,
  canStartPatrol,
  createPatrolRecord,
  settlePatrolRecord,
  applyActorReward,
  applyTargetLoss,
  patrolHistoryCopy
} = require("../js/worldHoundPatrol");
const { applyChapterVisitorDelta, chapterVisitorTotal } = require("../js/chapterTargets");
const { livingStock } = require("../js/animalSourceLedger");

async function main() {
  const quiet = calculatePatrolOutcome({ cost: PATROL_COST_MAX, safety: 100, fund: 5000, visitors: 1000, animals: 1000, chapter: 3 });
  const risky = calculatePatrolOutcome({ cost: PATROL_COST_MAX, safety: 0, fund: 5000, visitors: 1000, animals: 1000, chapter: 3 });
  assert.ok(risky.actorReward.fund > quiet.actorReward.fund, "低安全值应提高基金收益");
  assert.ok(risky.actorReward.visitors > quiet.actorReward.visitors, "低安全值应提高游客收益");
  assert.ok(risky.actorReward.animals > quiet.actorReward.animals, "低安全值应提高动物收益");
  const chapterNeed = chapterPatrolNeed(3);
  assert.equal(risky.actorReward.visitors, Math.round(chapterNeed.visitors * PATROL_POPULATION_REWARD_SCALE), "满额且安全为0时，游客收益按当前章节目标计算");
  assert.equal(risky.actorReward.animals, Math.round(chapterNeed.animals * PATROL_ANIMAL_REWARD_SCALE), "满额且安全为0时，动物收益应明显低于游客收益");
  assert.equal(risky.actorReward.fund, chapterNeed.fund, "满额且安全为0时，基金收益应等于当前章节基金需要");
  assert.equal(PATROL_POPULATION_REWARD_SCALE, 0.7, "世界榜巡逻游客收益倍率应保持70%");
  assert.equal(PATROL_ANIMAL_REWARD_SCALE, 0.28, "世界榜巡逻动物收益倍率应降至28%");
  const smallStake = calculatePatrolOutcome({ cost: PATROL_COST_MIN, safety: 0, chapter: 3 });
  assert.ok(smallStake.actorReward.animals < risky.actorReward.animals, "投入更少时动物收益应下降");
  assert.ok(smallStake.actorReward.visitors > 0, "游客收益不能再固定为0");
  assert.ok(risky.transferRate > quiet.transferRate, "低安全值应提高转移比例");
  const protectedFloor = calculatePatrolOutcome({ cost: 100, safety: 0, fund: 1000, visitors: 500, animals: 500, visitorFloor: 500, animalFloor: 500 });
  assert.equal(protectedFloor.targetLoss.visitors, 0, "章节游客底线不得被巡逻突破");
  assert.equal(protectedFloor.targetLoss.animals, 0, "章节动物底线不得被巡逻突破");
  const state = normalizePatrolState({ dayKey: localDayKey(), initiatedToday: PATROL_DAILY_LIMIT, initiatedTargets: ["a"] });
  assert.equal(canStartPatrol(state, "b").ok, false, "每日最多5次");
  const duplicate = normalizePatrolState({ dayKey: localDayKey(), initiatedToday: 1, initiatedTargets: ["a"] });
  assert.equal(canStartPatrol(duplicate, "a").code, "TARGET_ALREADY_PATROLLED", "同一天同一目标只能一次");
  const record = createPatrolRecord({ targetId: "a", cost: PATROL_COST_MIN, targetSnapshot: { safety: 40, visitors: 100, animals: 100 } });
  assert.equal(settlePatrolRecord(record, record.settleAt - 1).status, "pending", "5分钟内不得提前结算");
  assert.equal(settlePatrolRecord(record, record.settleAt).status, "settled", "达到结算时间后应结算");

  const { Game } = require("../js/game");
  const { createCharacter } = require("../js/storage");
  const game = Object.create(Game.prototype);
  game.state = createCharacter(null, "世界巡逻入口");
  game.state.world.reserve.fund = 500;
  game.leagueScope = "world";
  game.render = () => {};
  const toasts = [];
  game.toast = (message) => { toasts.push(String(message || "")); };
  game.cloudService = {
    supported: true,
    feature(name) { return name === "worldLeaderboard"; },
    sessionReady() { return true; },
    session: { token: "signed-session-token", expiresAt: Date.now() + 3600000 },
    routeUnavailable() { return false; }
  };
  const opened = game.openWorldHoundPatrolForLeaguePlayer({
    id: "cloud_other",
    worldPlayerId: "other1234567890abcd",
    mine: false,
    profileComplete: true,
    name: "云岭·6474的湖岸哨站",
    owner: "云岭·6474",
    safety: 100,
    animals: 712,
    visitors: 241
  });
  assert.equal(opened, true, "world board plus a valid session should open the patrol confirm even if worldPatrols is still cached false");
  assert.equal(game.infoDetailModal && game.infoDetailModal.kind, "worldHoundPatrolConfirm", "the patrol confirm modal should open");
  assert.equal(toasts.some((message) => /退出后重新进入/.test(message)), false, "connected world board must not tell the player to restart the game");

  const reconnect = Object.create(Game.prototype);
  reconnect.state = createCharacter(null, "世界巡逻重连");
  reconnect.state.world.reserve.fund = 500;
  reconnect.leagueScope = "world";
  reconnect.render = () => {};
  const reconnectToasts = [];
  reconnect.toast = (message) => { reconnectToasts.push(String(message || "")); };
  let loginCalls = 0;
  reconnect.cloudService = {
    supported: true,
    feature(name) { return name === "worldLeaderboard"; },
    sessionReady() { return loginCalls > 0; },
    session: { token: "", expiresAt: 0 },
    routeUnavailable() { return false; },
    login() {
      loginCalls += 1;
      this.session = { token: "signed-session-token", expiresAt: Date.now() + 3600000 };
      return Promise.resolve(true);
    }
  };
  assert.equal(reconnect.openWorldHoundPatrolForLeaguePlayer({
    id: "cloud_friend",
    worldPlayerId: "friend1234567890ab",
    mine: false,
    profileComplete: true,
    name: "云岭·6474的湖岸哨站",
    owner: "云岭·6474"
  }), false, "missing token should attempt login instead of opening immediately");
  assert.equal(reconnectToasts[0], "正在连接世界榜", "missing token should show a reconnecting toast");
  await Promise.resolve();
  assert.equal(reconnect.infoDetailModal && reconnect.infoDetailModal.kind, "worldHoundPatrolConfirm", "login success should reopen the patrol confirm");
  assert.equal(reconnectToasts.some((message) => /退出后重新进入/.test(message)), false, "login retry must not ask the player to leave and re-enter");
  assert.ok(game.infoDetailModal.outcome && game.infoDetailModal.outcome.targetLoss, "confirm modal should preview the target's loss");
  assert.ok(game.infoDetailModal.outcome.actorReward.fund > 0, "confirm modal should preview the actor's fund gain");

  const actorReserve = {
    fund: 400,
    ecology: { herbivores: { antelope: 10 }, predators: {}, birds: {} },
    progression: { stage: 1 },
    chapterRescue: { enforceCompletion: false },
    development: { operations: { today: {}, visitorLedger: {} } },
    base: { animals: 10 }
  };
  const beforeActorAnimals = livingStock(actorReserve);
  const reward = applyActorReward(actorReserve, { actorReward: { fund: 80, visitors: 12, animals: 5 } });
  assert.equal(actorReserve.fund, 480, "settlement should add fund to the patrol actor");
  assert.equal(reward.visitors, 12, "settlement should add visitors to the patrol actor");
  assert.equal(reward.animals, 5, "settlement should add living animals to the patrol actor");
  assert.equal(livingStock(actorReserve), beforeActorAnimals + 5, "actor animal stock should rise by the patrol reward");
  const onceRecord = { patrolId: "once-only", actorReward: { fund: 20, visitors: 3, animals: 2 } };
  const onceReserveBefore = { fund: actorReserve.fund, animals: actorReserve.base.animals };
  const onceFirst = applyActorReward(actorReserve, onceRecord);
  const onceSecond = applyActorReward(actorReserve, onceRecord);
  assert.deepEqual(onceSecond, onceFirst, "同一巡逻记录的重复结算应返回首次奖励");
  assert.equal(actorReserve.fund, onceReserveBefore.fund + onceFirst.fund, "同一巡逻记录不得重复增加基金");
  assert.equal(actorReserve.base.animals, onceReserveBefore.animals + onceFirst.animals, "同一巡逻记录不得重复增加动物");
  const restoredPatrolState = normalizePatrolState({ history: [onceRecord] });
  assert.equal(patrolAlreadyClaimed(restoredPatrolState, onceRecord, "reward"), true, "重载存档后同一巡逻仍应标记为已领奖");

  const targetReserve = {
    fund: 900,
    ecology: { herbivores: { antelope: 80 }, predators: {}, birds: {} },
    progression: { stage: 1 },
    chapterRescue: { enforceCompletion: false },
    development: { operations: { today: {}, visitorLedger: {} } },
    base: { animals: 80 }
  };
  applyChapterVisitorDelta(targetReserve, 200, "visit");
  const beforeVisitors = chapterVisitorTotal(targetReserve);
  const beforeTargetAnimals = livingStock(targetReserve);
  const loss = applyTargetLoss(targetReserve, {
    targetLoss: { fund: 100, visitors: 40, animals: 20 },
    protectedFloors: { fund: 0, visitors: 0, animals: 0 }
  });
  assert.equal(loss.fund, 100, "target fund loss should apply");
  assert.equal(targetReserve.fund, 800, "target fund should fall by the patrol loss");
  assert.equal(loss.visitors, 40, "target visitor loss should apply");
  assert.equal(chapterVisitorTotal(targetReserve), beforeVisitors - 40, "target visitor total should fall");
  assert.equal(loss.animals, 20, "target animal loss should apply");
  assert.equal(livingStock(targetReserve), beforeTargetAnimals - 20, "target living animals should fall");

  const floorReserve = {
    fund: 500,
    ecology: { herbivores: { antelope: 80 }, predators: {}, birds: {} },
    progression: { stage: 1 },
    chapterRescue: { enforceCompletion: false },
    development: { operations: { today: {}, visitorLedger: {} } }
  };
  const floorHold = applyTargetLoss(floorReserve, {
    targetLoss: { fund: 400, visitors: 40, animals: 40 },
    protectedFloors: { fund: 400, visitors: 0, animals: 70 }
  });
  assert.equal(floorHold.fund, 100, "target fund must not fall through the protected floor");
  assert.ok(floorHold.animals <= 10, "target animals must not fall through the protected floor");

  const receivedCopy = patrolHistoryCopy({
    direction: "received",
    status: "settled",
    partnerName: "云岭哨站",
    cost: 300,
    targetLoss: { fund: 40, visitors: 12, animals: 8 }
  });
  assert.match(receivedCopy.body, /损失 基金 -40/, "received history must show the lost materials");
  assert.match(receivedCopy.body, /游客 -12/, "received history must show lost visitors");
  assert.match(receivedCopy.body, /动物 -8/, "received history must show lost animals");
  assert.equal(receivedCopy.tag, "已结算", "settled received patrols stay in history as settled");

  const historyGame = Object.create(Game.prototype);
  historyGame.state = {
    character: { name: "林卫" },
    world: {
      reserve: {
        fund: 500,
        progression: { stage: 1 },
        worldHoundPatrol: {
          history: [{
            patrolId: "recv1",
            direction: "received",
            status: "settled",
            partnerName: "林岚",
            cost: 300,
            targetLoss: { fund: 40, visitors: 12, animals: 8 }
          }]
        }
      }
    }
  };
  historyGame.cloudService = null;
  historyGame.render = () => {};
  historyGame.openWorldHoundPatrolHistory(false);
  assert.equal(historyGame.infoDetailModal && historyGame.infoDetailModal.kind, "worldHoundPatrolHistory");
  assert.match(historyGame.infoDetailModal.items[0].body, /损失 基金 -40/, "patrol history screen must show the target's lost materials");
  assert.equal(historyGame.infoDetailModal.items[0].tone, "loss", "received losses should use the loss tone");

  historyGame.screen = "home";
  historyGame.infoDetailModal = null;
  historyGame.pendingWorldHoundPatrolResults = [{
    noticeRole: "target",
    partnerName: "林岚",
    appliedLoss: { fund: 40, visitors: 12, animals: 8 }
  }];
  assert.equal(historyGame.openPendingWorldHoundPatrolResult(), true, "sandbox should pop the patrol result");
  assert.equal(historyGame.infoDetailModal.kind, "worldHoundPatrolResult");
  assert.equal(historyGame.infoDetailModal.title, "被巡逻，物资被取走");
  assert.equal(historyGame.infoDetailModal.kicker, "登录提醒 · 猎犬巡逻");
  historyGame.infoDetailModal = null;
  historyGame.pendingWorldHoundPatrolResults = [{
    noticeRole: "target",
    partnerName: "林岚",
    appliedLoss: { fund: 0, visitors: 0, animals: 0 }
  }];
  assert.equal(historyGame.openPendingWorldHoundPatrolResult(), false, "zero material loss must not open the login popup");
  assert.equal(historyGame.infoDetailModal, null);

  const gameSrc = fs.readFileSync(require.resolve("../js/game.js"), "utf8");
  assert.match(gameSrc, /reserve\.fund = Math\.max\(0, Number\(reserve\.fund\) - cost\)/, "confirm must deduct the actor fund immediately");
  assert.match(gameSrc, /applyTargetLoss\(reserve/, "received mailbox must apply the target loss");
  assert.match(gameSrc, /noticeRole: "target"/, "target settlement must queue a sandbox notice");
  assert.match(gameSrc, /对方损失 基金/, "confirm preview must show the target loss");

  const capped = normalizePatrolState({
    claimedIds: ["legacy-claim"],
    claimedLossIds: ["legacy-loss"],
    history: Array.from({ length: 16 }, (_, index) => ({
      patrolId: `row${index}`,
      direction: index % 2 === 0 ? "sent" : "received",
      status: "settled",
      createdAt: 1000 + index,
      settledAt: 2000 + index,
      appliedReward: index % 2 === 0,
      appliedLoss: index % 2 === 1,
      targetName: index % 2 === 0 ? `主动${index}` : `来访${index}`,
      cost: 100,
      actorReward: { fund: 8, visitors: 2, animals: 1 },
      targetLoss: { fund: 4, visitors: 1, animals: 1 }
    }))
  });
  assert.equal(capped.history.length, PATROL_HISTORY_LIMIT, "patrol history must keep only the latest 10 rows");
  assert.ok(capped.claimedIds.includes("legacy-claim"), "claim ids must survive history trimming");
  assert.ok(capped.claimedLossIds.includes("legacy-loss"), "loss claim ids must survive history trimming");
  assert.ok(capped.history.some((row) => row.direction === "sent"), "history must keep outgoing patrols");
  assert.ok(capped.history.some((row) => row.direction === "received"), "history must keep incoming patrols");

  const claimStore = { claimedIds: [], claimedLossIds: [] };
  const claimGame = Object.create(Game.prototype);
  claimGame.state = createCharacter(null, "巡逻只领一次");
  claimGame.runtime = {
    getStorageSync() { return claimStore; },
    setStorageSync(_key, value) { Object.assign(claimStore, value || {}); }
  };
  claimGame.render = () => {};
  claimGame.publishWorldHoundPatrolScore = () => {};
  claimGame.queueWorldHoundPatrolResult = () => {};
  const mailbox = {
    sent: [{
      patrolId: "once-only",
      status: "settled",
      cost: 100,
      partnerName: "云岭",
      createdAt: Date.now() - 10000,
      settledAt: Date.now() - 1000,
      targetSafety: 0
    }],
    received: [{
      patrolId: "loss-once",
      status: "settled",
      cost: 300,
      partnerName: "林岚",
      createdAt: Date.now() - 9000,
      settledAt: Date.now() - 500,
      loss: { fund: 10, visitors: 2, animals: 1 },
      protectedFloors: { fund: 0, visitors: 0, animals: 0 }
    }]
  };
  const beforeMailbox = {
    fund: claimGame.state.world.reserve.fund,
    visitors: chapterVisitorTotal(claimGame.state.world.reserve),
    animals: livingStock(claimGame.state.world.reserve)
  };
  claimGame.reconcileWorldHoundPatrolMailbox(mailbox);
  assert.ok(Number.isFinite(claimGame.state.world.reserve.fund), "world patrol settlement must keep fund numeric");
  assert.ok(Number.isFinite(chapterVisitorTotal(claimGame.state.world.reserve)), "world patrol settlement must keep visitors numeric");
  assert.ok(Number.isFinite(livingStock(claimGame.state.world.reserve)), "world patrol settlement must keep animals numeric");
  const afterFirst = {
    fund: claimGame.state.world.reserve.fund,
    visitors: chapterVisitorTotal(claimGame.state.world.reserve),
    animals: livingStock(claimGame.state.world.reserve)
  };
  claimGame.reconcileWorldHoundPatrolMailbox(mailbox);
  assert.equal(claimGame.state.world.reserve.fund, afterFirst.fund, "the same outgoing patrol must not pay twice");
  assert.equal(chapterVisitorTotal(claimGame.state.world.reserve), afterFirst.visitors, "the same incoming patrol must not drain visitors twice");
  assert.equal(livingStock(claimGame.state.world.reserve), afterFirst.animals, "the same incoming patrol must not drain animals twice");
  const patrolState = claimGame.worldHoundPatrolState(claimGame.state.world.reserve);
  assert.equal(patrolAlreadyClaimed(patrolState, "once-only"), true);
  assert.equal(patrolAlreadyClaimed(patrolState, "loss-once", "loss"), true);
  assert.ok(patrolState.history.length <= PATROL_HISTORY_LIMIT);
  claimGame.openWorldHoundPatrolHistory(false);
  assert.ok(claimGame.infoDetailModal.items.length <= PATROL_HISTORY_LIMIT, "history UI must show at most 10 mixed rows");
  assert.ok(claimGame.infoDetailModal.items.some((item) => /收益/.test(item.body || "")), "history must keep outgoing gains");
  assert.ok(claimGame.infoDetailModal.items.some((item) => /损失/.test(item.body || "")), "history must keep incoming losses");

  const { normalizeReserve } = require("../js/storage");
  const reloaded = { world: { reserve: normalizeReserve(JSON.parse(JSON.stringify(claimGame.state.world.reserve))) } };
  const reloadGame = Object.create(Game.prototype);
  reloadGame.state = reloaded;
  reloadGame.runtime = claimGame.runtime;
  reloadGame.render = () => {};
  reloadGame.publishWorldHoundPatrolScore = () => {};
  reloadGame.queueWorldHoundPatrolResult = () => {};
  const reloadedFund = reloaded.world.reserve.fund;
  const reloadedVisitors = chapterVisitorTotal(reloaded.world.reserve);
  const reloadedAnimals = livingStock(reloaded.world.reserve);
  reloadGame.reconcileWorldHoundPatrolMailbox(mailbox);
  assert.equal(reloaded.world.reserve.fund, reloadedFund, "loading a save and logging in again must not regrant patrol rewards");
  assert.ok((reloaded.world.reserve.worldHoundPatrol.history || []).length <= PATROL_HISTORY_LIMIT);
  const renamedMailbox = {
    sent: [Object.assign({}, mailbox.sent[0], { patrolId: "once-only-renamed", createdAt: Date.now() })],
    received: [Object.assign({}, mailbox.received[0], { patrolId: "loss-once-renamed", createdAt: Date.now() })]
  };
  reloadGame.reconcileWorldHoundPatrolMailbox(renamedMailbox);
  assert.equal(reloaded.world.reserve.fund, reloadedFund, "a renamed mailbox id on the same day must not pay again");
  assert.equal(chapterVisitorTotal(reloaded.world.reserve), reloadedVisitors, "a renamed incoming patrol must not drain visitors again");
  assert.equal(livingStock(reloaded.world.reserve), reloadedAnimals, "a renamed incoming patrol must not drain animals again");
  reloadGame.openWorldHoundPatrolHistory(false);
  assert.ok(reloadGame.infoDetailModal.items.length <= PATROL_HISTORY_LIMIT, "history after login still caps at 10 mixed rows");

  const pendingGame = Object.create(Game.prototype);
  pendingGame.state = createCharacter(null, "待结算才发奖");
  pendingGame.runtime = {
    getStorageSync() { return { claimedIds: [], claimedLossIds: [] }; },
    setStorageSync() {}
  };
  pendingGame.render = () => {};
  pendingGame.publishWorldHoundPatrolScore = () => {};
  pendingGame.queueWorldHoundPatrolResult = () => {};
  const pendingReserve = pendingGame.state.world.reserve;
  pendingReserve.progression.stage = 3;
  pendingReserve.progression.displayChapter = 3;
  const waiting = createPatrolRecord({
    clientPatrolId: "pending-then-mail",
    targetId: "cloud_target",
    targetName: "云岭",
    cost: PATROL_COST_MIN,
    targetSnapshot: { safety: 0 },
    chapter: 3,
    now: Date.now() - 1000
  });
  pendingReserve.worldHoundPatrol = normalizePatrolState({
    pending: [waiting],
    history: [waiting]
  });
  const beforePending = {
    visitors: chapterVisitorTotal(pendingReserve),
    animals: livingStock(pendingReserve)
  };
  pendingGame.reconcileWorldHoundPatrolMailbox({
    sent: [{
      patrolId: "pending-then-mail",
      status: "settled",
      cost: PATROL_COST_MIN,
      partnerName: "云岭",
      createdAt: waiting.createdAt,
      settledAt: Date.now(),
      targetSafety: 0
    }],
    received: []
  });
  assert.ok(chapterVisitorTotal(pendingReserve) > beforePending.visitors, "a locally started pending patrol should pay visitors once after mailbox settle");
  assert.ok(livingStock(pendingReserve) > beforePending.animals, "a locally started pending patrol should pay animals once after mailbox settle");
  const afterPending = {
    visitors: chapterVisitorTotal(pendingReserve),
    animals: livingStock(pendingReserve)
  };
  pendingGame.reconcileWorldHoundPatrolMailbox({
    sent: [{
      patrolId: "pending-then-mail",
      status: "settled",
      cost: PATROL_COST_MIN,
      partnerName: "云岭",
      createdAt: waiting.createdAt,
      settledAt: Date.now(),
      targetSafety: 0
    }],
    received: []
  });
  assert.equal(chapterVisitorTotal(pendingReserve), afterPending.visitors, "a settled local patrol must not pay again on the next mailbox refresh");
  assert.equal(livingStock(pendingReserve), afterPending.animals, "a settled local patrol must not pay animals again on the next mailbox refresh");

  const loginFillGame = Object.create(Game.prototype);
  loginFillGame.state = createCharacter(null, "登录不填满");
  loginFillGame.runtime = {
    getStorageSync() { return { claimedIds: [], claimedLossIds: [] }; },
    setStorageSync() {}
  };
  loginFillGame.render = () => {};
  loginFillGame.publishWorldHoundPatrolScore = () => {};
  loginFillGame.queueWorldHoundPatrolResult = () => {};
  const loginReserve = loginFillGame.state.world.reserve;
  loginReserve.progression.stage = 5;
  loginReserve.progression.displayChapter = 5;
  const liveMailbox = {
    sent: [
      { patrolId: "hound_1791251297327_6e1pek", status: "settled", cost: 100, partnerId: "Yxnyp7pwQmIolniOtmDA", partnerName: "松影·3E3C的河湾哨站", createdAt: 1791251297823, settledAt: 1791251653046, targetSafety: 50, reward: { fund: 85, visitors: 0, animals: 57 } },
      { patrolId: "hound_1791251294525_p796wl", status: "settled", cost: 100, partnerId: "JVbhlw5KW1GW_rXoHcVQ", partnerName: "雨岸·558C的湿地哨站", createdAt: 1791251295013, settledAt: 1791251653046, targetSafety: 50, reward: { fund: 85, visitors: 0, animals: 61 } },
      { patrolId: "hound_1791217212471_pgo4ax", status: "settled", cost: 600, partnerId: "DvBNungrvBOJjRuhoy5W", partnerName: "青屿·F5BE的河湾哨站", createdAt: 1791217213167, settledAt: 1791217669532, targetSafety: 50, reward: { fund: 510, visitors: 0, animals: 65 } },
      { patrolId: "hound_1791161663441_h4d989", status: "settled", cost: 100, partnerId: "JBnAne1uesFSVdLL-jPR", partnerName: "晨岚·BAFC的杉谷哨站", createdAt: 1791161665585, settledAt: 1791166095678, targetSafety: 50, reward: { fund: 85, visitors: 0, animals: 40 } },
      { patrolId: "hound_1791161639896_vur29l", status: "settled", cost: 1000, partnerId: "I5b3GRjBY2eisbdX7sZO", partnerName: "雨岸·B38D的杉谷哨站", createdAt: 1791161642032, settledAt: 1791166095678, targetSafety: 50, reward: { fund: 850, visitors: 0, animals: 63 } },
      { patrolId: "hound_1791160891178_ydg7a6", status: "settled", cost: 100, partnerId: "D7m0u7E8yG2XhFisPd_H", partnerName: "星渡·D9BC的苔原哨站", createdAt: 1791160893288, settledAt: 1791161610277, targetSafety: 50, reward: { fund: 85, visitors: 0, animals: 72 } },
      { patrolId: "hound_1791130198350_u5pwon", status: "settled", cost: 100, partnerId: "DvBNungrvBOJjRuhoy5W", partnerName: "青屿·F5BE的河湾哨站", createdAt: 1791130199014, settledAt: 1791130729344, targetSafety: 50, reward: { fund: 85, visitors: 0, animals: 70 } },
      { patrolId: "hound_1791129752342_x9vywv", status: "settled", cost: 100, partnerId: "1Y3rlkhIvTl5zN36tWlp", partnerName: "云岭·6474的湖岸哨站", createdAt: 1791129753615, settledAt: 1791130066784, targetSafety: 100, reward: { fund: 769, visitors: 0, animals: 21 } },
      { patrolId: "hound_1791094383732_lftiux", status: "settled", cost: 100, partnerId: "I5b3GRjBY2eisbdX7sZO", partnerName: "雨岸·B38D的杉谷哨站", createdAt: 1791094383869, settledAt: 1791094873008, targetSafety: 50, reward: { fund: 85, visitors: 0, animals: 68 } },
      { patrolId: "hound_1791092999664_ig7fhf", status: "settled", cost: 100, partnerId: "Yxnyp7pwQmIolniOtmDA", partnerName: "松影·3E3C的河湾哨站", createdAt: 1791092999791, settledAt: 1791093318199, targetSafety: 50, reward: { fund: 85, visitors: 0, animals: 71 } },
      { patrolId: "hound_1791089974483_15bauo", status: "settled", cost: 100, partnerId: "D7m0u7E8yG2XhFisPd_H", partnerName: "星渡·D9BC的苔原哨站", createdAt: 1791089974854, settledAt: 1791090652011, targetSafety: 50, reward: { fund: 85, visitors: 0, animals: 77 } },
      { patrolId: "hound_1791089844767_8pt1pr", status: "settled", cost: 100, partnerId: "DvBNungrvBOJjRuhoy5W", partnerName: "青屿·F5BE的河湾哨站", createdAt: 1791089845142, settledAt: 1791090652011, targetSafety: 50, reward: { fund: 85, visitors: 0, animals: 76 } },
      { patrolId: "hound_1791089652244_dvu67v", status: "settled", cost: 100, partnerId: "1Y3rlkhIvTl5zN36tWlp", partnerName: "云岭·6474的湖岸哨站", createdAt: 1791089652417, settledAt: 1791090652011, targetSafety: 50, reward: { fund: 85, visitors: 0, animals: 50 } }
    ],
    received: []
  };
  loginFillGame.reconcileWorldHoundPatrolMailbox(liveMailbox);
  const afterFirstLoginSync = {
    visitors: chapterVisitorTotal(loginReserve),
    animals: livingStock(loginReserve)
  };
  loginFillGame.reconcileWorldHoundPatrolMailbox(liveMailbox);
  assert.equal(chapterVisitorTotal(loginReserve), afterFirstLoginSync.visitors, "settled patrol rewards and NPC pressure must apply only once per login day");
  assert.equal(livingStock(loginReserve), afterFirstLoginSync.animals, "settled patrol animal rewards and NPC pressure must apply only once per login day");

  console.log("world hound patrol check ok");
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
