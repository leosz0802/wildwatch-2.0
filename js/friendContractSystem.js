"use strict";

const { addPendingRecovered, addSupply } = require("./resourceLedger");
const { recordFundChange } = require("./fundLedger");

const CONTRACTS = Object.freeze([
  {
    id: "patrol_note",
    label: "完成一次巡护记录",
    short: "巡护记录",
    body: "在沙盘完成一次巡护、观察或任务处理，并把结果记入合同。",
    action: "patrol",
    reward: { fund: 20, supplies: { dogFood: 1 }, collection: { researchSample: 1 } }
  },
  {
    id: "habitat_care",
    label: "完成一次水草维护",
    short: "水草维护",
    body: "完成一次水源或草场维护，让双方的保护区各获得一条贡献记录。",
    action: "habitat",
    reward: { fund: 25, supplies: { fieldKit: 1 }, collection: { researchSample: 1 } }
  },
  {
    id: "species_watch",
    label: "完成一次动物观察",
    short: "动物观察",
    body: "完成一次动物观察或生存探索，双方各提交一条观察贡献。",
    action: "observe",
    reward: { fund: 18, supplies: { tranquilizer: 1 }, collection: { shedAntlerA: 1 } }
  },
  {
    id: "route_marker",
    label: "完成一次边界路线标记",
    short: "路线标记",
    body: "检查一处边界路线并留下标记，帮助好友减少重复巡查。",
    action: "route",
    reward: { fund: 30, supplies: { alarm: 1 }, collection: { recoveredTrap: 1 } }
  },
  {
    id: "night_rescue",
    label: "完成一次夜间救护准备",
    short: "夜间救护",
    body: "完成一次夜间救护或动物安置准备，让保护区更快应对突发事件。",
    action: "rescue",
    reward: { fund: 28, supplies: { medicalKit: 1 }, collection: { naturalHide: 1 } }
  },
  {
    id: "community_archive",
    label: "完成一次保护资料整理",
    short: "资料整理",
    body: "整理一份保护资料并同步给好友，把发现转成可收藏的研究记录。",
    action: "archive",
    reward: { fund: 35, supplies: { dogFood: 1 }, collection: { shedAntlerB: 1 } }
  }
]);
const DAY_MS = 24 * 60 * 60 * 1000;
const CONTRACT_EXPIRY_MS = 48 * 60 * 60 * 1000;
// Compatibility alias for older callers. Contracts now expire without NPC
// or patrol completion.
const PARTNER_FALLBACK_MS = CONTRACT_EXPIRY_MS;
const MAX_FRIEND_CONTRACTS = 5;

function n(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}
function dayOf(reserve = {}) {
  return Math.max(1, n(((reserve.guardianCycle || {}).day) || ((reserve.progression || {}).day) || 1));
}
function dateKeyOf(now = Date.now()) {
  const date = new Date(Number(now) || Date.now());
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function contractDayOf(now = Date.now()) {
  const stamp = Number(now) || Date.now();
  const date = new Date(stamp);
  const localMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.max(1, Math.floor(localMidnight / DAY_MS));
}
function chooseContract(day) {
  return CONTRACTS[(Math.max(1, n(day)) - 1) % CONTRACTS.length];
}
function friendContractRewardText(reward = {}) {
  const parts = [];
  const fund = n(reward.fund);
  if (fund) parts.push(`基金 +${fund}`);
  Object.entries(reward.supplies || {}).forEach(([id, amount]) => {
    const labels = { dogFood: "狗粮", alarm: "警报器", tranquilizer: "阻滞弹", fieldKit: "野外工具包", medicalKit: "医疗包", evidenceTrap: "诱迹机关" };
    const value = n(amount);
    if (value) parts.push(`${labels[id] || id} +${value}`);
  });
  Object.entries(reward.collection || {}).forEach(([id, amount]) => {
    const labels = { shedAntlerA: "A级岩角", shedAntlerB: "B级岩角", naturalHide: "自然生物样本", recoveredTrap: "回收陷阱", researchSample: "研究样本" };
    const value = n(amount);
    if (value) parts.push(`${labels[id] || id}待收 +${value}`);
  });
  return parts.join(" · ") || "无额外奖励";
}
function realFriends(friends = []) {
  const seen = new Set();
  return (friends || []).filter((item) => item && item.simulated !== true && item.mine !== true
    && (item.id || item.openId || item.owner || item.nickName || item.nickname || item.name))
    .map((item) => {
      const id = String(item.id || item.openId || item.owner || item.nickName || item.name || "friend_contract").slice(0, 48);
      if (seen.has(id)) return null;
      seen.add(id);
      return {
        id,
        name: String(item.owner || item.nickName || item.nickname || item.name || "好友").trim().slice(0, 16) || "好友",
        kind: "player",
        simulated: false,
        nickName: String(item.nickName || item.nickname || "").trim().slice(0, 16),
        worldPlayerId: String(item.worldPlayerId || item.publicId || "").replace(/^cloud_/, "").slice(0, 32),
        friendMatchKey: /^[a-f0-9]{64}$/.test(String(item.friendMatchKey || "")) ? String(item.friendMatchKey) : ""
      };
    })
    .filter(Boolean)
    .slice(0, MAX_FRIEND_CONTRACTS);
}
function emptySide() {
  return { completed: false, action: "", contribution: 0, completedAt: 0 };
}
function emptySlot(partner = null, slotId = "") {
  const normalizedPartner = partner && typeof partner === "object" ? {
    id: String(partner.id || "").slice(0, 48),
    name: String(partner.name || "好友").slice(0, 16),
    kind: partner.kind === "npc" ? "npc" : "player",
    simulated: !!partner.simulated,
    nickName: String(partner.nickName || partner.nickname || "").trim().slice(0, 16),
    worldPlayerId: String(partner.worldPlayerId || partner.publicId || "").replace(/^cloud_/, "").slice(0, 32),
    friendMatchKey: /^[a-f0-9]{64}$/.test(String(partner.friendMatchKey || "")) ? String(partner.friendMatchKey) : ""
  } : null;
  return {
    id: String(slotId || (normalizedPartner ? `slot_${normalizedPartner.id}` : "slot_1")).slice(0, 80),
    remoteId: "",
    clientContractId: "",
    partner: normalizedPartner,
    status: "open",
    started: false,
    startedAt: 0,
    player: emptySide(),
    partnerSide: emptySide(),
    createdAt: 0,
    expiresAt: 0,
    fallbackAt: 0,
    completedAt: 0,
    resolution: "",
    rewardClaimed: false,
    reward: null
  };
}
function emptyState(day, dateKey = "") {
  return {
    version: 3,
    day: Math.max(1, n(day) || 1),
    dateKey: String(dateKey || ""),
    id: "",
    status: "open",
    partner: null,
    objective: null,
    player: emptySide(),
    partnerSide: emptySide(),
    createdAt: 0,
    fallbackAt: 0,
    completedAt: 0,
    resolution: "",
    slots: [],
    history: []
  };
}
function normalizeSide(side = {}) {
  return {
    completed: !!side.completed,
    action: String(side.action || "").slice(0, 32),
    contribution: Math.max(0, n(side.contribution)),
    completedAt: n(side.completedAt)
  };
}
function normalizePartner(partner) {
  if (!partner || typeof partner !== "object") return null;
  return {
    id: String(partner.id || "").slice(0, 48),
    name: String(partner.name || "好友").slice(0, 16),
    kind: partner.kind === "npc" ? "npc" : "player",
    simulated: !!partner.simulated,
    nickName: String(partner.nickName || partner.nickname || "").trim().slice(0, 16),
    worldPlayerId: String(partner.worldPlayerId || partner.publicId || "").replace(/^cloud_/, "").slice(0, 32),
    friendMatchKey: /^[a-f0-9]{64}$/.test(String(partner.friendMatchKey || "")) ? String(partner.friendMatchKey) : ""
  };
}
function normalizeSlot(slot = {}, fallbackPartner = null, fallbackId = "") {
  const partner = normalizePartner(slot.partner || fallbackPartner);
  const normalized = emptySlot(partner, slot.id || fallbackId);
  normalized.status = ["open", "awaiting_player", "awaiting_partner", "completed", "expired"].includes(slot.status)
    ? slot.status
    : "open";
  // New slots wait for an explicit "发起合同" action. Old saves do not have
  // this flag, so they remain active to preserve their in-flight contracts.
  normalized.started = slot.started === undefined
    ? ["awaiting_partner", "completed", "fallback"].includes(normalized.status)
      || !!(slot.player && slot.player.completed)
      || !!(slot.partnerSide && slot.partnerSide.completed)
    : slot.started !== false;
  normalized.startedAt = n(slot.startedAt) || (normalized.started ? n(slot.createdAt) : 0);
  normalized.remoteId = String(slot.remoteId || "").slice(0, 80);
  normalized.clientContractId = String(slot.clientContractId || "").slice(0, 80);
  normalized.expiresAt = n(slot.expiresAt)
    || (normalized.startedAt ? normalized.startedAt + CONTRACT_EXPIRY_MS : 0);
  normalized.player = normalizeSide(slot.player);
  normalized.partnerSide = normalizeSide(slot.partnerSide || slot.partnerContribution);
  normalized.createdAt = n(slot.createdAt);
  normalized.fallbackAt = 0;
  normalized.completedAt = n(slot.completedAt);
  normalized.resolution = String(slot.resolution || "").slice(0, 24);
  normalized.rewardClaimed = !!slot.rewardClaimed;
  normalized.reward = slot.reward && typeof slot.reward === "object" ? {
    fund: n(slot.reward.fund),
    supplies: Object.fromEntries(Object.entries(slot.reward.supplies || {}).map(([key, value]) => [key, n(value)])),
    collection: Object.fromEntries(Object.entries(slot.reward.collection || {}).map(([key, value]) => [key, n(value)]))
  } : null;
  return normalized;
}
function legacySlot(previous = {}) {
  const hasLegacyData = previous.partner || previous.id || (previous.player && previous.player.completed)
    || (previous.partnerSide && previous.partnerSide.completed);
  if (!hasLegacyData) return null;
  return normalizeSlot({
    id: previous.id ? `${previous.id}:legacy` : "slot_legacy",
    partner: previous.partner,
    status: previous.status,
    player: previous.player,
    partnerSide: previous.partnerSide || previous.partnerContribution,
    createdAt: previous.createdAt,
    fallbackAt: previous.fallbackAt,
    completedAt: previous.completedAt,
    resolution: previous.resolution
  });
}
function isWaitingSlot(slot) {
  return !!(slot && ["open", "awaiting_player", "awaiting_partner"].includes(slot.status)
    && slot.started && !(slot.player && slot.player.completed)
    && !(slot.partnerSide && slot.partnerSide.completed));
}
function hasUnfinishedSlots(state) {
  return (state.slots || []).some((slot) => slot && !["completed", "expired"].includes(slot.status));
}
function isExpiredSlot(slot, now = Date.now()) {
  return !!(slot && slot.started && !["completed", "expired"].includes(slot.status)
    && slot.expiresAt && Number(now) >= Number(slot.expiresAt));
}
function syncLegacyAliases(state) {
  const primary = (state.slots || [])[0] || emptySlot(null, "slot_1");
  state.partner = primary.partner;
  state.player = primary.player;
  state.partnerSide = primary.partnerSide;
  state.fallbackAt = 0;
  state.expiresAt = primary.expiresAt;
  state.completedAt = primary.completedAt;
  state.resolution = primary.resolution;
  const slots = state.slots || [];
  const allEnded = slots.length && slots.every((slot) => ["completed", "expired"].includes(slot.status));
  state.status = allEnded && slots.some((slot) => slot.status === "expired")
    ? "expired"
    : allEnded ? "completed" : "open";
  return state;
}
function historyPartnerFields(slot = {}, extra = {}) {
  const partner = slot.partner || extra.partner || {};
  return {
    partnerId: partner.id || extra.partnerId || "",
    partnerName: partner.name || extra.partnerName || "",
    nickName: partner.nickName || extra.nickName || extra.nickname || "",
    worldPlayerId: String(partner.worldPlayerId || extra.worldPlayerId || "").replace(/^cloud_/, "").slice(0, 32),
    friendMatchKey: /^[a-f0-9]{64}$/.test(String(partner.friendMatchKey || extra.friendMatchKey || ""))
      ? String(partner.friendMatchKey || extra.friendMatchKey)
      : ""
  };
}
function expireSlots(state, now = Date.now()) {
  const stamp = Number(now) || Date.now();
  (state.slots || []).forEach((slot) => {
    if (!isExpiredSlot(slot, stamp)) return;
    slot.status = "expired";
    slot.resolution = "expired";
    slot.completedAt = stamp;
    slot.fallbackAt = 0;
  state.history = (state.history || []).concat(Object.assign({
    type: "expired",
    direction: "sent",
      id: state.id,
      slotId: slot.id,
      day: state.day,
      dateKey: state.dateKey,
      objective: state.objective && state.objective.id,
      expiresAt: slot.expiresAt,
      expiredAt: stamp
    }, historyPartnerFields(slot))).slice(-60);
  });
  return state;
}
function normalizeFriendContract(reserve = {}, now = Date.now()) {
  const dateKey = dateKeyOf(now);
  const day = contractDayOf(now);
  const previous = reserve.friendContract || {};
  const previousDateKey = String(previous.dateKey || (previous.createdAt ? dateKeyOf(previous.createdAt) : ""));
  const previousSlots = Array.isArray(previous.slots) ? previous.slots : [];
  const waitingAcrossDate = previousSlots.some((slot) => slot
    && slot.started !== false
    && !["completed", "expired", "fallback"].includes(slot.status));
  const sameDate = !!previous.objective && previousDateKey === dateKey;
  const keepExisting = sameDate || waitingAcrossDate;
  const activeDay = keepExisting ? (n(previous.day) || day) : day;
  const activeDateKey = keepExisting ? (previousDateKey || dateKey) : dateKey;
  const state = keepExisting
    ? Object.assign(emptyState(activeDay, activeDateKey), previous, { day: activeDay, dateKey: activeDateKey })
    : Object.assign(emptyState(day, dateKey), { history: Array.isArray(previous.history) ? previous.history.slice(-60) : [] });
  state.version = 3;
  state.day = activeDay;
  state.dateKey = activeDateKey;
  state.id = String(state.id || "").slice(0, 80);
  state.objective = state.objective && typeof state.objective === "object"
    ? (CONTRACTS.find((item) => item.id === state.objective.id) || chooseContract(activeDay))
    : chooseContract(activeDay);
  const sourceSlots = keepExisting
    ? (previousSlots.length ? previousSlots : (legacySlot(previous) ? [legacySlot(previous)] : []))
    : [];
  state.slots = sourceSlots.slice(0, MAX_FRIEND_CONTRACTS).map((slot, index) => normalizeSlot(slot, slot.partner, slot.id || `slot_${index + 1}`));
  state.createdAt = n(state.createdAt) || (state.slots[0] && state.slots[0].createdAt) || 0;
  state.history = (Array.isArray(state.history) ? state.history : [])
    .filter((entry) => entry && typeof entry === "object").slice(-60);
  // Migrate legacy NPC/fallback slots out of the active contract state.
  state.slots = state.slots.filter((slot) => slot.partner && slot.partner.kind === "player");
  syncLegacyAliases(state);
  reserve.friendContract = state;
  return state;
}
function addFriendSlots(state, friends = [], now = Date.now()) {
  const candidates = realFriends(friends);
  // NPC/patrol slots belonged to the previous contract flow. Never create or
  // retain one: a contract exists only after the player selects a real friend.
  // Ended slots stay in history, but no longer consume one of the five active
  // friend slots. Keeping them in this array was the reason a stale save could
  // report “资料尚未同步” forever after five old contracts had ended.
  state.slots = (state.slots || []).filter((slot) => slot && slot.partner && slot.partner.kind === "player"
    && !["completed", "expired"].includes(slot.status));
  const existing = new Set((state.slots || []).map((slot) => slot.partner && slot.partner.id).filter(Boolean));
  candidates.forEach((partner) => {
    if (state.slots.length >= MAX_FRIEND_CONTRACTS || existing.has(partner.id)) return;
    const stamp = Number(now) || Date.now();
    const slot = emptySlot(partner, `${state.id}:friend:${partner.id}`);
    slot.createdAt = stamp;
    state.slots.push(slot);
    existing.add(partner.id);
    state.history = (state.history || []).concat({
      type: "slot_created",
      id: state.id,
      slotId: slot.id,
      day: state.day,
      dateKey: state.dateKey,
      partnerId: partner.id,
      partnerName: partner.name,
      partnerKind: "player",
      createdAt: stamp
    }).slice(-60);
  });
  return syncLegacyAliases(state);
}
function ensureFriendContract(reserve = {}, friends = [], now = Date.now()) {
  const state = normalizeFriendContract(reserve, now);
  if (!state.id) {
    const stamp = Number(now) || Date.now();
    state.id = `friend_contract_${state.dateKey}`;
    state.createdAt = stamp;
    state.objective = chooseContract(state.day);
    state.history = (state.history || []).concat({
      type: "created",
      id: state.id,
      day: state.day,
      dateKey: state.dateKey,
      objective: state.objective.id,
      createdAt: stamp
    }).slice(-60);
  }
  addFriendSlots(state, friends, now);
  expireSlots(state, now);
  syncLegacyAliases(state);
  reserve.friendContract = state;
  return state;
}
function slotForState(state, partnerId = "", now = Date.now()) {
  const slots = state.slots || [];
  if (partnerId) return slots.find((slot) => slot.id === partnerId || (slot.partner && slot.partner.id === partnerId)) || null;
  return slots.find((slot) => slot.status === "open" && slot.started && !slot.player.completed)
    || slots.find((slot) => ["open", "awaiting_player", "awaiting_partner"].includes(slot.status)
      && !slot.started && !slot.player.completed)
    || slots.find((slot) => isWaitingSlot(slot))
    || slots[0]
    || null;
}
function slotStatus(slot, now = Date.now()) {
  return Object.assign({}, slot, {
    expired: isExpiredSlot(slot, now),
    expiryAt: slot.expiresAt || 0,
    fallbackReady: false
  });
}
function statusForState(state, now = Date.now(), selectedSlotId = "") {
  const slots = (state.slots || []).map((slot) => slotStatus(slot, now));
  const selected = slotForState(Object.assign({}, state, { slots }), selectedSlotId, now) || slots[0] || null;
  const completed = slots.length > 0 && slots.every((slot) => slot.status === "completed");
  const expired = slots.length > 0 && slots.every((slot) => slot.status === "expired");
  return {
    state,
    day: state.day,
    dateKey: state.dateKey,
    objective: state.objective,
    partner: selected && selected.partner,
    player: selected && selected.player,
    partnerSide: selected && selected.partnerSide,
    selectedSlot: selected,
    slots,
    maxSlots: MAX_FRIEND_CONTRACTS,
    availableSlots: slots.filter((slot) => !slot.started && !["completed", "expired", "fallback"].includes(slot.status)),
    startedSlots: slots.filter((slot) => slot.started && !["completed", "expired", "fallback"].includes(slot.status)),
    activeSlots: slots.filter((slot) => !["completed", "expired", "fallback"].includes(slot.status)).length,
    completed,
    expired,
    waitingPartner: slots.some((slot) => slot.status === "awaiting_partner"),
    fallbackReady: false,
    canCompletePlayer: slots.some((slot) => ["open", "awaiting_player"].includes(slot.status) && !slot.player.completed),
    history: state.history
  };
}
function friendContractStatus(reserve = {}, friends = [], now = Date.now(), selectedSlotId = "") {
  return statusForState(ensureFriendContract(reserve, friends, now), now, selectedSlotId);
}
function startFriendContract(reserve = {}, friends = [], now = Date.now(), partnerId = "") {
  const status = friendContractStatus(reserve, friends, now, partnerId);
  const state = status.state;
  const selectedId = status.selectedSlot && status.selectedSlot.id;
  const slot = (state.slots || []).find((item) => item.id === selectedId) || (state.slots || [])[0];
  if (!slot) return { ok: false, reason: "missing", status };
  if (!slot.partner || slot.partner.kind !== "player") {
    return { ok: false, reason: "real_friend_required", slot, status };
  }
  if (["completed", "expired"].includes(slot.status)) {
    return { ok: false, reason: "completed", slot, status };
  }
  if (slot.started !== false) {
    return { ok: true, alreadyStarted: true, slot, status };
  }
  const stamp = Number(now) || Date.now();
  slot.started = true;
  slot.startedAt = stamp;
  slot.expiresAt = stamp + CONTRACT_EXPIRY_MS;
  // The initiator's confirmation is their contribution.  From this point the
  // contract only waits for the selected friend to execute it; there is no
  // second local "complete my operation" step.
  slot.player = { completed: true, action: "contract_sent", contribution: 1, completedAt: stamp };
  slot.status = "awaiting_partner";
  state.history = (state.history || []).concat(Object.assign({
    type: "started",
    direction: "sent",
    id: state.id,
    slotId: slot.id,
    partnerKind: slot.partner && slot.partner.kind,
    day: state.day,
    dateKey: state.dateKey,
    objective: state.objective && state.objective.id,
    startedAt: stamp
  }, historyPartnerFields(slot))).slice(-60);
  syncLegacyAliases(state);
  reserve.friendContract = state;
  return { ok: true, started: true, slot, status: statusForState(state, stamp, slot.id) };
}
function applyContractReward(reserve = {}, objective = {}, slot = {}) {
  if (!reserve || !objective || !slot || slot.rewardClaimed) {
    return { applied: false, reward: slot && slot.reward ? slot.reward : null };
  }
  const reward = objective.reward || {};
  const applied = { fund: 0, supplies: {}, collection: {} };
  const requestedFund = n(reward.fund);
  if (requestedFund) {
    const before = n(reserve.fund);
    reserve.fund = before + requestedFund;
    recordFundChange(
      reserve,
      before,
      reserve.fund,
      "好友合同奖励",
      ((reserve.guardianCycle || {}).day) || 0,
      objective.label || "好友合同完成"
    );
    applied.fund = requestedFund;
  }
  Object.entries(reward.supplies || {}).forEach(([id, amount]) => {
    const accepted = addSupply(reserve, id, n(amount));
    if (accepted) applied.supplies[id] = accepted;
  });
  Object.entries(reward.collection || {}).forEach(([id, amount]) => {
    const accepted = addPendingRecovered(reserve, id, n(amount));
    if (accepted) applied.collection[id] = accepted;
  });
  slot.rewardClaimed = true;
  slot.reward = applied;
  return { applied: true, reward: applied };
}
function completeFriendContractSide(reserve = {}, friends = [], side = "player", action = "", now = Date.now(), partnerId = "") {
  const status = friendContractStatus(reserve, friends, now, partnerId);
  const state = status.state;
  const selectedId = status.selectedSlot && status.selectedSlot.id;
  const slot = (state.slots || []).find((item) => item.id === selectedId) || (state.slots || [])[0];
  if (!slot) return { ok: false, reason: "missing", status };
  const objective = state.objective || chooseContract(state.day);
  const stamp = Number(now) || Date.now();
  const actor = side === "partner" ? "partnerSide" : "player";
  if (["completed", "expired"].includes(slot.status)) return { ok: false, reason: "completed", status };
  if (!slot.started || !slot.partner || slot.partner.kind !== "player") {
    return { ok: false, reason: "not_started", status };
  }
  if (slot[actor].completed) return { ok: false, reason: "already_completed", status };
  slot[actor] = { completed: true, action: String(action || objective.action).slice(0, 32), contribution: 1, completedAt: stamp };
  state.history = (state.history || []).concat(Object.assign({
    type: side === "partner" ? "partner_completed" : "player_completed",
    direction: side === "partner" ? "received" : "sent",
    id: state.id,
    slotId: slot.id,
    day: state.day,
    dateKey: state.dateKey,
    objective: objective.id,
    action: slot[actor].action,
    contribution: 1,
    completedAt: stamp
  }, historyPartnerFields(slot))).slice(-60);
  if (slot.player.completed && slot.partnerSide.completed) {
    slot.status = "completed";
    slot.resolution = "friend_confirmed";
    slot.completedAt = stamp;
  } else if (slot.player.completed) {
    slot.status = "awaiting_partner";
  } else if (slot.partnerSide.completed) {
    slot.status = "awaiting_player";
  }
  if (slot.status === "completed") {
    const rewardResult = applyContractReward(reserve, objective, slot);
    state.history = (state.history || []).concat(Object.assign({
      type: "completed",
      direction: "both",
      id: state.id,
      slotId: slot.id,
      day: state.day,
      dateKey: state.dateKey,
      objective: objective.id,
      resolution: slot.resolution,
      reward: rewardResult.reward,
      rewardText: friendContractRewardText(rewardResult.reward),
      completedAt: stamp
    }, historyPartnerFields(slot))).slice(-60);
  }
  syncLegacyAliases(state);
  reserve.friendContract = state;
  return {
    ok: true,
    side,
    slot,
    state,
    reward: slot.reward,
    rewardText: friendContractRewardText(slot.reward || objective.reward),
    status: statusForState(state, stamp, slot.id)
  };
}
function expireFriendContract(reserve = {}, friends = [], now = Date.now(), force = false, partnerId = "") {
  const status = friendContractStatus(reserve, friends, now, partnerId);
  const state = status.state;
  const selectedId = status.selectedSlot && status.selectedSlot.id;
  const slot = (state.slots || []).find((item) => item.id === selectedId)
    || (state.slots || []).find((item) => ["open", "awaiting_player", "awaiting_partner"].includes(item.status));
  if (slot && slot.status === "expired") {
    return { ok: true, expired: true, slot, reward: null, rewardText: "", status };
  }
  if (!slot || slot.status === "completed") {
    return { ok: false, reason: "not_expired", status };
  }
  const stamp = Number(now) || Date.now();
  if (!force && (!slot.expiresAt || stamp < slot.expiresAt)) {
    return { ok: false, reason: "waiting", status };
  }
  expireSlots(state, stamp);
  const expiredSlot = (state.slots || []).find((item) => item.id === slot.id) || slot;
  if (expiredSlot.status !== "expired") {
    return { ok: false, reason: "not_expired", status };
  }
  syncLegacyAliases(state);
  reserve.friendContract = state;
  return { ok: true, expired: true, slot: expiredSlot, reward: null, rewardText: "", status: statusForState(state, stamp, expiredSlot.id) };
}
// Deprecated compatibility name. It now expires a contract and never creates
// an NPC result or grants a reward.
const settleFriendContractFallback = expireFriendContract;
function friendContractHistory(reserve = {}) {
  return normalizeFriendContract(reserve).history || [];
}

function claimReceivedFriendContractReward(reserve = {}, objectiveId = "", remoteId = "", partner = {}, now = Date.now()) {
  const state = normalizeFriendContract(reserve, now);
  const receiptId = String(remoteId || "").slice(0, 80);
  if (!receiptId) return { ok: false, reason: "missing" };
  const previous = (state.history || []).find((entry) => entry.type === "received_completed" && entry.remoteId === receiptId);
  if (previous) return { ok: true, alreadyClaimed: true, reward: previous.reward, rewardText: previous.rewardText };
  const objective = CONTRACTS.find((item) => item.id === objectiveId) || chooseContract(state.day);
  const rewardSlot = { rewardClaimed: false, reward: null };
  const rewardResult = applyContractReward(reserve, objective, rewardSlot);
  const stamp = Number(now) || Date.now();
  const rewardText = friendContractRewardText(rewardResult.reward);
  state.history = (state.history || []).concat({
    type: "received_completed",
    direction: "received",
    id: state.id,
    remoteId: receiptId,
    partnerId: String(partner.id || "").slice(0, 48),
    partnerName: String(partner.name || "好友").slice(0, 16),
    nickName: String(partner.nickName || partner.nickname || "").trim().slice(0, 16),
    worldPlayerId: String(partner.worldPlayerId || partner.publicId || "").replace(/^cloud_/, "").slice(0, 32),
    friendMatchKey: /^[a-f0-9]{64}$/.test(String(partner.friendMatchKey || "")) ? String(partner.friendMatchKey) : "",
    day: state.day,
    dateKey: dateKeyOf(stamp),
    objective: objective.id,
    reward: rewardResult.reward,
    rewardText,
    completedAt: stamp
  }).slice(-60);
  reserve.friendContract = syncLegacyAliases(state);
  return { ok: true, reward: rewardResult.reward, rewardText };
}

module.exports = {
  CONTRACTS,
  CONTRACT_EXPIRY_MS,
  PARTNER_FALLBACK_MS,
  MAX_FRIEND_CONTRACTS,
  dateKeyOf,
  normalizeFriendContract,
  ensureFriendContract,
  friendContractStatus,
  startFriendContract,
  completeFriendContractSide,
  expireFriendContract,
  settleFriendContractFallback,
  friendContractHistory,
  friendContractRewardText,
  claimReceivedFriendContractReward
};
