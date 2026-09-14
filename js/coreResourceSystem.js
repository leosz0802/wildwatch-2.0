const { habitatCapacitySnapshot } = require("./ecologyConsistency");
const { recordFundChange } = require("./fundLedger");

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
}

function facilityStage(reserve, id) {
  const site = ((((reserve || {}).facilityConstruction || {}).sites || {})[id]) || {};
  return Math.max(site.buildStage || 0, site.collectionStage || 0);
}

function syncCoreResources(reserve, options = {}) {
  const previous = reserve.coreResources || {};
  const capacity = habitatCapacitySnapshot(reserve);
  const cycle = reserve.guardianCycle || {};
  const energy = options.afterAction
    ? Math.max(0, 2 - (cycle.actionIndex || 0))
    : Math.max(0, 3 - (cycle.actionIndex || 0));
  const communityBase = Math.round(((reserve.reputation || 50) * 0.65) + ((((reserve.social || {}).coop) || 40) * 0.35));
  reserve.coreResources = {
    version: 1,
    energy,
    energyMax: 3,
    fund: Math.max(0, Math.round(reserve.fund || 0)),
    capacity: capacity.effectiveCapacity,
    population: capacity.totalPopulation,
    capacityLoad: Math.round(capacity.loadRatio * 100),
    community: clamp(Number.isFinite(previous.community) ? previous.community : communityBase),
    communityIncome: previous.communityIncome || 0
  };
  return reserve.coreResources;
}

function prepareCoreAction(reserve, action) {
  const core = syncCoreResources(reserve);
  return { energySpent: 1, chanceBonus: 0 };
}

// 第一阶段的行动成本必须和预览、结算共用同一套章节经济配置。
// 目前只有会直接改造环境的两类行动消耗保护基金；侦察、驱赶和探索仍只消耗对应补给。
function applyChapterActionCost(reserve, action) {
  const chapter = Math.max(1, Math.round((((reserve || {}).progression || {}).level) || 1));
  const economy = require("./balanceConfig").chapterEconomy(chapter);
  const cost = action === "habitat" ? Math.max(0, Math.round(economy.habitatCost || 0))
    : action === "intervention" ? Math.max(0, Math.round(economy.interventionCost || 0)) : 0;
  const before = Math.max(0, Math.round((reserve || {}).fund || 0));
  const after = Math.max(0, before - cost);
  if (reserve && cost > 0) {
    reserve.fund = after;
    recordFundChange(reserve, before, after, "生态行动投入", ((reserve.guardianCycle || {}).day || 0), `${action === "habitat" ? "栖息地修复" : "生态干预"}行动成本`);
  }
  return { action, chapter, cost, fundBefore: before, fundAfter: after, insufficient: before < cost };
}

function settleCoreResources(reserve, action, context = {}) {
  const core = syncCoreResources(reserve, { afterAction: true });
  if (context.dayClosed) core.energy = core.energyMax;
  const communityDelta = action === "habitat" ? 2 : action === "intervention" ? 1 : action === "antiPoacher" ? -1 : 0;
  core.community = clamp(core.community + communityDelta);
  core.communityIncome = 0;
  if (context.dayClosed) {
    core.communityIncome = Math.max(0, Math.floor((core.community - 50) / 12) * 5);
    const beforeFund = Math.max(0, Math.round(reserve.fund || 0));
    reserve.fund = Math.max(0, Math.round(beforeFund + core.communityIncome));
    recordFundChange(reserve, beforeFund, reserve.fund, "社区合作收入", (reserve.guardianCycle || {}).day, "守护日社区分成");
  }
  core.fund = reserve.fund;
  reserve.coreResources = core;
  return core;
}

function resolveEcologyChain(reserve, beforeReserve, context = {}) {
  const old = reserve.ecologyChain || { id: "water_food_predator", stage: 0, history: [] };
  const beforeEco = (beforeReserve || {}).ecology || {};
  const eco = reserve.ecology || {};
  const beforeCapacity = habitatCapacitySnapshot(beforeReserve || reserve);
  const capacity = habitatCapacitySnapshot(reserve);
  let stage = old.stage || 0;
  let title = old.title || "生态链尚未启动";
  let message = old.message || "修复水源后，动物变化会在后续守护日逐步传导。";
  let pressure = old.patrolPressure || 0;
  const waterGain = (eco.water || 0) - (beforeEco.water || 0);
  const herbivoreGain = capacity.herbivores - beforeCapacity.herbivores;
  const predatorGain = capacity.predators - beforeCapacity.predators;
  const observationReady = facilityStage(reserve, "migration_watch") >= 2;

  if (stage === 0 && waterGain >= 3) {
    stage = 1; title = "水源恢复"; message = "新水线开始吸引食草动物；下一守护日留意种群增长。";
  } else if (context.dayClosed && stage === 1) {
    const herd = eco.herbivores || {};
    const key = Object.keys(herd).sort((a, b) => (herd[b] || 0) - (herd[a] || 0))[0];
    if (key) herd[key] = (herd[key] || 0) + 1;
    stage = 2; title = "食草动物回流"; message = "水源带回了食草动物，充足猎物正在吸引捕食者。";
  } else if (context.dayClosed && stage === 2) {
    const predators = eco.predators || {};
    const key = Object.keys(predators).sort((a, b) => (predators[b] || 0) - (predators[a] || 0))[0];
    if (key) predators[key] = (predators[key] || 0) + 1;
    stage = 3; title = "捕食者迁入"; message = "捕食者沿猎物路线进入，巡护盲区与冲突风险开始增加。";
  } else if (context.dayClosed && stage === 3) {
    pressure = Math.min(10, pressure + 4);
    reserve.poacherPressure = Math.min(100, (reserve.poacherPressure || 0) + (observationReady ? 1 : 4));
    stage = observationReady ? 5 : 4;
    title = observationReady ? "观测站接住了变化" : "巡护压力上升";
    message = observationReady ? "迁徙观测站提前标出捕食者路线，新增压力已被控制。" : "动物路线变复杂，需要建设迁徙观测站来消除巡护盲区。";
  } else if (stage === 4 && observationReady) {
    stage = 5; pressure = Math.max(0, pressure - 3); title = "生态链进入可控状态"; message = "迁徙观测站开始预告捕食者与食草动物的交汇位置。";
  } else if (herbivoreGain > 0 && stage < 2) {
    stage = 2; title = "食草动物增长"; message = "承载改善带来种群增长，捕食者可能在后续守护日迁入。";
  } else if (predatorGain > 0 && stage < 3) {
    stage = 3; title = "捕食者迁入"; message = "猎物增长吸引捕食者，巡护路线即将变复杂。";
  }
  const changed = stage !== (old.stage || 0);
  const chain = { id: "water_food_predator", stage, title, message, patrolPressure: pressure, observationRequired: stage === 4, observationReady,
    flow: ["修复水源", "食草动物增加", "捕食者迁入", "巡护压力上升", "建设观测站"],
    history: changed ? (old.history || []).concat({ stage, title, day: context.day || 0 }).slice(-8) : (old.history || []) };
  reserve.ecologyChain = chain;
  return chain;
}

module.exports = { syncCoreResources, prepareCoreAction, applyChapterActionCost, settleCoreResources, resolveEcologyChain };
