// 野境守护长线经营数值体系 V2
// 所有核心经济、成长与资源上限只允许从本文件读取。

const BALANCE_V2 = Object.freeze({
  version: 2,
  tuning: Object.freeze({
    fundSourceScale: 1,
    fundSinkScale: 1,
    supplyPriceScale: 1,
    chapterRequirementScale: 1,
    taskTargetScale: 1,
    metricGainScale: 1,
    metricPressureScale: 1,
    populationGrowthScale: 1,
    strategyRewardScale: 1,
    strategyCostScale: 1,
    rareDropScale: 1,
    recoveryScale: 1
  }),
  caps: Object.freeze({
    actionPoints: 5,
    intel: 6,
    fieldPermits: 3,
    pendingRecovered: 6,
    inventory: 10,
    supplies: Object.freeze({ dogFood: 12, alarm: 6, tranquilizer: 8, fieldKit: 5, medicalKit: 5 })
  }),
  chapterEconomy: Object.freeze({
    1: Object.freeze({ baseIncome: 105, baseMaintenance: 155, habitatCost: 90, interventionCost: 115, permitCost: 60, supplyPriceMultiplier: 1 }),
    2: Object.freeze({ baseIncome: 135, baseMaintenance: 180, habitatCost: 105, interventionCost: 130, permitCost: 70, supplyPriceMultiplier: 1.05 }),
    3: Object.freeze({ baseIncome: 170, baseMaintenance: 210, habitatCost: 120, interventionCost: 145, permitCost: 80, supplyPriceMultiplier: 1.10 }),
    4: Object.freeze({ baseIncome: 210, baseMaintenance: 245, habitatCost: 135, interventionCost: 160, permitCost: 90, supplyPriceMultiplier: 1.15 }),
    5: Object.freeze({ baseIncome: 255, baseMaintenance: 285, habitatCost: 150, interventionCost: 175, permitCost: 100, supplyPriceMultiplier: 1.20 })
  }),
  rankRewards: Object.freeze([
    Object.freeze({ max: 0.01, value: 80 }),
    Object.freeze({ max: 0.10, value: 60 }),
    Object.freeze({ max: 0.30, value: 45 }),
    Object.freeze({ max: 0.50, value: 30 }),
    Object.freeze({ max: 1, value: 20 })
  ]),
  // 10 个经营阶段映射到现有 5 个剧情章：1–2 阶属于第一章，
  // 3–4 阶属于第二章，以此类推。expectedMinutes 只用于平衡校验，
  // 升级本身只检查有效操作、策略、剧情与里程碑，绝不检查挂机时长。
  progression: Object.freeze({
    // 每个剧情章由“4 次快速发现 + 15 次完整经营”组成；最终章收束为
    // 10 次关键操作。全程共 90 次，按每日 3 次约 30 日，给剧情间隔
    // 和恢复操作留下余量后，仍能稳定落入 27–41 日目标。
    1: Object.freeze({ stage: 1, storyLevel: 1, nextStage: 2, nextLevel: 1, expectedMinutes: 10, expectedSessions: 1, actions: 4, strategicChoices: 1, majorChoices: 0, score: 56, storyBeats: 2, milestoneNeed: 1, population: 220, fundEarned: 600, migratedIn: 4, rareRecovered: 1 }),
    2: Object.freeze({ stage: 2, storyLevel: 1, nextStage: 3, nextLevel: 2, expectedMinutes: 20, expectedSessions: 2, actions: 15, strategicChoices: 3, majorChoices: 1, score: 58, storyBeats: 7, milestoneNeed: 2, population: 260, fundEarned: 1200, migratedIn: 7, rareRecovered: 2 }),
    3: Object.freeze({ stage: 3, storyLevel: 2, nextStage: 4, nextLevel: 2, expectedMinutes: 30, expectedSessions: 2, actions: 4, strategicChoices: 1, majorChoices: 0, score: 60, storyBeats: 2, milestoneNeed: 1, population: 300, fundEarned: 1000, migratedIn: 6, rareRecovered: 2 }),
    4: Object.freeze({ stage: 4, storyLevel: 2, nextStage: 5, nextLevel: 3, expectedMinutes: 35, expectedSessions: 3, actions: 15, strategicChoices: 4, majorChoices: 1, score: 62, storyBeats: 7, milestoneNeed: 2, population: 340, fundEarned: 1800, migratedIn: 10, rareRecovered: 3 }),
    5: Object.freeze({ stage: 5, storyLevel: 3, nextStage: 6, nextLevel: 3, expectedMinutes: 40, expectedSessions: 3, actions: 4, strategicChoices: 1, majorChoices: 0, score: 65, storyBeats: 2, milestoneNeed: 1, population: 400, fundEarned: 1700, migratedIn: 9, rareRecovered: 3 }),
    6: Object.freeze({ stage: 6, storyLevel: 3, nextStage: 7, nextLevel: 4, expectedMinutes: 45, expectedSessions: 4, actions: 15, strategicChoices: 5, majorChoices: 2, score: 68, storyBeats: 7, milestoneNeed: 2, population: 470, fundEarned: 2800, migratedIn: 13, rareRecovered: 4 }),
    7: Object.freeze({ stage: 7, storyLevel: 4, nextStage: 8, nextLevel: 4, expectedMinutes: 50, expectedSessions: 4, actions: 4, strategicChoices: 1, majorChoices: 0, score: 70, storyBeats: 2, milestoneNeed: 1, population: 540, fundEarned: 2500, migratedIn: 13, rareRecovered: 4 }),
    8: Object.freeze({ stage: 8, storyLevel: 4, nextStage: 9, nextLevel: 5, expectedMinutes: 55, expectedSessions: 4, actions: 15, strategicChoices: 5, majorChoices: 2, score: 73, storyBeats: 7, milestoneNeed: 2, population: 620, fundEarned: 4000, migratedIn: 17, rareRecovered: 5 }),
    9: Object.freeze({ stage: 9, storyLevel: 5, nextStage: 10, nextLevel: 5, expectedMinutes: 60, expectedSessions: 5, actions: 4, strategicChoices: 1, majorChoices: 0, score: 76, storyBeats: 2, milestoneNeed: 1, population: 700, fundEarned: 3800, migratedIn: 17, rareRecovered: 5 }),
    10: Object.freeze({ stage: 10, storyLevel: 5, nextStage: 10, nextLevel: 5, expectedMinutes: 60, expectedSessions: 5, actions: 10, strategicChoices: 4, majorChoices: 1, score: 80, storyBeats: 7, milestoneNeed: 2, population: 780, fundEarned: 6000, migratedIn: 22, rareRecovered: 7 })
  }),
  task: Object.freeze({
    targetByLevel: Object.freeze({ 1: 2, 2: 3, 3: 3, 4: 4, 5: 4 }),
    fundRewardByLevel: Object.freeze({ 1: 20, 2: 25, 3: 30, 4: 35, 5: 40 })
  }),
  fundHealth: Object.freeze({
    1: Object.freeze({ danger: 300, healthyMin: 500, healthyMax: 1200, high: 1600, projectCost: 320 }),
    2: Object.freeze({ danger: 450, healthyMin: 700, healthyMax: 1600, high: 2200, projectCost: 450 }),
    3: Object.freeze({ danger: 650, healthyMin: 950, healthyMax: 2200, high: 3000, projectCost: 600 }),
    4: Object.freeze({ danger: 900, healthyMin: 1300, healthyMax: 2900, high: 3900, projectCost: 780 }),
    5: Object.freeze({ danger: 1200, healthyMin: 1700, healthyMax: 3700, high: 5000, projectCost: 980 })
  }),
  supplyCaps: Object.freeze({ dogFood: 12, alarm: 6, tranquilizer: 8, fieldKit: 5, medicalKit: 5 }),
  supplyBasePrices: Object.freeze({ dogFood: 50, alarm: 65, tranquilizer: 75, fieldKit: 45, medicalKit: 45 }),
  repeatMultipliers: Object.freeze([1, 0.85, 0.70, 0.55]),
  metricDiminishing: Object.freeze([
    Object.freeze({ min: 95, multiplier: 0.25 }),
    Object.freeze({ min: 85, multiplier: 0.50 }),
    Object.freeze({ min: 75, multiplier: 0.70 }),
    Object.freeze({ min: 0, multiplier: 1 })
  ]),
  poacherDiminishing: Object.freeze([
    Object.freeze({ max: 9, multiplier: 0.30 }),
    Object.freeze({ max: 24, multiplier: 0.55 }),
    Object.freeze({ max: 40, multiplier: 0.80 }),
    Object.freeze({ max: 100, multiplier: 1 })
  ]),
  resourceAging: Object.freeze({
    intelFreshLimit: 4,
    intelIdleActions: 3,
    pendingLifetimeActions: 6,
    recoveryCooldownActions: 8
  }),
  fragmentExchange: Object.freeze({
    fieldNote: Object.freeze({ amount: 6, reward: "intel", rewardAmount: 1, cooldown: 3 }),
    migrationTrace: Object.freeze({ amount: 5, fund: 80, reward: "fieldPermits", rewardAmount: 1, cooldown: 5 }),
    forestGift: Object.freeze({ amount: 3, cooldown: 6 }),
    coGuardShard: Object.freeze({ amount: 8, fund: 200, discount: 0.20 })
  }),
  highStockProject: Object.freeze({ triggerActions: 3, durationActions: 8 }),
  population: Object.freeze({
    maxGrowthPerAction: 3,
    nearCapacityRatio: 0.90,
    nearCapacityGrowthMultiplier: 0.30,
    carryingCapacity: Object.freeze({ 1: 260, 2: 360, 3: 500, 4: 680, 5: 850 })
  }),
  rarity: Object.freeze({ baseChance: 0.03, trustBonus: 0.02, ecologyBonus: 0.02, seasonBonus: 0.01, maxChance: 0.08, pity: 10 })
});

function levelOf(reserve) {
  return Math.max(1, Math.min(5, Math.round((((reserve || {}).progression || {}).level) || 1)));
}

function chapterEconomy(reserveOrLevel) {
  const level = typeof reserveOrLevel === "number" ? reserveOrLevel : levelOf(reserveOrLevel);
  return BALANCE_V2.chapterEconomy[Math.max(1, Math.min(5, Math.round(level || 1)))];
}

function progressionGate(stage) {
  return BALANCE_V2.progression[Math.max(1, Math.min(10, Math.round(stage || 1)))];
}

function roundToFive(value) {
  return Math.max(0, Math.round(Number(value || 0) / 5) * 5);
}

function supplyPrice(id, reserveOrLevel) {
  const economy = chapterEconomy(reserveOrLevel);
  return roundToFive((BALANCE_V2.supplyBasePrices[id] || 0) * economy.supplyPriceMultiplier * BALANCE_V2.tuning.supplyPriceScale);
}

function fundHealth(level) {
  return BALANCE_V2.fundHealth[Math.max(1, Math.min(5, Math.round(level || 1)))];
}

function metricGainMultiplier(value) {
  const found = BALANCE_V2.metricDiminishing.find((band) => Number(value || 0) >= band.min);
  return (found ? found.multiplier : 1) * BALANCE_V2.tuning.metricGainScale;
}

function poacherReductionMultiplier(value) {
  const found = BALANCE_V2.poacherDiminishing.find((band) => Number(value || 0) <= band.max);
  return (found ? found.multiplier : 1) * BALANCE_V2.tuning.metricPressureScale;
}

module.exports = {
  BALANCE_V2,
  levelOf,
  chapterEconomy,
  progressionGate,
  supplyPrice,
  fundHealth,
  metricGainMultiplier,
  poacherReductionMultiplier,
  roundToFive
};
