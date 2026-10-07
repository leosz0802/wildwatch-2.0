"use strict";

const assert = require("node:assert/strict");
const { createReserveState, INITIAL_PROTECTION_FUND } = require("../js/world");
const {
  chapterEconomy,
  supplyPrice,
  paceStationFund,
  paceFundAdReward,
  paceSlowDayFund,
  PACE_ECONOMY
} = require("../js/balanceConfig");
const { FACILITY_USE_PROFILES, FACILITY_USE_LIMIT } = require("../js/reserveFacilities");
const { recruitmentYieldBand } = require("../js/visitorRecruitment");
const { visitorContributionRate } = require("../js/eventEconomy");
const { chapterSpecialDef } = require("../js/chapterSpecialSystem");
const { BALANCE_V2 } = require("../js/balanceConfig");

function sessionsOf(chapter) {
  return Math.max(1, Math.round(Number((BALANCE_V2.progression[chapter] || {}).expectedSessions) || 1));
}

function recruitIncome(chapter, reserve) {
  const first = recruitmentYieldBand(chapter, 0);
  const later = recruitmentYieldBand(chapter, 1);
  const typ = Math.round((first.min + first.max) / 2) + Math.round((later.min + later.max) / 2);
  return Math.round(typ * visitorContributionRate(reserve).rate);
}

function unlockedStations(chapter) {
  return Object.keys(FACILITY_USE_PROFILES).filter((id) => (
    chapter >= Math.max(1, Math.round(Number((FACILITY_USE_PROFILES[id] || {}).unlockChapter) || 1))
  ));
}

function buySupply(reserve, id) {
  const price = supplyPrice(id, reserve);
  reserve.fund -= price;
  reserve.supplies[id] = Math.max(0, Math.round(Number(reserve.supplies[id]) || 0)) + 1;
  return price;
}

function useStation(reserve, chapter, id, times) {
  const profile = FACILITY_USE_PROFILES[id];
  let spent = 0;
  for (let index = 0; index < times; index += 1) {
    const cost = paceStationFund(id, chapter);
    reserve.fund -= cost;
    spent += cost;
    if (!profile.supplyId) continue;
    if (Math.max(0, Math.round(Number(reserve.supplies[profile.supplyId]) || 0)) <= 0) {
      spent += buySupply(reserve, profile.supplyId);
    }
    reserve.supplies[profile.supplyId] = Math.max(0, Math.round(Number(reserve.supplies[profile.supplyId]) || 0) - 1);
  }
  return spent;
}

function play(start, chapter, patrolsPerDay, allStations) {
  const reserve = JSON.parse(JSON.stringify(start));
  reserve.progression = Object.assign({}, reserve.progression || {}, {
    stage: chapter,
    displayChapter: chapter,
    level: Math.min(7, Math.ceil(chapter / 2))
  });
  const sessions = sessionsOf(chapter);
  const habitat = Math.max(0, Math.round(Number(chapterEconomy(reserve).habitatCost) || 0));
  const special = Math.max(0, Math.round(Number((chapterSpecialDef(chapter).success || {}).fund) || 0));
  let minFund = reserve.fund;
  for (let day = 0; day < sessions; day += 1) {
    reserve.guardianCycle = Object.assign({}, reserve.guardianCycle || {}, { day: Math.max(1, day + 1) });
    reserve.fund += recruitIncome(chapter, reserve);
    if (day === 0) reserve.fund += special;
    reserve.fund -= habitat;
    useStation(reserve, chapter, "old_patrol_post", patrolsPerDay);
    if (allStations) {
      unlockedStations(chapter).filter((id) => id !== "old_patrol_post").forEach((id) => {
        useStation(reserve, chapter, id, FACILITY_USE_LIMIT);
      });
    }
    minFund = Math.min(minFund, reserve.fund);
  }
  return { reserve, minFund, endFund: reserve.fund, broke: minFund < 0 };
}

assert.ok(INITIAL_PROTECTION_FUND >= 600 && INITIAL_PROTECTION_FUND <= 1000);

let diligent = createReserveState();
diligent.fund = INITIAL_PROTECTION_FUND;
let fivePatrol = JSON.parse(JSON.stringify(diligent));

for (let chapter = 1; chapter <= 20; chapter += 1) {
  const reserve = createReserveState();
  reserve.progression = Object.assign({}, reserve.progression || {}, { stage: chapter, displayChapter: chapter });
  reserve.guardianCycle.day = 2;
  reserve.fund = INITIAL_PROTECTION_FUND;
  const slow = paceSlowDayFund(reserve);
  const ad = paceFundAdReward(chapter);
  const oneRound = unlockedStations(chapter).reduce((sum, id) => sum + paceStationFund(id, chapter), 0);
  const freePatrolCost = paceStationFund("old_patrol_post", chapter) * FACILITY_USE_LIMIT + supplyPrice("dogFood", reserve) * FACILITY_USE_LIMIT;
  const dayRecruit = recruitIncome(chapter, reserve);

  if (chapter <= 2) {
    assert.ok(slow < INITIAL_PROTECTION_FUND, `ch${chapter} slow day must be payable from opening fund`);
  }
  assert.ok(dayRecruit > 0, `ch${chapter} two free recruits must pay some fund`);
  if (chapter >= 2) {
    assert.ok(
      freePatrolCost > dayRecruit,
      `ch${chapter} three free patrols must cost more than one day's free recruit income so rushing needs leftover or ads`
    );
  }
  if (chapter >= 3) {
    assert.ok(
      oneRound * FACILITY_USE_LIMIT > INITIAL_PROTECTION_FUND,
      `ch${chapter} rushing all unlocked stations must exceed opening fund`
    );
    assert.ok(
      INITIAL_PROTECTION_FUND + ad * PACE_ECONOMY.fundAdDailyCap >= oneRound,
      `ch${chapter} three fund ads must cover one use of every unlocked station`
    );
    assert.ok(
      ad < oneRound * FACILITY_USE_LIMIT,
      `ch${chapter} one fund ad must not cover three uses of every unlocked station`
    );
  }

  const slowPlay = play(diligent, chapter, 1, false);
  assert.equal(
    slowPlay.broke,
    false,
    `ch${chapter} habitat+1 patrol+two recruits must stay solvent: min ${slowPlay.minFund}`
  );
  diligent = slowPlay.reserve;

    const rushPatrols = play(fivePatrol, chapter, FACILITY_USE_LIMIT, false);
  if (chapter <= 2) {
    assert.equal(rushPatrols.broke, false, `ch${chapter} three free patrols must be payable from opening fund: min ${rushPatrols.minFund}`);
  } else {
    assert.equal(rushPatrols.broke, true, `ch${chapter} three free patrols/day must go broke without ads: min ${rushPatrols.minFund}`);
  }
  fivePatrol = rushPatrols.broke
    ? Object.assign(rushPatrols.reserve, { fund: 0 })
    : rushPatrols.reserve;

  if (chapter >= 2) {
    const rush = play({
      fund: INITIAL_PROTECTION_FUND,
      supplies: { dogFood: 4, fieldKit: 1, alarm: 1, medicalKit: 1 },
      progression: {},
      guardianCycle: { day: 2 }
    }, chapter, 5, true);
    assert.equal(rush.broke, true, `ch${chapter} rushing every station 5 times must go broke without ads`);
  }
}

assert.ok(
  diligent.fund >= 200 && diligent.fund <= 4000,
  `slow play must end tight, not piled or ruined: ${diligent.fund}`
);

console.log("fund tight balance check ok: slow day solvent, five-station rush needs ads");
