"use strict";

const assert = require("node:assert/strict");
const { createReserveState, INITIAL_PROTECTION_FUND } = require("../js/world");
const { chapterTargets, chapterVisitorCarryover } = require("../js/chapterTargets");
const {
  PACE_ECONOMY,
  paceFundAdReward,
  paceStationFund,
  paceRushStationFund,
  paceSlowDayFund,
  paceSellFundFreeCap,
  chapterEconomy
} = require("../js/balanceConfig");
const {
  REWARDED_FUND_AD_CONFIG,
  REWARDED_ANIMAL_AD_CONFIG,
  emergencyFundAdStatus,
  applyEmergencyFundReward
} = require("../js/adSystem");
const {
  DAILY_FREE_RECRUITS,
  AD_RECRUIT_GRANT,
  PLAYTIME_RECRUIT_RESTORE_SECONDS,
  recruitmentYieldBand
} = require("../js/visitorRecruitment");
const {
  FACILITY_USE_LIMIT,
  FACILITY_USE_PROFILES,
  facilityUsePreview,
  facilityAnimalGain
} = require("../js/reserveFacilities");
const { chapterSpecialDef } = require("../js/chapterSpecialSystem");

assert.equal(DAILY_FREE_RECRUITS, PACE_ECONOMY.visitorFreeRecruits);
assert.equal(AD_RECRUIT_GRANT, PACE_ECONOMY.visitorAdGrant);
assert.equal(PLAYTIME_RECRUIT_RESTORE_SECONDS, PACE_ECONOMY.visitorRestoreSeconds);
assert.equal(FACILITY_USE_LIMIT, PACE_ECONOMY.stationUseLimit);
assert.equal(PACE_ECONOMY.stationUseLimit, 3, "each chapter starts with 3 free facility uses");
assert.equal(PACE_ECONOMY.stationAdUseGrant, 3, "facility reward ad adds 3 uses");
assert.equal(REWARDED_FUND_AD_CONFIG.rewardPerChapter, PACE_ECONOMY.fundAdPerChapter);
assert.equal(REWARDED_FUND_AD_CONFIG.dailyCap, PACE_ECONOMY.fundAdDailyCap);
assert.equal(REWARDED_ANIMAL_AD_CONFIG.chapterCap, PACE_ECONOMY.animalAdChapterCap);
assert.equal(PACE_ECONOMY.animalAdChapterCap, 4, "lucky animal migration is 4 times per chapter");
const { REWARDED_FACILITY_AD_CONFIG } = require("../js/adSystem");
assert.equal(REWARDED_FACILITY_AD_CONFIG.adUnitId, "adunit-a74d65c9384d70b7");
assert.equal(PACE_ECONOMY.sellFundFreeBatches, 2, "every chapter gets 2 free sell times");
assert.equal(PACE_ECONOMY.fundAdDailyCap, 3, "fund ads stay at 3 a day; prices inflate instead");
assert.equal(PACE_ECONOMY.fundAdMinReward, 1000, "each fund ad pays at least 1000");
assert.equal(paceSellFundFreeCap(1), 150, "chapter 1 free sell cap is 150");
assert.equal(paceSellFundFreeCap(4), 250, "chapter 4 free sell cap is 250");
assert.equal(paceFundAdReward(1), 1000, "chapter 1 fund ad is floored at 1000");
assert.equal(paceFundAdReward(4), 1000, "chapter 4 fund ad is floored at 1000");
assert.equal(paceFundAdReward(6), 1200, "chapter 6 fund ad scales to 1200");
assert.equal(PACE_ECONOMY.sellUnlockAdDailyCap, 0, "sell unlock ads have no daily cap");

Object.keys(PACE_ECONOMY.stationFundById).forEach((id) => {
  assert.equal(FACILITY_USE_PROFILES[id].fund, PACE_ECONOMY.stationFundById[id], `${id} station fund must follow the pace table`);
});

assert.ok(INITIAL_PROTECTION_FUND >= 600 && INITIAL_PROTECTION_FUND <= 1000, "opening fund must cover a slow first day, not a rush of every station");

for (let chapter = 1; chapter <= 20; chapter += 1) {
  const targets = chapterTargets(chapter);
  const inherit = chapter === 1 ? 0 : chapterVisitorCarryover(chapterTargets(chapter - 1).visitors, chapter);
  const need = targets.visitors - inherit;
  const firstBand = recruitmentYieldBand(chapter, 0);
  const laterBand = recruitmentYieldBand(chapter, 1);
  const twoFreeMax = firstBand.max + laterBand.max;
  const threeMax = twoFreeMax + laterBand.max;
  assert.ok(twoFreeMax < need, `ch${chapter} two free recruits max ${twoFreeMax} must not clear +${need}`);
  const specialVisitors = Math.max(0, Math.round(Number((chapterSpecialDef(chapter).success || {}).visitors) || 0));
  assert.ok(twoFreeMax + specialVisitors < need, `ch${chapter} two free + special +${specialVisitors} must still need ad or wait`);
  if (chapter <= 2) {
    assert.ok(threeMax >= need, `ch${chapter} one extra recruit (ad or 6min restore) must be able to finish visitors`);
  } else {
    assert.ok(threeMax < need, `ch${chapter} three same-day recruits must leave a gap so rushing still needs more ads or days`);
  }

  const reserve = createReserveState();
  reserve.progression = Object.assign({}, reserve.progression || {}, { stage: chapter, displayChapter: chapter });
  reserve.guardianCycle = Object.assign({}, reserve.guardianCycle || {}, { day: 2 });
  reserve.fund = INITIAL_PROTECTION_FUND;
  const slow = paceSlowDayFund(reserve);
  if (chapter <= 2) {
    assert.ok(slow < INITIAL_PROTECTION_FUND, `ch${chapter} slow day (habitat+dog food+one patrol) must be payable without ads`);
  }
  const rush = paceRushStationFund(chapter);
  const unlockedRush = Object.keys(PACE_ECONOMY.stationFundById).reduce((sum, id) => {
    const unlock = Math.max(1, Math.round(Number((FACILITY_USE_PROFILES[id] || {}).unlockChapter) || 1));
    return chapter >= unlock ? sum + paceStationFund(id, chapter) * PACE_ECONOMY.stationUseLimit : sum;
  }, 0);
  if (chapter >= 3) {
      assert.ok(unlockedRush > INITIAL_PROTECTION_FUND, `ch${chapter} unlocked stations 3 times must exceed opening fund so ads are needed`);
  }
  if (chapter >= 3) {
    const oneRound = unlockedRush / PACE_ECONOMY.stationUseLimit;
    assert.ok(rush > INITIAL_PROTECTION_FUND, `ch${chapter} rushing all stations 3 times must exceed opening fund`);
    assert.ok(INITIAL_PROTECTION_FUND + paceFundAdReward(chapter) * PACE_ECONOMY.fundAdDailyCap >= oneRound, `ch${chapter} three fund ads must cover one use of every unlocked station`);
  }
  if (chapter >= 4) {
    assert.ok(unlockedRush > INITIAL_PROTECTION_FUND, `ch${chapter} unlocked station uses must exceed opening fund`);
  }

  const hallCost = paceStationFund("governance_hall", chapter);
  if (chapter >= 5) {
    const hall = facilityUsePreview(reserve, "governance_hall");
    assert.equal(hall.fund, hallCost);
    assert.equal(hall.visitors, 0);
    assert.equal(hall.animals, chapter);
  }
  const patrol = facilityUsePreview(reserve, "old_patrol_post");
  assert.equal(patrol.fund, paceStationFund("old_patrol_post", chapter));
  assert.equal(patrol.animals, facilityAnimalGain(chapter));

  const economy = chapterEconomy(reserve);
  assert.ok(economy.habitatCost > 0 && economy.interventionCost > economy.habitatCost, `ch${chapter} intervention must cost more than habitat`);
}

const fundReserve = createReserveState();
fundReserve.guardianCycle.day = 1;
fundReserve.fund = 520;
assert.equal(emergencyFundAdStatus(fundReserve).eligible, false, "chapter 1 day 1 must not push fund ads");
fundReserve.guardianCycle.day = 2;
const firstStatus = emergencyFundAdStatus(fundReserve);
assert.equal(firstStatus.reward, 1000);
assert.equal(firstStatus.dailyCap, 3);
assert.ok(firstStatus.eligible);
const first = applyEmergencyFundReward(fundReserve);
assert.equal(first.amount, 1000);
assert.equal(fundReserve.fund, 1520);
applyEmergencyFundReward(fundReserve);
applyEmergencyFundReward(fundReserve);
const blocked = applyEmergencyFundReward(fundReserve);
assert.equal(blocked.ok, false);
assert.equal(blocked.reason, "daily_cap");

const rich = createReserveState();
rich.guardianCycle.day = 2;
rich.progression = Object.assign({}, rich.progression || {}, { stage: 5, displayChapter: 5 });
rich.fund = 20000;
const richStatus = emergencyFundAdStatus(rich);
assert.equal(richStatus.reward, 1000, "high fund must still pay chapter 5 * 200, not 10% of the pile");
const richReward = applyEmergencyFundReward(rich);
assert.equal(richReward.amount, 1000);
assert.equal(rich.fund, 21000);

console.log("pace economy check ok");
