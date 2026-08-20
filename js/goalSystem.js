const { BALANCE_V2, chapterEconomy, levelOf } = require("./balanceConfig");
const { collectionSummary } = require("./collectionSystem");
const { facilityStates } = require("./reserveFacilities");
const { eventStepGuidance } = require("./storyGuidance");
const { addPendingRecovered, addSupply } = require("./resourceLedger");
const { supplyPurchaseCatalog } = require("./actions");

const GOAL_BALANCE = Object.freeze({
  version: 3,
  instantDifficultyScale: 1,
  dailyDifficultyScale: 1,
  stageDifficultyScale: 1,
  goalRewardScale: 1,
  instantRefreshActions: 1,
  dailyResetHour: 4,
  dailyGoalCount: 3,
  dailyRequiredCount: 2,
  maxVisibleGoals: 3,
  fallbackCooldownActions: 3,
  rerouteAfterNoProgress: 2,
  repeatedActionPenalty: 20,
  instantRewardBudget: Object.freeze({ 1: 10, 2: 12, 3: 15, 4: 18, 5: 20 }),
  dailyFundReward: Object.freeze({ 1: 20, 2: 25, 3: 30, 4: 35, 5: 40 }),
  milestoneFundReward: Object.freeze({ 1: 10, 2: 15, 3: 20, 4: 25, 5: 30 }),
  // 终章拨款按 Lv.5 危险线 1200 设计：即使玩家在最后一轮刚好耗尽
  // 基金，完成主线后也能继续采购一轮巡护补给，而不会在庆祝后立刻软锁。
  chapterFundReward: Object.freeze({ 1: 40, 2: 60, 3: 70, 4: 90, 5: 100, 6: 120, 7: 140, 8: 170, 9: 200, 10: 1200 }),
  longNodeFundReward: Object.freeze({ 0: 50, 1: 80, 2: 120 })
});

const LONG_TERM_UNLOCKS = Object.freeze({
  guardian_journey: Object.freeze({ appearance: "守护年轮边框", title: "十章守护者", shareCard: "守护历程分享卡" }),
  forest_collection: Object.freeze({ appearance: "森林档案封套", title: "森林收藏家", shareCard: "森林收藏分享卡" }),
  facility_revival: Object.freeze({ appearance: "复兴站徽", title: "保护站复兴者", shareCard: "设施复兴分享卡" }),
  animal_memory: Object.freeze({ appearance: "动物回忆相框", title: "被动物记住的人", shareCard: "动物记忆分享卡" })
});

const ACTION_META = Object.freeze({
  houndScout: { label: "派猎犬侦察", icon: "houndScout", screen: "action" },
  antiPoacher: { label: "驱赶偷猎", icon: "antiPoacher", screen: "action" },
  habitat: { label: "修复栖息地", icon: "habitat", screen: "action" },
  intervention: { label: "生态干预", icon: "intervention", screen: "action" },
  exploreMaterials: { label: "跟动物探索", icon: "trail", screen: "materials" },
  salvage: { label: "处理回收物", icon: "salvage", screen: "role" },
  buySupplies: { label: "采购短缺补给", icon: "buySupplies", screen: "role" },
  collectionInvestigate: { label: "去沙盘收录", icon: "trail", screen: "home" },
  facilityBuild: { label: "建设保护设施", icon: "reserve_level", screen: "home" },
  animalCare: { label: "安抚命名动物", icon: "eye", screen: "population" },
  shiftHandover: { label: "轮休交接", icon: "action_points", screen: "action" },
  observeReserve: { label: "观察保护区", icon: "eye", screen: "home" }
});

const SUPPLY_CAPS = BALANCE_V2.supplyCaps;
const ACTION_SUPPLY = Object.freeze({
  houndScout: "dogFood",
  antiPoacher: "alarm",
  habitat: "fieldKit",
  intervention: "tranquilizer"
});

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function goalDateKey(now = Date.now()) {
  // 北京时间 04:00 切日：UTC + 8h - 4h = UTC + 4h。
  return new Date(Number(now) + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function reserveFor(state) {
  return (((state || {}).world || {}).reserve) || {};
}

function inventoryTotal(reserve) {
  return Object.values((reserve || {}).inventory || {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
}

function dailyGuardAction(state) {
  const reserve = reserveFor(state);
  const eco = reserve.ecology || {};
  const emergency = ((reserve.emergency || {}).active) || null;
  if (emergency && emergency.recommendedAction) return emergency.recommendedAction;
  if ((reserve.poacherPressure || 0) >= 35) return "antiPoacher";
  if ((eco.disease || 0) >= 28) return "intervention";
  if ((eco.water || 0) < 58 || (eco.grass || 0) < 54) return "habitat";
  return "houndScout";
}

function dailyEconomyAction(state) {
  const reserve = reserveFor(state);
  const supplies = reserve.supplies || {};
  const level = Math.max(1, Math.min(5, Math.round((((reserve.progression || {}).level) || 1))));
  const health = BALANCE_V2.fundHealth[level];
  const stock = inventoryTotal(reserve);
  const lowSupply = Object.keys(SUPPLY_CAPS).some((key) => (supplies[key] || 0) / Math.max(1, SUPPLY_CAPS[key]) <= 0.34);
  if (stock > 0 && (reserve.fund || 0) < health.healthyMin) return "salvage";
  if (lowSupply && (reserve.fund || 0) >= health.healthyMin) return "buySupplies";
  return stock > 0 ? "salvage" : "exploreMaterials";
}

function dailyAnimalAction(state) {
  const collection = (((state || {}).world || {}).collection) || {};
  const active = ((collection.discovery || {}).active) || null;
  if (active && active.status === "located") return "collectionInvestigate";
  if (active && active.status === "hinted") return active.actionId || "houndScout";
  const charges = ((collection.investigation || {}).charges) || 0;
  if ((collection.leads || []).length && charges > 0) return "collectionInvestigate";
  // 剧情发现 V3 的线索只由沙盘动物提供。旧目标仍推荐“探索物资”会让
  // 严格跟随任务的玩家永远没有机会开启发现，最终造成章节证据软锁。
  return "animalCare";
}

function objectiveFor(kind, state) {
  const action = kind === "guard" ? dailyGuardAction(state) : kind === "economy" ? dailyEconomyAction(state) : dailyAnimalAction(state);
  const meta = ACTION_META[action] || ACTION_META.observeReserve;
  const definitions = {
    guard: {
      id: "daily_guard",
      kind: "guard",
      title: "稳住当前最高风险",
      story: "先处理最可能恶化的指标，动物才敢继续留下。",
      description: "完成2次侦察、驱赶、修复或生态干预。",
      target: Math.max(1, Math.round(2 * GOAL_BALANCE.dailyDifficultyScale)),
      reward: "推进今日守护奖励"
    },
    economy: {
      id: "daily_economy",
      kind: "economy",
      title: "接通一次经营循环",
      story: "让基金、回收物和补给真正流动起来。",
      description: "完成1次采购、样本移交、回收或设施投入。",
      target: 1,
      reward: "推进今日守护奖励"
    },
    animal: {
      id: "daily_animal",
      kind: "animal",
      title: "回应一位动物朋友",
      story: "关系和线索都来自具体动物，不来自空白数字。",
      description: "完成1次动物探索、安抚或线索调查。",
      target: 1,
      reward: "推进今日守护奖励"
    }
  };
  return Object.assign({}, definitions[kind], {
    progress: 0,
    complete: false,
    recommendedAction: action,
    buttonLabel: meta.label,
    icon: meta.icon,
    targetScreen: meta.screen
  });
}

function longTrackDefinitions(state) {
  const world = (state || {}).world || {};
  const reserve = world.reserve || {};
  const progression = reserve.progression || {};
  const currentStage = clamp(progression.stage || 1, 1, 10);
  const completedChapters = Math.max(0, currentStage - 1)
    + (currentStage === 10 && progression.chapterComplete ? 1 : 0);
  let collected = 0;
  try {
    collected = collectionSummary(state).collected || 0;
  } catch (error) {
    collected = Object.keys(((world.collection || {}).items) || {}).length;
  }
  let facilityLevels = 0;
  try {
    facilityLevels = facilityStates(state).reduce((sum, facility) => sum + clamp(facility.buildStage || 0, 0, 3), 0);
  } catch (error) {
    facilityLevels = Object.values(((reserve.facilityConstruction || {}).sites) || {}).reduce((sum, site) => sum + clamp((site || {}).buildStage || 0, 0, 3), 0);
  }
  const memory = world.lifeMemory || {};
  const namedCompleted = (memory.individuals || []).filter((animal) => {
    const trust = Math.max(Number(animal.security) || 0, Number(animal.bond) || 0);
    const storyResolved = (animal.strategicHistory || []).length > 0 || (animal.permanentFlags || []).length > 0 || ["independent", "departed"].includes(animal.status);
    return trust >= 80 && storyResolved;
  }).length;
  return [
    { id: "guardian_journey", title: "守护历程", current: completedChapters, target: 10, nodes: [2, 4, 6, 8, 10], icon: "reserve_level" },
    { id: "forest_collection", title: "森林收藏", current: collected, target: 45, nodes: [10, 23, 34, 45], icon: "trail" },
    { id: "facility_revival", title: "设施复兴", current: facilityLevels, target: 18, nodes: [4, 9, 14, 18], icon: "reserve_prosperity" },
    { id: "animal_memory", title: "动物记忆", current: namedCompleted, target: 10, nodes: [2, 5, 8, 10], icon: "eye" }
  ].map((track) => Object.assign({}, track, { percent: Math.round(track.current / Math.max(1, track.target) * 100) }));
}

function syncDailyProjection(daily) {
  const objectives = daily.objectives || [];
  const current = objectives.find((objective) => !objective.complete) || objectives[objectives.length - 1] || {};
  const parsedChapter = Number(daily.chapterNumber) || Number(String(daily.chapter || "").match(/\d+/)?.[0]) || 1;
  const chapterNumber = clamp(parsedChapter, 1, 10);
  return Object.assign({}, daily, {
    id: current.id || "daily_guard",
    chapterNumber,
    chapter: `第${chapterNumber}章 · 今日守护`,
    title: `今日目标：${current.title || "完成一次有效经营"}`,
    story: current.story || "保护区会根据当前状态给出下一步。",
    description: current.description || "完成一个可执行目标。",
    recommendedAction: current.recommendedAction || "houndScout",
    buttonLabel: current.buttonLabel || "开始行动",
    reward: current.reward || "推进今日守护奖励",
    progress: current.progress || 0,
    target: current.target || 1,
    done: objectives.length > 0 && objectives.every((objective) => objective.complete),
    targetScreen: current.targetScreen || "action",
    icon: current.icon || "trail"
  });
}

function createDailyState(state, now = Date.now()) {
  const chapter = clamp((((reserveFor(state).progression || {}).stage) || 1), 1, 10);
  return syncDailyProjection({
    version: 3,
    dateKey: goalDateKey(now),
    chapterNumber: chapter,
    objectives: [objectiveFor("guard", state), objectiveFor("economy", state), objectiveFor("animal", state)],
    required: GOAL_BALANCE.dailyRequiredCount,
    coreClaimed: false,
    fullClaimed: false,
    completedPrevious: false,
    cycle: 1,
    creditedActions: []
  });
}

function createGoalState(state = {}, now = Date.now()) {
  const daily = createDailyState(state, now);
  const goals = {
    version: 3,
    active: { primary: null, alternatives: [], generatedAtAction: 0, manualSelectedId: null },
    daily,
    stage: { chapter: clamp((((reserveFor(state).progression || {}).stage) || 1), 1, 10), objectiveIds: [] },
    longTerm: { tracks: longTrackDefinitions(state), unlocks: {}, grandComplete: false, finalMemorial: false },
    history: [],
    claims: {},
    fallbackCooldown: 0,
    noProgressActions: 0,
    lastProgressSignature: "",
    lastResult: null,
    legacyArchive: null
  };
  goals.active = resolveGoals(state, goals, "create").active;
  return goals;
}

function completedNodeIds(tracks) {
  const ids = [];
  (tracks || []).forEach((track) => (track.nodes || []).forEach((node, index) => {
    if ((track.current || 0) >= node) ids.push(`long:${track.id}:${index}`);
  }));
  return ids;
}

function normalizeGoalState(saved, state = {}, now = Date.now()) {
  if (!saved || saved.version !== 3 || !saved.daily || !Array.isArray(saved.daily.objectives)) {
    const next = createGoalState(state, now);
    next.legacyArchive = saved ? {
      daily: saved.daily ? clone(saved.daily) : null,
      midTerm: Array.isArray(saved.midTerm) ? clone(saved.midTerm) : [],
      longTerm: saved.longTerm ? clone(saved.longTerm) : null
    } : null;
    // 旧存档已有的长线进度只迁移记录，不补发历史奖励。
    completedNodeIds(next.longTerm.tracks).forEach((id) => { next.claims[id] = "legacy"; });
    return next;
  }
  const next = Object.assign(createGoalState(state, now), clone(saved));
  next.claims = Object.assign({}, saved.claims || {});
  next.history = (saved.history || []).slice(-80);
  next.daily = Object.assign(createDailyState(state, now), clone(saved.daily));
  next.daily.objectives = (saved.daily.objectives || []).slice(0, 3).map((objective, index) => {
    const kind = ["guard", "economy", "animal"][index] || objective.kind;
    const base = objectiveFor(kind, state);
    return Object.assign(base, objective, {
      progress: clamp(objective.progress || 0, 0, objective.target || base.target),
      complete: !!objective.complete || (objective.progress || 0) >= (objective.target || base.target)
    });
  });
  next.daily = syncDailyProjection(next.daily);
  if (next.daily.dateKey !== goalDateKey(now)) {
    next.history = (next.history || []).concat([{
      type: "daily_refresh",
      id: `daily:${next.daily.dateKey}:closed`,
      title: "上一日目标已归档",
      dateKey: next.daily.dateKey,
      day: (((state || {}).world || {}).day) || 0
    }]).slice(-80);
    next.daily = createDailyState(state, now);
  }
  next.active = Object.assign({ primary: null, alternatives: [], generatedAtAction: 0, manualSelectedId: null }, saved.active || {});
  next.stage = Object.assign({ chapter: 1, objectiveIds: [] }, saved.stage || {});
  next.longTerm = Object.assign({ tracks: [], unlocks: {}, grandComplete: false, finalMemorial: false }, saved.longTerm || {});
  next.longTerm.unlocks = Object.assign({}, (saved.longTerm || {}).unlocks || {});
  next.longTerm.tracks = longTrackDefinitions(state).map((track) => {
    const old = (next.longTerm.tracks || []).find((item) => item.id === track.id);
    return Object.assign({}, track, old || {}, { current: track.current, percent: track.percent, nodes: track.nodes });
  });
  next.longTerm.grandComplete = next.longTerm.tracks.every((track) => track.current >= track.target);
  next.longTerm.finalMemorial = !!next.longTerm.finalMemorial || next.longTerm.grandComplete;
  next.fallbackCooldown = Math.max(0, Math.round(Number(saved.fallbackCooldown) || 0));
  next.noProgressActions = Math.max(0, Math.round(Number(saved.noProgressActions) || 0));
  return next;
}

function actionMatchesObjective(action, objective) {
  if (!objective) return false;
  if (objective.kind === "guard") return ["houndScout", "antiPoacher", "habitat", "intervention", "patrol"].includes(action);
  if (objective.kind === "economy") return ["buySupplies", "salvage", "facilityBuild", "collectRecovered"].includes(action);
  if (objective.kind === "animal") return ["exploreMaterials", "animalCare", "collectionInvestigate", "careAnimal", "guideMigration", "rescueCare"].includes(action);
  return action === objective.recommendedAction;
}

function affordableSupplyId(reserve, preferredId = "") {
  const fund = Math.max(0, Number((reserve || {}).fund) || 0);
  const supplies = (reserve || {}).supplies || {};
  const catalog = supplyPurchaseCatalog(reserve).filter((purchase) => (supplies[purchase.id] || 0) < purchase.cap);
  if (preferredId) {
    const preferred = catalog.find((purchase) => purchase.id === preferredId);
    return preferred && fund >= preferred.cost ? preferred.id : "";
  }
  const affordable = catalog.filter((purchase) => fund >= purchase.cost).sort((a, b) => {
    const ar = (supplies[a.id] || 0) / Math.max(1, a.target || 1);
    const br = (supplies[b.id] || 0) / Math.max(1, b.target || 1);
    return ar - br || a.cost - b.cost;
  });
  return (affordable[0] || {}).id || "";
}

function actionExecutable(state, action) {
  const reserve = reserveFor(state);
  const supplies = reserve.supplies || {};
  if (action === "houndScout") return (supplies.dogFood || 0) > 0;
  if (action === "antiPoacher") return (supplies.alarm || 0) > 0;
  if (action === "habitat") return (supplies.fieldKit || 0) > 0;
  if (action === "intervention") return (supplies.tranquilizer || 0) > 0;
  if (action === "exploreMaterials") return true;
  if (action === "buySupplies") return !!affordableSupplyId(reserve);
  if (action === "salvage") return true;
  if (action === "shiftHandover") return false;
  if (action === "collectionInvestigate") {
    const collection = (((state || {}).world || {}).collection) || {};
    const active = ((collection.discovery || {}).active) || null;
    return !!(active && active.status === "located")
      || ((collection.leads || []).length > 0 && (((collection.investigation || {}).charges) || 0) > 0);
  }
  if (action === "facilityBuild") {
    try {
      return facilityStates(state).some((facility) => facility.repaired && facility.buildStage < 3 && (reserve.fund || 0) >= (facility.nextBuildCost || facility.specializeCost || Infinity));
    } catch (error) {
      return false;
    }
  }
  return true;
}

function candidate(id, kind, title, body, action, basePriority, state, extras = {}) {
  const meta = ACTION_META[action] || ACTION_META.observeReserve;
  const executable = actionExecutable(state, action);
  const reserve = reserveFor(state);
  const repeat = ((reserve.actionRepeat || {}).lastAction) === action && ((reserve.actionRepeat || {}).count || 0) >= 2;
  const score = basePriority
    + (executable ? 15 : -100)
    + (extras.oneStep ? 10 : 0)
    + (extras.expiresSoon ? 15 : 0)
    + (extras.shortage ? 8 : 0)
    - (repeat && kind !== "crisis" ? GOAL_BALANCE.repeatedActionPenalty : 0);
  return Object.assign({
    id,
    kind,
    title,
    body,
    recommendedAction: action,
    buttonLabel: meta.label,
    icon: meta.icon,
    targetScreen: meta.screen,
    basePriority,
    priorityScore: score,
    executable,
    progress: 0,
    target: 1,
    rewardText: "行动本身会推进保护区"
  }, extras);
}

function criticalEcologyCandidate(state) {
  const reserve = reserveFor(state);
  const eco = reserve.ecology || {};
  const risks = [
    { id: "water", value: eco.water || 0, score: Math.max(0, 55 - (eco.water || 0)) * 1.2, action: "habitat", title: "水源接近危险线", body: "修复水点，先阻止健康下降和动物迁出。" },
    { id: "grass", value: eco.grass || 0, score: Math.max(0, 55 - (eco.grass || 0)) * 1.2, action: "habitat", title: "草场接近危险线", body: "恢复草场产能，减轻种群承载压力。" },
    { id: "disease", value: eco.disease || 0, score: Math.max(0, (eco.disease || 0) - 55), action: "intervention", title: "疾病正在扩散", body: "执行生态干预，避免健康和迁徙继续恶化。" },
    { id: "poacher", value: reserve.poacherPressure || 0, score: Math.max(0, (reserve.poacherPressure || 0) - 50) * 0.9, action: "antiPoacher", title: "边界偷猎风险过高", body: "驱赶靠近保护区的偷猎者，让动物重新回到安全路线。" }
  ].sort((a, b) => b.score - a.score);
  const risk = risks[0];
  if (!risk || risk.score <= 0) return null;
  let action = risk.action;
  let preparing = false;
  let purchaseId = "";
  if (!actionExecutable(state, action)) {
    preparing = true;
    const neededSupply = ACTION_SUPPLY[risk.action] || "";
    purchaseId = affordableSupplyId(reserve, neededSupply);
    action = purchaseId ? "buySupplies" : inventoryTotal(reserve) > 0 ? "salvage" : "exploreMaterials";
  }
  return candidate(`ecology-risk:${risk.id}`, "recovery", preparing ? `为“${risk.title}”补齐物资` : risk.title,
    preparing ? `${risk.body} 当前缺少执行物资，先恢复补给。` : risk.body,
    action, 96, state, { shortage: preparing, oneStep: true, rewardText: "阻止生态继续恶化", riskMetric: risk.id, riskValue: risk.value, purchaseId });
}

function stageCandidate(state) {
  const reserve = reserveFor(state);
  const progression = reserve.progression || {};
  const collection = (((state || {}).world || {}).collection) || {};
  const activeDiscovery = ((collection.discovery || {}).active) || null;
  // 动物已经指出异常后，章节任务必须接管这条因果链。不能继续把
  // “提升评分”放在最优先，同时把正在等待的剧情发现塞进次要目标。
  // 危机会在 resolveGoals 中以更高优先级覆盖这里，其余时间先把当前
  // 发现做完，再回到常规章节门槛。
  if (activeDiscovery) {
    const requiredAction = activeDiscovery.status === "located"
      ? "collectionInvestigate"
      : (activeDiscovery.actionId || "houndScout");
    let action = requiredAction;
    let preparing = false;
    let purchaseId = "";
    if (!actionExecutable(state, action)) {
      preparing = true;
      const neededSupply = ACTION_SUPPLY[requiredAction] || "";
      purchaseId = affordableSupplyId(reserve, neededSupply);
      action = purchaseId
        ? "buySupplies"
        : inventoryTotal(reserve) > 0
          ? "salvage"
          : "exploreMaterials";
    }
    const title = preparing
      ? `为剧情补齐物资：${activeDiscovery.title || "动物发现"}`
      : activeDiscovery.status === "located"
      ? `收录现场物件：${activeDiscovery.title || "动物发现"}`
      : `推进剧情：${activeDiscovery.title || "动物发现异常"}`;
    const body = preparing
      ? `这条发现需要“${(ACTION_META[requiredAction] || {}).label || "对应守护行动"}”。先取得所需补给，发现会保留。`
      : activeDiscovery.status === "located"
      ? "物件已出现在沙盘，点击它完成收录并推进章节证据。"
      : `执行“${activeDiscovery.actionLabel || "对应守护行动"}”，验证动物指出的迹象。`;
    return candidate(`stage:${progression.stage || 1}:discovery:${activeDiscovery.itemId || activeDiscovery.id}`, "stage", title, body, action, 89, state, {
      oneStep: true,
      rewardText: "推进剧情发现与章节证据",
      storyAligned: true,
      evidenceAligned: true,
      shortage: preparing,
      intendedAction: requiredAction,
      purchaseId
    });
  }
  const objectives = progression.objectives || [];
  const incomplete = objectives.filter((item) => !item.optional && !item.complete);
  const milestones = objectives.filter((item) => item.optional && item.id !== "expectedTime" && !item.complete);
  // 剧情目标优先使用事件链给出的真实条件。否则任务卡可能说“侦察”，
  // 而剧情判定实际等待“修复水源”，玩家完成任务却看不到剧情推进。
  const storyGoal = incomplete.find((item) => item.id === "chapterStory");
  const evidenceGoal = milestones.find((item) => item.id === "storyEvidence");
  const goal = storyGoal || incomplete[0] || evidenceGoal || milestones.sort((a, b) => ((b.current || 0) / Math.max(1, b.target || 1)) - ((a.current || 0) / Math.max(1, a.target || 1)))[0];
  if (!goal) return null;
  const actionMap = {
    actions: dailyGuardAction(state),
    strategicChoices: dailyGuardAction(state),
    majorStrategicChoices: dailyGuardAction(state),
    // 保护区评分只由水源、草场、疾病和迁徙构成。旧映射却优先处理
    // 偷猎并在水源达 65 后推荐侦察，导致草场 50 多时仍无法冲过终章评分。
    score: ((reserve.ecology || {}).disease || 0) > 10
      ? "intervention"
      : Math.min(((reserve.ecology || {}).water || 0), ((reserve.ecology || {}).grass || 0)) < 82
        ? "habitat"
        : "houndScout",
    chapterStory: dailyGuardAction(state),
    population: "habitat",
    fundEarned: inventoryTotal(reserve) ? "salvage" : "buySupplies",
    migratedIn: "habitat",
    rareRecovered: "exploreMaterials"
  };
  const chain = reserve.eventChain || {};
  // Old saves only stored title/prompt. Rebuild action guidance from the same
  // canonical table used by the simulator before the first post-update action.
  const nextStory = Object.assign({}, eventStepGuidance(reserve, Math.min(7, (chain.step || 0) + 1)), chain.next || {});
  const validStoryActions = Array.isArray(nextStory.validActions) ? nextStory.validActions.filter(Boolean) : [];
  let action = actionMap[goal.id] || dailyGuardAction(state);
  let preparingStory = false;
  let purchaseId = "";
  if (goal.id === "storyEvidence") {
    const collection = (((state || {}).world || {}).collection) || {};
    const activeDiscovery = ((collection.discovery || {}).active) || null;
    action = activeDiscovery && activeDiscovery.status === "located"
      ? "collectionInvestigate"
      : activeDiscovery
        ? (activeDiscovery.actionId || "houndScout")
        : "animalCare";
  }
  if (goal.id === "chapterStory") {
    const ordered = [nextStory.recommendedAction].concat(validStoryActions).filter((item, index, all) => item && all.indexOf(item) === index);
    const executableStoryAction = ordered.find((item) => actionExecutable(state, item));
    if (executableStoryAction) action = executableStoryAction;
    else {
      preparingStory = true;
      const neededSupply = ordered.map((item) => ACTION_SUPPLY[item]).find(Boolean) || "";
      purchaseId = affordableSupplyId(reserve, neededSupply);
      action = purchaseId ? "buySupplies" : inventoryTotal(reserve) > 0 ? "salvage" : "exploreMaterials";
    }
    if (!actionExecutable(state, action)) {
      preparingStory = true;
      const recoveryActions = [
        inventoryTotal(reserve) > 0 ? "salvage" : "",
        actionExecutable(state, "houndScout") ? "houndScout" : "",
        affordableSupplyId(reserve) ? "buySupplies" : "",
        "salvage"
      ].filter(Boolean);
      action = recoveryActions.find((item) => actionExecutable(state, item)) || "salvage";
      if (action === "buySupplies" && !purchaseId) purchaseId = affordableSupplyId(reserve);
    }
  }
  const title = goal.id === "chapterStory"
    ? `${preparingStory ? "为剧情做准备" : "推进剧情"}：${nextStory.title || goal.label}`
    : goal.id === "storyEvidence"
      ? `推进章节：${goal.label}`
    : `推进章节：${goal.label}`;
  const body = goal.id === "chapterStory"
    ? `${nextStory.prompt || chain.waitingText || "完成对应行动，推进本章剧情。"}${preparingStory ? " 先补齐执行条件。" : ""}`
    : goal.id === "storyEvidence"
      ? `${goal.current || 0}/${goal.target || 1}件；倾听动物、完成它指出的守护行动，再到沙盘收录实物。`
    : `${goal.current || 0}/${goal.target || 1}${goal.unit || ""}，这是当前最接近的晋级条件。`;
  return candidate(`stage:${progression.stage || 1}:${goal.id}`, "stage", title, body, action, goal.id === "chapterStory" ? 88 : 80, state, {
    progress: goal.current || 0,
    target: goal.target || 1,
    oneStep: (goal.target || 1) - (goal.current || 0) <= 1,
    rewardText: goal.id === "chapterStory" ? "推进剧情与章节晋级" : "推进章节晋级",
    storyAligned: goal.id === "chapterStory",
    evidenceAligned: goal.id === "storyEvidence",
    storyStep: goal.id === "chapterStory" ? (chain.step || 0) + 1 : 0,
    storyValidActions: goal.id === "chapterStory" ? validStoryActions : [],
    purchaseId
  });
}

function resolveGoals(state, suppliedGoals = null, trigger = "refresh") {
  const goals = suppliedGoals && suppliedGoals.version === 3 ? suppliedGoals : normalizeGoalState(suppliedGoals || (((state || {}).world || {}).goals), state);
  const reserve = reserveFor(state);
  const candidates = [];
  const emergency = ((reserve.emergency || {}).active) || null;
  if (emergency) {
    candidates.push(candidate(`crisis:${emergency.id || emergency.type}`, "crisis", emergency.title || "危机需要立即处理", `剩余${emergency.daysRemaining || 1}次处置窗口，先执行具体恢复行动。`, emergency.recommendedAction || dailyGuardAction(state), 100, state, { expiresSoon: (emergency.daysRemaining || 1) <= 2, rewardText: "阻止危机继续恶化" }));
  }
  const ecologyRisk = criticalEcologyCandidate(state);
  if (ecologyRisk) candidates.push(ecologyRisk);
  const supplyTotal = Object.values(reserve.supplies || {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  if (supplyTotal <= 0) {
    const purchaseId = affordableSupplyId(reserve);
    const canPurchase = !!purchaseId;
    const hasInventory = inventoryTotal(reserve) > 0;
    const action = canPurchase ? "buySupplies" : hasInventory ? "salvage" : "exploreMaterials";
    const body = canPurchase
      ? "基金已经足够，补齐当前最短缺的巡护物资。"
      : hasInventory
        ? "先移交回收物获得基金，再采购具体补给。"
        : "先跟动物探索回收物，再移交换取基金。";
    candidates.push(candidate("recovery:supplies", "recovery", "接通基金与补给", body, action, 90, state, { shortage: true, oneStep: true, rewardText: "恢复一条巡护路径", purchaseId }));
  }
  const stage = stageCandidate(state);
  if (stage) candidates.push(stage);
  let daily = goals.daily || createDailyState(state);
  daily = Object.assign({}, daily, {
    objectives: (daily.objectives || []).map((objective) => {
      const live = objectiveFor(objective.kind, state);
      return Object.assign({}, objective, {
        recommendedAction: live.recommendedAction,
        buttonLabel: live.buttonLabel,
        icon: live.icon,
        targetScreen: live.targetScreen
      });
    })
  });
  goals.daily = syncDailyProjection(daily);
  const dailyPriority = { guard: 74, economy: 62, animal: 61 };
  (daily.objectives || []).filter((objective) => !objective.complete).forEach((objective) => {
    const remaining = Math.max(0, (objective.target || 1) - (objective.progress || 0));
    candidates.push(candidate(`daily:${daily.dateKey}:${objective.id}`, "daily", objective.title, objective.description, objective.recommendedAction, dailyPriority[objective.kind] || 60, state, {
      progress: objective.progress || 0,
      target: objective.target || 1,
      oneStep: remaining <= 1,
      rewardText: "推进今日守护奖励",
      targetScreen: objective.targetScreen
    }));
  });
  // 主线剧情正在等待明确行动时，不再把“剧情发现”伪装成第二条并列剧情。
  // 发现系统仍可从底部频道进入，但目标中心一次只解释一条剧情因果链。
  if (!(stage && (stage.storyAligned || stage.evidenceAligned))) {
    const collection = (((state || {}).world || {}).collection) || {};
    const activeDiscovery = ((collection.discovery || {}).active) || null;
    if (activeDiscovery && activeDiscovery.status === "located") {
      candidates.push(candidate("story:collection:located", "story", "现场物件等待收录", "动物的迹象已经被守护行动验证；回到沙盘点击具体物件。", "collectionInvestigate", 58, state, { oneStep: true, rewardText: "推进剧情发现" }));
    } else if (activeDiscovery) {
      candidates.push(candidate("story:collection:hinted", "story", activeDiscovery.title || "动物发现异常", `完成“${activeDiscovery.actionLabel || "对应守护行动"}”，把迹象定位到沙盘现场。`, activeDiscovery.actionId || "houndScout", 58, state, { oneStep: true, rewardText: "定位剧情物件" }));
    } else if ((collection.leads || []).length && (((collection.investigation || {}).charges) || 0) > 0) {
      candidates.push(candidate("story:collection:legacy", "story", "隐藏档案仍有一条线索", "隐藏或高风险发现仍可使用六面骰调查。", "collectionInvestigate", 45, state, { oneStep: true, rewardText: "推进隐藏发现" }));
    } else {
      candidates.push(candidate("story:animal", "story", "听听动物发现了什么", "选择一只动物倾听或安抚；它可能提出异常，并开启下一条剧情发现。", "animalCare", 50, state, { rewardText: "开启剧情发现" }));
    }
  }
  try {
    const buildable = facilityStates(state).find((facility) => facility.repaired && facility.buildStage < 3 && (reserve.fund || 0) >= (facility.nextBuildCost || facility.specializeCost || Infinity));
    if (buildable) candidates.push(candidate(`facility:${buildable.id}`, "long", `建设${buildable.name}`, buildable.stageLabel || "让案件结局真正改变沙盘。", "facilityBuild", 35, state, { rewardText: "推进设施复兴" }));
  } catch (error) {
    // 设施尚未初始化时不阻断目标系统。
  }
  let valid = candidates.filter((item) => item.executable);
  const stalePrimary = goals.noProgressActions >= GOAL_BALANCE.rerouteAfterNoProgress
    ? ((goals.active || {}).primary || null)
    : null;
  if (stalePrimary && !["crisis", "recovery"].includes(stalePrimary.kind)) {
    valid = valid.map((item) => item.id === stalePrimary.id
      ? Object.assign({}, item, { priorityScore: item.priorityScore - 35, rerouted: true })
      : item);
  }
  if (!valid.length) {
    valid = [candidate("fallback:observe", "fallback", "观察保护区", "先观察动物与水草变化，寻找下一条可执行线索。", "observeReserve", 20, state, { rewardText: "待收研究样本 +1" })];
  }
  valid.sort((a, b) => b.priorityScore - a.priorityScore || a.id.localeCompare(b.id));
  const deduped = [];
  const actionIds = new Set();
  valid.forEach((item) => {
    if (deduped.length >= GOAL_BALANCE.maxVisibleGoals) return;
    if (actionIds.has(item.recommendedAction) && item.kind !== "crisis") return;
    actionIds.add(item.recommendedAction);
    deduped.push(item);
  });
  if (!deduped.length) deduped.push(valid[0]);
  const mandatoryOverride = ["crisis", "recovery"].includes((deduped[0] || {}).kind);
  const manualSelectedId = (((goals.active || {}).manualSelectedId) || "");
  if (manualSelectedId && !mandatoryOverride) {
    const selectedIndex = deduped.findIndex((item) => item.id === manualSelectedId);
    if (selectedIndex > 0) deduped.unshift(deduped.splice(selectedIndex, 1)[0]);
  }
  const retainedManualSelection = !mandatoryOverride && deduped.some((item) => item.id === manualSelectedId)
    ? manualSelectedId
    : null;
  return Object.assign({}, goals, {
    active: {
      primary: deduped[0],
      alternatives: deduped.slice(1),
      generatedAtAction: (((reserve.progression || {}).totalActions) || 0),
      trigger,
      manualSelectedId: retainedManualSelection
    },
    stage: {
      chapter: clamp((((reserve.progression || {}).stage) || 1), 1, 10),
      objectiveIds: ((reserve.progression || {}).objectives || []).filter((item) => !item.optional).map((item) => item.id)
    },
    longTerm: {
      tracks: longTrackDefinitions(state),
      unlocks: Object.assign({}, (goals.longTerm || {}).unlocks || {}),
      grandComplete: longTrackDefinitions(state).every((track) => track.current >= track.target),
      finalMemorial: !!((goals.longTerm || {}).finalMemorial)
    }
  });
}

function selectActiveGoal(goals, goalId) {
  const next = clone(goals || {});
  const active = Object.assign({ primary: null, alternatives: [], generatedAtAction: 0, manualSelectedId: null }, next.active || {});
  const options = [active.primary].concat(active.alternatives || []).filter(Boolean);
  const selected = options.find((goal) => goal.id === goalId);
  if (!selected) return next;
  active.primary = selected;
  active.alternatives = options.filter((goal) => goal.id !== selected.id);
  active.manualSelectedId = selected.id;
  next.active = active;
  return next;
}

function addReward(rewards, type, amount, label, source) {
  if (!amount) return;
  rewards.push({ type, amount, label, source });
}

function applyInstantReward(reserve, level, rewards) {
  const accepted = addPendingRecovered(reserve, "researchSample", 1);
  addReward(rewards, "pendingRecovered", accepted, `研究样本待收 +${accepted}`, "instant");
}

function applyDailyCoreReward(reserve, level, rewards) {
  const accepted = addPendingRecovered(reserve, "researchSample", 1);
  addReward(rewards, "pendingRecovered", accepted, `研究样本待收 +${accepted}`, "daily_core");
}

function applyDailyFullReward(state, rewards) {
  const reserve = reserveFor(state);
  const supplies = reserve.supplies || (reserve.supplies = {});
  const supplyKey = Object.keys(SUPPLY_CAPS).sort((a, b) => ((supplies[a] || 0) / SUPPLY_CAPS[a]) - ((supplies[b] || 0) / SUPPLY_CAPS[b]))[0];
  if (supplyKey && (supplies[supplyKey] || 0) < SUPPLY_CAPS[supplyKey]) {
    const accepted = addSupply(reserve, supplyKey, 1);
    const labels = { dogFood: "狗粮", alarm: "警报器", tranquilizer: "麻醉弹", fieldKit: "野外工具包", medicalKit: "医疗包" };
    addReward(rewards, supplyKey, accepted, `${labels[supplyKey]} +${accepted}`, "daily_full");
  }
  const world = state.world || {};
  const memory = world.lifeMemory || {};
  const named = (memory.individuals || []).filter((animal) => animal.status === "active").sort((a, b) => (b.security || b.bond || 0) - (a.security || a.bond || 0))[0];
  if (named) {
    named.security = clamp((named.security == null ? named.bond || 40 : named.security) + 1, 0, 100);
    named.bond = named.security;
    addReward(rewards, "animalTrust", 1, `${named.name || named.species}信任 +1`, "daily_full");
  } else {
    const known = (world.knownCharacters || [])[0];
    if (known) {
      known.relation = Object.assign({}, known.relation || {}, { trust: clamp(((known.relation || {}).trust || 0) + 1, 0, 100) });
      addReward(rewards, "animalTrust", 1, `${known.shortName || known.name || "动物"}信任 +1`, "daily_full");
    }
  }
}

function claimFund(goals, reserve, key, amount, label, source, rewards) {
  if (goals.claims[key]) return false;
  goals.claims[key] = "claimed";
  // 最终档案本身就是十阶段累计样本的统一移交。此处直接结算专项拨款，
  // 避免完成主线后还要再做一次“收取→移交”才能脱离危险资金状态。
  if (source === "stage_complete" && key === "stage:10:complete") {
    const grant = Math.max(0, Math.round(amount));
    reserve.fund = Math.max(0, Math.round((reserve.fund || 0) + grant));
    reserve.progression = reserve.progression || {};
    reserve.progression.totalFundEarned = Math.max(0, Math.round((reserve.progression.totalFundEarned || 0) + grant));
    reserve.economyLedger = reserve.economyLedger || { sources: {}, sinks: {}, net: 0 };
    reserve.economyLedger.sources = reserve.economyLedger.sources || {};
    reserve.economyLedger.sources.archiveGrant = (reserve.economyLedger.sources.archiveGrant || 0) + grant;
    reserve.economyLedger.net = (reserve.economyLedger.net || 0) + grant;
    addReward(rewards, "fund", grant, `${label}：最终档案自动移交，专项拨款 +${grant}`, source);
    return true;
  }
  const actual = Math.max(1, Math.round(amount / 80));
  const accepted = addPendingRecovered(reserve, "researchSample", actual);
  addReward(rewards, "pendingRecovered", accepted, `${label}：研究样本待收 +${accepted}`, source);
  return true;
}

function progressionMilestones(state) {
  return ((((reserveFor(state).progression || {}).objectives) || [])).filter((item) => item.optional && item.id !== "expectedTime");
}

function progressSignature(goals) {
  return (goals.daily.objectives || []).map((objective) => `${objective.id}:${objective.progress}`).join("|");
}

function applyGoalProgress(beforeState, afterState, context = {}) {
  const now = context.now == null ? Date.now() : context.now;
  const action = context.action || "";
  const derivedOnly = !!context.derivedOnly;
  const beforeGoals = normalizeGoalState((((beforeState || {}).world || {}).goals), beforeState, now);
  const savedAfterGoals = (((afterState || {}).world || {}).goals);
  let goals = normalizeGoalState(savedAfterGoals && savedAfterGoals.version === 3 ? savedAfterGoals : beforeGoals, afterState, now);
  const reserve = reserveFor(afterState);
  const beforeReserve = reserveFor(beforeState);
  const level = levelOf(reserve);
  const rewards = [];
  const completions = [];
  const today = goalDateKey(now);

  if (goals.daily.dateKey !== today) {
    if (!goals.daily.coreClaimed && (goals.daily.objectives || []).filter((objective) => objective.complete).length >= goals.daily.required) {
      applyDailyCoreReward(reserve, level, rewards);
    }
    goals.daily = createDailyState(afterState, now);
  }

  const previousDaily = clone(goals.daily);
  let credited = 0;
  if (!derivedOnly) {
    goals.daily.objectives = (goals.daily.objectives || []).map((objective) => {
      const next = Object.assign({}, objective);
      if (!next.complete && credited < 2 && actionMatchesObjective(action, next)) {
        next.progress = Math.min(next.target || 1, (next.progress || 0) + 1);
        next.complete = next.progress >= (next.target || 1);
        credited += 1;
        if (next.complete) completions.push({ type: "daily_objective", id: next.id, title: next.title });
      }
      return next;
    });
  }
  if (!derivedOnly) goals.daily.completedPrevious = completions.some((item) => item.type === "daily_objective");
  goals.daily.creditedActions = ((goals.daily.creditedActions || []).concat(action ? [action] : [])).slice(-12);
  const dailyCompleteCount = goals.daily.objectives.filter((objective) => objective.complete).length;
  if (dailyCompleteCount >= goals.daily.required && !goals.daily.coreClaimed) {
    goals.daily.coreClaimed = true;
    applyDailyCoreReward(reserve, level, rewards);
    completions.push({ type: "daily_core", id: `daily:${today}:core`, title: "今日守护 2/3 完成" });
  }
  if (dailyCompleteCount >= goals.daily.objectives.length && !goals.daily.fullClaimed) {
    goals.daily.fullClaimed = true;
    applyDailyFullReward(afterState, rewards);
    completions.push({ type: "daily_full", id: `daily:${today}:full`, title: "今日守护 3/3 完成" });
  }
  if (!derivedOnly) goals.daily.cycle = Math.max(1, Number(goals.daily.cycle) || 1) + (goals.daily.completedPrevious ? 1 : 0);
  goals.daily = syncDailyProjection(goals.daily);

  const priorPrimary = ((beforeGoals.active || {}).primary) || null;
  if (!derivedOnly && action && priorPrimary && priorPrimary.executable && priorPrimary.recommendedAction === action) {
    const claimKey = `instant:${priorPrimary.id}:${(((beforeReserve.progression || {}).totalActions) || 0)}`;
    if (!goals.claims[claimKey]) {
      goals.claims[claimKey] = "claimed";
      if (priorPrimary.kind === "fallback" && action === "observeReserve") {
        goals.fallbackCooldown = GOAL_BALANCE.fallbackCooldownActions;
        completions.unshift({ type: "fallback", id: priorPrimary.id, title: "观察保护区完成" });
      } else {
        applyInstantReward(reserve, level, rewards);
        completions.unshift({ type: "instant", id: priorPrimary.id, title: priorPrimary.title });
      }
    }
  }

  const beforeMilestones = progressionMilestones(beforeState).reduce((map, item) => { map[item.id] = item; return map; }, {});
  progressionMilestones(afterState).forEach((item) => {
    if (item.complete && !(beforeMilestones[item.id] && beforeMilestones[item.id].complete)) {
      const chapter = clamp(((beforeReserve.progression || {}).stage) || ((reserve.progression || {}).stage) || 1, 1, 10);
      const key = `stage:${chapter}:milestone:${item.id}`;
      if (claimFund(goals, reserve, key, GOAL_BALANCE.milestoneFundReward[level], item.label, "stage_milestone", rewards)) {
        completions.push({ type: "stage_milestone", id: key, title: `${item.label}里程碑完成` });
      }
    }
  });

  const beforeStage = clamp(((beforeReserve.progression || {}).stage) || 1, 1, 10);
  const afterStage = clamp(((reserve.progression || {}).stage) || 1, 1, 10);
  const finalJustCompleted = beforeStage === 10 && !((beforeReserve.progression || {}).chapterComplete) && !!((reserve.progression || {}).chapterComplete);
  if (afterStage > beforeStage || finalJustCompleted) {
    const completedStage = finalJustCompleted ? 10 : beforeStage;
    const key = `stage:${completedStage}:complete`;
    if (claimFund(goals, reserve, key, GOAL_BALANCE.chapterFundReward[completedStage], `第${completedStage}章完成`, "stage_complete", rewards)) {
      completions.push({ type: "stage_complete", id: key, title: `第${completedStage}章完成` });
    }
  }

  const beforeTracks = longTrackDefinitions(beforeState).reduce((map, track) => { map[track.id] = track; return map; }, {});
  const afterTracks = longTrackDefinitions(afterState);
  afterTracks.forEach((track) => {
    const old = beforeTracks[track.id] || { current: 0 };
    track.nodes.forEach((node, index) => {
      if (track.current >= node && old.current < node) {
        const key = `long:${track.id}:${index}`;
        if (index < 3) {
          claimFund(goals, reserve, key, GOAL_BALANCE.longNodeFundReward[index], track.title, "long_term", rewards);
        } else if (index === track.nodes.length - 1 && !goals.claims[key]) {
          goals.claims[key] = "cosmetic";
          goals.longTerm = goals.longTerm || {};
          goals.longTerm.unlocks = Object.assign({}, goals.longTerm.unlocks || {}, {
            [track.id]: clone(LONG_TERM_UNLOCKS[track.id])
          });
        } else if (!goals.claims[key]) {
          // 守护历程包含额外的 8/10 叙事节点，只点亮进度，不重复投放资源或提前解锁终奖。
          goals.claims[key] = "checkpoint";
        }
        completions.push({ type: "long_term", id: key, title: `${track.title}达到${node}/${track.target}` });
      }
    });
  });

  const beforeSignature = progressSignature({ daily: previousDaily });
  const afterSignature = progressSignature(goals);
  if (!derivedOnly) goals.noProgressActions = beforeSignature === afterSignature ? Math.min(9, (goals.noProgressActions || 0) + 1) : 0;
  goals.lastProgressSignature = afterSignature;
  goals.fallbackCooldown = Math.max(0, (goals.fallbackCooldown || 0) - 1);
  const grandComplete = afterTracks.every((track) => track.current >= track.target);
  goals.longTerm = {
    tracks: afterTracks,
    unlocks: Object.assign({}, (goals.longTerm || {}).unlocks || {}),
    grandComplete,
    finalMemorial: !!((goals.longTerm || {}).finalMemorial) || grandComplete
  };
  goals.history = (goals.history || []).concat(completions.map((item) => Object.assign({
    day: (((afterState || {}).world || {}).day) || 0,
    dateKey: today,
    action
  }, item))).slice(-80);
  goals.lastResult = completions.length || rewards.length ? { completions, rewards, dateKey: today, action } : null;
  goals = resolveGoals(afterState, goals, "settlement");
  afterState.world.goals = goals;
  if (rewards.length) {
    const previousReward = reserve.lastTaskReward || {};
    const previousItems = previousReward.rewards || [];
    reserve.lastTaskReward = {
      fund: (previousReward.fund || 0) + rewards.filter((reward) => reward.type === "fund").reduce((sum, reward) => sum + reward.amount, 0),
      shift: (previousReward.shift || 0) + rewards.filter((reward) => reward.type === "actionPoints").reduce((sum, reward) => sum + reward.amount, 0),
      fieldPermit: (previousReward.fieldPermit || 0) + rewards.filter((reward) => reward.type === "fieldPermits").reduce((sum, reward) => sum + reward.amount, 0),
      rewards: clone(previousItems.concat(rewards))
    };
  }
  return { state: afterState, goals, rewards, completions, dailyGoalDone: completions.some((item) => item.type === "daily_core" || item.type === "daily_full"), primary: goals.active.primary };
}

function buildGoalView(state, suppliedGoals = null) {
  // Rendering must be a pure projection. Re-resolving here used to apply the
  // "no progress" reroute once for every painted frame. When two candidates
  // were close in priority, the stored primary and the rendered primary would
  // alternate indefinitely (A -> B -> A), making the title and progress chip
  // visibly flicker. Callers that already own a normalized V3 state can pass it
  // in and avoid all decision-making during paint.
  const goals = suppliedGoals && suppliedGoals.version === 3
    ? suppliedGoals
    : resolveGoals(state, normalizeGoalState((((state || {}).world || {}).goals), state), "view");
  const dailyComplete = (goals.daily.objectives || []).filter((objective) => objective.complete).length;
  return {
    primary: goals.active.primary,
    alternatives: goals.active.alternatives || [],
    daily: {
      dateKey: goals.daily.dateKey,
      complete: dailyComplete,
      total: goals.daily.objectives.length,
      required: goals.daily.required,
      coreClaimed: goals.daily.coreClaimed,
      fullClaimed: goals.daily.fullClaimed,
      objectives: goals.daily.objectives
    },
    stage: goals.stage,
    longTerm: goals.longTerm,
    lastResult: goals.lastResult
  };
}

module.exports = {
  GOAL_BALANCE,
  goalDateKey,
  createGoalState,
  normalizeGoalState,
  resolveGoals,
  applyGoalProgress,
  buildGoalView,
  selectActiveGoal,
  actionMatchesObjective,
  actionExecutable,
  longTrackDefinitions
};
