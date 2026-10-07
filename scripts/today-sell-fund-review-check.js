"use strict";

const assert = require("node:assert/strict");
const { createCharacter } = require("../js/storage");
const { simulateDay, sellRecoveredGoodsBatch } = require("../js/simulator");
const { PACE_ECONOMY, paceSellFundFreeBatches, paceSellFundFreeCap, paceFundAdReward } = require("../js/balanceConfig");
const {
  sellFundCapStatus,
  applySellUnlockAd,
  convertRecoveredGoodsToSupplies,
  planCappedRecoveredSale,
  recordSellFundGrant
} = require("../js/sellFundCap");
const { emergencyFundAdStatus, applyEmergencyFundReward } = require("../js/adSystem");
const { Game } = require("../js/game");

function makeReserve(chapter = 1, extra = {}) {
  const state = createCharacter(null, "今日回顾");
  const reserve = state.world.reserve;
  reserve.guardianCycle = Object.assign({}, reserve.guardianCycle, { day: 3 });
  reserve.progression = Object.assign({}, reserve.progression || {}, {
    stage: chapter,
    displayChapter: chapter,
    level: Math.max(1, Math.min(7, chapter))
  });
  reserve.fund = 800;
  reserve.inventory = Object.assign({
    shedAntlerA: 1,
    shedAntlerB: 1,
    naturalHide: 1,
    researchSample: 4,
    recoveredTrap: 1
  }, extra.inventory || {});
  reserve.pendingRecovered = Object.assign({
    shedAntlerA: 0,
    shedAntlerB: 0,
    naturalHide: 0,
    researchSample: 0,
    recoveredTrap: 0
  }, extra.pendingRecovered || {});
  reserve.supplies = Object.assign({}, reserve.supplies, {
    dogFood: 2,
    fieldKit: 1,
    medicalKit: 1,
    alarm: 0,
    evidenceTrap: 0
  }, extra.supplies || {});
  return { state, reserve };
}

function stockTotal(group = {}) {
  return ["shedAntlerA", "shedAntlerB", "naturalHide", "researchSample", "recoveredTrap"]
    .reduce((sum, id) => sum + Math.max(0, Math.round(Number(group[id]) || 0)), 0);
}

// D01 第一章免费出售 2 次，单次不限制金额
assert.equal(paceSellFundFreeBatches(), 2, "D01 每章免费出售 2 次");
const d01 = makeReserve(1);
assert.equal(sellFundCapStatus(d01.reserve).freeSellsLeft, 2, "D01 第一章开局可免费出售 2 次");
const d01Plan = planCappedRecoveredSale(d01.reserve.inventory, d01.reserve, {
  limit: Number.MAX_SAFE_INTEGER,
  modifier: 1
});
assert.ok(d01Plan.value > 450, `D01 一次出售应卖掉已积攒样本，实际 ${d01Plan.value}`);
assert.equal(d01Plan.leftover, 0, "D01 免费次数内不按金额截断");

// D02 第四章同样按次数，不按金额
const d02 = makeReserve(4);
assert.equal(sellFundCapStatus(d02.reserve).freeSellsLeft, 2, "D02 第四章同样 2 次免费出售");
const d02Sale = sellRecoveredGoodsBatch(d02.reserve.inventory, d02.reserve, Number.MAX_SAFE_INTEGER);
assert.ok(d02Sale.value > 450, `D02 第四章一次出售也不按金额截断，实际 ${d02Sale.value}`);
assert.equal(sellFundCapStatus(d02.reserve).soldTimes, 1);

// D03 两次卖完后库存留下，才能广告解锁
const d03 = makeReserve(1);
for (let index = 0; index < 2; index += 1) {
  d03.reserve.inventory = Object.assign({}, d03.reserve.inventory, {
    shedAntlerA: 1,
    researchSample: 2
  });
  assert.ok(sellRecoveredGoodsBatch(d03.reserve.inventory, d03.reserve, Number.MAX_SAFE_INTEGER).sold.length >= 1, `D03 第 ${index + 1} 次出售必须成交`);
}
d03.reserve.inventory.researchSample = 2;
const leftoverAfterThird = stockTotal(d03.reserve.inventory);
const blocked = sellRecoveredGoodsBatch(d03.reserve.inventory, d03.reserve, Number.MAX_SAFE_INTEGER);
assert.equal(blocked.sold.length, 0, "D03 2 次用完后不能再免费出售");
assert.ok(leftoverAfterThird >= 1, "D03 次数用完后样本留在仓库");
assert.equal(sellFundCapStatus(d03.reserve).adEligible, true, "D03 次数用完后应出现看广告解锁");

// D04 看广告再解锁 2 次，次数不限
assert.equal(PACE_ECONOMY.sellUnlockAdDailyCap, 0, "D04 出售解锁广告不设每日次数");
const d04 = makeReserve(1);
d04.reserve.dailySellFund = {
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
  const unlock = applySellUnlockAd(d04.reserve);
  assert.equal(unlock.ok, true, `D04 第 ${unlocks + 1} 次看广告仍应再解锁 2 次出售`);
  assert.equal(unlock.unlocked, 2, `D04 第 ${unlocks + 1} 次广告必须恢复 2 次免费出售`);
  recordSellFundGrant(d04.reserve, 1);
  recordSellFundGrant(d04.reserve, 1);
  unlocks += 1;
}
assert.equal(unlocks, 5, "D04 连续看 5 次广告仍可解锁");
assert.equal(sellFundCapStatus(d04.reserve).batches, 12, "D04 5 次解锁后本章可出售 12 次");

// D05 次数用完后的库存改兑补给，基金不增加
const d05 = makeReserve(1);
const fundBeforeConvert = d05.reserve.fund;
d05.reserve.dailySellFund = {
  version: 1,
  lastGuardianDay: 3,
  lastChapter: 1,
  soldFund: 0,
  soldTimes: 2,
  unlockedBatches: 2,
  unlockClaimCount: 0,
  unlockClaimCountToday: 0,
  lastUnlock: null
};
const converted = convertRecoveredGoodsToSupplies(d05.reserve, { onlyLeftover: true });
assert.ok(converted.count >= 1, "D05 次数用完后的样本可以改兑补给");
assert.ok(converted.grantDescription, `D05 兑换应写出补给名称，实际 ${converted.grantDescription}`);
assert.equal(d05.reserve.fund, fundBeforeConvert, "D05 改兑补给不能增加基金");

// D06 收取不受影响：待收取进入仓库，不直接变现
global.wx = global.wx || {
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 1 }; },
  createCanvas() { return { width: 375, height: 667, getContext() { return { measureText: (s) => ({ width: String(s || "").length * 7 }) }; } }; },
  createImage() { return { loaded: true, set src(value) { this._src = value; }, get src() { return this._src; } }; },
  getStorageSync() { return null; },
  setStorageSync() {},
  showToast() {},
  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
  onTouchCancel() {},
  onKeyboardConfirm() {},
  onAppHide() {},
  onAppShow() {}
};
const d06Game = new Game();
d06Game.render = () => {};
d06Game.stopLoop && d06Game.stopLoop();
d06Game.state = createCharacter(null, "收取回顾");
const d06Reserve = d06Game.state.world.reserve;
d06Reserve.inventory.researchSample = 0;
d06Reserve.pendingRecovered.researchSample = 2;
const fundBeforeCollect = d06Reserve.fund;
d06Game.collectRecoveredGood("researchSample");
assert.equal(d06Reserve.pendingRecovered.researchSample, 0, "D06 收取后待收取清零");
assert.equal(d06Reserve.inventory.researchSample, 2, "D06 收取后样本进入仓库");
assert.equal(d06Reserve.fund, fundBeforeCollect, "D06 收取不增加基金");
assert.equal(sellFundCapStatus(d06Reserve).soldTimes, 0, "D06 收取不占用出售次数");

// D07 巡护移交算一次主动出售，不截金额
const d07 = makeReserve(1);
const patrolBefore = d07.reserve.fund;
const patrol = simulateDay("移交仓库里的脱落岩角和研究样本", d07.state);
const patrolSale = patrol.visual && patrol.visual.salvageEconomy;
assert.ok(patrolSale && patrolSale.sold.length >= 1, "D07 巡护移交仍能出售");
assert.ok(patrol.world.reserve.fund - patrolBefore > 0, "D07 巡护移交应增加基金");
assert.equal(sellFundCapStatus(patrol.world.reserve).soldTimes, 1, "D07 巡护移交占用 1 次出售");

// D08 基金应急广告仍每天 3 条，和出售解锁分开
assert.equal(PACE_ECONOMY.fundAdDailyCap, 3, "D08 基金应急广告仍每天 3 条");
assert.equal(paceFundAdReward(1), 1000, "D08 第一章一条基金广告不低于 1000");
assert.equal(paceFundAdReward(4), 1000, "D08 第四章一条基金广告不低于 1000");
assert.equal(paceFundAdReward(6), 1200, "D08 第六章一条基金广告按章节定额 1200");
const d08 = makeReserve(4);
d08.reserve.fund = 200;
d08.reserve.emergencyFundAd = { version: 1, lastGuardianDay: 0, claimCount: 0, claimCountToday: 0, lastReward: null };
let fundAds = 0;
while (emergencyFundAdStatus(d08.reserve).eligible) {
  const reward = applyEmergencyFundReward(d08.reserve);
  assert.equal(reward.ok, true, "D08 基金广告应发放");
  fundAds += 1;
}
assert.equal(fundAds, 3, "D08 基金广告到 3 次后停止");
assert.equal(emergencyFundAdStatus(d08.reserve).eligible, false, "D08 第 4 条基金广告不可领");
d08.reserve.dailySellFund = {
  version: 1,
  lastGuardianDay: 3,
  lastChapter: 4,
  soldFund: 900,
  soldTimes: 2,
  unlockedBatches: 2,
  unlockClaimCount: 0,
  unlockClaimCountToday: 0,
  lastUnlock: null
};
assert.equal(applySellUnlockAd(d08.reserve).ok, true, "D08 基金广告用完后，出售解锁广告仍可用");

// D09 连续点 5 次确认出售，第 3 次起必须拦住
const d09Game = new Game();
d09Game.render = () => {};
d09Game.stopLoop && d09Game.stopLoop();
d09Game.state = createCharacter(null, "连续出售");
const d09Reserve = d09Game.state.world.reserve;
d09Reserve.guardianCycle = Object.assign({}, d09Reserve.guardianCycle, { day: 3 });
d09Reserve.fund = 800;
let d09Sells = 0;
for (let index = 0; index < 5; index += 1) {
  d09Reserve.inventory = {
    shedAntlerA: 1,
    shedAntlerB: 1,
    naturalHide: 1,
    researchSample: 2,
    recoveredTrap: 1
  };
  d09Game.openRecoveredChoice();
  const sale = d09Game.confirmRecoveredSale();
  if (sale && sale.sold && sale.sold.length) d09Sells += 1;
}
assert.equal(d09Sells, 2, `D09 连续确认 5 次只能成交 2 次，实际 ${d09Sells}`);
assert.equal(sellFundCapStatus(d09Reserve).soldTimes, 2, "D09 连续出售后次数停在 2");
assert.equal(sellFundCapStatus(d09Reserve).adEligible, true, "D09 第 3 次起应要求看广告或改兑补给");

// D10 出售 1 次后离开做别的事，回来次数不能清零
const d10 = makeReserve(1);
assert.ok(sellRecoveredGoodsBatch(d10.reserve.inventory, d10.reserve, Number.MAX_SAFE_INTEGER).sold.length >= 1);
assert.equal(sellFundCapStatus(d10.reserve).soldTimes, 1, "D10 先记 1 次");
d10.reserve.inventory = {
  shedAntlerA: 1,
  shedAntlerB: 0,
  naturalHide: 0,
  researchSample: 2,
  recoveredTrap: 0
};
const afterGap = simulateDay("修复水源和草场", d10.state);
assert.equal(sellFundCapStatus(afterGap.world.reserve).soldTimes, 1, "D10 离开后再回来，本章次数仍在");
afterGap.world.reserve.inventory.researchSample = 2;
assert.ok(sellRecoveredGoodsBatch(afterGap.world.reserve.inventory, afterGap.world.reserve, Number.MAX_SAFE_INTEGER).sold.length >= 1);
assert.equal(sellFundCapStatus(afterGap.world.reserve).soldTimes, 2, "D10 间隔出售仍计入本章第 2 次");
afterGap.world.reserve.inventory.researchSample = 2;
assert.equal(sellRecoveredGoodsBatch(afterGap.world.reserve.inventory, afterGap.world.reserve, Number.MAX_SAFE_INTEGER).sold.length, 0, "D10 第 3 次免费出售仍被拦住");

console.log("today sell fund review check ok");
