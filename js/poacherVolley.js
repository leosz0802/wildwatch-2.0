"use strict";

const { addLivingAnimals, removeLivingAnimals } = require("./animalSourceLedger");
const { chapterPatrolNeed } = require("./worldHoundPatrol");

const VOLLEY_ROUNDS = 2;
const VOLLEY_HP = VOLLEY_ROUNDS * 6;
const VOLLEY_STAKE = 100;

function defenseBag(safety = 0) {
  const value = Math.round(Number(safety) || 0);
  if (value >= 71) return [4, 4, 5, 5, 6, 6];
  if (value >= 41) return [3, 3, 4, 4, 5, 6];
  return [2, 2, 3, 3, 4, 5];
}

function defenseVolley(safety = 0, random = Math.random) {
  const bag = defenseBag(safety);
  const roll = typeof random === "function" ? random() : Math.random();
  const index = Math.max(0, Math.min(bag.length - 1, Math.floor(roll * bag.length)));
  return bag[index];
}

function volleyVerdict(playerHp = 0, defenseHp = 0) {
  if (playerHp > defenseHp) return "drive";
  if (playerHp < defenseHp) return "breach";
  return "hold";
}

function stakeScale(cost = VOLLEY_STAKE) {
  return Math.max(1, Math.round(Number(cost) || VOLLEY_STAKE) / VOLLEY_STAKE);
}

// Chapter 1 at a 100 stake is the two-round card: drive +100 fund / +2 animals,
// breach -60 / -2, hold 0 / 0. Later chapters scale those amounts by that
// chapter's patrol need (fund = visitor target × 4, animals = animal target)
// against chapter 1. A 300/600/1000 stake multiplies the same chapter amounts.
// Poacher pressure is a 0–100 meter in every chapter, so -8 / +4 / -3 stay fixed.
function houndPatrolVolleyPayout(verdict = "hold", cost = VOLLEY_STAKE, chapter = 1) {
  const need = chapterPatrolNeed(chapter);
  const base = chapterPatrolNeed(1);
  const stake = stakeScale(cost);
  const fundRatio = need.fund / Math.max(1, base.fund);
  const animalRatio = need.animals / Math.max(1, base.animals);
  const animals = Math.max(1, Math.round(2 * animalRatio * stake));
  const fundWin = Math.max(1, Math.round(100 * fundRatio * stake));
  const fundLoss = Math.max(1, Math.round(60 * fundRatio * stake));
  const shared = {
    chapter: need.chapter,
    fundNeed: need.fund,
    animalNeed: need.animals,
    stake
  };
  if (verdict === "drive") {
    return Object.assign({ id: "drive", name: "驱离", fund: fundWin, animals, poacher: -8, tone: "" }, shared);
  }
  if (verdict === "breach") {
    return Object.assign({ id: "breach", name: "被突破", fund: -fundLoss, animals: -animals, poacher: 4, tone: "is-loss" }, shared);
  }
  return Object.assign({ id: "hold", name: "僵持", fund: 0, animals: 0, poacher: -3, tone: "is-tie" }, shared);
}

function applyHoundPatrolVolley(reserve = {}, payout = {}) {
  const fundBefore = Math.max(0, Math.round(Number(reserve.fund) || 0));
  const poacherBefore = Math.max(0, Math.min(100, Math.round(Number(reserve.poacherPressure) || 0)));
  reserve.fund = Math.max(0, fundBefore + Math.round(Number(payout.fund) || 0));
  reserve.poacherPressure = Math.max(0, Math.min(100, poacherBefore + Math.round(Number(payout.poacher) || 0)));
  let animals = 0;
  if (payout.animals > 0) animals = addLivingAnimals(reserve, payout.animals, "tasked").added;
  else if (payout.animals < 0) animals = -removeLivingAnimals(reserve, -payout.animals, "emigrated", { floor: 0 }).removed;
  reserve.base = reserve.base || {};
  reserve.base.animals = Math.max(0, Math.round(Number(reserve.base.animals) || 0) + animals);
  return {
    fundBefore,
    fundAfter: reserve.fund,
    animals,
    poacherBefore,
    poacherAfter: reserve.poacherPressure,
    payout
  };
}

const GUARD_ROOM_PATROL_LIMIT = 3;
const GUARD_ROOM = Object.freeze({ id: "guard_room", name: "警卫室", short: "警卫室", x: 0.20, y: 0.39 });

function guardRoomChapter(reserve = {}) {
  const progression = reserve.progression || {};
  return Math.max(1, Math.round(Number(progression.displayChapter || progression.stage) || 1));
}

function guardRoomPatrolState(reserve = {}) {
  const chapter = guardRoomChapter(reserve);
  const saved = reserve.guardRoomPatrol || {};
  const sameChapter = Number(saved.chapter) === chapter;
  const hasGrant = sameChapter && Number.isFinite(Number(saved.granted));
  // 每章开始自带 3 次。广告只在这 3 次用完后追加，不代替开章次数。
  const granted = hasGrant
    ? Math.max(0, Math.round(Number(saved.granted) || 0))
    : GUARD_ROOM_PATROL_LIMIT;
  const used = sameChapter
    ? Math.min(granted, Math.max(0, Math.round(Number(saved.used) || 0)))
    : 0;
  return {
    chapter,
    used,
    granted,
    limit: GUARD_ROOM_PATROL_LIMIT,
    remaining: Math.max(0, granted - used)
  };
}

function grantGuardRoomPatrolAd(reserve = {}) {
  const current = guardRoomPatrolState(reserve);
  reserve.guardRoomPatrol = {
    chapter: current.chapter,
    used: current.used,
    granted: current.granted + GUARD_ROOM_PATROL_LIMIT,
    lastSource: "ad"
  };
  return Object.assign({ ok: true, added: GUARD_ROOM_PATROL_LIMIT }, guardRoomPatrolState(reserve));
}

function spendGuardRoomPatrol(reserve = {}, source = "active") {
  const current = guardRoomPatrolState(reserve);
  if (current.remaining <= 0) return Object.assign({ ok: false }, current);
  reserve.guardRoomPatrol = {
    chapter: current.chapter,
    used: current.used + 1,
    granted: current.granted,
    lastSource: source === "passive" ? "passive" : "active"
  };
  return Object.assign({ ok: true }, guardRoomPatrolState(reserve));
}

function undoHoundPatrolVolley(reserve = {}, applied = {}) {
  if (!applied) return reserve;
  reserve.fund = Math.max(0, Math.round(Number(applied.fundBefore) || 0));
  reserve.poacherPressure = Math.max(0, Math.min(100, Math.round(Number(applied.poacherBefore) || 0)));
  const animals = Math.round(Number(applied.animals) || 0);
  if (animals > 0) removeLivingAnimals(reserve, animals, "emigrated", { floor: 0 });
  else if (animals < 0) addLivingAnimals(reserve, -animals, "tasked");
  reserve.base = reserve.base || {};
  reserve.base.animals = Math.max(0, Math.round(Number(reserve.base.animals) || 0) - animals);
  return reserve;
}

module.exports = {
  VOLLEY_ROUNDS,
  VOLLEY_HP,
  VOLLEY_STAKE,
  GUARD_ROOM,
  GUARD_ROOM_PATROL_LIMIT,
  guardRoomPatrolState,
  grantGuardRoomPatrolAd,
  spendGuardRoomPatrol,
  defenseBag,
  defenseVolley,
  volleyVerdict,
  stakeScale,
  houndPatrolVolleyPayout,
  applyHoundPatrolVolley,
  undoHoundPatrolVolley
};
