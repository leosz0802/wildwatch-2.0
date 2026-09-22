const { BALANCE_V2, chapterEconomy, ECOLOGY_THRESHOLDS, levelOf, supplyCapFor } = require("./balanceConfig");
const { collectionSummary } = require("./collectionSystem");
const { facilityStates } = require("./reserveFacilities");
const { eventStepGuidance } = require("./storyGuidance");
const { addPendingRecovered, addSupply } = require("./resourceLedger");
const { supplyPurchaseCatalog, actionSupplyRequirement } = require("./actions");
const { recordFundChange } = require("./fundLedger");
const { eventCategory } = require("./eventEconomy");
const { isVisitorArcheryEvent, isNeighborExchangeEvent } = require("./worldEventSystem");
const { isRealNatureEventType } = require("./realNatureEventSystem");
const { chapterRescueSummary, nextRescueTask, nextPoacherRescue } = require("./chapterRescueSystem");
const { chapterCoreLiveSnapshot } = require("./chapterTargets");
const { criticalPatrolRisk } = require("./patrolTriggerPolicy");
const { chapterSpecialStatus, METRIC_LABELS } = require("./chapterSpecialSystem");
const { reserveDevelopmentViews } = require("./reserveDevelopment");
const { chapterHostedVisitors } = require("./visitorReception");

const SANDBOX_VISITOR_SPARSE_LIMIT = 8;
const VISITOR_FACILITY_NODE_ORDER = Object.freeze(["river_shallows", "meadow_edge", "border_pass", "forest_watch"]);

const GOAL_BALANCE = Object.freeze({
  version: 3,
  instantDifficultyScale: 1,
  dailyDifficultyScale: 1,
  stageDifficultyScale: 1,
  goalRewardScale: 1,
  instantRefreshActions: 1,
  dailyResetHour: 4,
  dailyGoalCount: 2,
  dailyRequiredCount: 2,
  dailySchemaVersion: 4,
  maxVisibleGoals: 3,
  fallbackCooldownActions: 3,
  rerouteAfterNoProgress: 2,
  repeatedActionPenalty: 20,
  instantRewardBudget: Object.freeze({ 1: 10, 2: 12, 3: 15, 4: 18, 5: 20 }),
  dailyFundReward: Object.freeze({ 1: 20, 2: 25, 3: 30, 4: 35, 5: 40 }),
  milestoneFundReward: Object.freeze({ 1: 10, 2: 15, 3: 20, 4: 25, 5: 30 }),
  chapterFundReward: Object.freeze({ 1: 40, 2: 60, 3: 70, 4: 90, 5: 100, 6: 120, 7: 140, 8: 170, 9: 200, 10: 1200 }),
  longNodeFundReward: Object.freeze({ 0: 50, 1: 80, 2: 120 })
});

const TASK_CATEGORIES = Object.freeze({
  naturalEvent: "natural_event",
  story: "story",
  userTriggered: "user_triggered",
  sandbox: "sandbox",
  metric: "metric",
  survival: "survival",
  animal: "animal"
});
const TASK_CATEGORY_SET = new Set(Object.values(TASK_CATEGORIES));

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
  guideSandbox: { label: "回沙盘查看", icon: "nav_sandbox", screen: "home" },
  viewFund: { label: "查看星币", icon: "fund", screen: "home" },
  viewVisitors: { label: "发布游客招募", icon: "community", screen: "collection" },
  viewSurvival: { label: "查看生存频道", icon: "leaf", screen: "survival" },
  viewDiscovery: { label: "打开发现频道", icon: "trail", screen: "animalworld" },
  visitorAdjust: { label: "调节游客现场", icon: "community", screen: "home" },
  neighborExchange: { label: "射箭判定交换", icon: "community", screen: "home" },
  harshNature: { label: "射箭判定伤害", icon: "wildfire", screen: "home" },
  realEvent: { label: "查看事件详情", icon: "trail", screen: "home" },
  facilityBuild: { label: "建设保护设施", icon: "reserve_level", screen: "home" },
  rescueAnimal: { label: "前往沙盘解救", icon: "paw", screen: "home" },
  animalCare: { label: "安抚命名动物", icon: "eye", screen: "population" },
  observeReserve: { label: "观察保护区", icon: "eye", screen: "home" },
  chapterSpecial: { label: "处理本章特别任务", icon: "paw", screen: "home" }
});

const SUPPLY_CAPS = BALANCE_V2.supplyCaps;
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

function chapterNumberOf(state) {
  const progression = reserveFor(state).progression || {};
  return clamp(progression.stage || progression.displayChapter || 1, 1, 20);
}

function ecologyNeedsAttention(reserve) {
  const eco = (reserve || {}).ecology || {};
  return (eco.water || 0) < ECOLOGY_THRESHOLDS.recoveryWater
    || (eco.grass || 0) < ECOLOGY_THRESHOLDS.recoveryGrass
    || Number(((reserve || {}).migration || {}).delta) < 0;
}

function dailyObjectiveKinds() {
  // 全章节每日任务只保留招募游客和水草养护，不再强制去生存频道。
  return ["visitor", "ecology"];
}

function dailyNeedCount(daily = {}) {
  return Math.max(
    Number(GOAL_BALANCE.dailyRequiredCount) || 2,
    dailyObjectiveKinds().length,
    Array.isArray(daily.objectives) ? daily.objectives.length : 0
  );
}

function dailyBatchComplete(daily = {}) {
  const kinds = dailyObjectiveKinds();
  const objectives = daily.objectives || [];
  return kinds.length > 0 && kinds.every((kind) => objectives.some((item) => item && item.kind === kind && item.complete));
}

function isCoreReserveGoal(item) {
  if (!item) return false;
  if (["crisis", "recovery", "daily"].includes(item.kind)) return true;
  if (item.rescueAligned || item.recommendedAction === "rescueAnimal") return true;
  if (item.kind === "stage" || item.kind === "collection") return true;
  if (["habitat", "intervention", "visitorAdjust", "neighborExchange", "viewVisitors", "animalCare", "chapterSpecial", "harshNature"].includes(item.recommendedAction)) return true;
  if (item.visitorFacilityGuidance) return true;
  return false;
}

function inventoryTotal(reserve) {
  return Object.values((reserve || {}).inventory || {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
}

function hasRecoveredStock(reserve) {
  return inventoryTotal(reserve) > 0
    || Object.values((reserve || {}).pendingRecovered || {}).some((value) => Number(value) > 0);
}

function safeRecoveryAction(state, preferredSupplyId = "") {
  const reserve = reserveFor(state);
  const purchaseId = affordableSupplyId(reserve, preferredSupplyId);
  if (purchaseId) return { action: "buySupplies", purchaseId };
  if (hasRecoveredStock(reserve)) return { action: "salvage", purchaseId: "" };
  if (ecologyNeedsAttention(reserve) && actionExecutable(state, "habitat")) return { action: "habitat", purchaseId: "" };
  return { action: "viewVisitors", purchaseId: "" };
}

function dailyGuardAction(state) {
  const reserve = reserveFor(state);
  const emergency = ((reserve.emergency || {}).active) || null;
  if (emergency && isVisitorArcheryEvent(emergency.type)) return "visitorAdjust";
  if (emergency && isNeighborExchangeEvent(emergency.type)) return "neighborExchange";
  if (emergency && emergency.recommendedAction) return emergency.recommendedAction;
  const risk = criticalPatrolRisk(reserve);
  // 没有真实巡护风险时，章节进度卡也只指向游客或水草，不再去生存频道。
  return risk ? risk.action : "viewVisitors";
}

function dailyEconomyAction(state) {
  const reserve = reserveFor(state);
  const supplies = reserve.supplies || {};
  const level = Math.max(1, Math.min(7, Math.round((((reserve.progression || {}).level) || 1))));
  const health = BALANCE_V2.fundHealth[level];
  const stock = inventoryTotal(reserve);
  const lowSupply = Object.keys(SUPPLY_CAPS).some((key) => (supplies[key] || 0) / Math.max(1, SUPPLY_CAPS[key]) <= 0.34);
  if (stock > 0 && (reserve.fund || 0) < health.healthyMin) return "salvage";
  if (lowSupply && (reserve.fund || 0) >= health.healthyMin) return "buySupplies";
  return stock > 0 || hasRecoveredStock(reserve) ? "salvage" : "viewVisitors";
}

function dailyAnimalAction(state) {
  const collection = (((state || {}).world || {}).collection) || {};
  const active = ((collection.discovery || {}).active) || null;
  if (active && active.status === "located") return "collectionInvestigate";
  if (active && active.status === "hinted") return ["animalCare", "careAnimal"].includes(active.actionId) ? "animalCare" : active.actionId || "animalCare";
  return "animalCare";
}

function objectiveFor(kind, state) {
  const action = kind === "guard"
    ? dailyGuardAction(state)
    : kind === "economy"
      ? dailyEconomyAction(state)
      : kind === "animal"
        ? dailyAnimalAction(state)
        : kind === "visitor"
          ? "viewVisitors"
          : "habitat";
  const meta = ACTION_META[action] || ACTION_META.observeReserve;
  const water = Number((reserveFor(state).ecology || {}).water) || 0;
  const grass = Number((reserveFor(state).ecology || {}).grass) || 0;
  const ecologyFocus = water <= grass ? "水源" : "草场";
  const definitions = {
    guard: {
      id: "daily_guard",
      kind: "guard",
      title: "处理当前风险",
      story: "回应现场的危险信号。",
      description: "完成2次相关守护行动。",
      target: Math.max(1, Math.round(2 * GOAL_BALANCE.dailyDifficultyScale)),
      reward: "研究样本待收 +1 · 基金 +8"
    },
    economy: {
      id: "daily_economy",
      kind: "economy",
      title: "接通一次经营循环",
      story: "让基金与补给运转。",
      description: "完成1次采购、回收或设施投入。",
      target: 1,
      reward: "研究样本待收 +1 · 基金 +8"
    },
    animal: {
      id: "daily_animal",
      kind: "animal",
      title: "回应一位动物朋友",
      story: "回应一位具体的动物朋友。",
      description: "完成1次探索、安抚或调查。",
      target: 1,
      reward: "研究样本待收 +1 · 基金 +8"
    },
    visitor: {
      id: "daily_visitor",
      kind: "visitor",
      title: "招揽游客来访",
      story: "让游客进入保护区，观察客流对水源和草地的影响。",
      description: "发布1次游客招募，真正带来游客。",
      target: 1,
      reward: "研究样本待收 +1 · 基金 +8"
    },
    ecology: {
      id: "daily_ecology",
      kind: "ecology",
      title: water < grass ? "稳住饮水点" : grass < water ? "稳住草场" : "稳住水源与草场",
      story: "水源、草地和迁徙线会直接改变游客与动物去留。",
      description: `完成1次栖息地修复，优先照顾${ecologyFocus}。`,
      target: 1,
      reward: "研究样本待收 +1 · 基金 +8"
    },
    discovery: {
      id: "daily_discovery", kind: "discovery", title: "记录一条新线索", story: "让今天的观察留下记录。",
      description: "完成1次探索或发现调查。", target: 1, reward: "研究样本待收 +1 · 基金 +8"
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
    reward: current.reward || "研究样本待收 +1 · 基金 +8",
    progress: current.progress || 0,
    target: current.target || 1,
    done: objectives.length > 0 && objectives.every((objective) => objective.complete),
    targetScreen: current.targetScreen || "action",
    icon: current.icon || "trail"
  });
}

function createDailyState(state, now = Date.now()) {
  const chapter = clamp((((reserveFor(state).progression || {}).stage) || 1), 1, 10);
  const kinds = dailyObjectiveKinds(state);
  return syncDailyProjection({
    version: 3,
    schemaVersion: GOAL_BALANCE.dailySchemaVersion,
    dateKey: goalDateKey(now),
    chapterNumber: chapter,
    objectives: kinds.map((kind) => objectiveFor(kind, state)),
    required: kinds.length,
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
  const savedObjectives = saved.daily.objectives || [];
  const kinds = dailyObjectiveKinds(state);
  next.daily.objectives = kinds.map((kind) => {
    const objective = savedObjectives.find((item) => item.kind === kind) || {};
    const base = objectiveFor(kind, state);
    // 存档只继承本类进度，文案与动作始终取同一份定义，避免旧游客任务被配上修复动作。
    const merged = Object.assign({}, objective, base, {
      progress: clamp(objective.progress || 0, 0, objective.target || base.target),
      complete: !!objective.complete || (objective.progress || 0) >= (objective.target || base.target)
    });
    return merged;
  });
  next.daily.schemaVersion = GOAL_BALANCE.dailySchemaVersion;
  next.daily.required = kinds.length;
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
  // Channel-entry tasks are intentionally one-step tasks: arriving at the
  // requested channel is the completion event.  Older saves only listed the
  // playable action (for example exploreMaterials), which left the task lock
  // active after the player had already reached 生存/发现 and caused a loop.
  if (objective.kind === "guard") return ["houndScout", "antiPoacher", "habitat", "intervention", "patrol", "exploreMaterials", "viewSurvival"].includes(action) || action === objective.recommendedAction;
  if (objective.kind === "economy") return ["buySupplies", "salvage", "facilityBuild", "collectRecovered", "exploreMaterials", "viewSurvival"].includes(action);
  if (objective.kind === "animal" || objective.kind === "discovery") return ["exploreMaterials", "animalCare", "collectionInvestigate", "careAnimal", "guideMigration", "rescueCare", "viewSurvival", "viewDiscovery"].includes(action) || action === objective.recommendedAction;
  if (objective.kind === "visitor") return action === "visitorAdjust" || action === "viewVisitors";
  if (objective.kind === "ecology") return ["habitat", "intervention", "harshNature"].includes(action);
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
  const requirement = actionSupplyRequirement(action, reserve);
  if (requirement) return (supplies[requirement.id] || 0) > 0;
  if (action === "exploreMaterials") return true;
  if (action === "harshNature") return true;
  if (action === "rescueAnimal") {
    const chapter = Math.max(1, Math.round(Number((reserve.progression || {}).stage || (reserve.progression || {}).displayChapter || 1)));
    return !!nextPoacherRescue(reserve) || !!nextRescueTask(reserve, chapter);
  }
  if (action === "buySupplies") return !!affordableSupplyId(reserve);
  if (action === "salvage") return true;
  if (action === "collectionInvestigate") {
    const collection = (((state || {}).world || {}).collection) || {};
    const active = ((collection.discovery || {}).active) || null;
    return !!(active && active.status === "located")
      || ((collection.leads || []).length > 0 && (((collection.investigation || {}).charges) || 0) > 0);
  }
  if (action === "facilityBuild") {
    try {
      const day = (((reserve.guardianCycle || {}).day) || (((state || {}).world || {}).day) || 1);
      const hasFacilityTask = facilityStates(state).some((facility) =>
        facility.repaired && facility.buildStage < 3 && (reserve.fund || 0) >= (facility.nextBuildCost || facility.specializeCost || Infinity)
      );
      if (hasFacilityTask) return true;
      return reserveDevelopmentViews(reserve, day).some((view) => {
        if (view.phase === "available") return (view.availability || []).some((row) => row.choice && row.choice.kind === "building" && row.available);
        const building = view.building || {};
        return ["operational", "managed"].includes(view.phase) && view.condition !== "damaged"
          && (!!building.upgradeAvailable || !!(building.story && building.story.ready));
      });
    } catch (error) {
      return false;
    }
  }
  return true;
}

function candidate(id, kind, title, body, action, basePriority, state, extras = {}) {
  const meta = ACTION_META[action] || ACTION_META.observeReserve;
  const executable = actionExecutable(state, action);
  const allowBlocked = !!extras.allowBlocked;
  const reserve = reserveFor(state);
  const repeat = ((reserve.actionRepeat || {}).lastAction) === action && ((reserve.actionRepeat || {}).count || 0) >= 2;
  const score = extras.forcePrimary
    ? 1000
    : basePriority
    + (executable ? 15 : allowBlocked ? 0 : -100)
    + (extras.oneStep ? 10 : 0)
    + (extras.expiresSoon ? 15 : 0)
    + (extras.shortage ? 8 : 0)
    - (repeat && kind !== "crisis" ? GOAL_BALANCE.repeatedActionPenalty : 0);
  const inferredCategory = extras.taskCategory
    || (extras.rescueAligned || action === "animalCare" || action === "rescueAnimal" ? TASK_CATEGORIES.animal
      : kind === "crisis" ? TASK_CATEGORIES.naturalEvent
        : kind === "stage" || kind === "collection" ? TASK_CATEGORIES.story
          : kind === "recovery" ? TASK_CATEGORIES.metric
            : action === "exploreMaterials" || action === "viewSurvival" ? TASK_CATEGORIES.survival
              : "");
  return Object.assign({
    id,
    kind,
    title,
    body,
    recommendedAction: action,
    buttonLabel: meta.label,
    icon: meta.icon,
    targetScreen: extras.targetScreen || meta.screen,
    basePriority,
    priorityScore: score,
    // 紧急事件即使缺少补给也必须留在主任务中；点击后由巡护入口显示
    // 缺失物资和“去物资”路线，不能被无关的生态风险任务抢走。
    executable: executable || allowBlocked,
    progress: 0,
    target: 1,
    taskCategory: inferredCategory,
    rewardText: "行动本身会推进保护区"
  }, extras);
}

function chapterSpecialCandidate(state) {
  const reserve = reserveFor(state);
  const status = chapterSpecialStatus(reserve);
  if (!status.available) return null;
  const def = status.def;
  const pair = def.metrics.map((metric) => METRIC_LABELS[metric] || metric).join("与");
  const play = def.mode === "archery" ? "射箭判定" : "骰子判定";
  return candidate(`stage:${status.state.chapter}:special:${def.taskTitle}`, "stage",
    def.taskTitle,
    `${def.storyTitle}。${def.taskBody} ${play}，结果直接影响${pair}。`,
    "chapterSpecial", 93, state, {
      forcePrimary: true,
      oneStep: true,
      storyAligned: true,
      chapterSpecial: true,
      rewardText: `直接影响${pair}`
    });
}

function animalShortageCandidate(state) {
  const reserve = reserveFor(state);
  const chapterNumber = Math.max(1, Math.round(Number((reserve.progression || {}).stage || (reserve.progression || {}).displayChapter || 1)));
  const snapshot = chapterCoreLiveSnapshot(reserve, chapterNumber);
  const gap = Math.max(0, Math.round(Number(snapshot.target.animals) || 0) - Math.round(Number(snapshot.animals) || 0));
  if (gap <= 0) return null;

  const actionsDone = Math.max(0, Number((reserve.progression || {}).totalActions) || 0);
  const onboardingDefer = chapterNumber === 1 && actionsDone < 2;
  const priority = onboardingDefer ? 70 : 91;

  const rescue = nextPoacherRescue(reserve) || nextRescueTask(reserve, chapterNumber);
  if (rescue) {
    const label = rescue.speciesName || rescue.speciesId || "被困动物";
    return candidate(`metric:animals:rescue:${rescue.targetId || rescue.speciesId}`, "stage",
      `增加动物总数：解救${label}`,
      `本章动物 ${snapshot.animals}/${snapshot.target.animals}，还差 ${gap} 只。完成这次解救，放归数量会直接计入动物总数。`,
      "rescueAnimal", priority, state, {
        oneStep: true,
        rescueAligned: true,
        progress: snapshot.animals,
        target: snapshot.target.animals,
        animalId: rescue.speciesId,
        targetId: rescue.targetId || rescue.speciesId,
        rewardText: "解救回归直接增加动物总数",
        taskCategory: TASK_CATEGORIES.animal,
        buttonLabel: ACTION_META.rescueAnimal.label
      });
  }

  const ecology = reserve.ecology || {};
  const water = Number(ecology.water) || 0;
  const grass = Number(ecology.grass) || 0;
  const metricFocus = water <= grass ? "water" : "grass";
  let action = "habitat";
  let preparing = false;
  let purchaseId = "";
  if (!actionExecutable(state, action)) {
    preparing = true;
    const neededSupply = ((actionSupplyRequirement(action, reserve) || {}).id) || "";
    const recovery = safeRecoveryAction(state, neededSupply);
    purchaseId = recovery.purchaseId;
    action = recovery.action;
  }
  const repairLabel = metricFocus === "water" ? "修复饮水点" : "恢复草场";
  return candidate(`metric:animals:habitat:${metricFocus}`, "stage",
    preparing ? "为增加动物总数先补物资" : `增加动物总数：${repairLabel}`,
    `本章动物 ${snapshot.animals}/${snapshot.target.animals}，还差 ${gap} 只。当前${metricFocus === "water" ? "水源" : "草场"} ${metricFocus === "water" ? water : grass}。完成这次栖息地修复，已有种群会靠近，动物总数上升。`,
    action, Math.max(80, priority - 1), state, {
      shortage: preparing,
      oneStep: true,
      progress: snapshot.animals,
      target: snapshot.target.animals,
      metricFocus,
      intendedAction: "habitat",
      purchaseId,
      rewardText: "栖息地修复会吸引已有种群靠近",
      taskCategory: TASK_CATEGORIES.metric,
      buttonLabel: preparing ? (ACTION_META[action] || ACTION_META.habitat).label : repairLabel
    });
}

function sandboxVisitorCrowd(state) {
  const reserve = reserveFor(state);
  const day = (((reserve.guardianCycle || {}).day) || (((state || {}).world || {}).day) || 1);
  const views = reserveDevelopmentViews(reserve, day);
  const active = views.filter((view) => ["operational", "managed"].includes(view.phase));
  let crowd = active.reduce((sum, view) => sum + Math.max(0, Number(view.visitors) || 0), 0);
  const today = (((reserve.development || {}).operations) || {}).today || {};
  if (Number(today.day) === Number(day)) {
    crowd += Math.max(0, Number(today.recruitedVisitors) || 0);
    crowd += chapterHostedVisitors(reserve, day);
  }
  return crowd;
}

function nextVisitorFacilityTarget(state) {
  const reserve = reserveFor(state);
  const day = (((reserve.guardianCycle || {}).day) || (((state || {}).world || {}).day) || 1);
  const views = reserveDevelopmentViews(reserve, day);
  const hasVisitorBuilding = views.some((view) => view.choice && view.choice.routeKey === "visitor"
    && ["operational", "managed", "construction"].includes(view.phase));
  if (hasVisitorBuilding) return null;
  for (let index = 0; index < VISITOR_FACILITY_NODE_ORDER.length; index += 1) {
    const nodeId = VISITOR_FACILITY_NODE_ORDER[index];
    const view = views.find((item) => item.config && item.config.id === nodeId);
    if (!view || view.phase !== "available") continue;
    const visitorChoice = (view.availability || []).find((row) => row.choice && row.choice.routeKey === "visitor" && row.choice.kind === "building");
    if (!visitorChoice || !visitorChoice.choice) continue;
    return {
      nodeId,
      nodeShort: (view.config && (view.config.short || view.config.name)) || "沙盘节点",
      choice: visitorChoice.choice,
      available: !!visitorChoice.available,
      missing: visitorChoice.missing || []
    };
  }
  return null;
}

function visitorFacilityCandidate(state) {
  const reserve = reserveFor(state);
  const chapterNumber = chapterNumberOf(state);
  const actionsDone = Math.max(0, Number((reserve.progression || {}).totalActions) || 0);
  if (chapterNumber === 1 && actionsDone < 2) return null;
  const crowd = sandboxVisitorCrowd(state);
  if (crowd >= SANDBOX_VISITOR_SPARSE_LIMIT) return null;
  const target = nextVisitorFacilityTarget(state);
  if (!target) return null;
  const empty = crowd <= 0;
  const choiceName = target.choice.short || target.choice.label || "游客设施";
  const title = empty ? `增加沙盘游客：建设${choiceName}` : `沙盘游客偏少：建设${choiceName}`;
  const body = empty
    ? `沙盘上还没有游客。去${target.nodeShort}选择游客友好方案，建成后接待人数会出现在地图上。`
    : `沙盘游客只有 ${crowd} 人。去${target.nodeShort}建设游客设施，把接待从临时招募变成固定步道。`;
  const missing = target.available || !(target.missing || []).length ? "" : ` 当前${target.missing[0]}。`;
  return candidate(`metric:visitors:guest-build:${target.nodeId}`, "stage", title, body + missing, "facilityBuild", empty ? 84 : 80, state, {
    visitorFacilityGuidance: true,
    allowBlocked: true,
    nodeId: target.nodeId,
    developmentTask: "build",
    preferredChoiceId: target.choice.id,
    progress: crowd,
    target: SANDBOX_VISITOR_SPARSE_LIMIT,
    taskCategory: TASK_CATEGORIES.metric,
    buttonLabel: "建设游客设施",
    icon: "community",
    rewardText: "游客设施会提高沙盘接待人数"
  });
}

function criticalEcologyCandidate(state) {
  const reserve = reserveFor(state);
  const risk = criticalPatrolRisk(reserve);
  if (!risk) return null;
  let action = risk.action;
  let preparing = false;
  let purchaseId = "";
  if (!actionExecutable(state, action)) {
    preparing = true;
    const neededSupply = ((actionSupplyRequirement(risk.action, reserve) || {}).id) || "";
    const recovery = safeRecoveryAction(state, neededSupply);
    purchaseId = recovery.purchaseId;
    action = recovery.action;
  }
  return candidate(`ecology-risk:${risk.id}`, "recovery", preparing ? `为“${risk.title}”补齐物资` : risk.title,
    preparing ? `${risk.body} 当前缺少执行物资，先恢复补给。` : risk.body,
    action, 96, state, { shortage: preparing, oneStep: true, rewardText: "阻止生态继续恶化", riskMetric: risk.id, riskValue: risk.value, purchaseId });
}

function liveEventStoryBeat(reserve = {}) {
  const chain = reserve.eventChain || {};
  if (!chain || chain.completed || chain.stageBound) return null;
  if (Math.max(0, Number(chain.step) || 0) < 1) return null;
  const next = chain.next || {};
  const recommended = String(next.recommendedAction || "").trim();
  const valid = Array.isArray(next.validActions) ? next.validActions.filter(Boolean) : [];
  if (!recommended && !valid.length) return null;
  return { chain, next: Object.assign({}, next, { recommendedAction: recommended || valid[0], validActions: valid }) };
}

function stageCandidate(state) {
  const reserve = reserveFor(state);
  const progression = reserve.progression || {};
  const poacherTask = nextPoacherRescue(reserve);
  if (poacherTask) {
    return candidate(`poacher-rescue:${poacherTask.targetId}`, "crisis",
      `盗猎者困住${poacherTask.speciesName}`,
      "本章节已有种群被困。点击进入解救任务，收集物品后前往沙盘处理。",
      "rescueAnimal", 72, state, { oneStep: true, rescueAligned: true, parallel: true, optional: true, animalId: poacherTask.targetId, targetId: poacherTask.targetId, rewardText: "解救完成后恢复该种群" });
  }
  const collection = (((state || {}).world || {}).collection) || {};
  const activeDiscovery = ((collection.discovery || {}).active) || null;
  if (activeDiscovery) {
    const requiredAction = activeDiscovery.status === "located"
      ? "collectionInvestigate"
      : (["animalCare", "careAnimal"].includes(activeDiscovery.actionId) ? "animalCare" : (activeDiscovery.actionId || "houndScout"));
    let action = requiredAction;
    let preparing = false;
    let purchaseId = "";
    if (!actionExecutable(state, action)) {
      preparing = true;
      const neededSupply = ((actionSupplyRequirement(requiredAction, reserve) || {}).id) || "";
      const recovery = safeRecoveryAction(state, neededSupply);
      purchaseId = recovery.purchaseId;
      action = recovery.action;
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
    // 只有缺补给时才把发现做成任务卡。可执行的发现留在沙盘物件上，
    // 避免“找到案件主证据 / 陷阱证据”在每章循环成强制卡片。
    if (preparing) {
      return candidate(`stage:${progression.stage || 1}:discovery:${activeDiscovery.itemId || activeDiscovery.id}`, "collection", title, body, action, 55, state, {
        oneStep: true,
        rewardText: "支线收藏与章节旁证",
        storyAligned: true,
        evidenceAligned: true,
        shortage: true,
        intendedAction: requiredAction,
        purchaseId
      });
    }
  }
  const objectives = progression.objectives || [];
  const incomplete = objectives.filter((item) => !item.optional && !item.complete);
  // 晋级门槛包含本章解救，但解救不是传统的 progression.objectives。
  // 必做目标完成后，即使可选里程碑（案件证据、珍稀回收）还没做，
  // 也要给出可执行的解救卡，而不是循环“找到案件主证据”。
  // 第一次侦察后剧情段仍是玩法主线（修栖息地），即使 leftover 把 chapterStory
  // 标成可选、不再卡住晋级，也不能让解救抢主按钮；新手第二步要打开巡护弹窗。
  const liveStory = liveEventStoryBeat(reserve);
  const chapterNumber = Math.max(1, Math.round(Number(progression.stage || progression.displayChapter || 1)));
  const rescueSummary = chapterRescueSummary(reserve, chapterNumber);
  const rescueGateRequired = !reserve.chapterRescue
    || (reserve.chapterRescue.enforceCompletion !== false && reserve.chapterRescue.legacyGateBypass !== true);
  const onlyRescueBlocksPromotion = Array.isArray(progression.objectives)
    && progression.objectives.length > 0
    && incomplete.length === 0;
  if (!liveStory && rescueGateRequired && onlyRescueBlocksPromotion && rescueSummary.remaining > 0) {
    const rescue = nextRescueTask(reserve, chapterNumber);
    if (rescue) {
      const missing = (rescue.requiredItems || []).filter((itemId) => {
        const inventory = (((reserve.inventory || {}).rescueItems) || {});
        return Number(inventory[itemId]) < 1;
      });
      const label = rescue.speciesName || rescue.speciesId || "待解救动物";
      return candidate(`stage:${chapterNumber}:rescue:${rescue.targetId || rescue.speciesId}`, "stage",
        `解救${label}：完成本章晋级条件`,
        missing.length
          ? `还缺${missing.length}件解救物品；点击后可直接进入解救任务并前往生存频道收集。`
          : `物品已齐，点击后进入沙盘，点击${label}的待解救标记完成解救。`,
        "rescueAnimal", 96, state, {
          forcePrimary: true,
          progress: rescueSummary.rescued,
          target: rescueSummary.total,
          oneStep: true,
          rescueAligned: true,
          animalId: rescue.speciesId,
          targetId: rescue.targetId || rescue.speciesId,
          rewardText: "完成解救后立即重新检查晋级条件"
        });
    }
  }
  const storyGoal = liveStory
    ? (objectives.find((item) => item && item.id === "chapterStory") || {
      id: "chapterStory",
      label: "阶段剧情",
      current: Number(liveStory.chain.step) || 0,
      target: (Number(liveStory.chain.step) || 0) + 1,
      unit: "段",
      complete: false
    })
    : incomplete.find((item) => item.id === "chapterStory");
  const goal = storyGoal || incomplete[0];
  if (!goal) return null;
  const actionMap = {
    actions: dailyGuardAction(state),
    strategicChoices: dailyGuardAction(state),
    majorStrategicChoices: dailyGuardAction(state),
    score: dailyGuardAction(state),
    chapterStory: dailyGuardAction(state),
    population: dailyGuardAction(state),
    fundEarned: inventoryTotal(reserve) ? "salvage" : "buySupplies",
    migratedIn: dailyGuardAction(state)
  };
  const chain = reserve.eventChain || {};
  // Keep the current narrative copy from the chain, but always recompute the
  // executable action. Old saves may retain a generic antiPoacher recommendation
  // from before branch-specific routing was added.
  const storyBranch = chain.branch
    || (/补给线/.test(`${chain.branchTitle || ""}${chain.title || ""}`) ? "ledger" : "");
  const nextStory = Object.assign({}, chain.next || {}, eventStepGuidance(reserve, Math.min(7, (chain.step || 0) + 1), storyBranch));
  const validStoryActions = Array.isArray(nextStory.validActions) ? nextStory.validActions.filter(Boolean) : [];
  let action = actionMap[goal.id] || dailyGuardAction(state);
  let preparingStory = false;
  let purchaseId = "";
  if (goal.id === "chapterStory") {
    const ordered = [nextStory.recommendedAction].concat(validStoryActions).filter((item, index, all) => item && all.indexOf(item) === index);
    const executableStoryAction = ordered.find((item) => actionExecutable(state, item));
    if (executableStoryAction) action = executableStoryAction;
    else {
      preparingStory = true;
      const neededSupply = ordered.map((item) => (actionSupplyRequirement(item, reserve) || {}).id).find(Boolean) || "";
      const recovery = safeRecoveryAction(state, neededSupply);
      purchaseId = recovery.purchaseId;
      action = recovery.action;
    }
    if (!actionExecutable(state, action)) {
      preparingStory = true;
      const recovery = safeRecoveryAction(state);
      action = recovery.action;
      if (action === "buySupplies" && !purchaseId) purchaseId = recovery.purchaseId;
    }
  }
  const title = goal.id === "chapterStory"
    ? `${preparingStory ? "为剧情做准备" : "推进剧情"}：${nextStory.title || goal.label}`
    : `推进章节：${goal.label}`;
  const body = goal.id === "chapterStory"
    ? `${nextStory.prompt || chain.waitingText || "完成对应行动，推进本章剧情。"}${preparingStory ? " 先补齐执行条件。" : ""}`
    : `${goal.current || 0}/${goal.target || 1}${goal.unit || ""}，这是当前最接近的晋级条件。`;
  return candidate(`stage:${progression.stage || 1}:${goal.id}`, "stage", title, body, action, goal.id === "chapterStory" ? 88 : 80, state, {
    progress: goal.current || 0,
    target: goal.target || 1,
    oneStep: (goal.target || 1) - (goal.current || 0) <= 1,
    rewardText: goal.id === "chapterStory" ? "推进剧情与章节晋级" : "推进章节晋级",
    storyAligned: goal.id === "chapterStory",
    evidenceAligned: false,
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
    const intendedEmergencyAction = isVisitorArcheryEvent(emergency.type)
      ? "visitorAdjust"
      : isNeighborExchangeEvent(emergency.type)
        ? "neighborExchange"
        : isRealNatureEventType(emergency.type)
          ? "realEvent"
          : (emergency.recommendedAction || dailyGuardAction(state));
    const requirement = actionSupplyRequirement(intendedEmergencyAction, reserve);
    let emergencyAction = intendedEmergencyAction;
    let purchaseId = "";
    let body = `${eventCategory(emergency).label} · 剩余${emergency.daysRemaining || 1}次。${emergency.recommendLabel || "处理现场"}，恢复客流。`;
    if (requirement && !actionExecutable(state, intendedEmergencyAction)) {
      purchaseId = affordableSupplyId(reserve, requirement.id);
      // Keep the crisis action as the primary goal even when its supply is
      // missing. Recovery options are surfaced separately so the emergency
      // cannot be silently replaced by an unrelated maintenance task.
      body = `危机需要“${(ACTION_META[intendedEmergencyAction] || ACTION_META.houndScout).label}”，当前缺${requirement.label}。先补给，随后继续处置。`;
    }
    candidates.push(candidate(`crisis:${emergency.id || emergency.type}`, "crisis", emergency.title || "危机需要立即处理", body, emergencyAction, 100, state, { allowBlocked: false, forcePrimary: true, expiresSoon: (emergency.daysRemaining || 1) <= 2, rewardText: "恢复游客与基金收入", purchaseId, intendedAction: intendedEmergencyAction, allowBlocked: true }));
  }
  const ecologyRisk = criticalEcologyCandidate(state);
  if (ecologyRisk) candidates.push(ecologyRisk);
  const chapterSpecial = chapterSpecialCandidate(state);
  if (chapterSpecial) candidates.push(chapterSpecial);
  // A single missing patrol item must be visible as a recovery task. The old
  // flow only surfaced recovery when *all* supplies were empty, so a depleted
  // dog-food/field-kit slot could leave the same patrol task on screen over
  // and over with no explanation or route back to Materials.
  const activeDiscoveryForSupply = ((((state || {}).world || {}).collection || {}).discovery || {}).active || null;
  const progressionForSupply = reserve.progression || {};
  const storyGoalPending = (progressionForSupply.objectives || []).some((item) =>
    item && ["chapterStory", "storyEvidence"].includes(item.id) && !item.complete
  ) || !!activeDiscoveryForSupply || !!liveEventStoryBeat(reserve);
  const desiredPatrolActions = [
    emergency && emergency.recommendedAction,
    activeDiscoveryForSupply && activeDiscoveryForSupply.actionId,
    dailyGuardAction(state)
  ].filter((action) => ["houndScout", "antiPoacher", "habitat", "intervention"].includes(action));
  const missingPatrolAction = desiredPatrolActions
    .map((action) => ({ action, requirement: actionSupplyRequirement(action, reserve) }))
    .find((item) => item.requirement && !actionExecutable(state, item.action));
  // During an active chapter objective, keep the story task as the primary
  // card (it already carries the purchaseId and resource route). The
  // standalone reminder is for ordinary patrol/economy flow only, so it
  // cannot hide the chapter context.
  if (missingPatrolAction && !storyGoalPending) {
    const requirement = missingPatrolAction.requirement;
    const recovery = safeRecoveryAction(state, requirement.id);
    const purchaseId = recovery.purchaseId;
    const recoveryAction = recovery.action;
    const meta = ACTION_META[missingPatrolAction.action] || ACTION_META.houndScout;
    candidates.push(candidate(`recovery:patrol:${missingPatrolAction.action}:${requirement.id}`, "recovery",
      `巡护暂停：先补${requirement.label}`,
      `“${meta.label}”缺${requirement.label}。先补给，原任务会继续。`,
      recoveryAction, 94, state, {
        shortage: true,
        oneStep: true,
        // 没有正在处理的紧急事件时，补给说明必须压过生态风险卡，
        // 否则玩家仍会看到一个无法执行的巡护目标。
        forcePrimary: !emergency && !storyGoalPending,
        purchaseId,
        intendedAction: missingPatrolAction.action,
        rewardText: `恢复${meta.label}执行入口`
      }));
  }
  const supplyTotal = Object.values(reserve.supplies || {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  if (supplyTotal <= 0 && !storyGoalPending) {
    const recovery = safeRecoveryAction(state);
    const purchaseId = recovery.purchaseId;
    const action = recovery.action;
    const body = action === "buySupplies"
      ? "基金已经足够，补齐当前最短缺的巡护物资。"
      : action === "salvage"
        ? "先移交回收物获得基金，再采购具体补给。"
        : "先发布游客招募获得基金，再采购补给。";
    candidates.push(candidate("recovery:supplies", "recovery", "接通基金与补给", body, action, 90, state, { shortage: true, oneStep: true, rewardText: "恢复一条巡护路径", purchaseId }));
  }
  const animalShortage = animalShortageCandidate(state);
  if (animalShortage) {
    candidates.push(storyGoalPending
      ? Object.assign({}, animalShortage, { forcePrimary: false, priorityScore: Math.min(Number(animalShortage.priorityScore) || 0, 72) })
      : animalShortage);
  }
  const visitorFacility = visitorFacilityCandidate(state);
  if (visitorFacility) {
    candidates.push(storyGoalPending
      ? Object.assign({}, visitorFacility, { forcePrimary: false, priorityScore: Math.min(Number(visitorFacility.priorityScore) || 0, 70) })
      : visitorFacility);
  }
  const stage = stageCandidate(state);
  if (stage) candidates.push(stage);
  let daily = goals.daily || createDailyState(state);
  daily = Object.assign({}, daily, {
    objectives: (daily.objectives || []).map((objective) => {
      const live = objectiveFor(objective.kind, state);
      return Object.assign({}, objective, {
        title: live.title,
        story: live.story,
        description: live.description,
        recommendedAction: live.recommendedAction,
        buttonLabel: live.buttonLabel,
        icon: live.icon,
        targetScreen: live.targetScreen
      });
    })
  });
  goals.daily = syncDailyProjection(daily);
  // 每日游客/水草记录仍保留在“每日事件”中结算奖励，但不再自动占用
  // 主任务卡。只有真实剧情、沙盘事件、指标异常、生存或动物触发才上卡。
  // 可执行的动物发现留在沙盘，不再做成循环强制卡片。
  // 缺补给时 stageCandidate 已经给出采购卡。
  // 游客设施引导只在沙盘没有游客或游客很少时出现，不按章节循环填充。
  const core = candidates.filter(isCoreReserveGoal);
  if (core.length) {
    candidates.length = 0;
    core.forEach((item) => candidates.push(item));
  }
  let valid = candidates.filter((item) => item.executable && TASK_CATEGORY_SET.has(item.taskCategory));
  const stalePrimary = goals.noProgressActions >= GOAL_BALANCE.rerouteAfterNoProgress
    ? ((goals.active || {}).primary || null)
    : null;
  if (stalePrimary && !["crisis", "recovery"].includes(stalePrimary.kind)) {
    valid = valid.map((item) => item.id === stalePrimary.id
      ? Object.assign({}, item, { priorityScore: item.priorityScore - 35, rerouted: true })
      : item);
  }
  // 没有七类真实触发时允许任务位为空。沙盘本身继续展示动物、建筑和
  // 地图事件，不再用“观察保护区”伪造一张任务卡。
  valid.sort((a, b) => b.priorityScore - a.priorityScore || a.id.localeCompare(b.id));
  const deduped = [];
  const actionIds = new Set();
  valid.forEach((item) => {
    if (deduped.length >= 2) return;
    if (actionIds.has(item.recommendedAction) && item.kind !== "crisis") return;
    actionIds.add(item.recommendedAction);
    deduped.push(item);
  });
  if (!deduped.length && valid[0]) deduped.push(valid[0]);
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

function applyDailyObjectiveReward(reserve, objective, rewards) {
  const accepted = addPendingRecovered(reserve, "researchSample", 1);
  addReward(rewards, "pendingRecovered", accepted, `${objective.title}：研究样本待收 +${accepted}`, "daily_objective");
  const beforeFund = Math.max(0, Math.round(reserve.fund || 0));
  const grant = 8;
  reserve.fund = beforeFund + grant;
  recordFundChange(reserve, beforeFund, reserve.fund, "每日任务奖励", ((reserve.guardianCycle || {}).day) || 0, objective.title);
  reserve.progression = reserve.progression || {};
  reserve.progression.totalFundEarned = Math.max(0, Math.round((reserve.progression.totalFundEarned || 0) + grant));
  addReward(rewards, "fund", grant, `${objective.title}：基金 +${grant}`, "daily_objective");
}

function applyDailyFullReward(state, rewards) {
  const reserve = reserveFor(state);
  const supplies = reserve.supplies || (reserve.supplies = {});
  const supplyKey = Object.keys(SUPPLY_CAPS).sort((a, b) => ((supplies[a] || 0) / Math.max(1, supplyCapFor(a, reserve))) - ((supplies[b] || 0) / Math.max(1, supplyCapFor(b, reserve))))[0];
  if (supplyKey && (supplies[supplyKey] || 0) < supplyCapFor(supplyKey, reserve)) {
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
  if (source === "stage_complete" && key === "stage:10:complete") {
    const grant = Math.max(0, Math.round(amount));
    const beforeFund = Math.max(0, Math.round(reserve.fund || 0));
    reserve.fund = Math.max(0, Math.round(beforeFund + grant));
    recordFundChange(reserve, beforeFund, reserve.fund, "任务奖励", ((reserve.guardianCycle || {}).day) || 0, label || "目标奖励");
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
  if (!derivedOnly) {
    let creditedDailyId = "";
    goals.daily.objectives = (goals.daily.objectives || []).map((objective) => {
      const next = Object.assign({}, objective);
      if (!next.complete && !creditedDailyId && actionMatchesObjective(action, next)) {
        next.progress = Math.min(next.target || 1, (next.progress || 0) + 1);
        next.complete = next.progress >= (next.target || 1);
        if (next.complete) {
          creditedDailyId = next.id;
          applyDailyObjectiveReward(reserve, next, rewards);
          completions.push({ type: "daily_objective", id: next.id, title: next.title, reward: next.reward });
        }
      }
      return next;
    });
  }
  if (!derivedOnly) {
    goals.daily.completedPrevious = !!goals.daily.completedPrevious
      || completions.some((item) => item.type === "daily_objective");
  }
  goals.daily.creditedActions = ((goals.daily.creditedActions || []).concat(action ? [action] : [])).slice(-12);
  goals.daily.required = dailyNeedCount(goals.daily);
  const dailyCompleteCount = goals.daily.objectives.filter((objective) => objective.complete).length;
  const dailyAllDone = dailyBatchComplete(goals.daily) && dailyCompleteCount >= goals.daily.required;
  if (dailyAllDone && !goals.daily.coreClaimed) {
    goals.daily.coreClaimed = true;
    applyDailyCoreReward(reserve, level, rewards);
    completions.push({ type: "daily_core", id: `daily:${today}:core`, title: "每日任务全部完成", reward: "额外补给 +1 · 动物信任 +1" });
  }
  if (dailyAllDone && !goals.daily.fullClaimed) {
    goals.daily.fullClaimed = true;
    applyDailyFullReward(afterState, rewards);
    completions.push({ type: "daily_full", id: `daily:${today}:full`, title: "每日任务全清奖励", reward: "额外补给 +1 · 动物信任 +1" });
  }
  if (!derivedOnly && dailyAllDone) goals.daily.cycle = Math.max(1, Number(goals.daily.cycle) || 1) + 1;
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
  TASK_CATEGORIES,
  goalDateKey,
  createGoalState,
  normalizeGoalState,
  resolveGoals,
  applyGoalProgress,
  buildGoalView,
  selectActiveGoal,
  actionMatchesObjective,
  actionExecutable,
  longTrackDefinitions,
  dailyObjectiveKinds,
  dailyNeedCount,
  dailyBatchComplete,
  SANDBOX_VISITOR_SPARSE_LIMIT
};
