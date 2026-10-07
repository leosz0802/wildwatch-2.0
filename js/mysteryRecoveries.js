const { addPendingRecovered } = require("./resourceLedger");
const MYSTERY_RECOVERY_CATALOG = [
  {
    id: "whiteRhinoHornEvidence",
    name: "白犀牛角证物",
    source: "白犀牛",
    rarity: "超等级·传奇证物",
    icon: "claw",
    minChapter: 1,
    minStoryStep: 1,
    minActions: 8,
    minPoacher: 46,
    minEnforcement: 44,
    actions: ["houndScout", "antiPoacher"],
    baseChance: 0.018,
    pityAt: 30,
    fundReward: 180,
    reputationReward: 6,
    enforcementReward: 5,
    poacherReduction: 7,
    story: "猎犬在一条不属于本地物种的运输气味线上停住。联合执法确认：这是一件跨区追回的白犀牛角证物。",
    archive: "白犀牛尚未出现在本地物种表中，但跨区偷猎链可能提前穿过任何等级的保护区。"
  },
  {
    id: "ivoryEvidence",
    name: "象牙证物",
    source: "大象",
    rarity: "超等级·传奇证物",
    icon: "reserve_prosperity",
    minChapter: 2,
    minStoryStep: 2,
    minActions: 16,
    minPoacher: 48,
    minEnforcement: 50,
    actions: ["antiPoacher", "houndScout"],
    baseChance: 0.015,
    pityAt: 32,
    fundReward: 220,
    reputationReward: 7,
    enforcementReward: 6,
    poacherReduction: 8,
    story: "边界拦截点发现一只被反复转运的密封箱。编号与旧案吻合，里面是等待归档的象牙证物。",
    archive: "即使大象尚未迁入本地，跨境运输线也可能让象牙案件提前进入你的剧情。"
  },
  {
    id: "pangolinScaleEvidence",
    name: "穿山甲鳞片证物",
    source: "穿山甲",
    rarity: "超等级·神秘证物",
    icon: "trail",
    minChapter: 1,
    minStoryStep: 2,
    minActions: 12,
    minPoacher: 40,
    minEnforcement: 46,
    actions: ["houndScout", "antiPoacher", "habitat"],
    baseChance: 0.021,
    pityAt: 28,
    fundReward: 150,
    reputationReward: 5,
    enforcementReward: 4,
    poacherReduction: 6,
    story: "修复线旁的旧包裹带着陌生泥土气味。鉴定结果指向一条未公开的穿山甲走私链。",
    archive: "它来自物种表之外的暗线，提醒保护区：看不见的动物也可能正在被你的行动保护。"
  },
  {
    id: "blackMarketLedger",
    name: "跨区黑市账本",
    source: "联合执法线索",
    rarity: "超等级·唯一证物",
    icon: "eye",
    minChapter: 3,
    minStoryStep: 4,
    minActions: 28,
    minPoacher: 42,
    minEnforcement: 60,
    actions: ["antiPoacher", "houndScout"],
    baseChance: 0.012,
    pityAt: 36,
    fundReward: 260,
    reputationReward: 8,
    enforcementReward: 8,
    poacherReduction: 10,
    story: "一张被雨水泡开的纸页串起多个保护区的异常脚印。它不是商品，而是一整条黑市链的入口。",
    archive: "账本会把前面追回的零散证物连接成跨区案件，并开启更高强度的执法叙事。"
  }
];
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function normalizeMysteryEvidence(saved) {
  const base = saved || {};
  return {
    evidence: Object.assign({}, base.evidence || {}),
    discovered: Object.assign({}, base.discovered || {}),
    history: (base.history || []).slice(-20),
    checksSinceLast: Math.max(0, Math.round(base.checksSinceLast || 0)),
    failedEligibleChecks: Math.max(0, Math.round(base.failedEligibleChecks || 0)),
    lastDiscovery: base.lastDiscovery ? Object.assign({}, base.lastDiscovery) : null
  };
}
function mysteryEvidenceCount(reserve) {
  const state = normalizeMysteryEvidence(reserve && reserve.mysteryEvidence);
  return Object.keys(state.evidence).reduce((sum, key) => sum + Math.max(0, state.evidence[key] || 0), 0);
}
function recoveryEligibility(entry, reserve, context) {
  const progression = reserve.progression || {};
  const eventChain = reserve.eventChain || {};
  const chapter = Math.max(1, progression.level || 1);
  const storyStep = Math.max(0, eventChain.step || 0);
  const totalActions = Math.max(0, context.totalActions || progression.totalActions || 0);
  const poacher = reserve.poacherPressure || 0;
  const enforcement = reserve.enforcement || 0;
  return {
    eligible: chapter >= entry.minChapter
      && storyStep >= entry.minStoryStep
      && totalActions >= entry.minActions
      && poacher >= entry.minPoacher
      && enforcement >= entry.minEnforcement
      && entry.actions.includes(context.action),
    chapter,
    storyStep,
    totalActions,
    poacher,
    enforcement
  };
}
function mysteryRecoveryChance(entry, eligibility, state) {
  const pressureBonus = clamp((eligibility.poacher - entry.minPoacher) * 0.0012, 0, 0.018);
  const enforcementBonus = clamp((eligibility.enforcement - entry.minEnforcement) * 0.0008, 0, 0.012);
  const storyBonus = clamp((eligibility.storyStep - entry.minStoryStep) * 0.002, 0, 0.008);
  const pityBonus = clamp(Math.max(0, state.failedEligibleChecks - 10) * 0.0015, 0, 0.055);
  return clamp(entry.baseChance + pressureBonus + enforcementBonus + storyBonus + pityBonus, entry.baseChance, 0.12);
}
function rollMysteryRecovery(reserve, context = {}, random = Math.random) {
  const state = normalizeMysteryEvidence(reserve.mysteryEvidence);
  state.checksSinceLast += 1;
  const candidates = MYSTERY_RECOVERY_CATALOG.map((entry) => ({
    entry,
    gate: recoveryEligibility(entry, reserve, context)
  })).filter((candidate) => !state.discovered[candidate.entry.id] && candidate.gate.eligible);
  if (!candidates.length) {
    reserve.mysteryEvidence = state;
    return null;
  }
  const candidateIndex = Math.min(candidates.length - 1, Math.floor(clamp(random(), 0, 0.999999) * candidates.length));
  const chosen = candidates[candidateIndex];
  const chance = mysteryRecoveryChance(chosen.entry, chosen.gate, state);
  const guaranteed = state.failedEligibleChecks >= chosen.entry.pityAt;
  const roll = clamp(random(), 0, 0.999999);
  if (!guaranteed && roll >= chance) {
    state.failedEligibleChecks += 1;
    reserve.mysteryEvidence = state;
    return null;
  }
  const entry = chosen.entry;
  const day = Math.max(1, context.day || 1);
  const discovery = {
    id: entry.id,
    name: entry.name,
    source: entry.source,
    rarity: entry.rarity,
    icon: entry.icon,
    day,
    chapter: chosen.gate.chapter,
    storyStep: chosen.gate.storyStep,
    chance: Math.round(chance * 1000) / 10,
    guaranteed,
    action: context.action,
    story: entry.story,
    archive: entry.archive,
    fundReward: entry.fundReward,
    reputationReward: entry.reputationReward,
    enforcementReward: entry.enforcementReward,
    poacherReduction: entry.poacherReduction,
    trigger: `第${chosen.gate.chapter}章·剧情${chosen.gate.storyStep} / 偷猎${chosen.gate.poacher} / 执法${chosen.gate.enforcement}`
  };
  state.evidence[entry.id] = (state.evidence[entry.id] || 0) + 1;
  state.discovered[entry.id] = true;
  state.history = state.history.concat(discovery).slice(-20);
  state.lastDiscovery = discovery;
  state.checksSinceLast = 0;
  state.failedEligibleChecks = 0;
  reserve.mysteryEvidence = state;
  addPendingRecovered(reserve, "recoveredTrap", 1);
  reserve.reputation = clamp((reserve.reputation || 0) + entry.reputationReward, 0, 100);
  reserve.enforcement = clamp((reserve.enforcement || 0) + entry.enforcementReward, 0, 100);
  reserve.poacherPressure = clamp((reserve.poacherPressure || 0) - entry.poacherReduction, 0, 100);
  reserve.progression = Object.assign({}, reserve.progression || {}, {
    totalMysteryRecovered: Math.max(0, ((reserve.progression || {}).totalMysteryRecovered || 0) + 1)
  });
  return discovery;
}
function mysteryRecoveryById(id) {
  return MYSTERY_RECOVERY_CATALOG.find((entry) => entry.id === id) || null;
}
module.exports = {
  MYSTERY_RECOVERY_CATALOG,
  normalizeMysteryEvidence,
  mysteryEvidenceCount,
  rollMysteryRecovery,
  mysteryRecoveryById
};
