"use strict";

const assert = require("node:assert/strict");
const { createReserveState, INITIAL_PROTECTION_FUND } = require("../js/world");
const {
  supplyPrice,
  paceStationFund,
  paceFundAdReward,
  paceEcologyFundCost,
  paceOperatingInflation,
  paceRushInflation,
  PACE_ECONOMY,
  BALANCE_V2
} = require("../js/balanceConfig");
const { recruitmentYieldBand } = require("../js/visitorRecruitment");
const { visitorContributionRate } = require("../js/eventEconomy");
const { recoveredGoodBasePrice } = require("../js/sellFundCap");

function sessionsOf(chapter) {
  return Math.max(1, Math.round(Number((BALANCE_V2.progression[chapter] || {}).expectedSessions) || 1));
}

function dayReserve(chapter) {
  const reserve = createReserveState();
  reserve.progression = {
    stage: chapter,
    displayChapter: chapter,
    level: Math.min(7, Math.ceil(chapter / 2))
  };
  reserve.guardianCycle = { day: 2 };
  reserve.fund = INITIAL_PROTECTION_FUND;
  return reserve;
}

function recruitFund(chapter, reserve) {
  const first = recruitmentYieldBand(chapter, 0);
  const later = recruitmentYieldBand(chapter, 1);
  const visitors = Math.round((first.min + first.max) / 2) + Math.round((later.min + later.max) / 2);
  return Math.round(visitors * visitorContributionRate(reserve).rate);
}

assert.equal(PACE_ECONOMY.fundAdDailyCap, 3, "fund ads stay at three a day");
assert.equal(PACE_ECONOMY.fundAdMinReward, 1000, "fund ads are not cut");
assert.equal(paceFundAdReward(1), 1000);
assert.equal(paceFundAdReward(6), 1200);
assert.ok(paceOperatingInflation(10) > paceOperatingInflation(1), "later chapters charge more for the daily patrol");
assert.ok(paceRushInflation(1) > paceRushInflation(5), "early station fees inflate until there is enough to spend the ad on");

for (let chapter = 1; chapter <= 11; chapter += 1) {
  const reserve = dayReserve(chapter);
  const sessions = sessionsOf(chapter);
  const light = paceEcologyFundCost(reserve, "habitat")
    + supplyPrice("dogFood", reserve)
    + paceStationFund("old_patrol_post", chapter);
  const lightNet = recruitFund(chapter, reserve) * sessions - light * sessions;
  const archive = chapter >= 2 && chapter <= 8 ? (240 + chapter * 40) * 8 : 0;
  const carefulNet = lightNet + recoveredGoodBasePrice("researchSample") * 2 + archive;
  assert.ok(lightNet < 0, `ch${chapter} daily patrol must run short: ${lightNet}`);
  if (chapter <= 1) {
    assert.ok(carefulNet >= -40 && carefulNet <= 80, `ch${chapter} two sample sales must barely cover: ${carefulNet}`);
  } else if (chapter <= 8) {
    assert.ok(carefulNet > 0 && carefulNet < archive, `ch${chapter} one archive covers the day and leaves less than another archive: ${carefulNet}`);
  } else {
    assert.ok(carefulNet < 0, `ch${chapter} has no new archive sale: ${carefulNet}`);
  }
  assert.ok(paceFundAdReward(chapter) >= 1000, `ch${chapter} fund ad must stay at the original floor`);
}

console.log("fund tight balance check ok: ads unchanged, operating prices inflate");
