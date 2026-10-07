"use strict";

const { chapterTargets } = require("./chapterTargets");

const PATROL_COST_MIN = 100;
const PATROL_COST_MAX = 1000;
const PATROL_SETTLE_DELAY_MS = 5 * 60 * 1000;
const PATROL_DAILY_LIMIT = 8;
const PATROL_INCOMING_DAILY_LIMIT = 5;
const PATROL_STATE_VERSION = 1;
const PATROL_HISTORY_LIMIT = 10;
const PATROL_POPULATION_REWARD_SCALE = 0.7;
const PATROL_CLAIM_STORAGE_KEY = "forest_kingdom_hound_patrol_claims_v1";

function clamp(value, min, max, fallback = min) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function localDayKey(now = Date.now()) {
  const date = new Date(Number(now) || Date.now());
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function uniquePatrolIds(list = []) {
  const next = [];
  const seen = new Set();
  (Array.isArray(list) ? list : []).forEach((value) => {
    const id = String(value || "");
    if (!id || seen.has(id)) return;
    seen.add(id);
    next.push(id);
  });
  return next.slice(-400);
}

function claimedIdsFromHistory(history = [], kind = "reward") {
  return uniquePatrolIds((Array.isArray(history) ? history : []).flatMap((row) => {
    if (!row || !row.patrolId) return [];
    if (kind === "loss") {
      if (row.appliedLoss || (row.status === "settled" && row.direction === "received")) return patrolClaimKeys(row, "loss");
      return [];
    }
    if (row.appliedReward || (row.status === "settled" && row.direction !== "received")) return patrolClaimKeys(row, "reward");
    return [];
  }));
}

function patrolPartnerAnchors(row = {}) {
  return uniquePatrolIds([
    row && row.partnerId,
    row && row.targetId,
    row && row.partnerName,
    row && row.targetName
  ]);
}

function patrolClaimFingerprint(row = {}, kind = "reward") {
  const received = kind === "loss" || (row && row.direction === "received");
  const partner = patrolPartnerAnchors(row)[0] || "";
  const created = Math.max(0, Math.round(Number(row && (row.createdAt || row.settleAt || row.settledAt)) || 0));
  const cost = Math.max(0, Math.round(Number(row && row.cost) || 0));
  return partner && created ? `${received ? "recv" : "sent"}:${partner}:${created}:${cost}` : "";
}

function patrolClaimKeys(rowOrId, kind = "reward") {
  const row = rowOrId && typeof rowOrId === "object" ? rowOrId : { patrolId: rowOrId };
  const received = kind === "loss" || (row && row.direction === "received");
  const prefix = received ? "recv" : "sent";
  const cost = Math.max(0, Math.round(Number(row && row.cost) || 0));
  const created = Math.max(0, Math.round(Number(row && (row.createdAt || row.settleAt || row.settledAt)) || 0));
  const day = created ? localDayKey(created) : "";
  const keys = [row && row.patrolId];
  patrolPartnerAnchors(row).forEach((partner) => {
    if (created) keys.push(`${prefix}:${partner}:${created}:${cost}`);
    if (day) keys.push(`${prefix}:${partner}:${day}:${cost}`);
  });
  return uniquePatrolIds(keys);
}

function patrolAlreadyClaimed(state = {}, patrolId, kind = "reward") {
  const keys = patrolClaimKeys(patrolId, kind);
  if (!keys.length) return true;
  const list = kind === "loss" ? state.claimedLossIds : state.claimedIds;
  return Array.isArray(list) && keys.some((id) => list.includes(id));
}

function markPatrolClaimed(state = {}, patrolId, kind = "reward") {
  if (!state) return state;
  const keys = patrolClaimKeys(patrolId, kind).filter(Boolean);
  if (!keys.length) return state;
  if (kind === "loss") {
    if (!Array.isArray(state.claimedLossIds)) state.claimedLossIds = [];
    keys.forEach((id) => {
      if (!state.claimedLossIds.includes(id)) state.claimedLossIds.push(id);
    });
    state.claimedLossIds = uniquePatrolIds(state.claimedLossIds);
  } else {
    if (!Array.isArray(state.claimedIds)) state.claimedIds = [];
    keys.forEach((id) => {
      if (!state.claimedIds.includes(id)) state.claimedIds.push(id);
    });
    state.claimedIds = uniquePatrolIds(state.claimedIds);
  }
  return state;
}

function patrolHistoryStamp(row = {}) {
  return Number(row && (row.settledAt || row.createdAt || row.settleAt)) || 0;
}

function trimPatrolHistory(history = []) {
  return (Array.isArray(history) ? history : []).slice().sort((left, right) => {
    const delta = patrolHistoryStamp(left) - patrolHistoryStamp(right);
    if (delta) return delta;
    return String((left && left.patrolId) || "").localeCompare(String((right && right.patrolId) || ""));
  }).slice(-PATROL_HISTORY_LIMIT);
}

function readPersistedPatrolClaims(runtime) {
  if (!runtime || typeof runtime.getStorageSync !== "function") {
    return { claimedIds: [], claimedLossIds: [] };
  }
  try {
    const saved = runtime.getStorageSync(PATROL_CLAIM_STORAGE_KEY) || {};
    return {
      claimedIds: uniquePatrolIds(saved.claimedIds),
      claimedLossIds: uniquePatrolIds(saved.claimedLossIds)
    };
  } catch (_error) {
    return { claimedIds: [], claimedLossIds: [] };
  }
}

function persistPatrolClaims(state, runtime) {
  if (!runtime || typeof runtime.setStorageSync !== "function" || !state) return state;
  try {
    runtime.setStorageSync(PATROL_CLAIM_STORAGE_KEY, {
      claimedIds: uniquePatrolIds(state.claimedIds),
      claimedLossIds: uniquePatrolIds(state.claimedLossIds)
    });
  } catch (_error) {}
  return state;
}

function mergePersistedPatrolClaims(state, runtime) {
  const saved = readPersistedPatrolClaims(runtime);
  state.claimedIds = uniquePatrolIds([].concat(state.claimedIds || [], saved.claimedIds));
  state.claimedLossIds = uniquePatrolIds([].concat(state.claimedLossIds || [], saved.claimedLossIds));
  return state;
}

function normalizePatrolState(input = {}) {
  const state = input && typeof input === "object" ? input : {};
  const history = trimPatrolHistory(Array.isArray(state.history) ? state.history : []);
  return {
    version: PATROL_STATE_VERSION,
    dayKey: String(state.dayKey || ""),
    initiatedToday: Math.max(0, Math.round(Number(state.initiatedToday) || 0)),
    initiatedTargets: Array.isArray(state.initiatedTargets) ? state.initiatedTargets.map(String).slice(-PATROL_DAILY_LIMIT) : [],
    pending: Array.isArray(state.pending) ? state.pending.slice(-PATROL_DAILY_LIMIT) : [],
    history,
    hintShownChapters: Array.isArray(state.hintShownChapters) ? state.hintShownChapters.map((item) => Math.max(1, Math.round(Number(item) || 0))).filter(Boolean).slice(-30) : [],
    claimedIds: uniquePatrolIds([].concat(state.claimedIds || [], claimedIdsFromHistory(Array.isArray(state.history) ? state.history : history, "reward"))),
    claimedLossIds: uniquePatrolIds([].concat(state.claimedLossIds || [], claimedIdsFromHistory(Array.isArray(state.history) ? state.history : history, "loss")))
  };
}

function rollTargetFloors(target = {}) {
  return {
    fund: Math.max(0, Math.round(Number(target.fundFloor) || 0)),
    visitors: Math.max(0, Math.round(Number(target.visitorFloor) || 0)),
    animals: Math.max(0, Math.round(Number(target.animalFloor) || 0))
  };
}

function chapterPatrolNeed(chapter = 1) {
  const stage = Math.max(1, Math.min(18, Math.round(Number(chapter) || 1)));
  const targets = chapterTargets(stage);
  return {
    chapter: stage,
    visitors: Math.max(0, Math.round(Number(targets.visitors) || 0)),
    animals: Math.max(0, Math.round(Number(targets.animals) || 0)),
    fund: Math.max(0, Math.round(Number(targets.visitors) || 0) * 4)
  };
}

function patrolStakeShare(cost) {
  const amount = Math.round(clamp(cost, PATROL_COST_MIN, PATROL_COST_MAX, PATROL_COST_MIN));
  if (amount >= 1000) return 1;
  if (amount >= 600) return 0.75;
  if (amount >= 300) return 0.5;
  return 0.25;
}

/**
 * Actor rewards follow the initiator's current chapter targets. A 1000-fund
 * patrol against a reserve at safety 0 pays that chapter's fund need exactly,
 * and 70% of the visitor/animal need. Higher safety or a smaller stake
 * scales the same need down. The target only loses surplus above its own
 * chapter floors.
 */
function calculatePatrolOutcome(input = {}) {
  const cost = Math.round(clamp(input.cost, PATROL_COST_MIN, PATROL_COST_MAX, PATROL_COST_MIN));
  const safety = Math.round(clamp(input.safety, 0, 100, 50));
  const risk = 1 - safety / 100;
  const share = 0.04 + risk * 0.12; // target transfer: 4% at 100 safety, 16% at 0 safety.
  const safetyShare = 0.45 + risk * 0.55; // actor scale: 45% when fully safe, 100% at safety 0.
  const stakeShare = patrolStakeShare(cost);
  const need = chapterPatrolNeed(input.chapter);
  const targetFund = Math.max(0, Math.round(Number(input.fund) || 0));
  const targetVisitors = Math.max(0, Math.round(Number(input.visitors) || 0));
  const targetAnimals = Math.max(0, Math.round(Number(input.animals) || 0));
  const floors = rollTargetFloors(input);
  const fundLoss = Math.min(Math.max(0, targetFund - floors.fund), Math.max(0, Math.round(targetFund * share)));
  const visitorsLoss = Math.min(Math.max(0, targetVisitors - floors.visitors), Math.max(0, Math.floor(targetVisitors * share)));
  const animalsLoss = Math.min(Math.max(0, targetAnimals - floors.animals), Math.max(0, Math.floor(targetAnimals * share * 0.75)));
  const fundReward = Math.max(0, Math.round(need.fund * stakeShare * safetyShare));
  const visitorReward = Math.max(0, Math.round(need.visitors * stakeShare * safetyShare * PATROL_POPULATION_REWARD_SCALE));
  const animalReward = Math.max(0, Math.round(need.animals * stakeShare * safetyShare * PATROL_POPULATION_REWARD_SCALE));
  const afterFloor = (value, floor, loss) => value > floor
    ? Math.max(floor, value - Math.min(loss, value - floor))
    : value;
  return {
    safety,
    risk: Number(risk.toFixed(4)),
    transferRate: Number(share.toFixed(4)),
    cost,
    chapter: need.chapter,
    chapterNeed: need,
    stakeShare,
    safetyShare: Number(safetyShare.toFixed(4)),
    actorReward: { fund: fundReward, visitors: visitorReward, animals: animalReward },
    targetLoss: { fund: fundLoss, visitors: visitorsLoss, animals: animalsLoss },
    protectedFloors: floors,
    targetAfter: {
      fund: afterFloor(targetFund, floors.fund, fundLoss),
      visitors: afterFloor(targetVisitors, floors.visitors, visitorsLoss),
      animals: afterFloor(targetAnimals, floors.animals, animalsLoss)
    }
  };
}

function canStartPatrol(state, targetId, now = Date.now()) {
  const patrol = normalizePatrolState(state);
  const day = localDayKey(now);
  if (patrol.dayKey !== day) return { ok: true, remaining: PATROL_DAILY_LIMIT };
  if (patrol.initiatedToday >= PATROL_DAILY_LIMIT) return { ok: false, code: "DAILY_LIMIT", remaining: 0 };
  if (patrol.initiatedTargets.includes(String(targetId))) return { ok: false, code: "TARGET_ALREADY_PATROLLED", remaining: Math.max(0, PATROL_DAILY_LIMIT - patrol.initiatedToday) };
  return { ok: true, remaining: Math.max(0, PATROL_DAILY_LIMIT - patrol.initiatedToday) };
}

function createPatrolRecord({ clientPatrolId, targetId, targetName, cost, targetSnapshot = {}, chapter = 1, now = Date.now() } = {}) {
  const id = String(clientPatrolId || `hound_${now}_${Math.random().toString(36).slice(2, 8)}`).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  const target = Object.assign({}, targetSnapshot);
  return {
    patrolId: id,
    direction: "sent",
    targetId: String(targetId || "").slice(0, 40),
    targetName: String(targetName || "远方保护区").slice(0, 40),
    chapter: Math.max(1, Math.round(Number(chapter) || 1)),
    cost: Math.round(clamp(cost, PATROL_COST_MIN, PATROL_COST_MAX, PATROL_COST_MIN)),
    targetSnapshot: {
      safety: Math.round(clamp(target.safety, 0, 100, 50)),
      fund: Math.max(0, Math.round(Number(target.fund) || 0)),
      visitors: Math.max(0, Math.round(Number(target.visitors) || 0)),
      animals: Math.max(0, Math.round(Number(target.animals) || 0)),
      fundFloor: Math.max(0, Math.round(Number(target.fundFloor) || 0)),
      visitorFloor: Math.max(0, Math.round(Number(target.visitorFloor) || 0)),
      animalFloor: Math.max(0, Math.round(Number(target.animalFloor) || 0))
    },
    status: "pending",
    createdAt: Number(now) || Date.now(),
    settleAt: (Number(now) || Date.now()) + PATROL_SETTLE_DELAY_MS,
    settledAt: 0,
    actorReward: null,
    targetLoss: null
  };
}

function settlePatrolRecord(record = {}, now = Date.now()) {
  if (!record || record.status !== "pending" || Number(now) < Number(record.settleAt || 0)) return record;
  const result = calculatePatrolOutcome(Object.assign({}, record.targetSnapshot || {}, {
    cost: record.cost,
    chapter: record.chapter
  }));
  return Object.assign({}, record, {
    status: "settled",
    settledAt: Number(now) || Date.now(),
    // The initiator's payout follows the chapter recorded when the patrol
    // started. A server copy can still be stale, so the local chapter formula
    // is the reward the player actually receives.
    actorReward: result.actorReward,
    targetLoss: record.targetLoss || result.targetLoss,
    transferRate: result.transferRate,
    risk: result.risk,
    protectedFloors: result.protectedFloors,
    targetAfter: result.targetAfter
  });
}

function applyActorReward(reserve = {}, record = {}) {
  const reward = record.actorReward || record.reward || {};
  const fundGain = Math.max(0, Math.round(Number(reward.fund) || 0));
  const visitorGain = Math.max(0, Math.round(Number(reward.visitors) || 0));
  const animalGain = Math.max(0, Math.round(Number(reward.animals) || 0));
  const beforeFund = Math.max(0, Number(reserve.fund) || 0);
  reserve.fund = beforeFund + fundGain;
  reserve.base = reserve.base || {};
  reserve.base.protectedAnimals = reserve.base.protectedAnimals || {};
  let visitors = 0;
  if (visitorGain) {
    visitors = Math.max(0, Math.round(Number(require("./chapterTargets").applyChapterVisitorDelta(reserve, visitorGain, "task").applied) || 0));
  }
  let animals = 0;
  if (animalGain) {
    animals = Math.max(0, Math.round(Number(require("./animalSourceLedger").addLivingAnimals(reserve, animalGain, "tasked").added) || 0));
    reserve.base.animals = Math.max(0, Number(reserve.base.animals) || 0) + animals;
  }
  return { fund: reserve.fund - beforeFund, visitors, animals };
}

function applyTargetLoss(reserve = {}, record = {}) {
  const loss = record.targetLoss || record.loss || {};
  const floors = record.protectedFloors || rollTargetFloors(record.targetSnapshot || {});
  const fundLoss = Math.max(0, Math.round(Number(loss.fund) || 0));
  const visitorLoss = Math.max(0, Math.round(Number(loss.visitors) || 0));
  const animalLoss = Math.max(0, Math.round(Number(loss.animals) || 0));
  const beforeFund = Math.max(0, Number(reserve.fund) || 0);
  const appliedFund = Math.min(fundLoss, Math.max(0, beforeFund - Math.max(0, Number(floors.fund) || 0)));
  reserve.fund = beforeFund - appliedFund;
  const { applyChapterVisitorDelta, chapterVisitorTotal } = require("./chapterTargets");
  const currentVisitors = chapterVisitorTotal(reserve);
  const allowedVisitors = Math.min(visitorLoss, Math.max(0, currentVisitors - Math.max(0, Number(floors.visitors) || 0)));
  const visitorsApplied = allowedVisitors
    ? Math.abs(Math.round(Number(applyChapterVisitorDelta(reserve, -allowedVisitors, "loss").applied) || 0))
    : 0;
  const animalsApplied = animalLoss
    ? Math.max(0, Math.round(Number(require("./animalSourceLedger").removeLivingAnimals(reserve, animalLoss, "emigrated", {
      floor: Math.max(0, Number(floors.animals) || 0)
    }).removed) || 0))
    : 0;
  reserve.base = reserve.base || {};
  reserve.base.animals = Math.max(0, Math.max(0, Number(reserve.base.animals) || 0) - animalsApplied);
  return { fund: appliedFund, visitors: visitorsApplied, animals: animalsApplied };
}

function patrolRewardFigures(row = {}) {
  if (row.appliedReward && typeof row.appliedReward === "object") return row.appliedReward;
  return row.actorReward || row.reward || {};
}

function patrolLossFigures(row = {}) {
  if (row.appliedLoss && typeof row.appliedLoss === "object") return row.appliedLoss;
  return row.targetLoss || row.loss || {};
}

function patrolHistoryCopy(row = {}) {
  const reward = patrolRewardFigures(row);
  const loss = patrolLossFigures(row);
  const cost = Math.max(0, Math.round(Number(row.cost) || 0));
  const received = row.direction === "received";
  const settled = row.status === "settled";
  return {
    tag: settled ? "已结算" : received ? "被巡逻" : "进行中",
    title: `${received ? "来自" : "巡逻"} ${row.targetName || row.partnerName || "远方保护区"}`,
    stake: received ? `对方投入 ${cost}` : `我的投入 ${cost}`,
    body: settled
      ? received
        ? `损失 基金 -${Math.max(0, Math.round(Number(loss.fund) || 0))} · 游客 -${Math.max(0, Math.round(Number(loss.visitors) || 0))} · 动物 -${Math.max(0, Math.round(Number(loss.animals) || 0))}`
        : `收益 基金 +${Math.max(0, Math.round(Number(reward.fund) || 0))} · 游客 +${Math.max(0, Math.round(Number(reward.visitors) || 0))} · 动物 +${Math.max(0, Math.round(Number(reward.animals) || 0))}`
      : received ? "有人正在巡逻你的保护区" : "5分钟后结算",
    lossBody: `对方损失 基金 -${Math.max(0, Math.round(Number(loss.fund) || 0))} · 游客 -${Math.max(0, Math.round(Number(loss.visitors) || 0))} · 动物 -${Math.max(0, Math.round(Number(loss.animals) || 0))}`
  };
}

function chapterFloors(reserve = {}, chapterTarget = {}) {
  return {
    fund: 0,
    visitors: Math.max(0, Math.round(Number(chapterTarget.visitors || chapterTarget.visitorTotal) || 0)),
    animals: Math.max(0, Math.round(Number(chapterTarget.animals || chapterTarget.animalTotal) || 0))
  };
}

module.exports = {
  PATROL_COST_MIN,
  PATROL_COST_MAX,
  PATROL_SETTLE_DELAY_MS,
  PATROL_DAILY_LIMIT,
  PATROL_INCOMING_DAILY_LIMIT,
  PATROL_HISTORY_LIMIT,
  PATROL_POPULATION_REWARD_SCALE,
  PATROL_CLAIM_STORAGE_KEY,
  localDayKey,
  normalizePatrolState,
  uniquePatrolIds,
  patrolAlreadyClaimed,
  markPatrolClaimed,
  trimPatrolHistory,
  readPersistedPatrolClaims,
  persistPatrolClaims,
  mergePersistedPatrolClaims,
  patrolClaimKeys,
  chapterPatrolNeed,
  calculatePatrolOutcome,
  canStartPatrol,
  createPatrolRecord,
  settlePatrolRecord,
  applyActorReward,
  applyTargetLoss,
  patrolHistoryCopy,
  patrolRewardFigures,
  patrolLossFigures,
  chapterFloors
};
