const { regions, syncKnownCharactersForReserve } = require("./world");
const { runForestDirector } = require("./forestDirector");
const { reserveActionMeta: catalogReserveActionMeta, supplyPurchaseById, supplyPurchaseForQuantity, supplyReplenishmentPlan } = require("./actions");
const { buildReserveView } = require("./reserveView");
const { normalizeMysteryEvidence, mysteryEvidenceCount, rollMysteryRecovery } = require("./mysteryRecoveries");
const { normalizeStrategyState, recordStrategicAction, maybePrepareStrategicDilemma } = require("./strategySystem");
const { resolveMaterialExploration } = require("./materialExploration");
const { normalizeGuardianPromises, applyGuardianPromiseAction, maybePrepareGuardianPromise } = require("./guardianPromises");
const { parseOperationPlan, applyOperationPlan } = require("./actionOperations");
const { applySeasonDynamics } = require("./seasonSystem");
const { applyFacilityOperationalEffects } = require("./reserveFacilities");
const { normalizeEcologyEconomy, applyAnimalEcologyEconomy } = require("./ecologyEconomy");
const { applyGoalProgress } = require("./goalSystem");
const { eventStepGuidance } = require("./storyGuidance");
const { addPendingRecovered, addSupply } = require("./resourceLedger");
const {
  guardianContext,
  guardianSeason,
  advanceGuardianCycle,
  awardKeyActionMastery,
  normalizeMastery,
  masteryView,
  applyNamedAnimalSchedule
} = require("./guardianCycle");
const {
  BALANCE_V2,
  chapterEconomy,
  progressionGate,
  metricGainMultiplier,
  poacherReductionMultiplier,
  levelOf
} = require("./balanceConfig");
const {
  habitatCapacitySnapshot,
  habitatMigrationAssessment,
  consistentMigrationSnapshot
} = require("./ecologyConsistency");
const {
  SPECIES_DB,
  getUnlockedSpecies,
  speciesPopulation,
  speciesPopulationGroup,
  reconcileSpeciesPopulations
} = require("./animalWorld");

function clamp(value) {
  return Math.max(0, Math.min(100, value));
}

function clampRange(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function numberOr(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

const CHAPTER_PROGRESSION_GATES = BALANCE_V2.progression;
const BALANCE = {
  dailySafetyPressure: 2,
  difficulty: {
    houndScout: 2,
    antiPoacher: 3,
    habitat: 2,
    intervention: 3,
    exploreMaterials: 2,
    salvage: 2,
    buySupplies: 1,
    patrol: 2
  }
};

function applyActionResourceRhythm(reserve, action, dailyGoalDone, operationSucceeded = true, goalRewardsApplied = false) {
  reserve.actionRhythm = {
    action,
    shiftGain: 0,
    permitGain: 0,
    goalReward: !!dailyGoalDone,
    note: operationSucceeded ? "行动完成，水源、草场与动物状态已重新结算。" : "行动未完全成功，可更换补给或路线后再试。"
  };
  return reserve.actionRhythm;
}

function reserveEcologyScore(reserve) {
  const eco = reserve.ecology || {};
  const migration = (reserve.migration && reserve.migration.delta) || 0;
  return clamp(Math.round(
    (numberOr(eco.water, 60) * 0.42) +
    (numberOr(eco.grass, 60) * 0.42) +
    ((100 - numberOr(eco.disease, 10)) * 0.12) +
    (clampRange(50 + migration * 5, 0, 100) * 0.04)
  ));
}

function reserveBusinessScore(reserve) {
  if (typeof reserve.business === "number") return clamp(Math.round(reserve.business));
  return clamp(Math.round(
    ((reserve.enforcement || 48) * 0.35) +
    ((reserve.reputation || 50) * 0.28) +
    (Math.min(100, (reserve.fund || 0) / 14) * 0.22) +
    (((reserve.base && reserve.base.shield) || 40) * 0.15)
  ));
}

function reserveRankReward(reserve) {
  const league = reserve.league || {};
  const base = reserve.base || {};
  const total = Math.max(1, league.totalRanks || 10000);
  const rank = Math.max(1, league.worldRank || base.rank || total);
  const percentile = Math.min(1, rank / total);
  const tier = BALANCE_V2.rankRewards.find((item) => percentile <= item.max) || BALANCE_V2.rankRewards[BALANCE_V2.rankRewards.length - 1];
  return tier.value;
}

function applyDailyReserveEconomy(reserve, action) {
  const ecology = reserveEcologyScore(reserve);
  reserve.ecologyScore = ecology;
  reserve.lastDailyEconomy = {
    income: 0,
    maintenance: 0,
    baseMaintenance: 0,
    chapterMaintenance: 0,
    reserveScaleMaintenance: 0,
    net: 0,
    rankReward: 0,
    ecology,
    skipped: true,
    note: "基金只通过回收物移交获得，只用于采购巡护补给。"
  };
  return reserve.lastDailyEconomy;
}

function actionDifficulty(action) {
  return BALANCE.difficulty[action] || 2;
}

function actionSuccessGain(difficulty) {
  return 4 + difficulty * 2;
}

function actionFailureLoss(difficulty) {
  return difficulty * 2;
}

function actionUnhandledLoss(difficulty) {
  return 2 + difficulty * 2;
}

function houndAttributeForAction(team, action) {
  const attr = {
    houndScout: team.tracking,
    antiPoacher: Math.round(((team.pursuit || 45) + (team.guard || 42)) / 2),
    habitat: Math.round(((team.tracking || 48) + (team.cohesion || 52)) / 2),
    intervention: Math.round(((team.tracking || 48) + (team.pursuit || 45)) / 2),
    exploreMaterials: Math.round(((team.tracking || 48) + (team.cohesion || 52)) / 2),
    salvage: team.tracking,
    buySupplies: team.cohesion,
    patrol: team.tracking
  }[action];
  return clampRange(Math.round((attr || 48) / 8), 1, 10);
}

function houndSuccessChance(reserve, action, materialSupport, difficulty) {
  const team = reserve.houndTeam || {};
  const attr = houndAttributeForAction(team, action);
  const level = Math.max(1, team.level || 1);
  const supplyBonus = materialSupport >= 1 && action !== "buySupplies" ? 8 : 0;
  const fatigue = (team.stamina || 70) < 30 ? 15 : 0;
  return clampRange(Math.round(50 + attr * 4 + level * 2 - difficulty * 5 + supplyBonus - fatigue), 30, 92);
}

function actionAuthorizationPlan(reserve, action, location) {
  const poacher = reserve.poacherPressure || 0;
  const ecology = reserve.ecology || {};
  const needsPermit = false;
  const usesIntel = false;
  const focus = action === "antiPoacher"
    ? (poacher >= 55 ? "高危边界" : "常规边界")
    : action === "intervention"
      ? ((ecology.grass || 0) < 48 || (ecology.disease || 0) > 28 ? "高风险生态" : "许可生态")
      : action === "houndScout"
        ? "线索采集"
        : action === "habitat"
          ? "栖息地修复"
          : action === "salvage"
            ? "合规回收"
            : action === "buySupplies" ? "后勤补给" : "巡护";
  const hasPermit = true;
  const hasIntel = true;
  const precision = action === "houndScout" ? "搜查" : "常规";
  const eventPressure = Math.max(0, Math.round(
    (poacher >= 55 ? 2 : 0)
    + (((ecology.water || 60) < 48 || (ecology.grass || 60) < 48) ? 1 : 0)
    + (action === "intervention" ? 1 : 0)
  ));
  return {
    focus,
    location,
    needsPermit,
    permitAvailable: hasPermit,
    permitUsed: false,
    usesIntel,
    intelAvailable: hasIntel,
    intelUsed: false,
    precision,
    eventPressure,
    chanceBonus: 0,
    reason: `${focus}由具体巡护补给和现场路线决定结果。`
  };
}

function reserveActionOutcome(reserve, action, materialSupport, authorization = null) {
  const difficulty = actionDifficulty(action);
  const configuredBase = { houndScout: 70, antiPoacher: 65, habitat: 80, intervention: 68, buySupplies: 100, salvage: 100 }[action];
  const baseChance = Number.isFinite(configuredBase) ? configuredBase : houndSuccessChance(reserve, action, materialSupport, difficulty);
  const permitPenalty = authorization && authorization.needsPermit && !authorization.permitAvailable ? -12 : 0;
  const intelPenalty = authorization && authorization.usesIntel && !authorization.intelAvailable ? -8 : 0;
  const supportBonus = materialSupport > 0 && ["houndScout", "antiPoacher", "intervention"].includes(action) ? 4 : 0;
  const successChance = clampRange(baseChance + permitPenalty + intelPenalty + supportBonus, 30, 100);
  const roll = Math.round(Math.random() * 100);
  const success = roll <= successChance;
  const mainGain = actionSuccessGain(difficulty);
  const failureLoss = actionFailureLoss(difficulty);
  const unhandledLoss = actionUnhandledLoss(difficulty);
  return {
    difficulty,
    successChance,
    roll,
    success,
    mainGain,
    failureLoss,
    unhandledLoss,
    authorization,
    effectiveGain: success ? mainGain : Math.max(2, Math.round(mainGain * 0.42))
  };
}

function consumeActionPoint(reserve, action) {
  // V3：班次不再是玩家资源。保留函数以兼容旧调用，但不再扣减。
  return 0;
}

function normalizeResourceAging(reserve) {
  const source = reserve.resourceAging || {};
  reserve.resourceAging = {
    intelIdleActions: Math.max(0, Math.round(source.intelIdleActions || 0)),
    pendingAges: Object.assign({}, source.pendingAges || {}),
    recoveryCooldown: Math.max(0, Math.round(source.recoveryCooldown || 0)),
    highFundActions: Math.max(0, Math.round(source.highFundActions || 0)),
    exchangeCooldowns: Object.assign({ fieldNote: 0, migrationTrace: 0, forestGift: 0 }, source.exchangeCooldowns || {})
  };
  return reserve.resourceAging;
}

function maybeApplyEmergencyRecovery(reserve) {
  const aging = normalizeResourceAging(reserve);
  const supplies = Object.values(reserve.supplies || {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  const inventory = Object.values(reserve.inventory || {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  const pending = Object.values(reserve.pendingRecovered || {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  const stranded = (reserve.fund || 0) <= 0 && supplies <= 0 && inventory <= 0 && pending <= 0;
  if (!stranded || aging.recoveryCooldown > 0) return null;
  const scale = BALANCE_V2.tuning.recoveryScale;
  addPendingRecovered(reserve, "researchSample", 1);
  reserve.poacherPressure = clamp((reserve.poacherPressure || 0) + 2);
  aging.recoveryCooldown = BALANCE_V2.resourceAging.recoveryCooldownActions;
  reserve.lastEmergencyRecovery = { pending: "researchSample", poacherPressure: 2 };
  return reserve.lastEmergencyRecovery;
}

function applyResourceAging(reserve, before) {
  const aging = normalizeResourceAging(reserve);
  aging.recoveryCooldown = Math.max(0, aging.recoveryCooldown - 1);
  Object.keys(aging.exchangeCooldowns).forEach((key) => {
    aging.exchangeCooldowns[key] = Math.max(0, Math.round(aging.exchangeCooldowns[key] || 0) - 1);
  });
  aging.intelIdleActions = 0;
  reserve.lastIntelDecay = 0;
  const beforePending = before.pendingRecovered || {};
  const pending = reserve.pendingRecovered || {};
  Object.keys(pending).forEach((key) => {
    const count = Math.max(0, Math.round(pending[key] || 0));
    if (!count) {
      delete aging.pendingAges[key];
      return;
    }
    aging.pendingAges[key] = count > Math.max(0, beforePending[key] || 0) ? 0 : Math.max(0, Math.round(aging.pendingAges[key] || 0)) + 1;
    if (aging.pendingAges[key] >= BALANCE_V2.resourceAging.pendingLifetimeActions) {
      pending[key] = Math.max(0, count - 1);
      aging.pendingAges[key] = 0;
      reserve.lastRecoveredLoss = { key, amount: 1 };
    }
  });
  const health = BALANCE_V2.fundHealth[levelOf(reserve)];
  if (reserve.highStockProject && reserve.highStockProject.active) {
    const project = reserve.highStockProject;
    project.remainingActions = Math.max(0, Math.round(project.remainingActions || project.durationActions || BALANCE_V2.highStockProject.durationActions) - 1);
    if (project.type === "boundary") {
      reserve.safety = clamp((reserve.safety || 0) + 1);
      reserve.poacherPressure = clamp((reserve.poacherPressure || 0) - 1);
    } else if (project.type === "ecology") {
      reserve.ecology.water = clamp((reserve.ecology.water || 0) + 1);
      reserve.ecology.grass = clamp((reserve.ecology.grass || 0) + 1);
    } else {
      reserve.reputation = clamp((reserve.reputation || 0) + 1);
    }
    if (project.remainingActions <= 0) {
      project.active = false;
      project.completed = true;
      project.completedAtAction = ((reserve.progression || {}).totalActions || 0) + 1;
    }
  }
  aging.highFundActions = (reserve.fund || 0) > health.high ? aging.highFundActions + 1 : 0;
  if (aging.highFundActions >= BALANCE_V2.highStockProject.triggerActions && !(reserve.highStockProject || {}).active) {
    reserve.highStockProject = { unlocked: true, active: false, cost: health.projectCost, durationActions: BALANCE_V2.highStockProject.durationActions, level: levelOf(reserve) };
  }
  return aging;
}

function activateHighStockProject(reserve, type = "ecology") {
  if (!reserve) return { ok: false, error: "保护区数据不存在" };
  const project = reserve.highStockProject || {};
  if (!project.unlocked) return { ok: false, error: "基金尚未达到专项计划门槛" };
  if (project.active) return { ok: false, error: "已有专项计划进行中" };
  const cost = BALANCE_V2.fundHealth[levelOf(reserve)].projectCost;
  if ((reserve.fund || 0) < cost) return { ok: false, error: "保护基金不足" };
  const selected = ["boundary", "ecology", "community"].includes(type) ? type : "ecology";
  reserve.fund -= cost;
  reserve.highStockProject = {
    unlocked: false,
    active: true,
    completed: false,
    type: selected,
    cost,
    durationActions: BALANCE_V2.highStockProject.durationActions,
    remainingActions: BALANCE_V2.highStockProject.durationActions
  };
  return { ok: true, type: selected, cost, durationActions: BALANCE_V2.highStockProject.durationActions };
}

function recoveredGoodValue(key, market) {
  if (key === "shedAntlerA") return Math.max(130, Math.round((market.antler || 86) * 1.45));
  if (key === "shedAntlerB") return Math.max(95, market.antler || 86);
  if (key === "naturalHide") return Math.max(145, market.hideSalvage || 124);
  if (key === "researchSample") return Math.max(60, market.researchSample || 42);
  if (key === "recoveredTrap") return 85;
  return 0;
}

function detectRecoveredGoodFromCommand(command) {
  const text = String(command || "");
  if (!/(?:只出售|只提交|只移交)/.test(text)) return "";
  if (/A级鹿角/.test(text)) return "shedAntlerA";
  if (/B级鹿角/.test(text)) return "shedAntlerB";
  if (/自然生命档案|自然死亡组织记录|自然皮样|皮样/.test(text)) return "naturalHide";
  if (/研究样本/.test(text)) return "researchSample";
  if (/陷阱证据|追回陷阱/.test(text)) return "recoveredTrap";
  return "";
}

function salvageMarketIndex(market) {
  const antler = (market.antler || 86) / 86;
  const hide = (market.hideSalvage || 124) / 124;
  const sample = (market.researchSample || 42) / 42;
  return Math.round(((antler + hide + sample) / 3) * 100) / 100;
}

function neighborReserveAverageRating(reserve) {
  const league = reserve.league || {};
  const directRivals = (league.rivals || []).filter((rival) => !rival.mine);
  const rivals = directRivals.length ? directRivals : leagueRivalsForSocial(reserve);
  if (!rivals.length) return 1100;
  return Math.round(rivals.reduce((sum, rival) => sum + (rival.rating || 1100), 0) / rivals.length);
}

function salvageEconomyModifiers(reserve, market) {
  const progression = reserve.progression || {};
  const ownLevel = clampRange(Math.round(progression.level || 1), 1, 10);
  const ownRating = (reserve.base && reserve.base.rating) || (1050 + ownLevel * 55);
  const neighborAvgRating = neighborReserveAverageRating(reserve);
  const ownLevelFactor = clampRange(1 + (ownLevel - 1) * 0.07, 0.96, 1.5);
  const neighborFactor = clampRange(1 + (ownRating - neighborAvgRating) / 1600, 0.78, 1.16);
  const marketIndex = salvageMarketIndex(market);
  const health = BALANCE_V2.fundHealth[Math.max(1, Math.min(5, ownLevel))];
  // 低基金不是免费发钱：玩家仍需先发现、收取并移交样本。这里只让
  // 项目拨款在资金断裂时更重视有效样本，形成可理解的逆风恢复路径。
  const liquidityFactor = (reserve.fund || 0) < health.danger ? 6.00
    : (reserve.fund || 0) < health.healthyMin ? 2.50 : 1;
  return {
    ownLevel,
    ownRating,
    neighborAvgRating,
    ownLevelFactor,
    neighborFactor,
    liquidityFactor,
    marketIndex,
    totalModifier: ownLevelFactor * neighborFactor * liquidityFactor
  };
}

function sellRecoveredGoodsBatch(inv, reserveOrMarket, limit = 3, preferredKey = "") {
  const reserve = reserveOrMarket && reserveOrMarket.market ? reserveOrMarket : null;
  const market = reserve ? reserve.market : (reserveOrMarket || {});
  const economy = reserve ? salvageEconomyModifiers(reserve, market) : {
    ownLevel: 1,
    ownRating: 1100,
    neighborAvgRating: 1100,
    ownLevelFactor: 1,
    neighborFactor: 1,
    marketIndex: salvageMarketIndex(market),
    totalModifier: 1
  };
  const allKeys = ["shedAntlerA", "shedAntlerB", "naturalHide", "researchSample", "recoveredTrap"];
  const order = preferredKey && allKeys.includes(preferredKey) ? [preferredKey] : allKeys;
  const sold = [];
  let baseValue = 0;
  order.forEach((key) => {
    while ((inv[key] || 0) > 0 && sold.length < limit) {
      inv[key] -= 1;
      sold.push(key);
      baseValue += recoveredGoodValue(key, market);
    }
  });
  const value = Math.max(0, Math.round(baseValue * economy.totalModifier));
  const fundingLabel = sold.length && sold.every((key) => key === "recoveredTrap")
    ? "联合执法拨款"
    : sold.includes("recoveredTrap")
      ? "研究补助 / 联合执法拨款"
      : "研究补助";
  return Object.assign({
    sold,
    baseValue,
    value,
    fundingLabel,
    note: sold.length
      ? `项目拨款 ${baseValue} × 等级 ${economy.ownLevelFactor.toFixed(2)} × 联区 ${economy.neighborFactor.toFixed(2)}${economy.liquidityFactor > 1 ? ` × 恢复 ${economy.liquidityFactor.toFixed(2)}` : ""}`
      : "没有库存，先去物资页进行动物引路探索。"
  }, economy);
}

function normalizeRecoveredProcessing(reserve) {
  const source = reserve.recoveredProcessing || {};
  reserve.recoveredProcessing = {
    version: 1,
    pending: Array.isArray(source.pending) ? source.pending.slice(-12) : [],
    history: Array.isArray(source.history) ? source.history.slice(-20) : [],
    lastSettlement: source.lastSettlement || null
  };
  return reserve.recoveredProcessing;
}

function settleRecoveredProcessing(reserve, guardianDay) {
  const processing = normalizeRecoveredProcessing(reserve);
  const matured = processing.pending.filter((entry) => (entry.dueDay || 0) <= guardianDay);
  processing.pending = processing.pending.filter((entry) => (entry.dueDay || 0) > guardianDay);
  if (!matured.length) {
    processing.lastSettlement = null;
    return null;
  }
  const fund = matured.reduce((sum, entry) => sum + Math.max(0, Math.round(entry.value || 0)), 0);
  reserve.fund = Math.max(0, Math.round((reserve.fund || 0) + fund));
  processing.lastSettlement = {
    day: guardianDay,
    fund,
    items: matured.reduce((sum, entry) => sum + (entry.count || 0), 0),
    label: "设施鉴定完成",
    note: `昨日留样完成鉴定，项目拨款 +${fund}`
  };
  processing.history = processing.history.concat(processing.lastSettlement).slice(-20);
  return processing.lastSettlement;
}

function recoveredProcessingMode(command) {
  const text = String(command || "");
  if (/设施鉴定|留样鉴定|次日拨款/.test(text)) return "appraise";
  if (/留作任务样本|案件样本|设施样本/.test(text)) return "case";
  return "immediate";
}

function processRecoveredGoods(inv, reserve, command, guardianDay) {
  const mode = recoveredProcessingMode(command);
  const preferredGood = detectRecoveredGoodFromCommand(command);
  const sale = sellRecoveredGoodsBatch(inv, reserve, 3, preferredGood);
  if (!sale.sold.length) return Object.assign({ mode, immediateFund: 0 }, sale);
  if (mode === "appraise") {
    const processing = normalizeRecoveredProcessing(reserve);
    const appraisedValue = Math.max(1, Math.round(sale.value * 1.25));
    processing.pending.push({
      id: `appraise_${guardianDay}_${processing.history.length}_${processing.pending.length}`,
      dueDay: guardianDay + 1,
      value: appraisedValue,
      count: sale.sold.length,
      goods: sale.sold.slice()
    });
    return Object.assign({}, sale, {
      mode,
      value: 0,
      immediateFund: 0,
      appraisedValue,
      dueDay: guardianDay + 1,
      fundingLabel: "设施鉴定",
      note: `留样 ${sale.sold.length} 件，明日获得项目拨款 ${appraisedValue}`
    });
  }
  if (mode === "case") {
    reserve.taskSamples = reserve.taskSamples || { submitted: 0, lastDay: 0 };
    reserve.taskSamples.submitted += sale.sold.length;
    reserve.taskSamples.lastDay = guardianDay;
    reserve.facilityCaseProgress = Math.min(99, Math.max(0, (reserve.facilityCaseProgress || 0) + sale.sold.length));
    return Object.assign({}, sale, {
      mode,
      value: 0,
      immediateFund: 0,
      caseProgress: sale.sold.length,
      fundingLabel: "案件留样",
      note: `样本推进案件与设施进度 +${sale.sold.length}`
    });
  }
  return Object.assign({}, sale, { mode, immediateFund: sale.value });
}

function getStatus(health) {
  if (health < 20) return "dying";
  if (health < 40) return "weak";
  if (health < 65) return "injured";
  return "alive";
}

function getStatusText(status) {
  return { alive: "正常", injured: "受伤", weak: "虚弱", dying: "濒危" }[status] || "正常";
}

const WEATHER_CYCLE = ["小雨", "阴", "雾", "晴"];

function weatherMod(weather) {
  switch (weather) {
    case "小雨": return { staminaCost: 3, drinkBonus: 8, scoutStamina: 0, hideStamina: 2, huntHealthRisk: 0, label: "雨冲淡了气味，饮水充足，但湿冷消耗体力" };
    case "雾":   return { staminaCost: 0, drinkBonus: 0, scoutStamina: 4, hideStamina: 3, huntHealthRisk: 0, label: "雾让侦察吃力，躲藏更易成功" };
    case "晴":   return { staminaCost: 0, drinkBonus: -3, scoutStamina: -2, hideStamina: 0, huntHealthRisk: 3, label: "晴天视野好但暴露上升，水源变少" };
    case "阴":   return { staminaCost: 0, drinkBonus: 0, scoutStamina: 0, hideStamina: 0, huntHealthRisk: 0, label: "阴天对行动无明显影响" };
    default:    return { staminaCost: 0, drinkBonus: 0, scoutStamina: 0, hideStamina: 0, huntHealthRisk: 0, label: "" };
  }
}

function nextWeather(cur) {
  const idx = WEATHER_CYCLE.indexOf(cur);
  const base = idx < 0 ? 0 : (idx + 1) % WEATHER_CYCLE.length;
  const jump = Math.random() < 0.3 ? 1 : 0;
  return WEATHER_CYCLE[(base + jump) % WEATHER_CYCLE.length];
}

const SEASON_CYCLE_DAYS = 24;
const SEASON_LENGTH = 12;

function advanceReserveSeason(reserve) {
  const absoluteDay = Math.max(1, Math.round((reserve.seasonDay || 1) + 1));
  const cycleDay = ((absoluteDay - 1) % SEASON_CYCLE_DAYS) + 1;
  const name = cycleDay <= SEASON_LENGTH ? "雨季" : "旱季";
  const previousName = (reserve.seasonState && reserve.seasonState.name) || (cycleDay === 1 ? "旱季" : name);
  const day = ((cycleDay - 1) % SEASON_LENGTH) + 1;
  reserve.seasonDay = absoluteDay;
  reserve.seasonState = { name, day, cycleDay, changed: name !== previousName };
  return reserve.seasonState;
}

function nextWeatherForSeason(current, seasonName) {
  const roll = Math.random();
  if (seasonName === "雨季") {
    if (roll < 0.46) return "小雨";
    if (roll < 0.72) return "阴";
    if (roll < 0.88) return "雾";
    return "晴";
  }
  if (roll < 0.58) return "晴";
  if (roll < 0.78) return "阴";
  if (roll < 0.90) return "雾";
  return "小雨";
}

function applySeasonEffects(reserve, seasonState, weather, action) {
  const eco = reserve.ecology || {};
  const rainy = seasonState.name === "雨季";
  const dynamics = applySeasonDynamics(reserve, seasonState);
  const effects = { water: 0, grass: 0, disease: 0, poacher: 0, predation: 0 };
  if (rainy) {
    // 雨季补水受现有水位约束。过去每个雨季日固定 +3/+5，再叠加
    // 巡护行动的无条件补水，导致水源长期锁在 85–100。高水位时雨水
    // 主要形成径流，不再继续堆高保护区水位。
    const water = clamp(numberOr(eco.water, 60));
    const rainBase = weather === "小雨" ? 5 : 3;
    const rainRetention = water >= 70 ? 0 : water >= 60 ? 0.4 : 1;
    effects.water = Math.round(rainBase * rainRetention);
    effects.grass = 2;
    effects.disease = action === "intervention" ? -3 : action === "habitat" ? 0 : dynamics.diseasePressure;
  } else {
    effects.water = action === "habitat" ? 0 : weather === "小雨" ? -1 : -2;
    effects.grass = action === "habitat" ? 0 : -2;
    effects.disease = dynamics.diseasePressure;
    effects.poacher = action === "antiPoacher" || action === "houndScout" ? 0 : 2;
    effects.predation = action === "habitat" || action === "intervention" ? 1 : 2;
  }
  eco.water = clamp(numberOr(eco.water, 60) + effects.water);
  eco.grass = clamp(numberOr(eco.grass, 60) + effects.grass);
  eco.disease = clamp(numberOr(eco.disease, 10) + effects.disease);
  const poacherPressure = numberOr(reserve.poacherPressure, 30);
  reserve.poacherPressure = clamp(poacherPressure + scaledPoacherPressureGain(poacherPressure, effects.poacher));
  reserve.lastSeasonEffect = Object.assign({ season: seasonState.name, weather, dynamics }, effects);
  return reserve.lastSeasonEffect;
}

function emergencyDefinition(type) {
  return {
    poacher_ring: {
      title: "偷猎团伙越界",
      recommendedAction: "antiPoacher",
      startBody: "多组直线脚印同时越过边界，偷猎压力会连续上升。优先驱赶偷猎者或派猎犬确认路线。"
    },
    disease_outbreak: {
      title: "疾病集中爆发",
      recommendedAction: "intervention",
      startBody: "潮湿环境中出现集中病征，疾病会压低动物种群。优先生态干预或修复栖息地。"
    }
  }[type];
}

function updateReserveEmergency(reserve, action, seasonState) {
  const emergency = reserve.emergency || (reserve.emergency = { active: null, cooldown: 0, history: [], lastOutcome: null });
  const progression = reserve.progression || {};
  const level = Math.max(1, Math.min(5, progression.level || 1));
  const totalActions = Math.max(0, progression.totalMeaningfulActions || progression.totalActions || progression.daysManaged || 0);
  const chapterActions = Math.max(0, progression.chapterActions || 0);
  const cadence = 6 + level * 2;
  emergency.history = (emergency.history || []).slice(-8);
  emergency.cooldown = Math.max(0, (emergency.cooldown || 0) - 1);
  emergency.lastOutcome = null;
  const eco = reserve.ecology || {};

  if (emergency.active) {
    const active = Object.assign({}, emergency.active);
    const correctGain = active.type === "poacher_ring"
      ? (action === "antiPoacher" ? 2 : action === "houndScout" ? 1 : 0)
      : (action === "intervention" ? 2 : action === "habitat" ? 1 : 0);
    active.progress = (active.progress || 0) + correctGain;
    if (active.progress >= active.target) {
      const outcome = {
        id: `${active.id}_resolved_${reserve.seasonDay}`,
        kind: "resolved",
        type: active.type,
        title: active.type === "poacher_ring" ? "偷猎团伙已驱离" : "疾病传播已控制",
        body: active.type === "poacher_ring"
          ? "边界路线重新闭合，动物可以逐步恢复固定活动线。"
          : "集中病征得到控制，幼体与老弱动物的风险开始回落。"
      };
      emergency.active = null;
      emergency.cooldown = cadence;
      emergency.lastOutcome = outcome;
      emergency.history = emergency.history.concat(outcome).slice(-8);
      return outcome;
    }
    active.daysRemaining = Math.max(0, (active.daysRemaining || 1) - 1);
    if (active.type === "poacher_ring") {
      reserve.poacherPressure = clamp((reserve.poacherPressure || 0) + Math.max(2, 6 - correctGain * 2));
      reserve.enforcement = clamp((reserve.enforcement || 0) - (correctGain ? 0 : 2));
    } else {
      eco.disease = clamp((eco.disease || 0) + Math.max(2, 7 - correctGain * 2));
      reserve.stability = clamp((reserve.stability || 0) - (correctGain ? 1 : 3));
    }
    if (active.daysRemaining <= 0) {
      if (active.type === "poacher_ring") reserve.poacherPressure = clamp((reserve.poacherPressure || 0) + 10);
      else eco.disease = clamp((eco.disease || 0) + 12);
      const outcome = {
        id: `${active.id}_failed_${reserve.seasonDay}`,
        kind: "failed",
        type: active.type,
        title: active.type === "poacher_ring" ? "偷猎团伙突破边界" : "疾病扩散至多个区域",
        body: active.type === "poacher_ring" ? "边界防线未能及时闭合，动物迁移线受到冲击。" : "处置窗口已经错过，多个物种将承受种群压力。"
      };
      emergency.active = null;
      emergency.cooldown = cadence + 2;
      emergency.lastOutcome = outcome;
      emergency.history = emergency.history.concat(outcome).slice(-8);
      return outcome;
    }
    emergency.active = active;
    return null;
  }

  if (emergency.cooldown > 0) return null;
  if (totalActions < 6 || chapterActions < 3) return null;
  if (typeof emergency.lastTriggerAction === "number" && totalActions - emergency.lastTriggerAction < cadence) return null;
  // Seasons now create persistent map/economy pressure themselves. Random
  // emergencies remain rare punctuation and are never the main way a season is
  // communicated to the player.
  const poacherTrigger = (reserve.poacherPressure || 0) >= 65 || (seasonState.name === "旱季" && (reserve.poacherPressure || 0) >= 48 && Math.random() < 0.10);
  const diseaseTrigger = (eco.disease || 0) >= 38 || (seasonState.name === "雨季" && (eco.disease || 0) >= 24 && Math.random() < 0.08);
  const type = poacherTrigger ? "poacher_ring" : diseaseTrigger ? "disease_outbreak" : null;
  if (!type) return null;
  const definition = emergencyDefinition(type);
  const active = {
    id: `${type}_${reserve.seasonDay}`,
    type,
    title: definition.title,
    recommendedAction: definition.recommendedAction,
    progress: 0,
    target: 3,
    daysRemaining: 3,
    startedSeason: seasonState.name
  };
  emergency.active = active;
  emergency.lastTriggerAction = totalActions;
  if (type === "poacher_ring") reserve.poacherPressure = clamp((reserve.poacherPressure || 0) + 5);
  else eco.disease = clamp((eco.disease || 0) + 5);
  const outcome = {
    id: `${active.id}_started`,
    kind: "started",
    type,
    title: definition.title,
    body: definition.startBody
  };
  emergency.lastOutcome = outcome;
  emergency.history = emergency.history.concat(outcome).slice(-8);
  return outcome;
}

function detectAction(command) {
  const text = command || "";
  if (/喝水|饮水|河|水源/.test(text)) return "drink";
  if (/捕猎|猎|攻击|伏击|鹿|兔/.test(text)) return "hunt";
  if (/休息|睡|恢复|躲在洞/.test(text)) return "rest";
  if (/躲|藏|隐蔽|避开/.test(text)) return "hide";
  if (/侦察|观察|查看|寻找|探查|跟踪/.test(text)) return "scout";
  if (/联系|传信|消息|协作|结盟|一起/.test(text)) return "contact";
  if (/去|前往|迁移|移动|离开/.test(text)) return "move";
  return "forage";
}

function detectLocation(command, currentLocation) {
  const text = command || "";
  const region = regions.find((item) => text.indexOf(item.name) >= 0 || text.indexOf(item.name.slice(0, 2)) >= 0);
  if (region) return region.name;
  if (/河|水|湿地/.test(text)) return "东部河岸湿地";
  if (/草|鹿群|草甸|林缘/.test(text)) return "南部林缘草甸";
  if (/岩|洞|岩坡/.test(text)) return "西部岩坡洞域";
  if (/针叶|北/.test(text)) return "北部针叶林";
  if (/密林|中央|混交/.test(text)) return "中央混交林";
  return currentLocation;
}

function regionByName(name) {
  return regions.find((region) => region.name === name) || regions[0];
}

function latestMessage(messages) {
  const outgoing = (messages || []).filter((message) => message.direction === "outgoing");
  return outgoing[outgoing.length - 1];
}

function applyAction(character, action, location, territoryEffect, mod) {
  const m = mod || weatherMod(null);
  const next = Object.assign({}, character);
  const rule = character.rule || {};
  const region = regionByName(location);
  const regionId = region ? region.id : "center";
  const isWater = regionId === "lake" || regionId === "river";
  next.hunger = clamp(next.hunger + (rule.hungerRate || 12));
  next.thirst = clamp(next.thirst + (rule.thirstRate || 16));
  next.stamina = clamp(next.stamina - (rule.staminaCost || 8) - m.staminaCost);

  if (action === "drink") {
    next.thirst = clamp(next.thirst - 45 - m.drinkBonus);
    next.stamina = clamp(next.stamina - 6 + (isWater ? 4 : 0));
  } else if (action === "hunt") {
    const bonus = (next.species === "狼" || next.species === "狐狸" || next.species === "猫头鹰" ? 48 : 30) + 6;
    next.hunger = clamp(next.hunger - bonus);
    next.stamina = clamp(next.stamina - (next.tier === "apex" ? 34 : 26));
    next.health = clamp(next.health - m.huntHealthRisk);
    if (next.species === "兔子" || next.species === "鹿") next.health = clamp(next.health - 12);
    if (next.tier === "apex" && next.stamina < 32) next.health = clamp(next.health - 8);
  } else if (action === "rest") {
    next.stamina = clamp(next.stamina + 34);
    next.health = clamp(next.health + 8);
  } else if (action === "hide") {
    next.stamina = clamp(next.stamina + (next.tier === "prey" ? 15 : 8) + m.hideStamina + 3);
  } else if (action === "scout") {
    next.stamina = clamp(next.stamina - (next.tier === "prey" || next.tier === "social" ? 8 : 14) - m.scoutStamina + 1);
  } else if (action === "move") {
    next.stamina = clamp(next.stamina - (next.tier === "prey" ? 10 : 18) + 3);
    next.health = clamp(next.health - Math.round(m.huntHealthRisk / 2));
  } else if (action === "forage") {
    next.hunger = clamp(next.hunger - (next.tier === "apex" ? 24 : 35) - 4);
  }

  if (territoryEffect) {
    const conflictReduction = territoryEffect.conflict ? 2 : 0;
    next.stamina = clamp(next.stamina + territoryEffect.stamina);
    next.health = clamp(next.health + territoryEffect.health + conflictReduction);
    next.territoryEffect = territoryEffect;
  }

  if (next.hunger > 82 || next.thirst > 82) next.health = clamp(next.health - 10);
  next.location = location;
  next.status = getStatus(next.health);
  next.statusText = getStatusText(next.status);
  return next;
}

function diffStats(before, after) {
  return {
    hunger: after.hunger - before.hunger,
    thirst: after.thirst - before.thirst,
    stamina: after.stamina - before.stamina,
    health: after.health - before.health
  };
}

function privateReport(character, action, location, command, message, time, territoryEffect, mod) {
  const intro = `${character.animalName}，你执行了今日指令：“${command}”。`;
  const msg = message ? `\n\n你留下给${message.toName}的消息：“${message.body}”。这条联系会在森林中继续发酵。` : "";
  const timeText = time ? `\n\n时间：第 ${time.day} 日 ${time.phase}，${time.moon}。` : "";
  const territoryText = territoryEffect && territoryEffect.note ? `\n\n领地：${territoryEffect.note}` : "";
  const weatherText = mod && mod.label ? `\n\n天气：${mod.label}。` : "";
  const map = {
    drink: `${intro}你抵达${location}，成功饮水。岸边的泥地留下多种足迹，你意识到这里也是其他动物的必争之地。${timeText}${territoryText}${weatherText}${msg}`,
    hunt: `${intro}你在${location}追踪猎物。行动带来收获，也消耗了不少体力；风向变化让你短暂暴露。${timeText}${territoryText}${weatherText}${msg}`,
    rest: `${intro}你在${location}选择休息。雨声掩住远处动静，你恢复了体力，也错过了一些白天消息。${timeText}${territoryText}${weatherText}${msg}`,
    hide: `${intro}你压低存在感，藏在${location}的阴影里。你避开了可能的遭遇，但饥饿和口渴仍在积累。${timeText}${territoryText}${weatherText}${msg}`,
    scout: `${intro}你在${location}侦察，发现新鲜足迹和被压弯的草。明天你会更清楚哪里危险。${timeText}${territoryText}${weatherText}${msg}`,
    contact: `${intro}你把叫声、气味或痕迹留在${location}附近，试图让其他动物回应。${timeText}${territoryText}${weatherText}${msg}`,
    move: `${intro}你向${location}移动。小雨让气味断续，迁移成功，但体力被消耗。${timeText}${territoryText}${weatherText}${msg}`,
    forage: `${intro}你在${location}觅食。收获不算丰盛，却足以让饥饿暂时退后。${timeText}${territoryText}${weatherText}${msg}`
  };
  return map[action];
}

function publicReport(day, action, location, species, time, territoryEffect, weather) {
  const phrase = { "小雨": "小雨仍在树冠间停留", "阴": "阴云压在树冠之上", "雾": "雾气缠绕着树冠", "晴": "阳光穿过树冠" }[weather] || "树冠静默";
  const map = {
    drink: "水边多了交错足迹，似乎有动物短暂相遇。",
    hunt: "林间发生追逐，鸟群被惊起。",
    rest: "今日森林较安静，洞穴附近出现停留痕迹。",
    hide: "许多踪迹在雨中消失，森林显得更谨慎。",
    scout: "几个区域边缘出现新的观察痕迹。",
    contact: "新的叫声和标记出现，似乎有动物在结盟。",
    move: "草甸与密林间的迁移路线变得清晰。",
    forage: "中央混交林的果实减少，小型动物活动频繁。"
  };
  const territoryText = territoryEffect && territoryEffect.publicNote ? ` ${territoryEffect.publicNote}` : "";
  return `第 ${day} 日${time ? ` ${time.phase}` : ""}，${phrase}。${location}附近出现了${species}活动过的模糊痕迹。${map[action]}${territoryText}`;
}

function updateGoals(goals, action, location, character, territoryEffect) {
  const next = JSON.parse(JSON.stringify(goals || {}));
  if (!next.longTerm || !next.midTerm || !next.daily) return next;
  const metrics = next.longTerm.metrics;
  metrics.water = clamp(metrics.water + (action === "drink" || /河岸/.test(location) ? 3 : -1));
  metrics.prey = clamp(metrics.prey + (action === "hunt" ? (character.tier === "apex" ? -8 : -5) : action === "scout" ? 2 : 0) + ((character.rule && character.rule.preyPressure) || 0));
  metrics.order = clamp(metrics.order + (action === "hide" || action === "rest" ? 2 : action === "hunt" ? -4 : 0) + (character.tier === "prey" && action === "move" ? 2 : 0) + ((territoryEffect && territoryEffect.order) || 0));
  metrics.trust = clamp(metrics.trust + (action === "contact" ? 6 : action === "hunt" ? -2 : 1) + ((character.rule && character.rule.socialGain) || 0) + ((territoryEffect && territoryEffect.trust) || 0));

  next.daily = buildDailyGoal(next, action, location);
  next.midTerm = next.midTerm.map((goal) => {
    const updated = Object.assign({}, goal);
    if (goal.id === "river_truce" && (action === "contact" || /河岸/.test(location))) updated.progress = Math.min(goal.target, goal.progress + 1);
    if (goal.id === "map_intel" && (action === "scout" || action === "move")) updated.progress = Math.min(goal.target, goal.progress + 1);
    updated.status = updated.progress >= updated.target ? "完成" : "进行中";
    return updated;
  });
  return next;
}

function buildDailyGoal(goals, action, location) {
  const completed = isDailyGoalDone(goals.daily, action, location);
  const pool = [
    {
      id: "daily_water",
      title: "今日目标：确认一个水源或安全路径",
      description: "去河岸饮水、侦察路线，或向其他动物交换水源情报。",
      reward: "提升水源或信任"
    },
    {
      id: "daily_contact",
      title: "今日目标：让一个动物知道你的意图",
      description: "发出协作邀请、交换情报，或留下不会被误解的信号。",
      reward: "提升信任"
    },
    {
      id: "daily_scout",
      title: "今日目标：更新一片林地情报",
      description: "侦察、迁移或跟踪足迹，确认一个区域的风险。",
      reward: "推进林地情报"
    },
    {
      id: "daily_recover",
      title: "今日目标：避免把身体推到危险边缘",
      description: "休息、躲藏，或选择低风险行动保存体力。",
      reward: "提升秩序"
    }
  ];
  const currentIndex = Math.max(0, pool.findIndex((item) => item.id === goals.daily.id));
  const nextGoal = completed ? pool[(currentIndex + 1) % pool.length] : pool[currentIndex];
  return Object.assign({}, nextGoal, { done: false, completedPrevious: completed });
}

function isDailyGoalDone(goal, action, location) {
  if (!goal) return false;
  if (goal.id === "daily_water") return action === "drink" || action === "scout" || /河岸/.test(location);
  if (goal.id === "daily_contact") return action === "contact";
  if (goal.id === "daily_scout") return action === "scout" || action === "move";
  if (goal.id === "daily_recover") return action === "rest" || action === "hide";
  return false;
}

function buildVisualResult(day, action, location, character, command, message, time, territoryEffect) {
  const region = regionByName(location);
  const palette = {
    drink: ["#2f6f7e", "#d7f0e4"],
    hunt: ["#7b3528", "#f0d8c0"],
    rest: ["#416257", "#dfe9d4"],
    hide: ["#2f3e31", "#dbe4ce"],
    scout: ["#7d692d", "#efe4b9"],
    contact: ["#5a4d86", "#e2dff1"],
    move: ["#496f3c", "#e3edcf"],
    forage: ["#66843c", "#edf0c8"]
  };
  const labels = {
    drink: "水源",
    hunt: "追猎",
    rest: "休整",
    hide: "潜伏",
    scout: "侦察",
    contact: "联络",
    move: "迁移",
    forage: "觅食"
  };
  const icon = {
    drink: "water",
    hunt: "claw",
    rest: "moon",
    hide: "leaf",
    scout: "eye",
    contact: "signal",
    move: "trail",
    forage: "berry"
  }[action];
  const momentText = {
    drink: `${location}的水面被雨点打碎，你在岸边留下新的足印。`,
    hunt: `${location}爆发短促追逐，树冠上的鸟群突然升起。`,
    rest: `${location}的雨声盖过呼吸，你把体温藏进阴影。`,
    hide: `${location}的气味被雨冲淡，你的存在感变得很低。`,
    scout: `${location}出现新鲜压痕，你读懂了一小段森林路线。`,
    contact: `${location}多了一串标记，等待另一个动物读懂。`,
    move: `你穿过湿叶和低枝，把活动范围推进到${location}。`,
    forage: `${location}的果实和昆虫少了一些，换来短暂饱腹。`
  };
  return {
    actionType: action,
    actionLabel: labels[action],
    location,
    regionId: region.id,
    risk: territoryEffect && territoryEffect.conflict ? "high" : action === "hunt" || (character.tier === "apex" && action !== "rest") ? "high" : action === "hide" || action === "rest" ? "low" : "medium",
    palette: palette[action],
    icon,
    command,
    socialHook: message ? `${message.toName}可能会注意到这条痕迹。` : "",
    eventCard: {
      title: `${labels[action]} · ${location}`,
      subtitle: `第 ${day} 日 ${time ? time.phase : ""} / ${character.species}`,
      body: territoryEffect && territoryEffect.shortNote ? `${momentText[action]} ${territoryEffect.shortNote}` : momentText[action],
      mood: action === "hunt" ? "紧张" : action === "contact" ? "暧昧" : "潮湿"
    },
    mapEvents: [
      {
        id: `event_${day}_${action}`,
        regionId: region.id,
        kind: icon,
        label: labels[action],
        intensity: action === "hunt" ? 3 : 2
      }
    ],
    time,
    territory: territoryEffect,
    statDelta: character.statDelta || {},
    influenceNote: buildInfluenceNote(character, action, location, territoryEffect),
    rumors: [
      action === "hunt"
        ? `${location}附近有追逐声，猎物路线可能改变。`
        : `${location}附近出现了新的${labels[action]}痕迹。`
    ]
  };
}

function buildInfluenceNote(character, action, location, territoryEffect) {
  if (territoryEffect && territoryEffect.conflict) {
    return `${territoryEffect.ownerName}的领地压力覆盖了你的意图：你仍能行动，但森林等级会让成本变高。`;
  }
  if (character.tier === "apex") {
    return `你的强大会改变${location}的恐惧，但也带来饥饿、暴露和更低信任。`;
  }
  if (character.tier === "prey") {
    return `你无法正面改写捕食法则，但能让路线、预警和群体选择发生偏移。`;
  }
  if (character.tier === "social") {
    return `你很难改变资源本身，但能改变其他动物相信什么、避开什么。`;
  }
  return `你留下了一个局部变量，森林整体仍按自己的惯性前进。`;
}

function regionNameById(regionId, world) {
  const region = ((world && world.regions) || regions).find((item) => item.id === regionId);
  return region ? region.name : "";
}

function intentForNpc(npc, day, action, playerLocation, message) {
  const cycle = {
    npc_wolf: [
      { type: "hunt", label: "沿鹿群气味压向中央混交林", targetRegionId: "center", certainty: "confirmed", stance: "threat", publicState: "盯着鹿群路线" },
      { type: "patrol", label: "绕开公共水源，巡查猎场边界", targetRegionId: "center", certainty: "rumor", stance: "threat", publicState: "在猎场边缘巡查" },
      { type: "listen", label: "停在树影里听其他动物的动静", targetRegionId: "river", certainty: "rumor", stance: "cautious", publicState: "暂时没有现身" }
    ],
    npc_crow: [
      { type: "intel", label: "盘旋观察河岸脚印", targetRegionId: "river", certainty: "rumor", stance: "open", publicState: "在树冠间散播消息" },
      { type: "contact", label: "把新传闻带到北部针叶林", targetRegionId: "north", certainty: "confirmed", stance: "open", publicState: "寻找愿意交换情报的动物" },
      { type: "scout", label: "从高处确认岩坡洞口气味", targetRegionId: "rocks", certainty: "rumor", stance: "open", publicState: "记录洞域边界" }
    ],
    npc_deer: [
      { type: "move", label: "试探草甸到河岸的安全线", targetRegionId: "meadow", certainty: "confirmed", stance: "cautious", publicState: "准备带群体换路线" },
      { type: "hide", label: "把鹿群压进林缘阴影", targetRegionId: "meadow", certainty: "rumor", stance: "cautious", publicState: "减少公开踪迹" },
      { type: "drink", label: "接近河岸但保持退路", targetRegionId: "river", certainty: "rumor", stance: "cautious", publicState: "等待水源安全窗口" }
    ],
    npc_bear: [
      { type: "guard", label: "重标洞域边界", targetRegionId: "rocks", certainty: "confirmed", stance: "closed", publicState: "守着岩坡洞口" },
      { type: "rest", label: "留在洞域深处恢复体力", targetRegionId: "rocks", certainty: "rumor", stance: "closed", publicState: "拒绝靠近" },
      { type: "forage", label: "沿岩坡寻找矿盐和腐木昆虫", targetRegionId: "rocks", certainty: "confirmed", stance: "closed", publicState: "缓慢扩大气味范围" }
    ],
    npc_mink: [
      { type: "guard", label: "在浅滩伏击点巡视饮水者", targetRegionId: "lake", certainty: "confirmed", stance: "closed", publicState: "守在湖泊浅滩" },
      { type: "hunt", label: "潜入芦苇浅滩捕鱼", targetRegionId: "lake", certainty: "confirmed", stance: "threat", publicState: "在水边伏击" },
      { type: "scout", label: "沿湖岸检查外来气味", targetRegionId: "lake", certainty: "rumor", stance: "cautious", publicState: "巡查湖岸边界" }
    ]
  };
  const pool = cycle[npc.id] || [
    { type: "scout", label: "观察森林变化", targetRegionId: "center", certainty: "rumor", stance: "cautious", publicState: "保持距离" }
  ];
  const playerRegion = regionByName(playerLocation);
  const playerRegionId = playerRegion ? playerRegion.id : null;
  const weights = pool.map((entry) => {
    let w = 1;
    if (action === "hunt" && (entry.stance === "threat" || entry.type === "hunt" || entry.type === "patrol")) w += 2;
    if (playerRegionId && entry.targetRegionId === playerRegionId) w += 2;
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let pickR = Math.random() * total;
  let pickIdx = pool.length - 1;
  for (let i = 0; i < pool.length; i += 1) {
    pickR -= weights[i];
    if (pickR <= 0) { pickIdx = i; break; }
  }
  const picked = Object.assign({}, pool[pickIdx]);
  if (message && message.toId === npc.id) {
    const responseByType = {
      invite: "注意到你的协作邀请，但会先观察明天的风险",
      intel: "愿意听取情报，也可能把它转述给别的动物",
      warning: "读到了警告，短时间内会更加谨慎"
    };
    picked.label = responseByType[message.type] || "注意到你的信号";
    picked.certainty = "confirmed";
    picked.stance = picked.stance === "closed" ? "cautious" : picked.stance;
    picked.publicState = "刚读过你的信号";
  } else if (action === "hunt" && npc.species === "鹿") {
    picked.label = "把群体推离追猎声源";
    picked.targetRegionId = playerLocation && /河岸/.test(playerLocation) ? "meadow" : picked.targetRegionId;
    picked.certainty = "confirmed";
    picked.publicState = "高度警觉";
  } else if (action === "contact" && npc.species === "乌鸦") {
    picked.label = "把你的信号变成一条传闻";
    picked.certainty = "confirmed";
    picked.publicState = "正在解释你的意图";
  }
  return picked;
}

const WATER_DEPENDENT_ANIMALS = new Set(["水貂", "河马", "鳄鱼", "火烈鸟", "大象"]);
const GRAZING_ANIMALS = new Set(["鹿", "羚羊", "野兔", "斑马", "野猪", "大象", "长颈鹿"]);
const TIMID_ANIMALS = new Set(["鹿", "羚羊", "野兔", "斑马", "火烈鸟"]);

function animalConditionDynamics(npc, reserve, beforeReserve, actualAction, dayClosed) {
  const eco = reserve.ecology || {};
  const beforeEco = (beforeReserve && beforeReserve.ecology) || {};
  const water = numberOr(eco.water, 60);
  const grass = numberOr(eco.grass, 60);
  const disease = numberOr(eco.disease, 10);
  const poachers = numberOr(reserve.poacherPressure, 30);
  const currentTrust = numberOr(npc.relation && npc.relation.trust, 40);
  const currentThreat = numberOr(npc.relation && npc.relation.threat, 40);
  const currentHealth = numberOr(npc.health, 84);
  const waterDependent = WATER_DEPENDENT_ANIMALS.has(npc.species);
  const grazer = GRAZING_ANIMALS.has(npc.species);
  const timid = TIMID_ANIMALS.has(npc.species);
  const waterDelta = water - numberOr(beforeEco.water, water);
  const grassDelta = grass - numberOr(beforeEco.grass, grass);
  const diseaseDelta = disease - numberOr(beforeEco.disease, disease);
  const poacherDelta = poachers - numberOr(beforeReserve && beforeReserve.poacherPressure, poachers);
  let trustDelta = 0;
  let threatDelta = 0;
  let healthDelta = 0;
  const reasons = [];

  // Only actions that visibly improve this animal's living conditions earn
  // reserve trust. Buying and selling no longer raise every animal's trust.
  if (actualAction === "habitat" && ((waterDependent && waterDelta >= 2) || (grazer && grassDelta >= 2))) {
    trustDelta += 1;
    threatDelta -= 1;
    reasons.push(waterDependent && waterDelta >= grassDelta ? "修复后的水线更可靠" : "栖息地得到真实修复");
  }
  if (["antiPoacher", "houndScout"].includes(actualAction) && poacherDelta <= -3) {
    if (timid || npc.species === "乌鸦") trustDelta += 1;
    threatDelta -= actualAction === "antiPoacher" ? 2 : 1;
    reasons.push("危险脚印正在退到边界外");
  }
  if (actualAction === "intervention") {
    if (diseaseDelta < 0) healthDelta += 1;
    if (timid) threatDelta += 1;
    reasons.push(timid ? "干预有效，但它仍会观察你的距离" : "种群压力得到控制");
  }

  // Environmental consequences settle once per guardian day. They affect
  // threat and health directly; trust only falls when a serious decline is
  // left unanswered, preserving trust as a relationship rather than ecology.
  if (dayClosed) {
    let stress = 0;
    if (poachers >= 65) stress += 2;
    else if (poachers >= 45) stress += 1;
    if (disease >= 60) stress += 2;
    else if (disease >= 34) stress += 1;
    if (water < (waterDependent ? 42 : 32)) stress += 2;
    else if (water < (waterDependent ? 56 : 44)) stress += 1;
    if (grass < (grazer ? 40 : 30)) stress += 2;
    else if (grass < (grazer ? 54 : 42)) stress += 1;

    if (stress >= 5) {
      threatDelta += 3;
      healthDelta -= 3;
      if (!["habitat", "antiPoacher", "houndScout", "intervention"].includes(actualAction)) trustDelta -= 2;
      reasons.push("水草、疾病与边界风险正在叠加");
    } else if (stress >= 3) {
      threatDelta += 2;
      healthDelta -= 2;
      if (!["habitat", "antiPoacher", "houndScout", "intervention"].includes(actualAction)) trustDelta -= 1;
      reasons.push("保护区压力已经影响日常活动");
    } else if (stress >= 1) {
      threatDelta += 1;
      healthDelta -= 1;
      reasons.push("它察觉到一项尚未消失的风险");
    } else if (water >= 62 && grass >= 58 && disease <= 22 && poachers <= 35) {
      threatDelta -= 1;
      healthDelta += 1;
      reasons.push("稳定水草让它逐渐恢复");
    }
  }

  // High trust is intentionally hard to finish through ambient management.
  // The final relationship levels require direct animal interaction/story.
  if (trustDelta > 0 && currentTrust >= 85) trustDelta = 0;
  else if (trustDelta > 1) trustDelta = 1;
  const nextTrust = clamp(currentTrust + trustDelta);
  const nextThreat = clamp(currentThreat + threatDelta);
  const nextHealth = clampRange(currentHealth + healthDelta, 15, 100);
  return {
    trust: nextTrust,
    threat: nextThreat,
    health: nextHealth,
    change: {
      trust: nextTrust - currentTrust,
      threat: nextThreat - currentThreat,
      health: nextHealth - currentHealth
    },
    summary: reasons[0] || (dayClosed ? "水草承载与风险暂时平衡" : "它继续观察今天的经营结果")
  };
}

function updateNpcMovements(world, day, action, playerLocation, message, playerSocialLevel, context = {}) {
  const socialBonus = Math.max(0, (playerSocialLevel || 1) - 1);
  const reserve = (world && world.reserve) || {};
  const eco = reserve.ecology || {};
  const lastPlayerAction = (world && world.lastPlayerAction) || null;
  const safety = reserve.safety || reserve.stability || 0;
  const poachers = reserve.poacherPressure || 0;
  const water = eco.water || 0;
  const disease = eco.disease || 0;
  const grass = eco.grass || 0;
  const knownCharacters = (world.knownCharacters || []).map((npc) => {
    const intent = intentForNpc(npc, day, action, playerLocation, message);
    const reserveAnimal = !!(world && world.reserve);
    const actualAction = context.reserveAction || (lastPlayerAction && lastPlayerAction.action) || action;
    const condition = reserveAnimal
      ? animalConditionDynamics(npc, reserve, context.beforeReserve || reserve, actualAction, !!context.dayClosed)
      : null;
    let trustDelta = condition ? condition.change.trust : (message && message.toId === npc.id ? (message.type === "warning" ? 1 : 4) : action === "hunt" ? -1 : 1);
    if (!condition && message && message.toId === npc.id) trustDelta += socialBonus;
    const threatDelta = condition ? condition.change.threat : (action === "hunt" && npc.species !== "狼" ? 3 : action === "contact" ? -1 : 0);
    let insight = npc.wisdom || "动物会按水源、食物、风险和记忆重新选择路线。";
    if (npc.species === "鹿" && (safety < 50 || poachers > 50)) {
      intent.label = "把鹿群推向更安静的边界线";
      intent.targetRegionId = water >= 55 ? "river" : "meadow";
      intent.publicState = "正在重新选择饮水路线";
      insight = "鹿群不是追着草走，而是先确认饮水窗口和幼体安全。";
    } else if (npc.species === "狼" && grass < 48) {
      intent.label = "沿虚弱食草动物的取食边界巡查";
      intent.targetRegionId = "meadow";
      insight = "草场不足会让鹿群分散，狼群更容易锁定落单个体。";
    } else if (npc.species === "乌鸦" && poachers > 48) {
      intent.label = "记住陌生人的路线并向树冠传播";
      intent.targetRegionId = "river";
      intent.publicState = "正在警戒人类气味";
      insight = "乌鸦会记住危险地点，连续偷猎会改变它们的巡飞路径。";
    } else if (npc.species === "熊" && disease > 28) {
      intent.label = "避开病弱个体聚集的草甸边缘";
      intent.targetRegionId = "rocks";
      insight = "疾病压力升高时，独行大型动物会减少无意义接触。";
    } else if (npc.species === "水貂" && water < 50) {
      intent.label = "退向更深水位的芦苇线";
      intent.targetRegionId = "lake";
      insight = "浅滩水位下降会让鱼群后撤，也会让饮水者更紧张。";
    }
    let relation = Object.assign({}, npc.relation || {}, {
      trust: condition ? condition.trust : clamp(numberOr(npc.relation && npc.relation.trust, 40) + trustDelta),
      threat: condition ? condition.threat : clamp(numberOr(npc.relation && npc.relation.threat, 40) + threatDelta)
    });
    const trustTier = animalTrustTierFor(relation.trust);
    relation = Object.assign({}, relation, {
      trustTier: trustTier.id,
      trustTitle: trustTier.title,
      trustProgress: trustTier.progress,
      trustNext: trustTier.next
    });
    const actionMemory = playerActionMemory(day, lastPlayerAction, npc);
    const memoryAdd = [`${day}日：${insight}`].concat(actionMemory ? [actionMemory] : []);
    const memory = ((npc.memory || []).concat(memoryAdd)).slice(-5);
    return Object.assign({}, npc, {
      intent,
      relation,
      trustTier,
      publicState: intent.publicState,
      insight,
      memory,
      health: condition ? condition.health : numberOr(npc.health, 84),
      conditionChange: condition ? condition.change : Object.assign({}, npc.conditionChange || {}),
      conditionSummary: condition ? condition.summary : (npc.conditionSummary || "正在适应保护区变化"),
      lastSeenDay: day,
      lastSeenRegionId: intent.targetRegionId
    });
  });
  const npcMovements = knownCharacters.map((npc) => ({
    id: `npc_${day}_${npc.id}`,
    actorId: npc.id,
    actorName: npc.name,
    species: npc.species,
    regionId: npc.intent.targetRegionId,
    location: regionNameById(npc.intent.targetRegionId, world),
    type: npc.intent.type,
    label: npc.intent.label,
    certainty: npc.intent.certainty,
    stance: npc.intent.stance,
    trust: npc.relation.trust,
    threat: npc.relation.threat
  }));
  return { knownCharacters, npcMovements };
}

function playerActionMemory(day, last, npc) {
  if (!last || !last.action) return "";
  const delta = last.delta || {};
  const location = last.location || "保护区";
  const species = (npc && npc.species) || "";
  if (last.action === "antiPoacher") {
    if (species === "鹿") return `${day}日：卫士驱赶过${location}的偷猎者，幼鹿今天敢多靠近核心区一点。`;
    if (species === "乌鸦") return `${day}日：卫士压低了边界坏脚印，我把这条好消息挂到树冠。`;
    return `${day}日：卫士清过${location}边界，偷猎压力${delta.poacher < 0 ? `降了${Math.abs(delta.poacher)}点` : "还在摇摆"}。`;
  }
  if (last.action === "houndScout") {
    if (species === "狼") return `${day}日：猎犬扫过路线，我闻到人味变少，鹿群也会重新试探。`;
    return `${day}日：猎犬侦察过${location}，陌生气味被翻出来，大家会重新排路线。`;
  }
  if (last.action === "habitat") {
    if (species === "水貂" || species === "鳄鱼" || species === "河马") return `${day}日：水线被修过，我的浅滩和伏击点都宽了一口气。`;
    return `${day}日：卫士修了水源和草场，迁移路线闻起来没那么硬了。`;
  }
  if (last.action === "salvage") {
    return `${day}日：卫士做了合规回收，基金回升，但动物仍在看边界脚步。`;
  }
  if (last.action === "buySupplies") {
    return `${day}日：补给箱变满，猎犬队明天能跑更远，坏脚印会更难藏。`;
  }
  if (last.action === "intervention") {
    if (species === "鹿") return `${day}日：那次生态干预留下了麻醉气味，鹿群会保持距离再观察。`;
    return `${day}日：卫士调整了种群压力，草场轻了一点，记忆也重了一点。`;
  }
  return `${day}日：卫士在${location}行动过，森林已经把这件事记进路线。`;
}

function resolveNpcEvents(character, npcUpdate, day, playerLocation) {
  const events = [];
  let next = Object.assign({}, character);
  const predators = ["狼", "熊", "水貂", "狐狸"];
  const knownCharacters = npcUpdate.knownCharacters.map((npc) => {
    const trust = (npc.relation && npc.relation.trust) || 40;
    if (!npc.ally && trust >= 70) {
      events.push({ kind: "ally", text: `${npc.name} 与你结成同盟，今后会分享食物与情报。` });
      return Object.assign({}, npc, { ally: true });
    }
    return npc;
  });
  knownCharacters.forEach((npc) => {
    if (npc.ally) return;
    const threat = (npc.relation && npc.relation.threat) || 40;
    if (predators.indexOf(npc.species) >= 0 && threat >= 75 && Math.random() < 0.4) {
      const dmg = 8 + rankForSpecies(npc.species) * 2;
      next.health = clamp(next.health - dmg);
      events.push({ kind: "ambush", text: `${npc.name} 伏击了你，你受了伤（健康 -${dmg}）。` });
    }
  });
  knownCharacters.forEach((npc) => {
    if (npc.ally) next.hunger = clamp(next.hunger - 3);
  });
  if (knownCharacters.some((n) => n.ally)) {
    events.push({ kind: "allyHelp", text: "盟友与你分享了一点食物。" });
  }
  const playerRegion = regionByName(playerLocation);
  const playerRegionId = playerRegion ? playerRegion.id : null;
  if (playerRegionId) {
    let nearbyThreat = false;
    let nearbyAlly = false;
    knownCharacters.forEach((npc) => {
      const target = (npc.intent || {}).targetRegionId;
      if (target !== playerRegionId) return;
      if (npc.ally) nearbyAlly = true;
      else if (predators.indexOf(npc.species) >= 0) nearbyThreat = true;
    });
    if (nearbyThreat) {
      next.stamina = clamp(next.stamina - 4);
      events.push({ kind: "nearbyThreat", text: "附近有捕食者活动，你保持警觉，消耗了体力。" });
    }
    if (nearbyAlly) {
      next.stamina = clamp(next.stamina + 3);
      events.push({ kind: "nearbyAlly", text: "盟友在附近为你警戒，你稍感安心。" });
    }
  }
  return { character: next, knownCharacters, events };
}

function actionTime(action, day, previousTime) {
  const phaseMap = {
    drink: ["清晨", 6],
    scout: ["上午", 9],
    forage: ["正午", 12],
    move: ["午后", 15],
    contact: ["黄昏", 18],
    hunt: ["黄昏", 18],
    hide: ["夜间", 22],
    rest: ["深夜", 23]
  };
  const moonPool = ["新月", "上弦月", "满月", "下弦月"];
  const chosen = phaseMap[action] || ["正午", 12];
  return {
    day,
    phase: chosen[0],
    hour: chosen[1],
    moon: moonPool[day % moonPool.length],
    seasonDay: ((previousTime && previousTime.seasonDay) || 18) + 1
  };
}

function rankForSpecies(species) {
  if (species === "熊") return 5;
  if (species === "狼") return 4;
  if (species === "狐狸" || species === "猫头鹰" || species === "水貂") return 3;
  if (species === "乌鸦" || species === "鹿") return 2;
  return 1;
}

function territoryForLocation(location, world) {
  const region = ((world && world.regions) || regions).find((item) => item.name === location);
  return region ? region.territory : null;
}

function resolveTerritoryEffect(character, action, location, world) {
  const territory = territoryForLocation(location, world);
  if (!territory) return null;
  const playerRank = character.rank || rankForSpecies(character.species);
  const ownerRank = territory.ownerSpecies === "多物种" ? 3 : rankForSpecies(territory.ownerSpecies);
  const sameKind = territory.ownerSpecies === character.species || territory.ownerName === character.animalName;
  const aggressive = action === "hunt" || action === "move" || action === "scout";
  const toleratedWater = territory.ownerId === "shared" && action === "drink";
  if (sameKind) {
    return {
      ownerName: territory.ownerName,
      claim: territory.claim,
      conflict: false,
      stamina: 3,
      health: 0,
      order: 1,
      trust: 0,
      note: `你进入的是${territory.ownerName}标记过的${territory.claim}，同类气味让通行成本降低。`,
      shortNote: `${territory.claim}接纳了你的气味。`,
      publicNote: `${territory.claim}的边界保持稳定。`
    };
  }
  if (toleratedWater) {
    return {
      ownerName: territory.ownerName,
      claim: territory.claim,
      conflict: false,
      stamina: 0,
      health: 0,
      order: 1,
      trust: 1,
      note: `${territory.claim}暂时允许饮水，但任何伏击都会破坏停战线。`,
      shortNote: `公共水源容忍了这次靠近。`,
      publicNote: `公共水源的停战线仍未崩坏。`
    };
  }
  const conflict = aggressive && territory.pressure + ownerRank * 8 > playerRank * 18 + 34;
  if (conflict) {
    return {
      ownerName: territory.ownerName,
      claim: territory.claim,
      conflict: true,
      stamina: -10,
      health: playerRank < ownerRank ? -5 : 0,
      order: -3,
      trust: -2,
      note: `这里是${territory.ownerName}的${territory.claim}。你的等级位置不足以让边界自动让路，行动被视为试探或冒犯。`,
      shortNote: `${territory.ownerName}的边界压力让这次行动变重。`,
      publicNote: `${territory.claim}出现短暂边界紧张。`
    };
  }
  return {
    ownerName: territory.ownerName,
    claim: territory.claim,
    conflict: false,
    stamina: -2,
    health: 0,
    order: 0,
    trust: action === "contact" ? 2 : 0,
    note: `你经过${territory.ownerName}的${territory.claim}边缘。没有爆发冲突，但气味会被记住。`,
    shortNote: `边界记录了你的气味。`,
    publicNote: `${territory.claim}边缘出现新的经过痕迹。`
  };
}

function cloneReserve(reserve) {
  const base = reserve || {};
  return {
    fund: base.fund || 0,
    stability: base.stability || 50,
    business: typeof base.business === "number" ? base.business : 58,
    ecologyScore: typeof base.ecologyScore === "number" ? base.ecologyScore : 66,
    reputation: base.reputation || 50,
    enforcement: base.enforcement || 45,
    poacherPressure: numberOr(base.poacherPressure, 30),
    // 旧字段仅保留结构兼容，V3 核心循环不再读取、生产或消耗它们。
    actionPoints: 0,
    intel: 0,
    fieldPermits: 0,
    seasonDay: base.seasonDay || 1,
    seasonState: Object.assign({}, base.seasonState || { name: "雨季", day: 1, cycleDay: 1, changed: false }),
    guardianCycle: JSON.parse(JSON.stringify(base.guardianCycle || {})),
    mastery: normalizeMastery(base.mastery),
    recoveredProcessing: JSON.parse(JSON.stringify(base.recoveredProcessing || { version: 1, pending: [], history: [], lastSettlement: null })),
    taskSamples: Object.assign({}, base.taskSamples || {}),
    facilityCaseProgress: Math.max(0, Number(base.facilityCaseProgress) || 0),
    facilityForecast: Object.assign({}, base.facilityForecast || {}),
    seasonPolicy: Object.assign({}, base.seasonPolicy || {}),
    memoryWall: Object.assign({}, base.memoryWall || {}),
    seasonDynamics: JSON.parse(JSON.stringify(base.seasonDynamics || {})),
    emergency: JSON.parse(JSON.stringify(base.emergency || { active: null, cooldown: 0, history: [], lastOutcome: null })),
    ecology: {
      predators: Object.assign({}, (base.ecology && base.ecology.predators) || {}),
      herbivores: Object.assign({}, (base.ecology && base.ecology.herbivores) || {}),
      birds: Object.assign({}, (base.ecology && base.ecology.birds) || {}),
      water: numberOr(base.ecology && base.ecology.water, 60),
      grass: numberOr(base.ecology && base.ecology.grass, 60),
      disease: numberOr(base.ecology && base.ecology.disease, 10)
    },
    safety: base.safety || 50,
    migration: Object.assign({ trend: "stable", delta: 0, reason: "水源与草场暂时稳定" }, base.migration || {}),
    guardianRun: Object.assign({}, base.guardianRun || {}),
    progression: Object.assign({}, base.progression || {}, {
      chapterStart: Object.assign({}, (base.progression && base.progression.chapterStart) || {})
    }),
    speciesChanges: Object.assign({}, base.speciesChanges || {}),
    houndTeam: Object.assign({}, base.houndTeam || {}),
    eventChain: JSON.parse(JSON.stringify(base.eventChain || {})),
    facilityConstruction: JSON.parse(JSON.stringify(base.facilityConstruction || {})),
    lastFacilityEffect: JSON.parse(JSON.stringify(base.lastFacilityEffect || {})),
    lastDailyEconomy: Object.assign({}, base.lastDailyEconomy || {}),
    lastActionOutcome: Object.assign({}, base.lastActionOutcome || {}),
    inventory: Object.assign({}, base.inventory || {}),
    pendingRecovered: Object.assign({}, base.pendingRecovered || {}),
    ecologyEconomy: normalizeEcologyEconomy(base.ecologyEconomy, base),
    lastMaterialExploration: base.lastMaterialExploration ? JSON.parse(JSON.stringify(base.lastMaterialExploration)) : null,
    mysteryEvidence: normalizeMysteryEvidence(base.mysteryEvidence),
    strategy: normalizeStrategyState(base.strategy),
    guardianPromises: normalizeGuardianPromises(base.guardianPromises),
    // 剧情发现会在轻互动中写入保护区；关键行动复制状态时必须保留，
    // 否则玩家明明收录了主证据，章节里程碑仍会永远显示 0。
    storyDiscoveries: JSON.parse(JSON.stringify(base.storyDiscoveries || {})),
    supplies: Object.assign({}, base.supplies || {}),
    market: Object.assign({}, base.market || {}),
    listenedIntel: Object.assign({}, base.listenedIntel || {}),
    animalCareLog: Object.assign({}, base.animalCareLog || {}),
    social: Object.assign({}, base.social || {}),
    base: Object.assign({}, base.base || {}, {
      protectedAnimals: Object.assign({}, (base.base && base.base.protectedAnimals) || {})
    }),
    league: JSON.parse(JSON.stringify(base.league || {})),
    hounds: (base.hounds || []).map((hound) => Object.assign({}, hound))
  };
}

function houndTeamNextXp(level) {
  return 40 + Math.max(0, (level || 1) - 1) * 18;
}

function houndTeamTitle(level) {
  if (level >= 10) return "传奇猎犬队";
  if (level >= 6) return "老练猎犬队";
  if (level >= 3) return "可靠猎犬队";
  return "新晋猎犬队";
}

function houndTeamPower(reserve) {
  const team = reserve.houndTeam || {};
  const score =
    (team.tracking || 50) * 0.28 +
    (team.pursuit || 50) * 0.22 +
    (team.guard || 50) * 0.20 +
    (team.cohesion || 50) * 0.18 +
    (team.stamina || 50) * 0.12;
  return Math.round(score + ((team.level || 1) - 1) * 4);
}

function actionMaterialSupport(reserve, action) {
  const supplies = reserve.supplies || {};
  const inventory = reserve.inventory || {};
  if (action === "houndScout") return (supplies.dogFood || 0) > 0 ? 1 : 0.45;
  if (action === "antiPoacher") {
    return (supplies.alarm || 0) > 0 ? 1 : 0.35;
  }
  if (action === "habitat") return (supplies.fieldKit || 0) > 0 ? 1 : 0.35;
  if (action === "intervention") {
    return (supplies.tranquilizer || 0) > 0 ? 1 : 0.25;
  }
  if (action === "salvage") {
    const goods = ["shedAntlerA", "shedAntlerB", "naturalHide", "researchSample", "recoveredTrap"].reduce((sum, key) => sum + (inventory[key] || 0), 0);
    return goods > 0 ? 1 : 0.55;
  }
  if (action === "buySupplies") return (reserve.fund || 0) >= 45 ? 1 : 0.45;
  return 0.8;
}

function applyHoundTeamGrowth(reserve, action, materialSupport = 1) {
  const team = Object.assign({
    level: 1,
    xp: 0,
    nextXp: 40,
    totalRuns: 0,
    tracking: 48,
    pursuit: 45,
    guard: 42,
    stamina: 86,
    cohesion: 52,
    lastReward: "猎犬队待命。",
    title: "新晋猎犬队"
  }, reserve.houndTeam || {});
  const baseXp = 6 + actionDifficulty(action) * 5;
  const xpGain = Math.max(2, Math.round(baseXp * Math.max(0.35, Math.min(1, materialSupport))));
  const beforeLevel = Math.max(1, team.level || 1);
  team.xp = Math.max(0, (team.xp || 0) + xpGain);
  team.nextXp = Math.max(30, team.nextXp || houndTeamNextXp(beforeLevel));
  team.totalRuns = Math.max(0, (team.totalRuns || 0) + 1);
  while (team.xp >= team.nextXp && team.level < 30) {
    team.xp -= team.nextXp;
    team.level += 1;
    team.nextXp = houndTeamNextXp(team.level);
  }
  team.title = houndTeamTitle(team.level);
  const levelUp = team.level > beforeLevel;
  const gains = {
    houndScout: { tracking: 4, pursuit: 1, guard: 0, cohesion: 2, stamina: -8 },
    antiPoacher: { tracking: 1, pursuit: 3, guard: 3, cohesion: 1, stamina: -9 },
    habitat: { tracking: 1, pursuit: 0, guard: 2, cohesion: 2, stamina: -5 },
    intervention: { tracking: 1, pursuit: 2, guard: 1, cohesion: 1, stamina: -6 },
    salvage: { tracking: 2, pursuit: 0, guard: 1, cohesion: 1, stamina: -4 },
    buySupplies: { tracking: 0, pursuit: 0, guard: 0, cohesion: 1, stamina: 14 },
    patrol: { tracking: 1, pursuit: 1, guard: 1, cohesion: 1, stamina: -5 }
  }[action] || { tracking: 1, pursuit: 1, guard: 1, cohesion: 1, stamina: -5 };
  const trainingFactor = Math.max(0.35, Math.min(1, materialSupport));
  team.tracking = clamp((team.tracking || 50) + Math.round(gains.tracking * trainingFactor) + (levelUp ? 1 : 0));
  team.pursuit = clamp((team.pursuit || 50) + Math.round(gains.pursuit * trainingFactor) + (levelUp ? 1 : 0));
  team.guard = clamp((team.guard || 50) + Math.round(gains.guard * trainingFactor) + (levelUp ? 1 : 0));
  team.cohesion = clamp((team.cohesion || 50) + Math.round(gains.cohesion * trainingFactor) + (levelUp ? 2 : 0));
  team.stamina = clamp((team.stamina || 70) + gains.stamina);
  const adjustedGains = {
    tracking: Math.round(gains.tracking * trainingFactor),
    pursuit: Math.round(gains.pursuit * trainingFactor),
    guard: Math.round(gains.guard * trainingFactor),
    cohesion: Math.round(gains.cohesion * trainingFactor)
  };
  const gainLabels = [
    adjustedGains.tracking > 0 ? `追踪 +${adjustedGains.tracking}` : "",
    adjustedGains.pursuit > 0 ? `驱赶 +${adjustedGains.pursuit}` : "",
    adjustedGains.guard > 0 ? `防护 +${adjustedGains.guard}` : "",
    adjustedGains.cohesion > 0 ? `默契 +${adjustedGains.cohesion}` : "",
    gains.stamina !== 0 ? `体能 ${gains.stamina > 0 ? "+" : ""}${gains.stamina}` : ""
  ].filter(Boolean);
  team.lastReward = levelUp
    ? `猎犬队升到 Lv.${team.level}，全队默契和训练上限提高。`
    : `猎犬队经验 +${xpGain}，${gainLabels.slice(0, 3).join(" / ")}。`;
  reserve.houndTeam = team;
  return {
    xpGain,
    beforeLevel,
    level: team.level,
    levelUp,
    title: team.title,
    power: houndTeamPower(reserve),
    materialSupport,
    training: {
      tracking: team.tracking,
      pursuit: team.pursuit,
      guard: team.guard,
      stamina: team.stamina,
      cohesion: team.cohesion
    },
    summary: team.lastReward
  };
}

function applyVariableReserveReward(reserve, action, houndGrowth) {
  const power = houndTeamPower(reserve);
  const roll = Math.random();
  const rareChance = Math.min(0.30, 0.10 + power / 620);
  const goodChance = Math.min(0.64, 0.34 + power / 680);
  let tier = "稳定";
  if (roll < rareChance) tier = "稀有";
  else if (roll < goodChance) tier = "良好";
  const reward = {
    tier,
    label: "",
    body: "",
    fund: 0,
    intel: 0,
    goods: {}
  };
  if (action === "houndScout") {
    if (tier === "稀有") {
      reward.label = "猎犬刨出完整陷阱证据";
      reward.goods.recoveredTrap = 1;
    } else if (tier === "良好") {
      reward.label = "猎犬带回一条新气味线";
      reward.goods.researchSample = 1;
    } else {
      reward.label = "巡线稳定";
    }
  } else if (action === "antiPoacher") {
    if (tier === "稀有") {
      reward.label = "追回偷猎工具";
      reward.goods.recoveredTrap = 1;
    } else if (tier === "良好") {
      reward.label = "边界告警提前触发";
      reward.goods.recoveredTrap = 1;
    } else {
      reward.label = "动物回到安全线内";
    }
  } else if (action === "habitat") {
    reward.label = tier === "稀有" ? "发现旧水洼支线" : tier === "良好" ? "草场恢复加速" : "水草小幅回稳";
    reserve.ecology.water = clamp((reserve.ecology.water || 0) + (tier === "稀有" ? 3 : tier === "良好" ? 2 : 1));
    reserve.ecology.grass = clamp((reserve.ecology.grass || 0) + (tier === "稀有" ? 3 : tier === "良好" ? 2 : 1));
  } else if (action === "salvage") {
    const soldCount = reserve.lastSalvageSoldCount || 0;
    reward.label = soldCount
      ? (tier === "稀有" ? "项目拨款加成" : tier === "良好" ? "移交审核加分" : "移交记录完整")
      : "库存为空，整理出研究线索";
    if (soldCount && tier === "稀有") reward.goods.researchSample = 1;
  } else if (action === "buySupplies") {
    reward.label = tier === "稀有" ? "供应商额外赠送警报器" : tier === "良好" ? "狗粮多到一袋" : "补给整理完成";
    if (tier === "稀有") addSupply(reserve, "alarm", 1);
    else if (tier === "良好") addSupply(reserve, "dogFood", 1);
  } else {
    reward.label = tier === "稀有" ? "动物留下清晰线索" : tier === "良好" ? "巡护记录补全" : "森林保持稳定";
    if (tier !== "稳定") reward.goods.researchSample = 1;
  }
  Object.keys(reward.goods).forEach((key) => {
    addPendingRecovered(reserve, key, reward.goods[key]);
  });
  // 保护基金只在样本移交时入账；随机奖励先进入待收取区。
  reward.body = `${tier}奖励：${reward.label}${houndGrowth && houndGrowth.levelUp ? `；猎犬队升到 Lv.${houndGrowth.level}` : ""}`;
  return reward;
}

function detectReserveAction(command) {
  const text = command || "";
  if (/探索回收物|物资探索|探索森林|跟随动物探索|寻找自然遗留/.test(text)) return "exploreMaterials";
  if (/购买|买|采购|补给|狗粮|麻醉弹|警报器|医疗包|护理包|野外工具包|物资/.test(text)) return "buySupplies";
  if (isSocialRecoveryCommand(text)) return "houndScout";
  if (/出售|卖出|变现|提交.*(?:科研|执法|样本)|移交|项目拨款|研究补助|专项拨款|收益|运营|经营/.test(text)) return "salvage";
  if (/收集|采集|采样|寻找.*鹿角|自然样本/.test(text)) return "houndScout";
  if (/狗|猎犬|嗅|追踪|搜寻|线索|情报/.test(text)) return "houndScout";
  if (/偷猎|驱赶|抓捕|巡逻|巡护|陷阱|警报/.test(text)) return "antiPoacher";
  if (/鹿角|皮|遗体|尸体|回收|样本/.test(text)) return "salvage";
  if (/猎杀|数量|过多|淘汰|生态干预|麻醉|转移|控制/.test(text)) return "intervention";
  if (/水源|喝水点|草场|迁徙|鹿群|羚羊/.test(text)) return "habitat";
  return "patrol";
}

function detectSupplyPurchase(command, reserve) {
  const text = command || "";
  if (/补齐全部短缺补给|清单:/.test(text)) return supplyReplenishmentPlan(reserve);
  let id = "";
  if (/狗粮|猎犬|侦察/.test(text)) id = "dogFood";
  else if (/警报|防偷|偷猎|边界/.test(text)) id = "alarm";
  else if (/麻醉|干预|转移/.test(text)) id = "tranquilizer";
  else if (/医疗|护理|救助|恢复|医/.test(text)) id = "medicalKit";
  else if (/工具|修复|栖息地/.test(text)) id = "fieldKit";
  const quantityMatch = text.match(/数量[:：]?\s*(\d+)/);
  if (id && quantityMatch) return supplyPurchaseForQuantity(id, Number(quantityMatch[1]), reserve);
  if (id) return supplyPurchaseById(id, reserve);
  const supplies = (reserve && reserve.supplies) || {};
  const ids = ["alarm", "dogFood", "tranquilizer", "fieldKit", "medicalKit"];
  return ids.map((id) => supplyPurchaseById(id, reserve)).filter(Boolean).sort((a, b) => {
    const ar = (supplies[a.id] || 0) / Math.max(1, a.target || 1);
    const br = (supplies[b.id] || 0) / Math.max(1, b.target || 1);
    if (ar !== br) return ar - br;
    return a.cost - b.cost;
  })[0] || supplyPurchaseById("dogFood", reserve);
}

function onsiteRepeatMultiplier(reserve, action) {
  const onsite = ["houndScout", "antiPoacher", "habitat", "intervention", "patrol"];
  const previous = reserve.actionRepeat || { lastAction: null, count: 0 };
  if (!onsite.includes(action)) {
    reserve.actionRepeat = { lastAction: null, count: 0, multiplier: 1 };
    return 1;
  }
  const count = previous.lastAction === action ? Math.max(1, previous.count + 1) : 1;
  const multiplier = BALANCE_V2.repeatMultipliers[Math.min(count - 1, BALANCE_V2.repeatMultipliers.length - 1)];
  reserve.actionRepeat = { lastAction: action, count, multiplier };
  return multiplier;
}

function scaledPositiveGain(current, baseGain, repeatMultiplier = 1) {
  const gain = Math.max(0, Math.round(baseGain * repeatMultiplier * metricGainMultiplier(current)));
  return Math.max(1, gain);
}

function scaledPoacherReduction(current, baseReduction, repeatMultiplier = 1) {
  return Math.max(1, Math.round(baseReduction * repeatMultiplier * poacherReductionMultiplier(current)));
}

function scaledPoacherPressureGain(current, baseGain) {
  const gain = Math.max(0, Number(baseGain) || 0);
  const multiplier = current >= 85 ? 0.25 : current >= 70 ? 0.50 : 1;
  return Math.max(0, Math.round(gain * multiplier));
}

function reserveActionMeta(action) {
  const catalogMeta = catalogReserveActionMeta(action);
  if (catalogMeta && catalogMeta.label !== "巡护") return catalogMeta;
  return {
    exploreMaterials: { label: "动物引路探索", icon: "eye", cost: 1 },
    patrol: { label: "巡护", icon: "trail", cost: 1 },
  }[action] || { label: "巡护", icon: "trail", cost: 1 };
}

function natureKnowledgeFor(world, reserve, weather) {
  const eco = reserve.ecology || {};
  const predators = totalAnimals(eco.predators || {});
  const herbivores = totalAnimals(eco.herbivores || {});
  const season = (world && world.season) || "雨季";
  const facts = [];
  if (season === "雨季") facts.push("雨季会快速补充水草，但持续潮湿会抬高疾病与病虫害风险。");
  if (season === "旱季") facts.push("旱季会压缩水源与草场，动物向饮水点集中，偷猎与捕食风险同步上升。");
  if (weather === "小雨") facts.push("小雨能补水并恢复浅滩，但会冲淡气味，猎犬侦察更依赖旧足迹和地形判断。");
  if (weather === "晴") facts.push("晴天蒸发加快，水源下降会让食草动物缩短觅食距离，捕食者更容易预判路线。");
  if ((eco.disease || 0) > 28) facts.push("病虫害会先削弱幼体和老弱个体，也会让群体减少长距离迁移。");
  if ((eco.grass || 0) < 48) facts.push("草场不足时，鹿和羚羊会扩大取食范围，边缘区域更容易暴露给偷猎者。");
  if ((eco.water || 0) < 48) facts.push("水源低于安全线时，动物会优先选择风险较低的饮水点，而不是最近的饮水点。");
  if (predators * 5 > herbivores) facts.push("捕食者数量过高会压缩食草动物饮水窗口，安全等级会比单纯数量更重要。");
  if (herbivores > 360) facts.push("食草动物过密会加速草场退化，短期看热闹，长期会降低保护区承载力。");
  if ((reserve.poacherPressure || 0) > 52) facts.push("偷猎压力升高时，动物会减少固定路线，猎犬侦察和警报器能显著提高边界安全。");
  if (!facts.length) facts.push("水源、草场、疾病与干扰保持平衡。");
  return facts.slice(0, 3);
}

function totalAnimals(group) {
  return Object.keys(group || {}).reduce((sum, key) => sum + ((group && group[key]) || 0), 0);
}

function rareRecoveredCount(reserve) {
  const keys = ["shedAntlerA", "naturalHide", "researchSample", "recoveredTrap"];
  return keys.reduce((sum, key) => sum
    + (((reserve.inventory || {})[key]) || 0)
    + (((reserve.pendingRecovered || {})[key]) || 0), 0)
    + mysteryEvidenceCount(reserve);
}

function leagueRivalsForSocial(reserve) {
  const league = reserve.league || {};
  const rivals = (league.rivals || []).map((rival) => Object.assign({}, rival, {
    scope: rival.scope || "world",
    simulated: typeof rival.simulated === "boolean" ? rival.simulated : !rival.scope,
    source: rival.source || ((typeof rival.simulated === "boolean" ? rival.simulated : !rival.scope) ? "system" : "player")
  }));
  const seeds = [
    { id: "world_crown", name: "金合欢王冠保护区", owner: "阿澈", rating: 1420, shield: 72, animals: 58, material: 240, style: "高安全等级", scope: "world", simulated: true, source: "system" },
    { id: "world_delta", name: "蓝河口保护区", owner: "南栀", rating: 1336, shield: 46, animals: 64, material: 220, style: "水源经营", scope: "world", simulated: true, source: "system" },
    { id: "world_redsand", name: "赤沙北线保护区", owner: "卷石", rating: 1258, shield: 34, animals: 49, material: 185, style: "高迁入", scope: "world", simulated: true, source: "system" },
    { id: "world_shade", name: "阴影林缘保护区", owner: "木眠", rating: 1168, shield: 61, animals: 38, material: 150, style: "防守反击", scope: "world", simulated: true, source: "system" }
  ];
  const byId = {};
  const realWorldCount = rivals.filter((rival) => rival.scope === "world" && !rival.simulated).length;
  const pool = realWorldCount >= 12 ? rivals.filter((rival) => !rival.simulated) : rivals.concat(seeds);
  pool.forEach((rival) => { byId[rival.id] = Object.assign({}, byId[rival.id] || {}, rival); });
  return Object.keys(byId).map((id) => byId[id]);
}

function buildSocialPulse(world, reserve, day) {
  const rivals = leagueRivalsForSocial(reserve);
  const base = reserve.base || {};
  const index = rivals.length ? day % rivals.length : 0;
  const actor = rivals[index] || { name: "邻近保护区", rating: 1100, shield: 40, animals: 30, material: 120, style: "平衡经营", scope: "friends" };
  const avgRating = rivals.length ? Math.round(rivals.reduce((sum, rival) => sum + (rival.rating || 0), 0) / rivals.length) : 1100;
  const ratingGap = (base.rating || 1100) - avgRating;
  const phase = day % 4;
  const highSafety = (actor.shield || 0) >= 58 || /安全|防|水源/.test(actor.style || "");
  const highHarvest = (actor.material || 0) >= 180 || /收益|资源/.test(actor.style || "");
  let pulse;
  if (phase === 0) {
    pulse = {
      title: `${actor.name}加固防护网`,
      action: "加固",
      marketDelta: -3,
      migrationDelta: highSafety && ratingGap < 0 ? -3 : -1,
      salvageDelta: 0,
      pressure: 2,
      priceNote: "周边保护区减少样本移交，鹿角研究热度小幅回落。",
      migrationNote: `${actor.name}的安全线变厚，部分胆小动物会先去那里试水。`,
      salvageNote: "回收物供给暂时稳定。"
    };
  } else if (phase === 1) {
    pulse = {
      title: `${actor.name}大量回收鹿角`,
      action: "回收",
      marketDelta: highHarvest ? -8 : -5,
      migrationDelta: 0,
      salvageDelta: -1,
      pressure: 1,
      priceNote: "多座保护区集中移交样本，今日项目拨款趋于平稳。",
      migrationNote: "动物迁移不明显，但人类活动让边缘更吵。",
      salvageNote: "共享回收池被抢收，今天能捡到的好东西变少。"
    };
  } else if (phase === 2) {
    pulse = {
      title: `${actor.name}偷猎警报外溢`,
      action: "告警",
      marketDelta: 6,
      migrationDelta: ratingGap >= 0 ? 2 : -2,
      salvageDelta: 1,
      pressure: 5,
      priceNote: "世界频道出现偷猎告警，研究样本和执法证据需求上升。",
      migrationNote: ratingGap >= 0 ? "你的保护区安全更高，少量动物会向这里靠近。" : "更强保护区吸走了边缘动物，你这里要补安全感。",
      salvageNote: "边界巡护更容易追回陷阱证据。"
    };
  } else {
    pulse = {
      title: `${actor.name}水源修复成功`,
      action: "修复",
      marketDelta: 3,
      migrationDelta: highSafety ? -2 : 1,
      salvageDelta: 0,
      pressure: 0,
      priceNote: "水源修复带动科研关注，研究样本项目拨款小幅增加。",
      migrationNote: highSafety ? "水源好的保护区会吸引象群和羚羊，迁移竞争变强。" : "区域水线改善，迁移压力稍微放松。",
      salvageNote: "回收物供给正常。"
    };
  }
  return Object.assign({
    day,
    actor: actor.name,
    actorScope: actor.scope || "friends",
    avgRating,
    ratingGap,
    log: `${pulse.title}：${pulse.migrationNote}`
  }, pulse);
}

function applySocialPulse(reserve, pulse, action) {
  reserve.social = pulse;
  reserve.market.antler = clampRange(Math.round((reserve.market.antler || 86) + pulse.marketDelta), 45, 150);
  reserve.market.hideSalvage = clampRange(Math.round((reserve.market.hideSalvage || 124) + Math.round(pulse.marketDelta * 1.3)), 70, 220);
  reserve.market.researchSample = clampRange(Math.round((reserve.market.researchSample || 42) + Math.max(-3, Math.round(pulse.marketDelta / 2))), 24, 96);
  reserve.poacherPressure = clamp((reserve.poacherPressure || 0) + scaledPoacherPressureGain(reserve.poacherPressure || 0, pulse.pressure || 0));
  if (action === "salvage" && (pulse.salvageDelta || 0) > 0) {
    reserve.inventory.recoveredTrap = (reserve.inventory.recoveredTrap || 0) + pulse.salvageDelta;
  }
  return pulse;
}

function isSocialRecoveryCommand(command) {
  return /抢回回收物|追回回收物|共享回收点|回收物搜寻/.test(String(command || ""));
}

function reserveSafetyScore(reserve) {
  const eco = reserve.ecology || {};
  const predators = totalAnimals(eco.predators);
  const herbivores = totalAnimals(eco.herbivores);
  const preyBalance = Math.max(0, 100 - Math.abs(herbivores - 320) * 0.22);
  const predatorPressure = Math.max(0, 100 - Math.max(0, predators * 5 - herbivores) * 0.7);
  const waterAccess = clamp((eco.water || 0) - Math.max(0, predators - 30) * 0.8);
  const poacherSafe = clamp(100 - (reserve.poacherPressure || 0));
  const healthSafe = clamp(100 - ((eco.disease || 0) * 1.4));
  const habitat = clamp(((eco.grass || 0) + waterAccess) / 2);
  const shield = (reserve.base && reserve.base.shield) || 0;
  return clamp(Math.round(
    preyBalance * 0.24 +
    predatorPressure * 0.16 +
    waterAccess * 0.20 +
    poacherSafe * 0.22 +
    healthSafe * 0.10 +
    habitat * 0.05 +
    shield * 0.03
  ));
}

function applyMigrationPopulationDelta(reserve, amount) {
  const delta = Math.round(Number(amount) || 0);
  if (!delta) return;
  const eco = reserve.ecology || (reserve.ecology = {});
  const herbivores = eco.herbivores || (eco.herbivores = {});
  const protectedAnimals = (reserve.base && reserve.base.protectedAnimals) || {};
  if (delta > 0) {
    herbivores.deer = (herbivores.deer || 0) + Math.ceil(delta * 0.55);
    herbivores.antelope = (herbivores.antelope || 0) + Math.floor(delta * 0.45);
    protectedAnimals.deer = (protectedAnimals.deer || 0) + Math.ceil(delta * 0.4);
  } else if (delta < 0) {
    const loss = Math.abs(delta);
    herbivores.deer = Math.max(20, (herbivores.deer || 0) - Math.ceil(loss * 0.55));
    herbivores.antelope = Math.max(15, (herbivores.antelope || 0) - Math.floor(loss * 0.45));
    protectedAnimals.deer = Math.max(0, (protectedAnimals.deer || 0) - Math.ceil(loss * 0.35));
  }
}

function enforceHabitatMigrationConsistency(reserve, migration = reserve.migration, beforeEcology) {
  const current = Object.assign({ trend: "stable", delta: 0, reason: "" }, migration || {});
  const consistent = consistentMigrationSnapshot(reserve, current, beforeEcology);
  const adjustment = Math.round((consistent.delta || 0) - (current.delta || 0));
  if (adjustment) applyMigrationPopulationDelta(reserve, adjustment);
  reserve.migration = Object.assign({}, current, consistent);
  return reserve.migration;
}

function applyAnimalMigration(reserve, beforeEcology) {
  const assessment = habitatMigrationAssessment(reserve, beforeEcology);
  applyMigrationPopulationDelta(reserve, assessment.delta);
  // 旧存档仍保留 safety/stability 字段，但只作为生态总况的兼容镜像，
  // 不再是玩家需要管理的独立数值。
  reserve.safety = assessment.ecologyScore;
  reserve.stability = assessment.ecologyScore;
  reserve.ecologyScore = assessment.ecologyScore;
  reserve.migration = { trend: assessment.trend, delta: assessment.delta, reason: assessment.reason };
  if (reserve.base) {
    reserve.base.rating = Math.max(800, Math.round((reserve.base.rating || 1100) + (assessment.ecologyScore - 60) * 0.35 + assessment.delta * 2));
  }
  return reserve.migration;
}

function applySeasonalMigration(reserve, seasonState) {
  const dynamics = reserve.seasonDynamics || {};
  if (!seasonState || seasonState.name !== "旱季") return reserve.migration;
  const eco = reserve.ecology || {};
  const herbivores = eco.herbivores || {};
  const safeRoute = (eco.water || 0) >= 45 && (eco.grass || 0) >= 42 && (eco.disease || 0) <= 36;
  const routePulse = seasonState.day % 2 === 0 ? (safeRoute ? 1 : -1) : 0;
  const elephantPresent = (herbivores.elephant || 0) > 0;
  const elephantPulse = elephantPresent && seasonState.day % 3 === 0 ? (safeRoute ? 1 : -1) : 0;
  if (elephantPulse) herbivores.elephant = Math.max(0, (herbivores.elephant || 0) + elephantPulse);
  const pulse = routePulse + elephantPulse;
  dynamics.migrationPulse = pulse;
  dynamics.elephantPulse = elephantPulse;
  dynamics.migrationText = elephantPresent
    ? (safeRoute ? "象群沿旧井与干河床重新连接迁徙路线" : "象群离开拥挤水点，向保护区外寻找旧水路")
    : (safeRoute ? "动物沿少数安全水点重新排列迁徙路线" : "水点压力迫使动物向外寻找水源");
  if (!pulse) return reserve.migration;
  const base = reserve.migration || { trend: "stable", delta: 0, reason: "动物保持观望" };
  const delta = (base.delta || 0) + pulse;
  reserve.migration = {
    trend: delta > 0 ? "in" : delta < 0 ? "out" : "stable",
    delta,
    reason: `${base.reason}；${dynamics.migrationText}`
  };
  return reserve.migration;
}

function applySocialMigration(reserve, pulse) {
  const extra = (pulse && pulse.migrationDelta) || 0;
  if (!extra) return reserve.migration;
  applyMigrationPopulationDelta(reserve, extra);
  const baseDelta = (reserve.migration && reserve.migration.delta) || 0;
  const delta = baseDelta + extra;
  reserve.migration = {
    trend: delta > 0 ? "in" : delta < 0 ? "out" : "stable",
    delta,
    reason: `${(reserve.migration && reserve.migration.reason) || "动物保持观望"}；${pulse.migrationNote}`
  };
  if (reserve.base) {
    reserve.base.rating = Math.max(800, Math.round((reserve.base.rating || 1100) + extra * 3));
  }
  return reserve.migration;
}

function guardianGrade(score) {
  if (score >= 88) return "S";
  if (score >= 76) return "A";
  if (score >= 64) return "B";
  if (score >= 50) return "C";
  return "D";
}

function reserveProgressionFor(reserve) {
  const eco = reserve.ecology || {};
  // 晋级评分就是玩家能理解的“保护区生态”：水源、草场、疾病与迁徙。
  // 不再让安全、经营、声誉等隐藏指标暗中卡住章节。
  const score = reserveEcologyScore(reserve);
  const tiers = [
    { level: 1, title: "临时营地", benefit: "动物只把这里当作临时路过点。" },
    { level: 2, title: "稳定保护站", benefit: "动物愿意短暂停留，猎犬线索更可靠。" },
    { level: 3, title: "可信保护区", benefit: "食草动物开始迁入，鸟类会更早报警。" },
    { level: 4, title: "核心庇护地", benefit: "幼兽和弱势动物更愿意靠近核心区。" },
    { level: 5, title: "旗舰保护区", benefit: "动物用迁移路线投票，这里成为区域样板。" }
  ];
  const previousLevel = clampRange(Math.round(((reserve.progression || {}).level) || 1), 1, 5);
  const prior = reserve.progression || {};
  const previousStage = clampRange(Math.round(prior.stage || (previousLevel * 2 - 1)), 1, 10);
  const daysManaged = Math.max(0, Math.round(prior.daysManaged || 0));
  const totalActions = Math.max(0, Math.round(prior.totalActions || daysManaged));
  const strategy = reserve.strategy || {};
  // Strategy choices are often confirmed after the operation settlement has
  // already produced a progression snapshot. Always merge the two canonical
  // counters so a resolved choice cannot be hidden behind that older snapshot.
  const totalMeaningfulActions = Math.max(0, Math.round(Math.max(
    prior.totalMeaningfulActions || 0,
    strategy.totalMeaningfulActions || 0,
    totalActions
  )));
  const totalStrategicChoices = Math.max(0, Math.round(Math.max(
    prior.totalStrategicChoices || 0,
    strategy.totalChoices || 0
  )));
  const totalMajorStrategicChoices = Math.max(0, Math.round(Math.max(
    prior.totalMajorStrategicChoices || 0,
    strategy.totalMajorChoices || 0
  )));
  const activeSeconds = Math.max(0, Number(prior.activeSeconds || 0));
  const totalFundEarned = Math.max(0, Math.round(prior.totalFundEarned || 0));
  const totalMigratedIn = Math.max(0, Math.round(prior.totalMigratedIn || 0));
  const totalRareRecovered = Math.max(0, Math.round(prior.totalRareRecovered || 0));
  const storedStart = prior.stageStart || prior.chapterStart || {};
  const chapterStart = storedStart.stage === previousStage ? {
    stage: previousStage,
    level: previousLevel,
    daysManaged: Math.max(0, Math.round(storedStart.daysManaged || 0)),
    totalActions: Math.max(0, Math.round(storedStart.totalActions || 0)),
    totalMeaningfulActions: Math.max(0, Math.round(storedStart.totalMeaningfulActions || storedStart.totalActions || 0)),
    totalStrategicChoices: Math.max(0, Math.round(storedStart.totalStrategicChoices || 0)),
    totalMajorStrategicChoices: Math.max(0, Math.round(storedStart.totalMajorStrategicChoices || 0)),
    activeSeconds: Math.max(0, Number(storedStart.activeSeconds || 0)),
    totalFundEarned: Math.max(0, Math.round(storedStart.totalFundEarned || 0)),
    totalMigratedIn: Math.max(0, Math.round(storedStart.totalMigratedIn || 0)),
    totalRareRecovered: Math.max(0, Math.round(storedStart.totalRareRecovered || 0)),
    bestScore: Math.max(0, Math.round(storedStart.bestScore || 0))
  } : {
    stage: previousStage,
    level: previousLevel,
    daysManaged,
    totalActions,
    totalMeaningfulActions,
    totalStrategicChoices,
    totalMajorStrategicChoices,
    activeSeconds,
    totalFundEarned,
    totalMigratedIn,
    totalRareRecovered,
    bestScore: score
  };
  const gate = progressionGate(previousStage);
  const chapterActions = Math.max(0, totalMeaningfulActions - chapterStart.totalMeaningfulActions);
  const chapterStrategicChoices = Math.max(0, totalStrategicChoices - chapterStart.totalStrategicChoices);
  const chapterMajorStrategicChoices = Math.max(0, totalMajorStrategicChoices - chapterStart.totalMajorStrategicChoices);
  const chapterDays = Math.max(0, daysManaged - chapterStart.daysManaged);
  const chapterActiveMinutes = Math.max(0, Math.floor((activeSeconds - chapterStart.activeSeconds) / 60));
  const chapterFundEarned = Math.max(0, totalFundEarned - chapterStart.totalFundEarned);
  const chapterMigratedIn = Math.max(0, totalMigratedIn - chapterStart.totalMigratedIn);
  const chapterRareRecovered = Math.max(0, totalRareRecovered - chapterStart.totalRareRecovered);
  const stageBestScore = Math.max(score, Math.round(prior.stageBestScore || chapterStart.bestScore || 0));
  const animalTotal = totalAnimals(eco.predators || {}) + totalAnimals(eco.herbivores || {}) + totalAnimals(eco.birds || {});
  const storyCaseProgress = ((reserve.storyDiscoveries || {})[`case_${previousLevel}`]) || {};
  const storyEvidenceTarget = previousStage % 2 === 0 ? 3 : 1;
  const milestoneGoals = [
    { id: "storyEvidence", label: "找到案件主证据", current: Math.max(0, storyCaseProgress.evidence || 0), target: storyEvidenceTarget, unit: "件" },
    { id: "population", label: "动物总量", current: animalTotal, target: gate.population, unit: "只" },
    { id: "fundEarned", label: "累计赚取基金", current: chapterFundEarned, target: gate.fundEarned, unit: "" },
    { id: "migratedIn", label: "迎来迁入动物", current: chapterMigratedIn, target: gate.migratedIn, unit: "只" },
    { id: "rareRecovered", label: "回收珍稀物品", current: chapterRareRecovered, target: gate.rareRecovered, unit: "件" }
  ].map((item) => Object.assign({}, item, { complete: item.current >= item.target }));
  const milestoneDone = milestoneGoals.filter((item) => item.complete).length;
  const eventChain = reserve.eventChain || {};
  const eventChapterMatches = Math.max(1, Math.round(eventChain.chapterLevel || previousLevel)) === previousLevel;
  const eventStep = eventChapterMatches ? Math.max(0, Math.round(eventChain.step || 0)) : 0;
  const eventComplete = eventChapterMatches
    && eventStep >= gate.storyBeats
    && (gate.storyBeats < Math.max(1, eventChain.length || 7) || !!eventChain.completed);
  const mandatoryGoals = [
    { id: "actions", label: "有效经营操作", current: chapterActions, target: gate.actions, unit: "次", complete: chapterActions >= gate.actions },
    { id: "strategicChoices", label: "战略抉择", current: chapterStrategicChoices, target: gate.strategicChoices, unit: "次", complete: chapterStrategicChoices >= gate.strategicChoices },
    { id: "majorStrategicChoices", label: "重大抉择", current: chapterMajorStrategicChoices, target: gate.majorChoices, unit: "次", complete: chapterMajorStrategicChoices >= gate.majorChoices },
    { id: "score", label: "本阶最高评分", current: stageBestScore, target: gate.score, unit: "", complete: stageBestScore >= gate.score },
    { id: "chapterStory", label: "阶段剧情", current: eventStep, target: gate.storyBeats, unit: "段", complete: eventComplete }
  ];
  const stageComplete = mandatoryGoals.every((item) => item.complete) && milestoneDone >= gate.milestoneNeed;
  // 最终章一旦验收完成就是永久成就。水草与种群仍会继续波动，但不能把
  // 已播放过的终章和长期目标重新撤销。
  const finalComplete = previousStage === 10 && (!!prior.chapterComplete || stageComplete);
  const stage = previousStage < 10 && stageComplete ? previousStage + 1 : previousStage;
  const level = Math.max(previousLevel, Math.ceil(stage / 2));
  const tier = tiers.find((item) => item.level === level) || tiers[0];
  const nextTier = tiers.find((item) => item.level === tier.level + 1) || null;
  const upgraded = stage > previousStage;
  const levelUpgraded = level > previousLevel;
  const nextChapterStart = upgraded ? {
    stage,
    level,
    daysManaged,
    totalActions,
    totalMeaningfulActions,
    // A story chapter spans two operating stages. Actions and material
    // milestones reset every stage, while decisions keep accumulating through
    // both halves and reset only when the story level changes.
    totalStrategicChoices: levelUpgraded ? totalStrategicChoices : chapterStart.totalStrategicChoices,
    totalMajorStrategicChoices: levelUpgraded ? totalMajorStrategicChoices : chapterStart.totalMajorStrategicChoices,
    activeSeconds,
    totalFundEarned,
    totalMigratedIn,
    totalRareRecovered,
    bestScore: score
  } : chapterStart;
  const timeProgress = Math.max(0, Math.min(1, chapterActiveMinutes / Math.max(1, gate.expectedMinutes)));
  const actionProgress = Math.max(0, Math.min(1, chapterActions / Math.max(1, gate.actions)));
  const choiceProgress = Math.max(0, Math.min(1, chapterStrategicChoices / Math.max(1, gate.strategicChoices)));
  const majorChoiceProgress = gate.majorChoices <= 0 ? 1 : Math.max(0, Math.min(1, chapterMajorStrategicChoices / gate.majorChoices));
  const scoreProgress = Math.max(0, Math.min(1, score / Math.max(1, gate.score)));
  const milestoneProgress = Math.max(0, Math.min(1, milestoneDone / Math.max(1, gate.milestoneNeed)));
  const storyProgress = Math.max(0, Math.min(1, eventStep / Math.max(1, gate.storyBeats)));
  const progress = upgraded ? 0 : Math.min(actionProgress, choiceProgress, majorChoiceProgress, scoreProgress, storyProgress, milestoneProgress);
  const objectives = mandatoryGoals
    .concat([{ id: "expectedTime", label: "预计体验时长", current: chapterActiveMinutes, target: gate.expectedMinutes, unit: "分钟", complete: chapterActiveMinutes >= gate.expectedMinutes, optional: true }])
    .concat(milestoneGoals.map((item) => Object.assign({}, item, { optional: true })));
  const nextGate = progressionGate(stage);
  return {
    level: tier.level,
    stage,
    displayChapter: stage,
    storyLevel: tier.level,
    daysManaged,
    totalActions,
    totalMeaningfulActions,
    totalStrategicChoices,
    totalMajorStrategicChoices,
    activeSeconds,
    totalFundEarned,
    totalMigratedIn,
    totalRareRecovered,
    stageBestScore: upgraded ? score : stageBestScore,
    chapterStart: nextChapterStart,
    stageStart: nextChapterStart,
    chapterActions: upgraded ? 0 : chapterActions,
    chapterStrategicChoices: upgraded ? 0 : chapterStrategicChoices,
    chapterMajorStrategicChoices: upgraded ? 0 : chapterMajorStrategicChoices,
    chapterDays: upgraded ? 0 : chapterDays,
    chapterActiveMinutes: upgraded ? 0 : chapterActiveMinutes,
    chapterFundEarned: upgraded ? 0 : chapterFundEarned,
    chapterMigratedIn: upgraded ? 0 : chapterMigratedIn,
    chapterRareRecovered: upgraded ? 0 : chapterRareRecovered,
    title: tier.title,
    score,
    progress,
    scoreProgress,
    dayProgress: actionProgress,
    timeProgress,
    actionProgress,
    choiceProgress,
    majorChoiceProgress,
    storyProgress,
    milestoneProgress,
    milestoneDone: upgraded ? 0 : milestoneDone,
    milestoneNeed: nextGate.milestoneNeed,
    objectives: upgraded ? [] : objectives,
    stageComplete: stage === 10 ? finalComplete : false,
    chapterComplete: stage === 10 ? finalComplete : false,
    levelUpgraded,
    nextDays: nextGate.actions,
    nextScore: nextGate.score,
    nextTitle: nextTier ? nextTier.title : "区域样板",
    benefit: tier.benefit,
    gate: nextGate
  };
}

function applySpeciesPopulationDynamics(reserve) {
  reconcileSpeciesPopulations(reserve, { removeLocked: true, initializeUnlocked: true });
  const eco = reserve.ecology || {};
  const capacity = habitatCapacitySnapshot(reserve);
  const level = Math.max(1, Math.min(5, Math.round(((reserve.progression || {}).level) || 1)));
  const preyTotal = totalAnimals(eco.herbivores || {});
  const predatorTotal = totalAnimals(eco.predators || {});
  const water = numberOr(eco.water, 60);
  const grass = numberOr(eco.grass, 60);
  const disease = numberOr(eco.disease, 10);
  const totalPopulation = preyTotal + predatorTotal + totalAnimals(eco.birds || {});
  const carryingCapacity = BALANCE_V2.population.carryingCapacity[level] || BALANCE_V2.population.carryingCapacity[5];
  const populationGrowthMultiplier = totalPopulation >= carryingCapacity * BALANCE_V2.population.nearCapacityRatio
    ? BALANCE_V2.population.nearCapacityGrowthMultiplier
    : 1;

  getUnlockedSpecies(level).forEach((sp) => {
    const group = speciesPopulationGroup(sp.id);
    const populations = eco[group] || (eco[group] = {});
    const current = Math.max(0, Math.round(populations[sp.id] || 0));
    if (!current) return;
    const waterSignal = (water - 55) / 25;
    const grassSignal = (grass - 55) / 25;
    const healthSignal = (35 - disease) / 35;
    const wetlandSpecies = ["flamingo", "hippo", "crocodile", "mink"].includes(sp.id);
    const predatorSpecies = group === "predators";
    let signal = wetlandSpecies
      ? waterSignal * 0.62 + grassSignal * 0.18 + healthSignal * 0.20
      : predatorSpecies
        ? waterSignal * 0.25 + grassSignal * 0.45 + healthSignal * 0.30
        : waterSignal * 0.38 + grassSignal * 0.42 + healthSignal * 0.20;
    const capacityRatio = current / Math.max(1, sp.maxPop || current);
    if (capacityRatio >= 0.9) signal -= 0.75;
    else if (capacityRatio <= 0.3) signal += 0.16;
    if (group === "predators") {
      const preyPerPredator = preyTotal / Math.max(1, predatorTotal);
      signal += preyPerPredator >= 5 ? 0.18 : preyPerPredator < 3.5 ? -0.45 : 0;
    }
    if (wetlandSpecies && water < 45) signal -= 0.8;
    // 水草短板与总承载优先于平均生态分。草场已进入高风险时，
    // 食草种群不能再因为水源充足而继续增长。
    if (group === "herbivores" && grass <= 38) signal -= 1.05;
    if (water <= 40) signal -= wetlandSpecies ? 1.15 : 0.55;
    if (capacity.loadRatio > 1) signal -= Math.min(1.2, (capacity.loadRatio - 1) * 1.25);

    let delta = 0;
    if (signal > 0.18 && Math.random() < 0.62 * populationGrowthMultiplier) delta = Math.max(1, Math.min(BALANCE_V2.population.maxGrowthPerAction, Math.round(current * 0.018 * BALANCE_V2.tuning.populationGrowthScale)));
    else if (signal < -0.18 && Math.random() < 0.72) delta = -Math.max(1, Math.min(3, Math.round(current * 0.015)));
    populations[sp.id] = Math.max(0, Math.min(sp.maxPop, current + delta));
  });
}

function applyWaterGrassHealthDynamics(reserve) {
  const eco = reserve.ecology || (reserve.ecology = {});
  const water = clamp(eco.water || 0);
  const grass = clamp(eco.grass || 0);
  const beforeDisease = clamp(eco.disease || 0);
  const waterPressure = water < 50 ? Math.ceil((50 - water) / 15) : 0;
  const grassPressure = grass < 48 ? Math.ceil((48 - grass) / 18) : 0;
  // When disease is already widespread, migration and lower animal density
  // naturally slow transmission. This soft ceiling keeps a neglected habitat
  // recoverable without making healthy water/grass irrelevant.
  const endemicRecovery = beforeDisease >= 78 ? 3 : beforeDisease >= 65 ? 2 : beforeDisease >= 52 ? 1 : 0;
  const recovery = (water >= 68 && grass >= 65 ? 2 : water >= 58 && grass >= 55 ? 1 : 0) + endemicRecovery;
  const diseaseDelta = Math.min(3, waterPressure + grassPressure) - recovery;
  eco.disease = clamp(beforeDisease + diseaseDelta);
  reserve.habitatHealth = {
    score: clamp(Math.round(water * 0.42 + grass * 0.42 + (100 - eco.disease) * 0.16)),
    diseaseBefore: beforeDisease,
    diseaseAfter: eco.disease,
    diseaseDelta: eco.disease - beforeDisease,
    water,
    grass,
    reason: diseaseDelta > 0
      ? (waterPressure >= grassPressure ? "水源不足使动物集中，疾病风险上升" : "草场不足使动物营养和抵抗力下降")
      : diseaseDelta < 0
        ? "水源与草场恢复，动物健康压力下降"
        : "水草承载与疾病风险暂时平衡"
  };
  return reserve.habitatHealth;
}

function applyLivingHabitatPressure(reserve, seasonState, context = {}) {
  const eco = reserve.ecology || (reserve.ecology = {});
  if (!context.dayClosed) {
    reserve.lastHabitatBalance = {
      deferred: true,
      note: "入夜后，动物取食、迁徙、偷猎与疾病才统一结算水草承载。"
    };
    return reserve.lastHabitatBalance;
  }

  const herbivores = totalAnimals(eco.herbivores || {});
  const predators = totalAnimals(eco.predators || {});
  const birds = totalAnimals(eco.birds || {});
  const weightedAnimals = herbivores + predators * 1.5 + birds * 0.25;
  const migration = reserve.migration || {};
  const migrationDelta = Math.round(migration.delta || 0);
  const poachers = clamp(reserve.poacherPressure || 0);
  const disease = clamp(eco.disease || 0);
  const beforeWater = clamp(eco.water || 0);
  const beforeGrass = clamp(eco.grass || 0);

  // 动物越多，每个守护日的水草消耗越明显；迁入当日还会带来一次适应压力。
  // 迁出或低承载并不“凭空发资源”，只让草场获得一小段自然恢复窗口。
  const waterUse = clampRange(Math.floor(weightedAnimals / 320), 0, 2);
  const grassUse = clampRange(Math.floor(herbivores / 260), 0, 2);
  const migrationWater = migrationDelta > 0 ? clampRange(Math.ceil(migrationDelta / 6), 0, 1) : 0;
  const migrationGrass = migrationDelta > 0 ? clampRange(Math.ceil(migrationDelta / 5), 0, 1) : 0;
  const poacherDamage = poachers >= 62 ? 1 : 0;
  const diseaseWater = disease >= 40 ? 1 : 0;
  const diseaseGrass = disease >= 65 ? 1 : 0;
  const lowLoadRecovery = weightedAnimals < 260 && beforeGrass >= 38 ? 1 : 0;
  const migrationRelief = migrationDelta <= -3 ? 1 : 0;
  const rainRecovery = seasonState && seasonState.name === "雨季" && beforeGrass < 45 ? 1 : 0;
  const managedRecovery = beforeGrass < 55 && beforeWater >= 55 && poachers < 45 && disease < 40 ? 1 : 0;
  const naturalGrassRecovery = Math.min(2, lowLoadRecovery + migrationRelief + rainRecovery + managedRecovery);
  const lushGrassOutflow = beforeGrass >= 90 ? 2 : beforeGrass >= 82 ? 1 : 0;
  // 高水位会通过河道外流、湿地渗透和蒸发自然回落，形成约 65–75 的
  // 长期平衡带。它不是惩罚，也不抵消玩家在低水位时的修复收益。
  const naturalWaterOutflow = beforeWater >= 85 ? 8 : beforeWater >= 75 ? 6 : beforeWater >= 68 ? 4 : beforeWater >= 62 ? 2 : 0;

  const waterDelta = -(waterUse + migrationWater + poacherDamage + diseaseWater + naturalWaterOutflow);
  const grassDelta = -(grassUse + migrationGrass + poacherDamage + diseaseGrass + lushGrassOutflow) + naturalGrassRecovery;
  eco.water = clamp(beforeWater + waterDelta);
  eco.grass = clamp(beforeGrass + grassDelta);

  const reasons = [];
  if (waterUse || grassUse) reasons.push(`${Math.round(weightedAnimals)}只加权动物消耗水草`);
  if (migrationWater || migrationGrass) reasons.push(`迁入 ${migrationDelta} 只提高当日承载压力`);
  if (migrationRelief) reasons.push("动物迁出后草场获得恢复窗口");
  if (managedRecovery) reasons.push("水线稳定且风险受控，草场自然返青");
  if (poacherDamage) reasons.push("偷猎干扰破坏固定饮水与觅食路线");
  if (diseaseWater || diseaseGrass) reasons.push("疾病聚集污染水点并削弱草场利用");
  if (naturalWaterOutflow) reasons.push(`高水位自然外流 -${naturalWaterOutflow}`);
  if (lushGrassOutflow) reasons.push(`成熟草场自然更新 -${lushGrassOutflow}`);
  if (naturalGrassRecovery) reasons.push(`自然恢复草场 +${naturalGrassRecovery}`);
  reserve.lastHabitatBalance = {
    deferred: false,
    weightedAnimals: Math.round(weightedAnimals),
    migrationDelta,
    poacherPressure: poachers,
    disease,
    water: { before: beforeWater, after: eco.water, delta: eco.water - beforeWater, consumption: waterUse + migrationWater, animalConsumption: waterUse, migrationConsumption: migrationWater, damage: poacherDamage + diseaseWater, outflow: naturalWaterOutflow },
    grass: { before: beforeGrass, after: eco.grass, delta: eco.grass - beforeGrass, consumption: grassUse + migrationGrass, animalConsumption: grassUse, migrationConsumption: migrationGrass, damage: poacherDamage + diseaseGrass, recovery: naturalGrassRecovery, outflow: lushGrassOutflow },
    reasons,
    note: reasons.join("；") || "动物承载与水草暂时平衡"
  };
  return reserve.lastHabitatBalance;
}

function finalizeSpeciesChanges(reserve, beforeReserve) {
  reconcileSpeciesPopulations(reserve, { removeLocked: true, initializeUnlocked: true });
  const changes = {};
  Object.keys(SPECIES_DB).forEach((speciesId) => {
    changes[speciesId] = speciesPopulation(reserve, speciesId) - speciesPopulation(beforeReserve, speciesId);
  });
  reserve.speciesChanges = changes;
  return changes;
}

function animalTrustTierFor(trust) {
  const value = clamp(Math.round(trust || 40));
  if (value >= 88) return { id: "soulmate", title: "托付", progress: 1, next: 100 };
  if (value >= 74) return { id: "trusted", title: "信任", progress: (value - 74) / 14, next: 88 };
  if (value >= 58) return { id: "familiar", title: "熟悉", progress: (value - 58) / 16, next: 74 };
  if (value >= 42) return { id: "watching", title: "观望", progress: (value - 42) / 16, next: 58 };
  return { id: "wary", title: "戒备", progress: value / 42, next: 42 };
}

function animalCareLevelFor(animal, reserve) {
  const relation = (animal && animal.relation) || {};
  const progression = reserveProgressionFor(reserve || {});
  const trust = relation.trust || 40;
  const threat = relation.threat || 40;
  const ecologyRank = (animal && animal.rank) || 2;
  return clampRange(Math.round(
    trust * 0.50 +
    progression.score * 0.28 +
    ecologyRank * 4 -
    threat * 0.10
  ), 1, 100);
}

const SEVEN_DAY_CHAIN = [
  { title: "立旗：第一次巡线", prompt: "让猎犬队跑出气味线。", good: "边界气味变清楚，胆小的动物开始记住你的脚步。", bad: "气味线还断着，偷猎者和动物都在试探。" },
  { title: "水线：试探回流", prompt: "稳住水源，让食草动物敢靠近。", good: "水边脚印变多，鹿群开始把幼兽带近一点。", bad: "水边仍紧，动物喝水像抢时间。" },
  { title: "暗脚印：偷猎转向", prompt: "压低偷猎压力，别让坏脚印绕开警戒。", good: "坏脚印被赶到外圈，乌鸦少喊了两声。", bad: "直线脚印还在，动物会绕更远的路。" },
  { title: "病虫风：草场自救", prompt: "修复草场或降低过度取食。", good: "草场缓过一口气，迁移线不再绷得太紧。", bad: "病虫和啃食压力叠在一起，草地有点发虚。" },
  { title: "迁移夜：动物投票", prompt: "守住安全，让动物用脚选择留下。", good: "夜里多了回流蹄声，保护区开始像真正的庇护地。", bad: "有动物向边界外试探，安全感还不够厚。" },
  { title: "边界战：防护网考验", prompt: "用补给、警报器和猎犬守住外圈。", good: "外圈守住了，猎犬队的路线被动物记成好消息。", bad: "外圈仍漏风，明天要先补短板。" },
  { title: "森林评议：阶段回声", prompt: "让水源、草场和动物状态同时过线。", good: "动物把这里写进路线，本章事件完成一轮闭环。", bad: "阶段故事收束了，但森林还没有完全点头。" }
];

const SEVEN_DAY_BRANCHES = {
  tracker: SEVEN_DAY_CHAIN,
  defender: SEVEN_DAY_CHAIN.map((chapter, index) => Object.assign({}, chapter, {
    title: [`边界线：第一次封口`, `边界线：水源封锁`, `边界线：假脚印`, `边界线：夜间警报`, `边界线：回流通道`, `边界线：防护网考验`, `边界线：守望评议`][index],
    prompt: [`用警报器和猎犬摸清外圈入口。`, `封住危险入口，别让饮水线变成偷渡线。`, `识别假脚印，把压力赶回边界外。`, `让夜间警戒覆盖最薄的一段网。`, `给回流动物留出安全通道。`, `把补给和猎犬集中到最后一道防线。`, `让水源、草场和动物回流同时过线。`][index]
  })),
  steward: SEVEN_DAY_CHAIN.map((chapter, index) => Object.assign({}, chapter, {
    title: [`水草线：先看一口水`, `水草线：浅滩回声`, `水草线：草场分流`, `水草线：病味退潮`, `水草线：动物投票`, `水草线：恢复点守护`, `水草线：生态评议`][index],
    prompt: [`确认水源和草场的短板，不要急着追所有脚印。`, `修复饮水点，让弱小动物先有退路。`, `分散草场压力，避免食草动物挤在一处。`, `处理病虫风险，给草场一个恢复窗口。`, `让动物用脚选择留下还是迁移。`, `保护恢复点，别让短期回流再次挤垮生态。`, `让水源、草场和动物健康同时过线。`][index]
  }))
};

const EVENT_BRANCH_LABELS = {
  tracker: "追踪线",
  defender: "边界线",
  steward: "水草线",
  ledger: "补给线"
};

function eventBranchForAction(action) {
  if (action === "antiPoacher") return "defender";
  if (action === "habitat" || action === "intervention") return "steward";
  if (action === "salvage" || action === "buySupplies") return "ledger";
  return "tracker";
}

function eventBranchChapters(branch) {
  if (branch === "ledger") {
    return SEVEN_DAY_CHAIN.map((chapter, index) => Object.assign({}, chapter, {
      title: [`补给线：先稳账本`, `补给线：狗粮与水`, `补给线：拨款变化`, `补给线：库存告急`, `补给线：样本去向`, `补给线：外勤准备`, `补给线：保护区结算`][index],
      prompt: [`把第一笔研究补助变成能行动的补给。`, `优先补齐猎犬和水源相关短缺。`, `看清项目需求，别为了眼前拨款耗掉保护能力。`, `在库存和风险之间做一次取舍。`, `让合规样本移交反过来支持动物回流。`, `用剩余基金准备最后一轮关键行动。`, `让基金、水源和草场同时回到健康线。`][index]
    }));
  }
  return SEVEN_DAY_BRANCHES[branch] || SEVEN_DAY_CHAIN;
}

function eventNextPayload(chapters, step, reserve) {
  const chapter = chapters[Math.max(0, Math.min(chapters.length - 1, step - 1))] || chapters[0];
  return Object.assign({
    title: chapter.title,
    prompt: chapter.prompt
  }, eventStepGuidance(reserve, step));
}

function eventStepReadiness(reserve, step, action, dailyGoalDone, migration) {
  const eco = reserve.ecology || {};
  const supplies = reserve.supplies || {};
  const progression = reserveProgressionFor(reserve);
  const guidance = eventStepGuidance(reserve, step);
  const checks = {
    1: { ready: guidance.validActions.includes(action), text: "先完成一次与路线方向一致的有效经营，建立本章事件起点。" },
    2: { ready: guidance.validActions.includes(action) && (eco.water || 0) >= 52, text: "把水源修到 52 以上，再观察动物是否回到水线。" },
    3: { ready: guidance.validActions.includes(action) && (reserve.poacherPressure || 0) <= 50, text: "把偷猎压力压到 50 以下，坏脚印才会真正转向。" },
    4: { ready: guidance.validActions.includes(action) && (eco.grass || 0) >= 40 && (eco.disease || 0) <= 36, text: "让草场恢复到 40、疾病降到 36 以下，草场事件才会继续。" },
    5: { ready: dailyGoalDone && ((migration && migration.delta) || 0) >= 0 && reserveEcologyScore(reserve) >= 60, text: "完成当前阶段任务，并让保护区生态达到 60、迁移不再为负。" },
    6: { ready: guidance.validActions.includes(action) && Object.values(supplies).reduce((sum, value) => sum + (value || 0), 0) >= 5 && (eco.water || 0) >= 55 && (eco.grass || 0) >= 55, text: "备齐至少 5 份补给，并把水源、草场稳定在 55 以上。" },
    7: { ready: dailyGoalDone && (progression.score || 0) >= Math.max(56, ((progression.gate || {}).score || 60) - 4), text: "完成阶段任务，并让综合评分接近本章晋级线。" }
  };
  return checks[step] || { ready: false, text: "继续经营，让保护区数据形成新的剧情条件。" };
}

function updateSevenDayEventChain(reserve, action, dailyGoalDone, migration, day) {
  const previous = Object.assign({
    id: "seven_day_guardian",
    title: "保护区阶段事件线",
    step: 0,
    length: 7,
    completed: false,
    lastAdvancedAction: -4,
    chapterLevel: 1
  }, reserve.eventChain || {});
  const length = previous.length || 7;
  const progression = reserve.progression || {};
  const level = Math.max(1, Math.min(5, progression.level || 1));
  // 剧情要求的是“至少3次有效操作”的停顿。安抚动物和亲手收录证据
  // 已经是正式的有效互动，不能继续只按晨/午/暮关键行动计时。
  const totalActions = Math.max(0, progression.totalMeaningfulActions || progression.totalActions || progression.daysManaged || 0);
  const chapterChanged = (previous.chapterLevel || 1) !== level;
  const base = chapterChanged ? Object.assign({}, previous, {
    step: 0,
    completed: false,
    branch: "",
    lastAdvancedAction: totalActions,
    chapterLevel: level,
    cycle: level,
    lastResult: `第${level}章刚刚开始，事件线会在经营数据成熟后出现。`
  }) : previous;
  if (base.completed) {
    return Object.assign({}, base, {
      advanced: false,
      waitingText: "本章事件已经收束，完成章节指标后再进入下一段剧情。"
    });
  }
  const branch = base.branch || eventBranchForAction(action);
  const chapters = eventBranchChapters(branch);
  const cycle = Math.max(1, base.cycle || level);
  const stageStoryTarget = Math.max(1, Math.min(length, (((progression.gate || {}).storyBeats) || length)));
  if ((base.step || 0) >= stageStoryTarget && stageStoryTarget < length) {
    return Object.assign({}, base, {
      title: "保护区阶段事件线",
      branch,
      branchTitle: EVENT_BRANCH_LABELS[branch] || branch,
      cycle,
      advanced: false,
      stageBound: true,
      chapterLevel: level,
      waitingText: `本阶段 ${stageStoryTarget} 段剧情已完成；完成其余晋级条件后，下一阶段继续。`,
      next: {
        title: "阶段收束",
        prompt: "先完成经营、策略、评分和里程碑条件，再进入下一段剧情。",
        recommendedAction: "",
        validActions: []
      }
    });
  }
  const step = Math.max(1, Math.min(length, (base.step || 0) + 1));
  // 所有章节统一至少间隔 3 次有效操作。旧公式在后章暗中升到 4–5 次，
  // 与界面承诺和十阶段时长表冲突，并把剧情等待误当成难度。
  const minGap = 3;
  const actionsSinceEvent = totalActions - (base.lastAdvancedAction == null ? -minGap : base.lastAdvancedAction);
  const readiness = eventStepReadiness(reserve, step, action, dailyGoalDone, migration);
  const maxGap = minGap + 8;
  const pressureAdvance = actionsSinceEvent >= maxGap;
  if (actionsSinceEvent < minGap || (!readiness.ready && !pressureAdvance)) {
    const waitForGap = Math.max(0, minGap - actionsSinceEvent);
    return Object.assign({}, base, {
      title: "保护区阶段事件线",
      branch,
      branchTitle: EVENT_BRANCH_LABELS[branch] || branch,
      cycle,
      advanced: false,
      chapterLevel: level,
      stageBound: false,
      next: eventNextPayload(chapters, step, reserve),
      waitingText: waitForGap > 0
        ? `事件暂歇，还需 ${waitForGap} 次有效经营；${readiness.text}`
        : `${readiness.text}；若局势持续 ${Math.max(1, maxGap - actionsSinceEvent)} 次行动，剧情将带代价继续。`
    });
  }
  const chapter = chapters[step - 1] || chapters[chapters.length - 1];
  const safe = (reserve.safety || 0) >= 64;
  const poacherOk = (reserve.poacherPressure || 0) <= 42;
  const migrationOk = ((migration && migration.delta) || 0) >= 0;
  const good = !pressureAdvance && (!!dailyGoalDone || (safe && poacherOk && migrationOk));
  const mood = good ? "升温" : (safe ? "摇摆" : "紧张");
  return {
    id: previous.id,
    title: previous.title,
    branch,
    branchTitle: EVENT_BRANCH_LABELS[branch] || branch,
    cycle,
    step,
    length,
    completed: step >= length,
    advanced: true,
    lastAdvancedAction: totalActions,
    chapterLevel: level,
    stageBound: false,
    waitingText: step >= length ? "本章事件已经收束，等待章节指标完成。" : `剧情已经推进，至少再完成 ${minGap} 次经营操作才会出现下一段。`,
    day,
    current: {
      title: chapter.title,
      summary: good ? chapter.good : chapter.bad,
      prompt: chapter.prompt,
      mood
    },
    next: step >= length ? {
      title: "新一轮守护",
      prompt: "用更高保护区等级解锁下一轮区域事件。",
      recommendedAction: "",
      validActions: []
    } : eventNextPayload(chapters, step + 1, reserve),
    lastResult: `${chapter.title}：${good ? chapter.good : chapter.bad}`,
    action
  };
}

function updateGuardianRun(reserve, action, dailyGoalDone, dayClosed = false) {
  const base = {
    title: "7天守护挑战",
    completedDays: 0,
    length: 7,
    targetWater: 65,
    targetGrass: 62,
    targetFund: 760,
    score: 55,
    streak: 0,
    lastGrade: "C",
    lastSummary: "稳住水源和草场，让动物愿意留下。"
  };
  const run = Object.assign({}, base, reserve.guardianRun || {});
  const eco = reserve.ecology || {};
  const migration = reserve.migration || {};
  const ecology = reserveEcologyScore(reserve);
  const outcome = reserve.lastActionOutcome || {};
  const completedEvents = dailyGoalDone ? 2 : (outcome.success ? 1 : 0);
  const eventScore = completedEvents >= 3 ? 90 : completedEvents === 2 ? 70 : completedEvents === 1 ? 45 : 15;
  const seriousPenalty = outcome.success ? 0 : (actionDifficulty(action) >= 4 ? -15 : 0);
  const migrationBonus = (migration.delta || 0) > 0 ? 5 : (migration.delta || 0) < 0 ? -6 : 0;
  const houndPerformance = Math.min(100, Math.max(0, houndTeamPower(reserve)));
  const fundBand = BALANCE_V2.fundHealth[levelOf(reserve)];
  const fundScore = (reserve.fund || 0) < fundBand.danger ? 35
    : (reserve.fund || 0) < fundBand.healthyMin ? 60
      : (reserve.fund || 0) <= fundBand.healthyMax ? 85 : 75;
  const socialPulse = reserve.social || {};
  const socialFix = clampRange(Math.round(
    (socialPulse.migrationDelta || 0) * 1.2 +
    (socialPulse.salvageDelta || 0) * 0.8 -
    (socialPulse.pressure || 0) * 0.8
  ), -6, 10);
  const score = clamp(Math.round(
    ecology * 0.55 +
    fundScore * 0.15 +
    eventScore * 0.20 +
    houndPerformance * 0.10 +
    migrationBonus +
    seriousPenalty +
    socialFix
  ));
  const stableDay = (eco.water || 0) >= run.targetWater
    && (eco.grass || 0) >= run.targetGrass
    && (eco.disease || 0) <= 28;
  const grade = guardianGrade(score);
  const reserveBase = reserve.base || {};
  const league = reserve.league || {};
  const rankDelta = clampRange(Math.round((score - 60) * 12 + (fundScore - 60) * 3), -700, 500);
  const oldRank = league.worldRank || reserveBase.rank || 10000;
  const nextRank = Math.max(1, oldRank - rankDelta);
  reserve.league = Object.assign({}, league, { worldRank: nextRank, lastRankDelta: rankDelta });
  reserve.base = Object.assign({}, reserveBase, { rank: nextRank });
  return Object.assign({}, run, {
    // “七日守护”按真正的守护日推进；上午、下午的行动只更新当天状态，
    // 不再把一天的三次操作错误计成三天。
    completedDays: Math.min(run.length || 7, (run.completedDays || 0) + (dayClosed ? 1 : 0)),
    score,
    rankDelta,
    streak: stableDay ? (run.streak || 0) + 1 : 0,
    lastGrade: grade,
    lastSummary: grade === "S" || grade === "A"
      ? "动物更愿意留下，保护区进入漂亮的一天。"
      : grade === "B"
        ? "局面稳住了，但还需要继续压风险。"
        : "保护区还在漏风，明天必须救一个关键指标。"
  });
}

function applyMasteryActionEffects(reserve, action) {
  const mastery = normalizeMastery(reserve.mastery);
  reserve.mastery = mastery;
  const patrol = mastery.patrol.branches || {};
  const habitat = mastery.habitat.branches || {};
  const effects = [];
  reserve.facilityForecast = Object.assign({}, reserve.facilityForecast || {});
  if (action === "houndScout" && patrol[5] === "tracking") {
    reserve.facilityForecast.masteryTrace = "猎犬专长标出了最近的可疑痕迹";
    effects.push("追踪：沙盘标出可疑痕迹");
  }
  if ((reserve.emergency || {}).active && patrol[5] === "guard" && !reserve.emergency.active.masteryExtensionApplied) {
    reserve.emergency.active.daysRemaining = Math.min(5, (reserve.emergency.active.daysRemaining || 1) + 1);
    reserve.emergency.active.masteryExtensionApplied = true;
    effects.push("防护：危机窗口延长1次行动");
  }
  if (action === "antiPoacher" && patrol[10] === "joint_enforcement") {
    addPendingRecovered(reserve, "recoveredTrap", 1);
    effects.push("联合执法：额外清除并封存1处陷阱");
  }
  if (patrol[10] === "regional_warning") {
    reserve.facilityForecast.masteryRisk = (reserve.poacherPressure || 0) >= 45 ? "明日边界风险偏高" : "明日边界风险可控";
  }
  if (action === "habitat" && habitat[5] === "hydrology") {
    reserve.facilityForecast.masteryWaterTomorrow = `预计次日水源 ${Math.max(0, Math.min(100, ((reserve.ecology || {}).water || 0) + (((reserve.seasonState || {}).name) === "雨季" ? 2 : -2)))}`;
    effects.push("水文：显示次日水位趋势");
  }
  if (action === "habitat" && habitat[5] === "grassland") {
    reserve.migration = Object.assign({}, reserve.migration || {}, { delta: ((reserve.migration || {}).delta || 0) + 1, reason: "草场专长吸引一小群食草动物靠近" });
    effects.push("草场：食草动物沿新草线靠近");
  }
  if (action === "habitat" && habitat[10] === "wetland_network") {
    reserve.ecology.water = clamp((reserve.ecology.water || 0) + 1);
    reserve.seasonDynamics = Object.assign({}, reserve.seasonDynamics || {}, { wetlandNetworkVisible: true });
    effects.push("湿地网络：新水路永久连通");
  }
  if (["habitat", "intervention"].includes(action) && habitat[10] === "eco_corridor") {
    reserve.migration = Object.assign({}, reserve.migration || {}, { delta: ((reserve.migration || {}).delta || 0) + 1, visibleCorridor: true, reason: "生态走廊让迁徙路线保持连通" });
    effects.push("生态走廊：迁徙路线在沙盘显形");
  }
  reserve.masteryOperational = effects.length ? { action, effects, summary: effects.join(" · ") } : null;
  return reserve.masteryOperational;
}

function buildReserveVisual(day, action, location, command, time, reserve, delta) {
  const meta = reserveActionMeta(action);
  const region = regionByName(location);
  const markerKind = action === "antiPoacher" ? "exclamation" : action === "habitat" ? "recovery" : "question";
  return {
    actionType: action,
    actionLabel: meta.label,
    location,
    regionId: region.id,
    risk: reserve.poacherPressure > 58 || action === "intervention" ? "high" : action === "habitat" ? "low" : "medium",
    palette: action === "antiPoacher" ? ["#73412f", "#f0d8c0"] : action === "salvage" ? ["#7d692d", "#efe4b9"] : ["#2d5f45", "#dfe9d4"],
    icon: meta.icon,
    command,
    socialHook: "",
    eventCard: {
      title: `${meta.label} · ${location}`,
      subtitle: `第 ${day} 日 ${time ? time.phase : ""} / 保护区行动`,
      body: `基金 ${delta.fund >= 0 ? "+" : ""}${delta.fund}，稳定 ${delta.stability >= 0 ? "+" : ""}${delta.stability}，偷猎压力 ${delta.poacher >= 0 ? "+" : ""}${delta.poacher}。`,
      mood: action === "antiPoacher" ? "紧张" : action === "salvage" ? "克制" : "清醒"
    },
    mapEvents: [{
      id: `reserve_${day}_${action}`,
      regionId: region.id,
      kind: markerKind,
      type: markerKind === "exclamation" ? "event" : markerKind,
      label: meta.label,
      title: meta.label,
      impact: action === "antiPoacher" ? "边界风险正在被处理。" : action === "habitat" ? "水草恢复点会影响动物路线。" : "这里有一条需要确认的暗线。",
      recommendAction: action,
      recommendLabel: meta.label,
      unhandled: "不处理：明天可能继续发酵。",
      intensity: action === "antiPoacher" ? 3 : 2
    }],
    time,
    statDelta: {},
    influenceNote: "AI 会把你的行动折算成水源、草场、捕食者边界、食草动物迁移、偷猎压力和项目拨款变化。",
    rumors: [`${location}完成了${meta.label}，保护区记录已更新。`]
  };
}

function simulateReserveDay(command, state) {
  const action = detectReserveAction(command);
  const socialRecovery = isSocialRecoveryCommand(command);
  const location = detectLocation(command, (state.character && state.character.location) || "中央混交林");
  const nextDay = state.world.day + 1;
  const reserve = cloneReserve(state.world.reserve);
  const guardian = guardianContext(reserve);
  reserve.guardianCycle = guardian.cycle;
  reserve.mastery = normalizeMastery(reserve.mastery);
  const time = Object.assign(
    {},
    actionTime(action === "antiPoacher" ? "scout" : action === "intervention" ? "hunt" : "move", nextDay, state.world.time),
    { phase: guardian.phase.label, clock: guardian.phase.time, guardianDay: guardian.day }
  );
  const seasonState = guardian.season;
  reserve.seasonState = seasonState;
  reserve.seasonDay = seasonState.day;
  const weather = state.world.weather || nextWeatherForSeason("阴", seasonState.name);
  const appraisalSettlement = settleRecoveredProcessing(reserve, guardian.day);
  // 周边保护区动态按“守护日”结算，而不是按晨/午/暮三次关键操作重复结算。
  // 旧实现使用 world.day（每次操作都会增加）驱动脉冲，使偷猎、市场和迁徙
  // 在一天内被放大三倍。当天后续阶段继续展示同一条播报，但不再次修改数值。
  const startsGuardianDay = guardian.cycle.actionIndex === 0;
  const dailySocialPulse = startsGuardianDay || !reserve.social || !reserve.social.title
    ? applySocialPulse(reserve, buildSocialPulse(state.world, reserve, guardian.day), action)
    : Object.assign({}, reserve.social);
  const socialPulse = startsGuardianDay
    ? dailySocialPulse
    : Object.assign({}, dailySocialPulse, {
      marketDelta: 0,
      migrationDelta: 0,
      salvageDelta: 0,
      pressure: 0,
      deferred: true
    });
  const before = cloneReserve(reserve);
  const emergencyRecovery = maybeApplyEmergencyRecovery(reserve);
  const seasonEffect = guardian.completesDay
    ? applySeasonEffects(reserve, seasonState, weather, action)
    : { season: seasonState.name, weather, water: 0, grass: 0, disease: 0, poacher: 0, predation: 0, deferred: true };
  const dailyEconomy = applyDailyReserveEconomy(reserve, action);
  const eco = reserve.ecology;
  const supplies = reserve.supplies;
  const inv = reserve.inventory;
  const hasDogFood = (supplies.dogFood || 0) > 0;
  const materialSupport = actionMaterialSupport(reserve, action);
  const authorization = actionAuthorizationPlan(reserve, action, location);
  const actionOutcome = reserveActionOutcome(reserve, action, materialSupport, authorization);
  const actionGain = actionOutcome.effectiveGain;
  const repeatMultiplier = onsiteRepeatMultiplier(reserve, action);
  const economyConfig = chapterEconomy(reserve);
  const droughtTrackingBonus = seasonState.name === "旱季" && (action === "houndScout" || action === "antiPoacher") ? 3 : 0;
  if (droughtTrackingBonus) {
    reserve.seasonDynamics.trackingBonus = droughtTrackingBonus;
    seasonEffect.trackingBonus = droughtTrackingBonus;
  }
  let salvageSale = null;
  let materialExploration = null;

  consumeActionPoint(reserve, action);
  if (action === "houndScout") {
    if (hasDogFood) supplies.dogFood -= 1;
    const succeeded = actionOutcome.success && hasDogFood;
    reserve.poacherPressure = clamp(reserve.poacherPressure - scaledPoacherReduction(reserve.poacherPressure, succeeded ? 7 : 3, repeatMultiplier) - droughtTrackingBonus);
    if (socialRecovery) {
      addPendingRecovered(reserve, "researchSample", 1);
      addPendingRecovered(reserve, "recoveredTrap", 1);
    } else if (succeeded && Math.random() < 0.35) {
      addPendingRecovered(reserve, "recoveredTrap", 1);
    }
    if (succeeded) eco.grass = clamp((eco.grass || 0) + scaledPositiveGain(eco.grass || 0, 1, repeatMultiplier));
  } else if (action === "antiPoacher") {
    const hadAlarm = (supplies.alarm || 0) > 0;
    if (hadAlarm) supplies.alarm -= 1;
    const succeeded = actionOutcome.success && hadAlarm;
    const antiReduction = succeeded ? 10 : 3;
    reserve.poacherPressure = clamp(reserve.poacherPressure - scaledPoacherReduction(reserve.poacherPressure, antiReduction, repeatMultiplier) - droughtTrackingBonus);
    const safetyGain = succeeded ? scaledPositiveGain(reserve.safety || 0, 4, repeatMultiplier) : -1;
    reserve.safety = clamp((reserve.safety || 0) + safetyGain);
    if (succeeded) eco.grass = clamp((eco.grass || 0) + scaledPositiveGain(eco.grass || 0, 2, repeatMultiplier));
    if (succeeded) addPendingRecovered(reserve, "recoveredTrap", 1);
  } else if (action === "exploreMaterials") {
    const targetMatch = String(command || "").match(/目标[:：]([A-Za-z]+)/);
    const rollMatch = String(command || "").match(/掷骰[:：](\d{1,3})/);
    const forcedRoll = rollMatch ? Math.max(1, Math.min(100, Number(rollMatch[1]))) : null;
    materialExploration = resolveMaterialExploration(reserve, state.world.knownCharacters || [], targetMatch ? targetMatch[1] : "", Math.random, forcedRoll, state.world.lifeMemory || null);
    materialExploration.items.forEach((item) => addPendingRecovered(reserve, item.key, item.amount));
    if (materialExploration.success) reserve.reputation = clamp((reserve.reputation || 0) + 1);
    reserve.lastMaterialExploration = materialExploration;
  } else if (action === "salvage") {
    const preferredGood = detectRecoveredGoodFromCommand(command);
    salvageSale = processRecoveredGoods(inv, reserve, command, guardian.day);
    reserve.lastSalvageSoldCount = salvageSale.sold.length;
    reserve.lastSalvageSale = Object.assign({ preferredGood }, salvageSale);
    if (salvageSale.sold.length) {
      reserve.fund += salvageSale.immediateFund || 0;
      reserve.reputation = clamp(reserve.reputation + 2);
      reserve.stability = clamp(reserve.stability - 1);
    } else {
      addPendingRecovered(reserve, "researchSample", 1);
      reserve.reputation = clamp(reserve.reputation + 1);
    }
  } else if (action === "intervention") {
    const hadTranquilizer = (supplies.tranquilizer || 0) > 0;
    if (hadTranquilizer) supplies.tranquilizer -= 1;
    const succeeded = actionOutcome.success && hadTranquilizer;
    const ecologyGain = scaledPositiveGain(eco.grass || 0, succeeded ? 6 : 2, repeatMultiplier);
    eco.grass = clamp((eco.grass || 0) + ecologyGain);
    eco.disease = clamp((eco.disease || 0) - (succeeded ? 5 : 1));
    if (succeeded) reserve.stability = clamp((reserve.stability || 0) + scaledPositiveGain(reserve.stability || 0, 2, repeatMultiplier));
    else reserve.reputation = clamp((reserve.reputation || 0) - 2);
  } else if (action === "buySupplies") {
    const purchase = detectSupplyPurchase(command, reserve);
    reserve.lastPurchase = purchase ? Object.assign({}, purchase) : null;
    if (purchase && purchase.batch) {
      if (purchase.items.length > 0 && (reserve.fund || 0) >= purchase.cost) {
        reserve.fund -= purchase.cost;
        purchase.items.forEach((item) => {
          const stock = Math.max(0, supplies[item.id] || 0);
          supplies[item.id] = Math.min(item.cap, stock + item.amount);
        });
        reserve.lastPurchase = Object.assign({}, purchase, { items: purchase.items.map((item) => Object.assign({}, item)) });
        reserve.reputation = clamp(reserve.reputation + 1);
      } else {
        reserve.lastPurchase = Object.assign({}, purchase, { amount: 0, blocked: purchase.items.length ? "基金不足" : "补给已足" });
      }
    } else {
      const currentStock = purchase ? Math.max(0, supplies[purchase.id] || 0) : 0;
      const room = purchase ? Math.max(0, purchase.cap - currentStock) : 0;
      const received = purchase ? Math.min(purchase.amount, room) : 0;
      if (purchase && received > 0 && (reserve.fund || 0) >= purchase.cost) {
      reserve.fund -= purchase.cost;
      supplies[purchase.id] = currentStock + received;
      reserve.lastPurchase.amount = received;
      reserve.reputation = clamp(reserve.reputation + 1);
      } else {
        reserve.lastPurchase = purchase ? Object.assign({}, purchase, { amount: 0, blocked: room <= 0 ? "库存已满" : "基金不足" }) : null;
      }
    }
  } else if (action === "habitat") {
    const hadKit = (supplies.fieldKit || 0) > 0;
    if (hadKit) {
      supplies.fieldKit -= 1;
      const succeeded = actionOutcome.success;
      const waterBaseGain = (eco.water || 0) >= 70 ? 0
        : (eco.water || 0) >= 60 ? (succeeded ? 2 : 1)
          : (succeeded ? 5 : 2);
      eco.water = clamp((eco.water || 0) + scaledPositiveGain(eco.water || 0, waterBaseGain, repeatMultiplier));
      eco.grass = clamp((eco.grass || 0) + scaledPositiveGain(eco.grass || 0, succeeded ? 6 : 2, repeatMultiplier));
      if (succeeded) reserve.stability = clamp((reserve.stability || 0) + scaledPositiveGain(reserve.stability || 0, 2, repeatMultiplier));
    } else {
      actionOutcome.success = false;
      actionOutcome.blocked = "缺野外工具包";
    }
  } else {
    reserve.poacherPressure = clamp(reserve.poacherPressure - 4);
    reserve.enforcement = clamp(reserve.enforcement + 3);
    reserve.stability = clamp(reserve.stability + 2);
    eco.disease = clamp(eco.disease - 2);
  }
  const facilityOperational = applyFacilityOperationalEffects(reserve, action, seasonState.name);
  let patrolOperation = null;
  const emergencyOutcome = updateReserveEmergency(reserve, action, seasonState);
  const houndGrowth = action === "exploreMaterials" ? {
    xpGain: 0,
    beforeLevel: (reserve.houndTeam || {}).level || 1,
    level: (reserve.houndTeam || {}).level || 1,
    levelUp: false,
    title: (reserve.houndTeam || {}).title || "猎犬队待命",
    power: houndTeamPower(reserve),
    materialSupport: 0,
    training: Object.assign({}, reserve.houndTeam || {}),
    summary: materialExploration && materialExploration.relationship.helper
      ? `${materialExploration.relationship.helper.name}提供了探索路线，猎犬队没有出动。`
      : "本次由动物关系提供路线，猎犬队没有出动。"
  } : applyHoundTeamGrowth(reserve, action, materialSupport);
  const variableReward = materialExploration ? {
    tier: materialExploration.quality,
    label: materialExploration.reward ? `探索发现${materialExploration.reward.label}` : "探索留下新线索",
    body: materialExploration.summary,
    fund: 0,
    intel: 0,
    goods: {}
  } : applyVariableReserveReward(reserve, action, houndGrowth);
  const mysteryRecovery = rollMysteryRecovery(reserve, {
    action,
    day: nextDay,
    totalActions: ((reserve.progression || {}).totalActions || 0) + 1
  });
  const strategyRhythm = recordStrategicAction(reserve, action);

  const predatorTotal = totalAnimals(eco.predators);
  const herbTotal = totalAnimals(eco.herbivores);
  // 捕食、啃食和边界回流属于“一个守护日”的生态结算，不能在晨、午、暮
  // 三次关键操作中重复三遍。旧逻辑正是草场和偷猎长期失控的主因。
  if (guardian.completesDay) {
    if (predatorTotal * 5 > herbTotal) {
      eco.herbivores.deer = Math.max(30, (eco.herbivores.deer || 80) - 2);
      reserve.stability = clamp(reserve.stability - 2);
    } else if (herbTotal > 360) {
      const grazingLoss = seasonState.name === "旱季" ? 3 : 2;
      eco.grass = clamp(eco.grass - grazingLoss);
      reserve.stability = clamp(reserve.stability - 2);
      if (seasonState.name === "旱季") reserve.seasonDynamics.outerGrassResting = true;
    } else {
      reserve.stability = clamp(reserve.stability + 1);
    }
    if (seasonState.name === "旱季" && predatorTotal > 0 && herbTotal > 0) {
      const concentratedLoss = Math.max(1, (seasonEffect && seasonEffect.predation) || 1);
      if ((eco.herbivores.antelope || 0) > 15) eco.herbivores.antelope = Math.max(15, eco.herbivores.antelope - concentratedLoss);
      else eco.herbivores.deer = Math.max(20, (eco.herbivores.deer || 0) - concentratedLoss);
      reserve.stability = clamp(reserve.stability - 1);
      reserve.seasonDynamics.predationLoss = concentratedLoss;
    }
  }
  if ((eco.grass || 0) < 28) {
    const deficitRecovery = Math.max(1, Math.ceil((28 - (eco.grass || 0)) * 0.24));
    const refugeRecovery = (seasonState.name === "雨季" ? 3 : 2) + deficitRecovery;
    eco.grass = clamp(Math.max(18, (eco.grass || 0) + refugeRecovery));
    reserve.seasonDynamics.refugeGrassRecovery = refugeRecovery;
  }
  if (guardian.completesDay && !["houndScout", "antiPoacher"].includes(action)) {
    reserve.poacherPressure = clamp(reserve.poacherPressure + scaledPoacherPressureGain(reserve.poacherPressure, Math.random() < 0.35 ? 2 : 0));
  }
  reserve.business = reserveBusinessScore(reserve);
  reserve.ecologyScore = reserveEcologyScore(reserve);
  reserve.lastActionOutcome = Object.assign({}, actionOutcome);
  let migration = applyAnimalMigration(reserve, reserveEcologyScore(before));
  migration = applySocialMigration(reserve, socialPulse);
  migration = applySeasonalMigration(reserve, seasonState);
  const masteryOperational = applyMasteryActionEffects(reserve, action);
  // Route planning resolves after the base action and migration calculation so
  // the displayed route deltas remain exact in the final saved values.
  patrolOperation = applyOperationPlan(reserve, action, parseOperationPlan(command, action));
  const guardianPromiseEffect = applyGuardianPromiseAction(reserve, action, { season: seasonState.name, day: nextDay });
  // Guardian promises are permanent rules, not decorative bonuses. They may
  // change today's migration outcome, so every downstream chapter/goal/visual
  // calculation must read the post-promise value from the single reserve source.
  migration = enforceHabitatMigrationConsistency(reserve, reserve.migration || migration, reserveEcologyScore(before));
  if ((reserve.stability || 0) < 45 && (reserve.safety || 0) >= 45 && (eco.water || 0) >= 45 && (eco.grass || 0) >= 45 && (eco.disease || 0) <= 16) {
    // 所有本轮环境与路线后果落地后再结算生态韧性托底，只恢复到可运营线，不替玩家消除风险。
    reserve.stability = Math.min(45, (reserve.stability || 0) + 1);
  }
  reserve.business = reserveBusinessScore(reserve);
  reserve.ecologyScore = reserveEcologyScore(reserve);
  reserve.fund = Math.max(0, Math.round(reserve.fund));
  const goalNow = Date.now();
  const preliminaryGoalState = Object.assign({}, state, {
    world: Object.assign({}, state.world || {}, { reserve, goals: (state.world || {}).goals })
  });
  const actionGoalProgress = applyGoalProgress(state, preliminaryGoalState, { action, now: goalNow });
  let goals = actionGoalProgress.goals;
  // 剧情第 5、7 段检查的是“本阶段目标已经完成”，不是只在奖励
  // 刚结算的那一帧成立。此前使用瞬时事件会让已经完成 2/3 目标的
  // 玩家仍被剧情判为未完成，只能等待超时强推，造成任务与剧情背离。
  const dailyGoalDone = !!actionGoalProgress.dailyGoalDone
    || !!(goals.daily && goals.daily.coreClaimed);
  const logisticsSucceeded = action === "buySupplies"
    ? !!reserve.lastPurchase && (before.fund || 0) >= ((reserve.lastPurchase || {}).cost || 0)
    : action === "salvage"
      ? !!(salvageSale && salvageSale.sold && salvageSale.sold.length)
      : !!actionOutcome.success;
  const actionRhythm = applyActionResourceRhythm(reserve, action, dailyGoalDone, logisticsSucceeded, true);
  applySpeciesPopulationDynamics(reserve);
  // 水草同时受玩家行动与保护区自身生命循环影响。自然承载只在入夜结算一次，
  // 防止一天三次操作被重复扣除；结算结果会继续影响疾病、迁徙和次日种群。
  applyLivingHabitatPressure(reserve, seasonState, {
    dayClosed: guardian.completesDay,
    migration
  });
  applyWaterGrassHealthDynamics(reserve);
  // 入夜水草消耗可能让原本可承载的环境跌入高风险。最终迁徙必须读取
  // 结算后的真实水草，不能继续保留结算前的“迁入”结果。
  migration = enforceHabitatMigrationConsistency(reserve, reserve.migration || migration, reserveEcologyScore(before));
  reserve.business = reserveBusinessScore(reserve);
  reserve.ecologyScore = reserveEcologyScore(reserve);
  const animalEconomy = applyAnimalEcologyEconomy(reserve, state.world.knownCharacters || [], {
    action,
    day: guardian.day,
    season: seasonState.name
  });
  applyResourceAging(reserve, before);
  const masteryGain = awardKeyActionMastery(reserve, action);
  const guardianCycleResult = advanceGuardianCycle(reserve, action, before, reserve, {
    animalResponse: (animalEconomy && animalEconomy.dialogue) || "",
    reward: salvageSale && salvageSale.sold && salvageSale.sold.length ? salvageSale.note : variableReward.body
  });
  reserve.guardianRun = updateGuardianRun(reserve, action, dailyGoalDone, !!guardianCycleResult.night);
  reserve.progression = Object.assign({}, reserve.progression || {});
  reserve.progression.daysManaged = Math.max(0, Math.round((reserve.progression.daysManaged || 0) + (guardianCycleResult.night ? 1 : 0)));
  reserve.progression.totalActions = Math.max(0, Math.round((reserve.progression.totalActions || 0) + 1));
  const compliantIncome = Math.max(0, Math.round(
    (dailyEconomy.income || 0)
    + ((salvageSale && salvageSale.immediateFund) || 0)
    + ((appraisalSettlement && appraisalSettlement.fund) || 0)
    + ((variableReward && variableReward.fund) || 0)
  ));
  reserve.progression.totalFundEarned = Math.max(0, Math.round((reserve.progression.totalFundEarned || 0) + compliantIncome));
  reserve.progression.totalMigratedIn = Math.max(0, Math.round((reserve.progression.totalMigratedIn || 0) + Math.max(0, migration.delta || 0)));
  reserve.progression.totalRareRecovered = Math.max(0, Math.round((reserve.progression.totalRareRecovered || 0) + Math.max(0, rareRecoveredCount(reserve) - rareRecoveredCount(before))));
  const knownSinks = Math.max(0, Math.round(
    (dailyEconomy.maintenance || 0)
    + (action === "buySupplies" && reserve.lastPurchase && !reserve.lastPurchase.blocked ? reserve.lastPurchase.cost : 0)
  ));
  const taskRewardAtLedger = (actionGoalProgress.rewards || []).filter((reward) => reward.type === "fund").reduce((sum, reward) => sum + reward.amount, 0);
  const observedNet = Math.round((reserve.fund || 0) - (before.fund || 0));
  const reconciliation = observedNet - (compliantIncome + taskRewardAtLedger - knownSinks);
  reserve.economyLedger = {
    version: 2,
    day: nextDay,
    sources: {
      operatingIncome: dailyEconomy.income || 0,
      salvage: ((salvageSale && salvageSale.immediateFund) || 0) + ((appraisalSettlement && appraisalSettlement.fund) || 0),
      taskReward: taskRewardAtLedger,
      actionReward: (variableReward && variableReward.fund) || 0,
      other: Math.max(0, reconciliation)
    },
    sinks: {
      baseMaintenance: dailyEconomy.maintenance || 0,
      actionCost: 0,
      supplyPurchase: action === "buySupplies" && reserve.lastPurchase && !reserve.lastPurchase.blocked ? reserve.lastPurchase.cost : 0,
      other: Math.max(0, -reconciliation)
    },
    compliantIncome,
    net: observedNet
  };
  reserve.progression = reserveProgressionFor(reserve);
  reserve.eventChain = updateSevenDayEventChain(reserve, action, dailyGoalDone, migration, nextDay);
  // The event chain is itself a chapter requirement. Recompute immediately
  // after it advances so level, species unlocks and the settlement all move
  // together on the same action instead of showing a one-day split state.
  reserve.progression = reserveProgressionFor(reserve);
  const derivedGoalState = Object.assign({}, state, {
    world: Object.assign({}, state.world || {}, { reserve, goals })
  });
  const derivedGoalProgress = applyGoalProgress(state, derivedGoalState, { derivedOnly: true, now: goalNow });
  goals = derivedGoalProgress.goals;
  const goalRewards = (actionGoalProgress.rewards || []).concat(derivedGoalProgress.rewards || []);
  const goalCompletions = (actionGoalProgress.completions || []).concat(derivedGoalProgress.completions || []);
  const goalFundReward = goalRewards.filter((reward) => reward.type === "fund").reduce((sum, reward) => sum + reward.amount, 0);
  reserve.lastTaskReward = goalRewards.length ? {
    fund: goalFundReward,
    shift: goalRewards.filter((reward) => reward.type === "actionPoints").reduce((sum, reward) => sum + reward.amount, 0),
    fieldPermit: goalRewards.filter((reward) => reward.type === "fieldPermits").reduce((sum, reward) => sum + reward.amount, 0),
    rewards: goalRewards
  } : null;
  if (reserve.economyLedger) {
    reserve.economyLedger.sources.taskReward = goalFundReward;
    const baseSource = (reserve.economyLedger.sources.operatingIncome || 0)
      + (reserve.economyLedger.sources.salvage || 0)
      + goalFundReward
      + (reserve.economyLedger.sources.actionReward || 0);
    const baseSink = (reserve.economyLedger.sinks.baseMaintenance || 0)
      + (reserve.economyLedger.sinks.actionCost || 0)
      + (reserve.economyLedger.sinks.supplyPurchase || 0);
    const finalNet = Math.round((reserve.fund || 0) - (before.fund || 0));
    const other = finalNet - (baseSource - baseSink);
    reserve.economyLedger.sources.other = Math.max(0, other);
    reserve.economyLedger.sinks.other = Math.max(0, -other);
    reserve.economyLedger.net = finalNet;
  }
  finalizeSpeciesChanges(reserve, before);
  const knownAnimalTrust = (state.world.knownCharacters || []).map((animal) => (animal.relation || {}).trust).filter(Number.isFinite);
  const averageAnimalTrust = knownAnimalTrust.length
    ? Math.round(knownAnimalTrust.reduce((sum, value) => sum + value, 0) / knownAnimalTrust.length)
    : reserve.reputation || 50;
  const strategicDilemma = maybePrepareStrategicDilemma(reserve, {
    action,
    day: nextDay,
    totalActions: reserve.progression.totalActions || 0,
    meaningfulActions: ((reserve.strategy || {}).totalMeaningfulActions) || 0,
    animalTrust: averageAnimalTrust,
    season: seasonState.name
  });
  const guardianPromise = maybePrepareGuardianPromise(reserve, {
    action,
    day: nextDay,
    totalActions: reserve.progression.totalActions || 0
  });

  const delta = {
    fund: reserve.fund - before.fund,
    stability: reserve.stability - before.stability,
    poacher: reserve.poacherPressure - before.poacherPressure,
    safety: reserve.safety - (before.safety || 50),
    migration: migration.delta || 0,
    reserveLevel: (reserve.progression && reserve.progression.level) - ((before.progression && before.progression.level) || 0),
    eventStep: (reserve.eventChain && reserve.eventChain.step) || 0
  };
  const knowledge = natureKnowledgeFor(Object.assign({}, state.world, { season: seasonState.name }), reserve, weather);
  const meta = reserveActionMeta(action);
  const visual = buildReserveVisual(nextDay, action, location, command, time, reserve, delta);
  const reserveView = buildReserveView(before, reserve, {
    action,
    day: nextDay,
    time,
    weather,
    season: seasonState.name,
    location,
    regionId: visual.regionId,
    authorization
  });
  reserve.reserveView = reserveView;
  visual.reserveView = reserveView;
  visual.mapEvents = reserveView.mapMarkers;
  visual.guardianRun = reserve.guardianRun;
  visual.progression = reserve.progression;
  visual.eventChain = reserve.eventChain;
  visual.dailyGoalDone = dailyGoalDone;
  visual.goalResult = { rewards: goalRewards, completions: goalCompletions, primary: goals.active && goals.active.primary };
  visual.actionRhythm = actionRhythm;
  visual.social = socialPulse;
  visual.salvageEconomy = salvageSale;
  visual.recoveredGoodsGain = socialRecovery ? {
    total: 2,
    pending: true,
    items: [
      { key: "researchSample", label: "研究样本", amount: 1 },
      { key: "recoveredTrap", label: "陷阱证据", amount: 1 }
    ]
  } : materialExploration && materialExploration.total > 0 ? {
    total: materialExploration.total,
    pending: true,
    exploration: true,
    items: materialExploration.items
  } : null;
  visual.materialExploration = materialExploration;
  visual.mysteryRecovery = mysteryRecovery;
  visual.strategyRhythm = strategyRhythm;
  visual.strategicDilemma = strategicDilemma;
  visual.guardianPromise = guardianPromise;
  visual.guardianPromiseEffect = guardianPromiseEffect;
  visual.houndGrowth = houndGrowth;
  visual.variableReward = variableReward;
  visual.dailyEconomy = dailyEconomy;
  visual.animalEconomy = animalEconomy;
  visual.economyLedger = reserve.economyLedger;
  visual.repeatAction = Object.assign({}, reserve.actionRepeat || {});
  visual.emergencyRecovery = emergencyRecovery;
  visual.actionOutcome = actionOutcome;
  visual.patrolOperation = patrolOperation;
  visual.authorization = authorization;
  visual.seasonState = seasonState;
  visual.seasonEffect = seasonEffect;
  visual.seasonDynamics = reserve.seasonDynamics;
  visual.facilityOperational = facilityOperational;
  visual.guardianCycle = guardianCycleResult;
  visual.seasonBeat = {
    day: guardian.day,
    seasonDay: guardian.season.day,
    label: guardian.beat,
    scheduled: [1, 3, 6, 9, 12].includes(guardian.season.day),
    firstAction: guardian.phase.id === "morning"
  };
  visual.masteryGain = masteryGain;
  visual.mastery = masteryView(reserve);
  visual.masteryOperational = masteryOperational;
  visual.appraisalSettlement = appraisalSettlement;
  visual.emergency = reserve.emergency;
  visual.emergencyOutcome = emergencyOutcome;
  if (reserve.emergency && reserve.emergency.active) {
    const active = reserve.emergency.active;
    visual.mapEvents.push({
      id: active.id,
      regionId: active.type === "poacher_ring" ? "river" : "meadow",
      kind: "exclamation",
      type: "crisis",
      label: active.title,
      title: active.title,
      impact: active.type === "poacher_ring" ? "偷猎压力会连续上升。" : "疾病会压低动物种群。",
      recommendAction: active.recommendedAction,
      recommendLabel: active.type === "poacher_ring" ? "驱赶偷猎" : "生态干预",
      unhandled: `剩余 ${active.daysRemaining} 天处置窗口。`,
      intensity: 4
    });
  }
  if (visual.seasonBeat.scheduled && visual.seasonBeat.firstAction) {
    const beatKind = guardian.season.day === 3 ? "animal"
      : guardian.season.day === 6 ? "question"
        : guardian.season.day === 9 ? "relationship"
          : guardian.season.day === 12 ? "recovery" : "season";
    visual.mapEvents.push({
      id: `season_beat_${guardian.day}`,
      regionId: guardian.season.day === 6 ? "river" : guardian.season.day === 9 ? "meadow" : "center",
      kind: beatKind,
      type: "season",
      label: guardian.beat.replace(/^[^：]+：/, ""),
      title: guardian.beat,
      impact: `这是${guardian.season.name}第${guardian.season.day}天的固定节奏。`,
      recommendAction: guardian.season.day === 6 ? "exploreMaterials" : guardian.season.day === 9 ? "habitat" : "houndScout",
      recommendLabel: guardian.season.day === 6 ? "跟随动物线索" : guardian.season.day === 9 ? "寻找命名动物" : "查看保护区",
      unhandled: "不会永久错过，今天处理会获得最完整的回应。",
      intensity: 2
    });
  }
  if (seasonState.name === "旱季" && (reserve.seasonDynamics || {}).migrationPulse) {
    visual.mapEvents.push({
      id: `dry_route_${reserve.seasonDay}`,
      regionId: "river",
      kind: "migration",
      type: "season",
      label: (reserve.seasonDynamics || {}).elephantPulse ? "象群沿干河床迁徙" : "水点迁徙线重排",
      title: (reserve.seasonDynamics || {}).elephantPulse ? "象群沿干河床迁徙" : "旱季迁徙线重排",
      dialogue: (reserve.seasonDynamics || {}).migrationText,
      impact: `迁徙 ${((reserve.seasonDynamics || {}).migrationPulse) > 0 ? "+" : ""}${(reserve.seasonDynamics || {}).migrationPulse}`,
      recommendAction: "habitat",
      recommendLabel: "守住水点",
      unhandled: "水点继续收缩，动物路线会更加集中。",
      intensity: 2
    });
  }
  visual.quickFeedback = `${guardian.phase.label} · ${meta.label}完成${patrolOperation ? ` · ${patrolOperation.summary}` : ""}${facilityOperational.summary ? ` · ${facilityOperational.summary}` : ""}${socialRecovery ? " · 物质回收+2" : ""}${materialExploration ? ` · 等级Lv.${materialExploration.level} / 关系${materialExploration.relationship.average} / 随机${materialExploration.roll}` : ""}${mysteryRecovery ? ` · 神秘证物：${mysteryRecovery.name}` : ""}${strategyRhythm.penalty ? ` · 重复衰减${strategyRhythm.penalty}级` : strategyRhythm.varietyBonus ? " · 多样行动奖励" : ""} · ${variableReward.body} · ${houndGrowth.summary}${masteryGain ? ` · ${masteryGain.label}熟练度+${masteryGain.amount}` : ""}${emergencyOutcome ? ` · ${emergencyOutcome.title}` : ""}${salvageSale && salvageSale.sold.length ? ` · ${salvageSale.note}` : ""}`;
  visual.influenceNote = knowledge[0] || visual.influenceNote;
  const lastPlayerAction = {
    id: `act_${nextDay}_${action}`,
    day: nextDay,
    action,
    label: meta.label,
    location,
    command,
    delta: Object.assign({}, delta)
  };
  const actionHistory = ((state.world.actionHistory || []).concat(lastPlayerAction)).slice(-5);
  const syncedKnownCharacters = syncKnownCharactersForReserve(state.world.knownCharacters || [], reserve);
  const directorBaseWorld = Object.assign({}, state.world, { day: nextDay, time, weather, season: seasonState.name, reserve, knownCharacters: syncedKnownCharacters, lastPlayerAction, actionHistory });
  const npcUpdate = updateNpcMovements(
    directorBaseWorld,
    nextDay,
    action === "antiPoacher" ? "scout" : action === "intervention" ? "hunt" : "move",
    location,
    null,
    1,
    { reserveAction: action, beforeReserve: before, dayClosed: !!guardianCycleResult.night }
  );
  const directed = runForestDirector({
    world: directorBaseWorld,
    beforeReserve: before,
    reserve,
    action,
    location,
    day: nextDay,
    time,
    weather,
    season: seasonState.name,
    delta,
    knowledge,
    visual,
    reserveView,
    knownCharacters: npcUpdate.knownCharacters,
    npcMovements: npcUpdate.npcMovements,
    regionId: visual.regionId
  });
  visual.influenceNote = directed.director.summary;
  visual.aiForest = directed.director;
  visual.pictureCues = directed.director.pictureCues;
  const character = Object.assign({}, state.character, {
    location,
    stamina: clamp(((state.character && state.character.stamina) || 82) - 4 + (action === "patrol" ? 2 : 0)),
    health: clamp(((state.character && state.character.health) || 92) + (action === "antiPoacher" && reserve.poacherPressure > 55 ? -3 : 1)),
    status: "alive",
    statusText: "正常"
  });
  const nextGuardianSeason = guardianSeason((reserve.guardianCycle || {}).day || guardian.day);
  const world = Object.assign({}, state.world, {
    day: nextDay,
    time,
    weather: guardianCycleResult.night ? nextWeatherForSeason(weather, nextGuardianSeason.name) : weather,
    season: nextGuardianSeason.name,
    reserve,
    reserveView,
    mapEvents: (state.world.mapEvents || []).concat(visual.mapEvents).slice(-8),
    rumors: (state.world.rumors || []).concat(visual.rumors).concat([
      `生态 ${reserve.ecologyScore}：${migration.reason}。`,
      reserve.eventChain ? `阶段事件：${reserve.eventChain.lastResult}` : "",
      knowledge[0],
      `森林导演：${directed.director.summary}`,
      `猎犬队：${houndGrowth.summary}`,
      `行动授权：${authorization.reason}`,
      `可变奖励：${variableReward.body}`,
      emergencyOutcome ? `${emergencyOutcome.title}：${emergencyOutcome.body}` : "",
      `社交风向：${socialPulse.log}`,
      `项目：鹿角研究热度 ${reserve.market.antler}，自然生命档案拨款 ${reserve.market.hideSalvage}。`,
      reserve.poacherPressure > 55 ? "夜间红外相机捕捉到可疑人影。" : "巡护线暂时稳定，猎犬队没有发现新入侵。"
    ].filter(Boolean)).slice(-5),
    natureKnowledge: ((state.world.natureKnowledge || []).concat(knowledge)).slice(-6),
    knownCharacters: applyNamedAnimalSchedule(directed.knownCharacters, reserve),
    npcMovements: npcUpdate.npcMovements,
    aiForest: directed.director,
    goals,
    lastPlayerAction,
    actionHistory
  });
  return {
    world,
    character,
    reports: [
      {
        id: `private_${Date.now()}`,
        day: nextDay,
        type: "private",
        title: guardianCycleResult.night ? guardianCycleResult.night.title : `第${guardian.day}日 · ${guardian.phase.label}行动`,
        body: `${guardian.phase.label} · ${meta.label} · ${location}\n基金 ${delta.fund >= 0 ? "+" : ""}${delta.fund}｜水源 ${((reserve.ecology || {}).water) || 0}｜草场 ${((reserve.ecology || {}).grass) || 0}｜迁徙 ${delta.migration >= 0 ? "+" : ""}${delta.migration}\n${guardianCycleResult.actionRecord.animalResponse}\n${guardianCycleResult.night && reserve.lastHabitatBalance && !reserve.lastHabitatBalance.deferred ? `水草承载：${reserve.lastHabitatBalance.note}\n` : ""}${guardianCycleResult.night ? `入夜：${guardianCycleResult.night.tomorrow}` : guardianCycleResult.cycle.tomorrowPreview}`,
        visual
      },
      {
        id: `public_${Date.now()}`,
        day: nextDay,
        type: "public",
        title: `第${guardian.day}日生态记录`,
        body: `第${guardian.day}日 · ${guardian.phase.label} · ${weather}\n基金 ${reserve.fund}｜水源 ${((reserve.ecology || {}).water) || 0}｜草场 ${((reserve.ecology || {}).grass) || 0}｜保护区生态 ${reserve.ecologyScore || 0}\n${migration.reason}\n${guardianCycleResult.night && reserve.lastHabitatBalance && !reserve.lastHabitatBalance.deferred ? `水草承载：${reserve.lastHabitatBalance.note}\n` : ""}${guardianCycleResult.actionRecord.animalResponse}`,
        visual: Object.assign({}, visual, {
          command: "",
          npcMovements: npcUpdate.npcMovements,
          influenceNote: "仅显示可见生态变化。"
        })
      }
    ],
    lastCommand: command,
    visual
  };
}

function simulateDay(command, state) {
  if (state && state.character && state.character.role === "warden") {
    return simulateReserveDay(command, state);
  }
  const action = detectAction(command);
  const message = latestMessage(state.messages);
  const location = detectLocation(command, state.character.location);
  const nextDay = state.world.day + 1;
  const time = actionTime(action, nextDay, state.world.time);
  const territoryEffect = resolveTerritoryEffect(state.character, action, location, state.world);
  const weather = nextWeather(state.world.weather);
  const mod = weatherMod(weather);
  let character = applyAction(state.character, action, location, territoryEffect, mod);
  character.statDelta = diffStats(state.character, character);
  const warning = character.health < 40 ? "\n\n你的健康已经进入危险区，明天最好优先恢复。" : "";
  const visual = buildVisualResult(nextDay, action, location, character, command, message, time, territoryEffect);
  const goals = updateGoals(state.world.goals, action, location, character, territoryEffect);
  const npcUpdate = updateNpcMovements(state.world, nextDay, action, location, message, 1);
  const npcEvents = resolveNpcEvents(character, npcUpdate, nextDay, location);
  character = npcEvents.character;
  const eventText = npcEvents.events.map((e) => `\n\n${e.text}`).join("");
  const world = Object.assign({}, state.world, {
    day: nextDay,
    time,
    weather,
    mapEvents: (state.world.mapEvents || []).concat(visual.mapEvents).slice(-8),
    rumors: (state.world.rumors || [])
      .concat(visual.rumors)
      .concat(npcUpdate.npcMovements.slice(0, 2).map((item) => `${item.actorName}：${item.label}。`))
      .slice(-5),
    knownCharacters: npcEvents.knownCharacters,
    npcMovements: npcUpdate.npcMovements,
    goals
  });

  return {
    world,
    character,
    reports: [
      {
        id: `private_${Date.now()}`,
        day: nextDay,
        type: "private",
        title: `第 ${nextDay} 日个人报告`,
        body: privateReport(character, action, location, command, message, time, territoryEffect, mod) + eventText + warning,
        visual
      },
      {
        id: `public_${Date.now()}`,
        day: nextDay,
        type: "public",
        title: `第 ${nextDay} 日世界报告`,
        body: publicReport(nextDay, action, location, character.species, time, territoryEffect, weather),
        visual: Object.assign({}, visual, {
          command: "",
          socialHook: "",
          npcMovements: npcUpdate.npcMovements,
          influenceNote: `公共报告只记录${location}的可见痕迹；真正的动机会被 AI 森林折算成水源、猎物、秩序和信任的变化。`,
          eventCard: Object.assign({}, visual.eventCard, {
            title: `公共异动 · ${location}`,
            body: `${location}出现一处新的模糊痕迹。${npcUpdate.npcMovements[0].actorName}也在行动，森林里的动物会以自己的方式解释它。`
          })
        })
      }
    ],
    lastCommand: command,
    visual
  };
}

module.exports = {
  simulateDay,
  weatherMod,
  nextWeather,
  WEATHER_CYCLE,
  applyAction,
  resolveNpcEvents,
  reserveProgressionFor,
  CHAPTER_PROGRESSION_GATES,
  activateHighStockProject,
  animalTrustTierFor,
  animalCareLevelFor
};
