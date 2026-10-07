"use strict";

// Small, dependency-free regression check for the chapter 6+ rare-animal MVP.
// Run from the game directory with: node scripts/rare-animal-mvp-check.js
const assert = require("assert");
const { createInitialWorld } = require("../js/world");
const rare = require("../js/rareAnimalSystem");
const ledger = require("../js/animalSourceLedger");
const { simulateDay } = require("../js/simulator");

function reserveAt(chapter, fund = 600) {
  const world = createInitialWorld();
  world.reserve.progression.stage = chapter;
  world.reserve.progression.displayChapter = chapter;
  world.reserve.fund = fund;
  return world.reserve;
}

// The auction is unavailable before chapter 6 and chapter 10 only gates on a
// resident rare animal, so normal chapter progression is unchanged.
assert.strictEqual(rare.rareAuctionView(reserveAt(5)).available, false);
assert.strictEqual(rare.rareAnimalChapterGate(reserveAt(9), 9).met, true);
assert.strictEqual(rare.rareAnimalChapterGate(reserveAt(10), 10).met, false);

// Base bid is capped at one sixth of the available protection fund.
const winnerReserve = reserveAt(6, 600);
assert.strictEqual(rare.maxBaseBid(winnerReserve), 100);
assert.strictEqual(rare.submitRareAuctionBid(winnerReserve, { baseBid: 101, arrowScore: 4 }).ok, false);
const submitted = rare.submitRareAuctionBid(winnerReserve, { baseBid: 100, arrowScore: 4 });
assert.strictEqual(submitted.ok, true);
assert.strictEqual(submitted.auction.finalBid, 400);
assert.strictEqual(submitted.auction.submittedDay, 1);
assert.strictEqual(submitted.auction.deadlineDay, 4, "出价当日记为第1个守护日，最迟第4个守护日");
assert.strictEqual(winnerReserve.fund, 0, "最高出价冻结 6 倍基础出价");
winnerReserve.rareAnimal.auction.submittedAt = 1;
assert.strictEqual(rare.settleRareAuction(winnerReserve).pending, true, "现实时间过去不会公布，未到守护日上限仍等待入夜");

winnerReserve.guardianCycle.day = submitted.auction.settleDay;
const settled = rare.settleRareAuction(winnerReserve, { force: true, rank: 10, entrants: 100 });
assert.strictEqual(settled.winner, true);
assert.strictEqual(winnerReserve.fund, 200, "中奖只扣最终出价，差额退回");

// Low archery results must not make the rare cub unrealistically cheap:
// scores 1–3 settle at the 4/6 price tier, while 5–6 retain their score.
for (const score of [1, 2, 3]) {
  const lowScoreReserve = reserveAt(6, 600);
  const lowScore = rare.submitRareAuctionBid(lowScoreReserve, { baseBid: 100, arrowScore: score });
  assert.strictEqual(lowScore.ok, true);
  assert.strictEqual(lowScore.auction.finalBid, 400, `得分${score}应按4/6最低成交价结算`);
}
const highScoreReserve = reserveAt(6, 600);
const highScore = rare.submitRareAuctionBid(highScoreReserve, { baseBid: 100, arrowScore: 6 });
assert.strictEqual(highScore.auction.finalBid, 600, "得分6应按6/6最高成交价结算");
assert.strictEqual(winnerReserve.ecology.herbivores.pangolin, 1);
assert.strictEqual(ledger.animalSourceSummary(winnerReserve).closureDelta, 0);
assert.strictEqual(rare.rareAnimalChapterGate(winnerReserve, 10).met, true);

// Losing refunds the whole frozen amount and never adds an animal.
const loserReserve = reserveAt(6, 600);
rare.submitRareAuctionBid(loserReserve, { baseBid: 80, arrowScore: 6 });
loserReserve.guardianCycle.day = 2;
const lost = rare.settleRareAuction(loserReserve, { force: true, rank: 31, entrants: 100 });
assert.strictEqual(lost.winner, false);
assert.strictEqual(loserReserve.fund, 600);
assert.strictEqual(loserReserve.ecology.herbivores.pangolin || 0, 0);
assert.strictEqual(ledger.animalSourceSummary(loserReserve).closureDelta, 0);

// Care consumes exactly two water and two grass once per guardian day.
const careReserve = winnerReserve;
const waterBefore = careReserve.ecology.water;
const grassBefore = careReserve.ecology.grass;
const healthBefore = careReserve.rareAnimal.health;
careReserve.guardianCycle.day += 1;
assert.strictEqual(rare.careRareAnimal(careReserve).ok, true);
assert.strictEqual(careReserve.ecology.water, waterBefore - 2);
assert.strictEqual(careReserve.ecology.grass, grassBefore - 2);
assert.strictEqual(careReserve.rareAnimal.health, healthBefore + 6);
assert.strictEqual(rare.careRareAnimal(careReserve).ok, false);

// Risk loss is also an animal-ledger outflow and closes the population delta.
careReserve.rareAnimal.status = "migrating";
careReserve.rareAnimal.health = 20;
careReserve.poacherPressure = 90;
careReserve.safety = 20;
const risk = rare.resolveRareAnimalRisk(careReserve, { action: "patrol" });
assert.strictEqual(risk.status, "stolen");
assert.strictEqual(careReserve.ecology.herbivores.pangolin, 0);
assert.strictEqual(ledger.animalSourceSummary(careReserve).closureDelta, 0);

// A legacy/fixture save may have chapter 6 but an old progression level. The
// generic species reconciler must not erase a won rare cub just because
// pangolin's ordinary unlock level has not caught up yet.
const chainWorld = createInitialWorld();
chainWorld.reserve.progression.stage = 6;
chainWorld.reserve.progression.displayChapter = 6;
chainWorld.reserve.progression.level = 1;
chainWorld.reserve.fund = 600;
chainWorld.reserve.ecology.herbivores.pangolin = 0;
let chainState = {
  world: chainWorld,
  character: { role: "warden", location: "中央混交林" },
  reports: [],
  messages: []
};
chainState = simulateDay("参与竞拍，出价100，射箭得分4", chainState);
assert.strictEqual(chainState.world.reserve.rareAnimal.auction.status, "submitted", "出价当夜不应立刻公布");
assert.strictEqual(chainState.world.reserve.rareAnimal.status, "unowned");
for (let index = 0; index < 4; index += 1) {
  chainState = simulateDay("巡护", chainState);
}
assert.strictEqual(chainState.world.reserve.rareAnimal.status, "resident");
assert.strictEqual(chainState.world.reserve.ecology.herbivores.pangolin, 1);
assert.strictEqual(ledger.animalSourceSummary(chainState.world.reserve).rareAuction, 1);

// A bid left unsettled cannot outlive 3 guardian days. Reaching the deadline
// grants the cub even if that action is not a night close.
const lateWorld = createInitialWorld();
lateWorld.reserve.progression.stage = 12;
lateWorld.reserve.progression.displayChapter = 12;
lateWorld.reserve.fund = 600;
lateWorld.reserve.guardianCycle = { day: 12, actionIndex: 1, actionsToday: [] };
let lateState = {
  world: lateWorld,
  character: { role: "warden", location: "中央混交林" },
  reports: [],
  messages: []
};
lateState = simulateDay("参与珍稀幼崽竞拍，出价100，射箭得分1", lateState);
assert.strictEqual(lateState.world.reserve.rareAnimal.status, "unowned");
assert.strictEqual(lateState.world.reserve.rareAnimal.auction.submittedDay, 12);
assert.strictEqual(lateState.world.reserve.rareAnimal.auction.deadlineDay, 15);
lateState.world.reserve.guardianCycle.day = 15;
lateState.world.reserve.guardianCycle.actionIndex = 0;
const beforeLateVisitors = require("../js/chapterTargets").chapterVisitorTotal(lateState.world.reserve);
const beforeLateFund = lateState.world.reserve.fund;
lateState = simulateDay("派猎犬侦察：确认边界", lateState);
assert.strictEqual(lateState.world.reserve.rareAnimal.status, "resident");
assert.strictEqual(lateState.world.reserve.rareAnimal.auction.rank, 1);
assert.strictEqual(ledger.animalSourceSummary(lateState.world.reserve).rareAuction, 1);
assert.strictEqual(require("../js/chapterTargets").chapterVisitorTotal(lateState.world.reserve), beforeLateVisitors);
assert.ok(lateState.world.reserve.fund > beforeLateFund, "到第3个守护日公布时退回冻结差额");

const context = new Proxy({}, {
  get(target, key) {
    if (key === "measureText") return () => ({ width: 10 });
    if (/create.*Gradient/.test(String(key))) return () => ({ addColorStop() {} });
    return target[key] || (() => {});
  },
  set(target, key, value) { target[key] = value; return true; }
});
global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
  createCanvas: () => ({ getContext: () => context }),
  getStorageSync() {}, setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};
const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
{
  const game = new Game();
  if (game.stopLoop) game.stopLoop();
  game.render = () => {};
  game.toast = () => {};
  game.state = createCharacter(null, "拍卖结果");
  const reserve = game.state.world.reserve;
  reserve.progression.stage = 6;
  reserve.progression.displayChapter = 6;
  reserve.fund = 600;
  assert.strictEqual(rare.submitRareAuctionBid(reserve, { baseBid: 100, arrowScore: 4 }).ok, true);
  assert.strictEqual(reserve.rareAnimal.auction.status, "submitted");
  game.screen = "home";
  game.settlementModal = null;
  game.infoDetailModal = null;
  assert.strictEqual(game.tryPresentRareAuctionResult(), false, "出价后、入夜前不能弹出结果");
  rare.settleRareAuction(reserve, { force: true, rank: 4, entrants: 40, playerName: "拍卖结果" });
  reserve.rareAnimal.auctionNotice.seen = true;
  reserve.rareAnimal.auctionNotice.dismissed = false;
  game.activeTaskLock = { kind: "goal" };
  assert.strictEqual(game.tryPresentRareAuctionResult(), true, "入夜公布后必须弹出拍卖结果，旧存档误标已读也要再展示");
  assert.strictEqual(game.infoDetailModal.kind, "rareAuctionResult");
  assert.strictEqual(game.infoDetailModal.title, "你获得了鳞芽");
  assert.equal(game.infoDetailModal.footer, "", "拍卖结果不要再用页脚重复护照说明");
  assert(/护照固定在地图西部岩坡/.test(String(game.infoDetailModal.hint || "")), "护照说明应放在结果正文里，避免和按钮叠字");
  assert.ok(game.infoDetailModalHeight(game.infoDetailModal) <= 500, "结果弹窗应缩短，避免压到底部导航");
  assert.strictEqual(reserve.rareAnimal.auctionNotice.dismissed, false, "看到结果前不能先记成已读");
  game.infoDetailModal.action();
  assert.strictEqual(reserve.rareAnimal.auctionNotice.dismissed, true, "点查看护照后才记已读");
  assert.ok(game.infoDetailModal && game.infoDetailModal.kind === "rareAnimalPassport", "中奖后应能打开护照");
}

{
  const game = new Game();
  if (game.stopLoop) game.stopLoop();
  game.render = () => {};
  game.toast = () => {};
  game.playSfx = () => {};
  game.playSettlementSfx = () => {};
  game.state = createCharacter(null, "入夜拍卖");
  const reserve = game.state.world.reserve;
  reserve.progression.stage = 6;
  reserve.progression.displayChapter = 6;
  reserve.fund = 600;
  reserve.supplies = Object.assign({}, reserve.supplies, { dogFood: 4 });
  reserve.guardianCycle = Object.assign({}, reserve.guardianCycle || {}, { day: 8, actionIndex: 1, actionsToday: ["houndScout"] });
  game.screen = "home";
  game.selectedReserveAction = "rareAuction";
  game.pendingTaskOriginScreen = "home";
  game.submitCommand("参与珍稀幼崽竞拍，出价100，射箭得分4");
  const afterBid = game.state.world.reserve;
  assert.strictEqual(afterBid.rareAnimal.auction.status, "submitted", "提交出价后应等待入夜");
  assert.ok(!game.infoDetailModal || game.infoDetailModal.kind !== "rareAuctionResult", "出价结算不能直接当成拍卖结果");
  game.settlementModal = null;
  game.infoDetailModal = null;
  game.finishGuardianDayEarly();
  const afterNight = game.state.world.reserve;
  assert.strictEqual(afterNight.rareAnimal.auction.status, "settled");
  assert.strictEqual(game.infoDetailModal && game.infoDetailModal.kind, "rareAuctionResult", "提前入夜必须展示拍卖结果");
  assert.ok(/获得了鳞芽|没有获得幼崽/.test(String(game.infoDetailModal.title || "")));
}

console.log("rare-animal MVP checks passed");
