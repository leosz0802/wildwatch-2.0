"use strict";

const assert = require("node:assert/strict");
const { createCharacter } = require("../js/storage");
const { simulateDay, sellRecoveredGoodsBatch } = require("../js/simulator");
const {
  PACE_ECONOMY,
  paceSellFundFreeBatches
} = require("../js/balanceConfig");
const {
  sellFundCapStatus,
  applySellUnlockAd,
  convertRecoveredGoodsToSupplies,
  planCappedRecoveredSale,
  recordSellFundGrant
} = require("../js/sellFundCap");

assert.equal(paceSellFundFreeBatches(), 2, "every chapter starts with 2 free sell times");
assert.equal(PACE_ECONOMY.sellUnlockAdDailyCap, 0, "sell unlock ads have no daily cap");

function stockWarehouse(reserve, extra = {}) {
  reserve.inventory = Object.assign({
    shedAntlerA: 1,
    shedAntlerB: 1,
    naturalHide: 1,
    researchSample: 4,
    recoveredTrap: 1
  }, extra);
}

function makeReserve(chapter = 1) {
  const state = createCharacter(null, "出售次数测试");
  const reserve = state.world.reserve;
  reserve.guardianCycle = Object.assign({}, reserve.guardianCycle, { day: 3 });
  reserve.progression = Object.assign({}, reserve.progression || {}, {
    stage: chapter,
    displayChapter: chapter,
    level: Math.max(1, Math.min(7, chapter))
  });
  reserve.fund = 800;
  stockWarehouse(reserve);
  reserve.pendingRecovered = {};
  reserve.supplies = Object.assign({}, reserve.supplies, {
    dogFood: 2,
    fieldKit: 1,
    medicalKit: 1,
    alarm: 0,
    evidenceTrap: 0
  });
  return { state, reserve };
}

const chapter1 = makeReserve(1);
const opening = sellFundCapStatus(chapter1.reserve);
assert.equal(opening.freeSellsLeft, 2, "chapter 1 starts with 2 free sell times");
assert.equal(opening.soldTimes, 0);

const preview = planCappedRecoveredSale(chapter1.reserve.inventory, chapter1.reserve, {
  limit: Number.MAX_SAFE_INTEGER,
  modifier: 1
});
assert.ok(preview.value > 450, `one sell dumps the accumulated warehouse, got ${preview.value}`);
assert.equal(preview.leftover, 0, "a free sell is not clipped by fund amount");
assert.ok(preview.sold.includes("shedAntlerA") && preview.sold.includes("researchSample"));

const firstSale = sellRecoveredGoodsBatch(chapter1.reserve.inventory, chapter1.reserve, Number.MAX_SAFE_INTEGER);
assert.equal(firstSale.value, preview.value);
const afterFirst = sellFundCapStatus(chapter1.reserve);
assert.equal(afterFirst.soldTimes, 1);
assert.equal(afterFirst.freeSellsLeft, 1, "first sell uses one time, leftover times stay");
assert.equal(afterFirst.adEligible, false, "empty warehouse after a dump does not need an ad");

stockWarehouse(chapter1.reserve);
const secondSale = sellRecoveredGoodsBatch(chapter1.reserve.inventory, chapter1.reserve, Number.MAX_SAFE_INTEGER);
assert.ok(secondSale.value > 0);
assert.equal(sellFundCapStatus(chapter1.reserve).soldTimes, 2);
assert.equal(sellFundCapStatus(chapter1.reserve).freeSellsLeft, 0);

stockWarehouse(chapter1.reserve, { researchSample: 2 });
const blocked = sellRecoveredGoodsBatch(chapter1.reserve.inventory, chapter1.reserve, Number.MAX_SAFE_INTEGER);
assert.equal(blocked.sold.length, 0, "a third free sell must not go through");
assert.ok(chapter1.reserve.inventory.researchSample > 0, "unsold samples stay after times run out");
assert.equal(sellFundCapStatus(chapter1.reserve).adEligible, true, "leftover stock after 2 sells unlocks an ad");

const unlock = applySellUnlockAd(chapter1.reserve);
assert.equal(unlock.ok, true);
assert.equal(unlock.unlocked, 2, "one ad restores two free sells");
assert.equal(unlock.status.freeSellsLeft, 2, "one ad unlocks two more sells");
const fourthSale = sellRecoveredGoodsBatch(chapter1.reserve.inventory, chapter1.reserve, Number.MAX_SAFE_INTEGER);
assert.ok(fourthSale.sold.length >= 1);
assert.ok(fourthSale.value > 0, "the unlocked sell has no fund amount cap");
stockWarehouse(chapter1.reserve, { researchSample: 2 });
const fifthSale = sellRecoveredGoodsBatch(chapter1.reserve.inventory, chapter1.reserve, Number.MAX_SAFE_INTEGER);
assert.ok(fifthSale.sold.length >= 1, "the second unlocked sell must still go through");
assert.equal(sellFundCapStatus(chapter1.reserve).freeSellsLeft, 0, "two unlocked sells then run out again");

const noMarket = makeReserve(1);
delete noMarket.reserve.market;
for (let index = 0; index < 2; index += 1) {
  stockWarehouse(noMarket.reserve);
  assert.ok(sellRecoveredGoodsBatch(noMarket.reserve.inventory, noMarket.reserve, Number.MAX_SAFE_INTEGER).sold.length >= 1, `missing market still records sell ${index + 1}`);
}
stockWarehouse(noMarket.reserve);
assert.equal(sellRecoveredGoodsBatch(noMarket.reserve.inventory, noMarket.reserve, Number.MAX_SAFE_INTEGER).sold.length, 0, "missing market still blocks the third free sell");
assert.equal(sellFundCapStatus(noMarket.reserve).soldTimes, 2);

stockWarehouse(chapter1.reserve, { researchSample: 2, shedAntlerA: 0, shedAntlerB: 0, naturalHide: 0, recoveredTrap: 0 });
const leftover = convertRecoveredGoodsToSupplies(chapter1.reserve, { onlyLeftover: true });
assert.ok(leftover.count >= 1, "stock after times run out can convert into patrol supplies");
assert.ok(leftover.grantDescription);
assert.equal(chapter1.reserve.fund, 800, "converting leftover must not add more fund");

const chapter4 = makeReserve(4);
const ch4Sale = sellRecoveredGoodsBatch(chapter4.reserve.inventory, chapter4.reserve, Number.MAX_SAFE_INTEGER);
assert.ok(ch4Sale.value > 450, `chapter 4 one sell also dumps the warehouse, got ${ch4Sale.value}`);
assert.equal(sellFundCapStatus(chapter4.reserve).soldTimes, 1);
assert.equal(sellFundCapStatus(chapter4.reserve).freeSellsLeft, 1);

const patrolState = makeReserve(1).state;
const patrolBefore = patrolState.world.reserve.fund;
const patrolResult = simulateDay("移交仓库里的脱落岩角和研究样本", patrolState);
const patrolSale = patrolResult.visual && patrolResult.visual.salvageEconomy;
assert.ok(patrolSale && patrolSale.sold.length >= 1, "patrol handover still sells");
assert.ok(patrolResult.world.reserve.fund - patrolBefore > 0);
assert.equal(sellFundCapStatus(patrolResult.world.reserve).soldTimes, 1, "patrol handover counts as one user sell");

const adReserve = makeReserve(1).reserve;
adReserve.dailySellFund = {
  version: 1,
  lastGuardianDay: 3,
  lastChapter: 1,
  soldFund: 900,
  soldTimes: 2,
  unlockedBatches: 2,
  unlockClaimCount: 0,
  unlockClaimCountToday: 0,
  lastUnlock: null
};
let unlocks = 0;
while (unlocks < 5) {
  const result = applySellUnlockAd(adReserve);
  assert.equal(result.ok, true, `sell unlock ad ${unlocks + 1} should still work`);
  recordSellFundGrant(adReserve, 1);
  recordSellFundGrant(adReserve, 1);
  unlocks += 1;
}
assert.equal(unlocks, 5, "sell unlock ads keep working after 5 watches");
assert.equal(sellFundCapStatus(adReserve).batches, 12, "five unlocks of two plus two free times make twelve sells");

const gap = makeReserve(1);
assert.ok(sellRecoveredGoodsBatch(gap.reserve.inventory, gap.reserve, Number.MAX_SAFE_INTEGER).sold.length >= 1);
assert.equal(sellFundCapStatus(gap.reserve).soldTimes, 1);
stockWarehouse(gap.reserve);
const afterLeave = simulateDay("修复水源和草场", gap.state);
assert.equal(sellFundCapStatus(afterLeave.world.reserve).soldTimes, 1, "leaving to do other work must not clear chapter sell times");
stockWarehouse(afterLeave.world.reserve);
assert.ok(sellRecoveredGoodsBatch(afterLeave.world.reserve.inventory, afterLeave.world.reserve, Number.MAX_SAFE_INTEGER).sold.length >= 1);
assert.equal(sellFundCapStatus(afterLeave.world.reserve).soldTimes, 2, "the second sell after a gap still counts");
stockWarehouse(afterLeave.world.reserve);
assert.equal(sellRecoveredGoodsBatch(afterLeave.world.reserve.inventory, afterLeave.world.reserve, Number.MAX_SAFE_INTEGER).sold.length, 0, "the third free sell stays blocked after a gap");

const nextChapter = makeReserve(1);
stockWarehouse(nextChapter.reserve);
sellRecoveredGoodsBatch(nextChapter.reserve.inventory, nextChapter.reserve, Number.MAX_SAFE_INTEGER);
stockWarehouse(nextChapter.reserve);
sellRecoveredGoodsBatch(nextChapter.reserve.inventory, nextChapter.reserve, Number.MAX_SAFE_INTEGER);
assert.equal(sellFundCapStatus(nextChapter.reserve).soldTimes, 2);
nextChapter.reserve.progression = Object.assign({}, nextChapter.reserve.progression, { stage: 2, displayChapter: 2 });
assert.equal(sellFundCapStatus(nextChapter.reserve).soldTimes, 0, "a new chapter resets free sell times");
assert.equal(sellFundCapStatus(nextChapter.reserve).freeSellsLeft, 2);

console.log("sell fund cap check ok");
