const { chapterFeaturedSpecies, CHAPTERS } = require("./animalWorld");
const { BALANCE_V2, chapterEconomy, ECOLOGY_THRESHOLDS, levelOf, supplyCapFor } = require("./balanceConfig");
const { collectionSummary } = require("./collectionSystem");
const { facilityStates, nextFacilityUseTarget } = require("./reserveFacilities");
const { eventStepGuidance } = require("./storyGuidance");
const { addPendingRecovered, addSupply } = require("./resourceLedger");
const { supplyPurchaseCatalog, actionSupplyRequirement, supplyFillLine } = require("./actions");
const { recordFundChange } = require("./fundLedger");
const { eventCategory } = require("./eventEconomy");
const { isVisitorArcheryEvent, isNeighborEventType } = require("./worldEventSystem");
const { isRealNatureEventType } = require("./realNatureEventSystem");
const { nextRescueTask, nextPoacherRescue } = require("./chapterRescueSystem");
const { chapterCoreLiveSnapshot, comfortAnimalGainRange } = require("./chapterTargets");
const { criticalPatrolRisk } = require("./patrolTriggerPolicy");
const { chapterSpecialStatus, METRIC_LABELS } = require("./chapterSpecialSystem");
const { reserveDevelopmentViews } = require("./reserveDevelopment");
const { chapterHostedVisitors, visitorReceptionPreview } = require("./visitorReception");
const {
  isEndlessGuardReady,
  endlessDailyContract,
  endlessAuctionView
} = require("./endlessGuardMode");
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
  facilityUse: { label: "使用保护站", icon: "reserve_level", screen: "home" },
  rescueAnimal: { label: "前往沙盘解救", icon: "paw", screen: "home" },
  animalCare: { label: "安抚命名动物", icon: "eye", screen: "population" },
  observeReserve: { label: "观察保护区", icon: "eye", screen: "home" },
  chapterSpecial: { label: "处理本章特别任务", icon: "paw", screen: "home" },
  visitorReception: { label: "观景接待", icon: "community", screen: "home" },
  endlessAuction: { label: "参加每周拍卖", icon: "rare", screen: "home" },
  worldHoundPatrol: { label: "发起猎犬巡逻", icon: "hound_team", screen: "league" },
  sharePostcard: { label: "截下本章种群", icon: "eye", screen: "home" }
});
const CHAPTER_THEME_TASKS = Object.freeze({
  1: Object.freeze([
    Object.freeze({
      id: "observe-footprints",
      title: "观察脚印",
      body: "先记录泥岸留下的脚印，确认第一条气味线从哪里开始。",
      action: "houndScout",
      taskVariant: "footprints",
      validActions: Object.freeze(["houndScout"]),
      buttonLabel: "观察脚印",
      resultText: "泥岸脚印已经记录，第一条气味线有了起点。"
    }),
    Object.freeze({
      id: "first-patrol-line",
      title: "建立第一条巡护线",
      body: "到巡护站派出一次短巡，把刚确认的气味线变成第一条保护边界。",
      action: "facilityUse",
      validActions: Object.freeze(["facilityUse"]),
      buttonLabel: "打开巡护站",
      actionHint: "使用巡护站 · 派出短巡",
      resultText: "巡护站已派出短巡，第一条保护边界已经固定。"
    }),
    Object.freeze({
      id: "first-protection",
      title: "完成首次保护",
      body: "执行一次驱赶偷猎，回应泥岸警报，让第一次保护真正落地。",
      action: "antiPoacher",
      taskVariant: "anti-poacher",
      validActions: Object.freeze(["antiPoacher", "habitat", "intervention"]),
      buttonLabel: "驱赶偷猎",
      actionHint: "执行保护行动 · 压低边界风险",
      resultText: "首次保护已经落地，泥岸警报得到回应。"
    })
  ]),
  2: Object.freeze([
    Object.freeze({
      id: "view-leaderboards",
      title: "看一眼榜单",
      body: "浅滩已经有了回声。打开好友榜或世界榜看一眼名次，任意一边都算完成。",
      action: "viewLeaderboard",
      validActions: Object.freeze(["viewLeaderboard"]),
      buttonLabel: "打开好友榜",
      actionHint: "好友榜或世界榜 · 看过即可",
      resultText: "榜单已经看过，浅滩回声有了对照。"
    }),
    Object.freeze({
      id: "restore-water",
      title: "修复水源",
      body: "先把浅滩水源恢复到当前章节的安全线，让动物重新有可以停留的水点。",
      action: "habitat",
      metricFocus: "water",
      validActions: Object.freeze(["habitat"]),
      buttonLabel: "修复水源",
      resultText: "浅滩水源已经恢复，动物重新有了可以停留的水点。"
    }),
    Object.freeze({
      id: "control-visitors",
      title: "控制游客压力",
      body: "调节水边客流，避免游客挤占浅滩边缘的动物活动空间。",
      action: "visitorReception",
      validActions: Object.freeze(["visitorAdjust", "visitorReception", "viewVisitors"]),
      buttonLabel: "控制游客压力",
      resultText: "水边客流已调节，浅滩边缘重新留出活动空间。"
    }),
    Object.freeze({
      id: "keep-animal-corridor",
      title: "保留动物通道",
      body: "打开水文站校准浅滩水线，给动物留出可以进出的安全通道。",
      action: "facilityUse",
      facilityId: "hydrology_station",
      validActions: Object.freeze(["facilityUse"]),
      buttonLabel: "打开水文站",
      actionHint: "校准水线 · 保留动物通道",
      resultText: "水文站已校准浅滩水线，动物通道得以保留。"
    })
  ]),
  3: Object.freeze([
    Object.freeze({
      id: "use-patrol-station",
      title: "使用巡护站",
      body: "先让巡护站承担一次稳定巡查，把第3章的保护动作从临时响应变成固定节奏。",
      action: "facilityUse",
      validActions: Object.freeze(["facilityUse"]),
      buttonLabel: "打开巡护站",
      actionHint: "使用巡护站 · 稳住巡查节奏",
      resultText: "巡护站完成一次稳定巡查，保护区开始站稳脚跟。"
    }),
    Object.freeze({
      id: "replenish-supplies",
      title: "补充物资",
      body: "补齐当前最短缺的巡护物资，让后续疾病和现场风险有真实处理能力。",
      action: "buySupplies",
      validActions: Object.freeze(["buySupplies", "salvage", "viewVisitors"]),
      buttonLabel: "补充物资",
      actionHint: "物资补给 · 补齐短缺",
      resultText: "关键补给已经入库，巡护队有能力处理下一轮风险。"
    }),
    Object.freeze({
      id: "first-disease-risk",
      title: "处理第一次疾病风险",
      body: "执行一次生态干预，把第3章第一次疾病风险压住，避免稳定水点变成扩散点。",
      action: "intervention",
      validActions: Object.freeze(["intervention"]),
      buttonLabel: "处理疾病风险",
      actionHint: "生态干预 · 压低疾病风险",
      resultText: "第一次疾病风险已被处理，稳定保护站没有变成新的扩散点。"
    })
  ]),
  4: Object.freeze([
    Object.freeze({
      id: "restore-grassland",
      title: "修复草场",
      body: "先恢复草场承载力，让回流动物不再把压力全部压到同一片草地。",
      action: "habitat",
      metricFocus: "grass",
      validActions: Object.freeze(["habitat"]),
      buttonLabel: "修复草场",
      resultText: "草场承载力得到恢复，回流动物有了更分散的取食空间。"
    }),
    Object.freeze({
      id: "lower-poacher-pressure",
      title: "降低盗猎压力",
      body: "执行一次驱赶偷猎，把草缘车辙和边界风险压下去。",
      action: "antiPoacher",
      taskVariant: "anti-poacher",
      validActions: Object.freeze(["antiPoacher", "houndScout"]),
      buttonLabel: "驱赶偷猎",
      actionHint: "边界行动 · 压低盗猎压力",
      resultText: "草缘风险被压低，保护区承受住了第一轮试压。"
    }),
    Object.freeze({
      id: "balance-visitors-animals",
      title: "平衡游客和动物",
      body: "调节一次游客现场，让游客活动不继续挤占动物回流路径。",
      action: "visitorReception",
      validActions: Object.freeze(["visitorAdjust", "visitorReception", "viewVisitors"]),
      buttonLabel: "平衡游客和动物",
      actionHint: "游客调节 · 留出动物路径",
      resultText: "游客和动物的活动空间重新拉开，草原试压进入可控状态。"
    })
  ]),
  5: Object.freeze([
    Object.freeze({
      id: "hound-trust-scout",
      title: "猎犬侦查",
      body: "先派猎犬确认捕食者活动边界，建立第5章信任线索。",
      action: "houndScout",
      validActions: Object.freeze(["houndScout"]),
      buttonLabel: "猎犬侦查",
      resultText: "猎犬确认了捕食者边界，保护区有了赢得信任的第一条线索。"
    }),
    Object.freeze({
      id: "protect-predators",
      title: "保护捕食者",
      body: "安抚并观察一位命名动物，让捕食者知道这里不是新的威胁来源。",
      action: "animalCare",
      validActions: Object.freeze(["animalCare"]),
      buttonLabel: "保护捕食者",
      actionHint: "动物安抚 · 建立捕食者信任",
      resultText: "捕食者的紧张感下降，保护区开始赢得更高层级动物的信任。"
    }),
    Object.freeze({
      id: "reduce-over-intervention",
      title: "减少过度干预",
      body: "退后观察一次保护区，让动物自己选择路线，避免把守护变成新的干扰。",
      action: "observeReserve",
      validActions: Object.freeze(["observeReserve"]),
      buttonLabel: "观察保护区",
      actionHint: "退后观察 · 减少干预",
      resultText: "你退后观察了一次，动物路线没有被新的干预打断。"
    })
  ]),
  6: Object.freeze([
    Object.freeze({
      id: "bear-loop-scout",
      title: "确认熊洞边界",
      body: "第6章熊和秃鹫开始把草甸当成回路。先派猎犬确认厚掌的洞域边界，别把回流变成惊扰。",
      action: "houndScout",
      validActions: Object.freeze(["houndScout"]),
      buttonLabel: "确认熊洞边界",
      resultText: "熊洞边界已经记下，草甸回路有了安静的一端。"
    }),
    Object.freeze({
      id: "vulture-snapshot",
      title: "截下秃鹫盘旋",
      body: "把第6章新到的秃鹫拍进守护明信片，让白领的盘旋成为本章种群被看见的证据。也可直接截图。",
      action: "sharePostcard",
      taskVariant: "screenshot",
      shareSpeciesId: "vulture",
      validActions: Object.freeze(["sharePostcard", "captureScreen"]),
      buttonLabel: "截下秃鹫盘旋",
      resultText: "秃鹫盘旋已经被看见，草甸回路有了天空这一层。"
    }),
    Object.freeze({
      id: "meadow-loop-balance",
      title: "稳住草甸回路",
      body: "修复草场，让熊的洞域和秃鹫的盘旋圈同时留出空间，不要让任何一端过稳。",
      action: "habitat",
      metricFocus: "grass",
      validActions: Object.freeze(["habitat"]),
      buttonLabel: "稳住草甸回路",
      resultText: "草甸两端重新分开，回路开始自己说话。"
    })
  ]),
  7: Object.freeze([
    Object.freeze({
      id: "old-water-reconnect",
      title: "接上旧水路",
      body: "第7章大象记得被忘掉的旧水路。先把水源接回去，让幼象和河马重新有湿泥可走。",
      action: "habitat",
      metricFocus: "water",
      validActions: Object.freeze(["habitat"]),
      buttonLabel: "接上旧水路",
      resultText: "旧水路重新发亮，幼象先喝到了水。"
    }),
    Object.freeze({
      id: "elephant-drink-snapshot",
      title: "截下幼象喝水",
      body: "把第7章回归的大象拍进守护明信片，让云耳带着幼象喝水的这一幕被看见。也可直接截图。",
      action: "sharePostcard",
      taskVariant: "screenshot",
      shareSpeciesId: "elephant",
      validActions: Object.freeze(["sharePostcard", "captureScreen"]),
      buttonLabel: "截下幼象喝水",
      resultText: "幼象喝水已经被看见，旧水路真正接上了记忆。"
    }),
    Object.freeze({
      id: "hippo-bay-watch",
      title: "守住河湾泡点",
      body: "河马需要更深的河湾。安抚并观察泥泡，确认水位不会把背脊露得太多。",
      action: "animalCare",
      validActions: Object.freeze(["animalCare", "observeReserve"]),
      buttonLabel: "守住河湾泡点",
      resultText: "河湾重新够深，河马愿意半沉着守门。"
    })
  ]),
  8: Object.freeze([
    Object.freeze({
      id: "crocodile-snapshot",
      title: "截下鳄鱼伏击线",
      body: "把第8章的鳄鱼拍进守护明信片，让核心庇护的沉默猎手被看见。也可直接截图。",
      action: "sharePostcard",
      taskVariant: "screenshot",
      shareSpeciesId: "crocodile",
      validActions: Object.freeze(["sharePostcard", "captureScreen"]),
      buttonLabel: "截下鳄鱼伏击线",
      resultText: "鳄鱼伏击线已经被看见，核心区开始像能住下来的地方。"
    })
  ]),
  9: Object.freeze([
    Object.freeze({
      id: "mink-night-snapshot",
      title: "截下水貂夜行",
      body: "把第9章新到的水貂拍进守护明信片，让霜脊贴着水线的夜行被看见。也可直接截图。",
      action: "sharePostcard",
      taskVariant: "screenshot",
      shareSpeciesId: "mink",
      validActions: Object.freeze(["sharePostcard", "captureScreen"]),
      buttonLabel: "截下水貂夜行",
      resultText: "水貂夜行已经被看见，迁徙线第一次穿过浅滩。"
    }),
  ]),
  10: Object.freeze([
    Object.freeze({
      id: "rhino-wallow-snapshot",
      title: "截下白犀牛泥坑",
      body: "把第10章回归的白犀牛拍进守护明信片，让阔盾盖着泥巴吃草的这一幕被看见。也可直接截图。",
      action: "sharePostcard",
      taskVariant: "screenshot",
      shareSpeciesId: "rhino",
      validActions: Object.freeze(["sharePostcard", "captureScreen"]),
      buttonLabel: "截下白犀牛泥坑",
      resultText: "白犀牛泥坑已经被看见，旗舰招牌有了真正的重量。"
    })
  ]),
  11: Object.freeze([
    Object.freeze({
      id: "endless-bison-snapshot",
      title: "截下守望里的野牛",
      body: "把第11章无限守望里的野牛拍进守护明信片，让宽肩提醒你：守望没有终点，只有下一轮。也可直接截图。",
      action: "sharePostcard",
      taskVariant: "screenshot",
      shareSpeciesId: "bison",
      validActions: Object.freeze(["sharePostcard", "captureScreen"]),
      buttonLabel: "截下守望里的野牛",
      resultText: "守望里的野牛已经被看见，主线完成，荒野继续。"
    })
  ])
});
const SUPPLY_CAPS = BALANCE_V2.supplyCaps;
function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}
function goalDateKey(now = Date.now()) {
  return new Date(Number(now) + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function reserveFor(state) {
  return (((state || {}).world || {}).reserve) || {};
}
const MAX_STORY_CHAPTER = CHAPTERS.length;
function chapterNumberOf(state) {
  const progression = reserveFor(state).progression || {};
  return clamp(progression.stage || progression.displayChapter || 1, 1, MAX_STORY_CHAPTER);
}
function chapterNumberFromProgression(progression = {}) {
  return clamp(progression.stage || progression.displayChapter || 1, 1, MAX_STORY_CHAPTER);
}
function chapterCompleteFund(stage) {
  const chapter = Math.max(1, Math.round(Number(stage) || 1));
  return GOAL_BALANCE.chapterFundReward[chapter] || GOAL_BALANCE.chapterFundReward[10] || 0;
}
function genericStoryGoalVisible(state) {
  // Per-chapter theme chains now cover 1-18. The seven-day event chain still
  // advances internally for story-beat gates, but its repeating titles must
  // not replace chapter-specific player guidance.
  return false;
}
function ecologyNeedsAttention(reserve) {
  const eco = (reserve || {}).ecology || {};
  return (eco.water || 0) < ECOLOGY_THRESHOLDS.recoveryWater
    || (eco.grass || 0) < ECOLOGY_THRESHOLDS.recoveryGrass
    || Number(((reserve || {}).migration || {}).delta) < 0;
}
function dailyObjectiveKinds() {
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
  if (item.endlessContract || item.kind === "endless") return true;
  if (["crisis", "recovery", "daily"].includes(item.kind)) return true;
  if (item.rescueAligned || item.recommendedAction === "rescueAnimal") return true;
  if (item.kind === "stage" || item.kind === "collection") return true;
  if (["habitat", "intervention", "visitorAdjust", "neighborExchange", "viewVisitors", "animalCare", "chapterSpecial", "harshNature"].includes(item.recommendedAction)) return true;
  if (item.visitorFacilityGuidance) return true;
  return false;
}
function chapterSystemGuideChapter(state, goal = {}) {
  const reserve = reserveFor(state);
  const progression = reserve.progression || {};
  return Math.max(1, Math.round(Number(goal.themeChapter) || Number(goal.chapter)
    || Number(progression.stage) || Number(progression.displayChapter) || 1));
}
function chapterSystemGuideKeys(state, goal = {}) {
  if (!goal) return [];
  const chapter = chapterSystemGuideChapter(state, goal);
  const keys = [];
  const id = String(goal.id || "");
  if (goal.themeTask && id) keys.push(id.replace(/^theme:\d+:/, `theme:${chapter}:`));
  if (id) keys.push(`chapter:${chapter}:goal:${id}`);
  const actions = [];
  if (goal.recommendedAction) actions.push(goal.recommendedAction);
  if (Array.isArray(goal.validThemeActions)) actions.push(...goal.validThemeActions);
  [...new Set(actions.filter(Boolean))].forEach((action) => {
    keys.push(`chapter:${chapter}:action:${action}`);
  });
  return [...new Set(keys)];
}
function chapterSystemGuideSeen(state, goal = {}) {
  const keys = chapterSystemGuideKeys(state, goal);
  if (!keys.length) return false;
  const ui = ((state || {}).ui) || {};
  const seen = ui.chapterSystemAutoGuides || {};
  if (keys.some((key) => seen[key])) return true;
  return Array.isArray(ui.chapterSystemAutoGuideKeys) && keys.some((key) => ui.chapterSystemAutoGuideKeys.includes(key));
}
function systemGoalCanRepeat(state, goal = {}) {
  if (!goal) return false;
  if (goal.endlessContract) return true;
  if (goal.rescueAligned || goal.recommendedAction === "rescueAnimal") return true;
  const action = String(goal.recommendedAction || "");
  if (action === "buySupplies") return !!affordableSupplyId(reserveFor(state), goal.purchaseId || "");
  if (["salvage", "fundReplenish", "collectRecovered"].includes(action)) return true;
  const text = `${goal.id || ""} ${goal.kind || ""} ${goal.title || ""} ${goal.body || ""} ${goal.rewardText || ""}`;
  if (action === "viewVisitors") {
    return goal.kind === "recovery" || /^recovery:/.test(String(goal.id || ""))
      || /补充基金|基金不足|获得基金|保护基金|接通基金|补给/.test(text);
  }
  return false;
}
function shouldSuppressSeenSystemGoal(state, goal = {}) {
  if (!goal) return false;
  // Auto-guide popups are one-shot. The live theme step must stay on the
  // goal bar until its matching action actually settles; otherwise late
  // chapters keep resurrecting the same first task after the popup is seen.
  if (goal.themeTask) return false;
  if (chapterSystemRiskRetired(state, goal)) {
    if (goal.taskCategory === TASK_CATEGORIES.userTriggered) return false;
    const manualSelectedId = ((((state || {}).world || {}).goals || {}).active || {}).manualSelectedId || "";
    if (manualSelectedId && manualSelectedId === goal.id) return false;
    return true;
  }
  if (!chapterSystemGuideSeen(state, goal)) return false;
  if (goal.kind === "crisis" || goal.expiresSoon) return false;
  if (systemGoalCanRepeat(state, goal)) return false;
  if (goal.taskCategory === TASK_CATEGORIES.userTriggered) return false;
  const manualSelectedId = ((((state || {}).world || {}).goals || {}).active || {}).manualSelectedId || "";
  if (manualSelectedId && manualSelectedId === goal.id) return false;
  return !!(goal.themeTask || goal.storyAligned || goal.passGoal || goal.taskCategory === TASK_CATEGORIES.metric || goal.taskCategory === TASK_CATEGORIES.story || goal.taskCategory === TASK_CATEGORIES.animal);
}
function inventoryTotal(reserve) {
  return Object.values((reserve || {}).inventory || {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
}
function hasRecoveredStock(reserve) {
  return inventoryTotal(reserve) > 0
    || Object.values((reserve || {}).pendingRecovered || {}).some((value) => Number(value) > 0);
}
function supplyShortageIds(reserve = {}) {
  const supplies = reserve.supplies || {};
  return supplyPurchaseCatalog(reserve)
    .filter((purchase) => {
      const current = Math.max(0, Math.round(Number(supplies[purchase.id]) || 0));
      return current < supplyFillLine(purchase, reserve);
    })
    .map((purchase) => purchase.id);
}
function hasSupplyShortage(reserve = {}, preferredId = "") {
  const shortages = supplyShortageIds(reserve);
  return preferredId ? shortages.includes(preferredId) : shortages.length > 0;
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
  if (emergency && isNeighborEventType(emergency.type)) return "neighborExchange";
  if (emergency && emergency.recommendedAction) return emergency.recommendedAction;
  const risk = criticalPatrolRisk(reserve);
  return risk ? risk.action : "viewVisitors";
}
function dailyEconomyAction(state) {
  const reserve = reserveFor(state);
  const supplies = reserve.supplies || {};
  const level = Math.max(1, Math.min(7, Math.round((((reserve.progression || {}).level) || 1))));
  const health = BALANCE_V2.fundHealth[level];
  const stock = inventoryTotal(reserve);
  const chapter = Math.max(1, Math.round(Number((reserve.progression || {}).stage || (reserve.progression || {}).displayChapter || 1)));
  const lowSupply = chapter === 3
    ? !chapterThemeSupplyTaskSatisfied(reserve)
    : supplyPurchaseCatalog(reserve).some((purchase) => {
      const current = Math.max(0, Math.round(Number(supplies[purchase.id]) || 0));
      return current < supplyFillLine(purchase, reserve);
    });
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
  const liveStage = chapterNumberFromProgression(progression);
  const completedChapters = Math.min(10, Math.max(0, liveStage - 1)
    + (liveStage >= 10 && progression.chapterComplete ? 1 : 0));
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
  const chapterMatch = String(daily.chapter || "").match(/\d+/);
  const parsedChapter = Number(daily.chapterNumber) || Number((chapterMatch && chapterMatch[0]) || 0) || 1;
  const chapterNumber = clamp(parsedChapter, 1, MAX_STORY_CHAPTER);
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
  const chapter = chapterNumberOf(state);
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
    stage: { chapter: chapterNumberOf(state), objectiveIds: [] },
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
  const catalog = supplyPurchaseCatalog(reserve).filter((purchase) => {
    const current = Math.max(0, Math.round(Number(supplies[purchase.id]) || 0));
    return current < supplyFillLine(purchase, reserve);
  });
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
  if (action === "worldHoundPatrol") return Math.max(0, Number(reserve.fund) || 0) >= 100;
  if (action === "endlessAuction") {
    const auction = endlessAuctionView(reserve);
    return !!auction && auction.status === "open" && !auction.submitted && !auction.settled;
  }
  const supplies = reserve.supplies || {};
  const requirement = actionSupplyRequirement(action, reserve);
  if (requirement) return (supplies[requirement.id] || 0) > 0;
  if (action === "sharePostcard" || action === "captureScreen") return true;
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
    if (active && active.status === "located") return true;
    return !!nextFacilityUseTarget(state);
  }
  if (action === "facilityUse") {
    return !!nextFacilityUseTarget(state);
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
    executable: executable || allowBlocked,
    progress: 0,
    target: 1,
    taskCategory: inferredCategory,
    chapter: extras.chapter || extras.themeChapter || chapterNumberOf(state),
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
  const care = reserve.animalCareGrant || {};
  const careReady = Number(care.remaining || 0) > 0;
  if (careReady) {
    const careRange = comfortAnimalGainRange(chapterNumber);
    return candidate("metric:animals:comfort", "stage",
      `增加动物总数：安抚观察 +${careRange.min}—${careRange.max}`,
      `本章动物 ${snapshot.animals}/${snapshot.target.animals}，还差 ${gap} 只。安抚观察一次会增加 ${careRange.min}—${careRange.max} 只，并计入本章动物。`,
      "animalCare", Math.max(85, priority - 1), state, {
        oneStep: true,
        progress: snapshot.animals,
        target: snapshot.target.animals,
        animalCareAligned: true,
        rewardText: "安抚观察直接增加动物总数",
        taskCategory: TASK_CATEGORIES.animal,
        buttonLabel: ACTION_META.animalCare.label
      });
  }
  const patrol = nextFacilityUseTarget(state);
  if (patrol) {
    return candidate(`metric:animals:patrol:${patrol.id}`, "stage",
      `增加动物总数：使用${patrol.name || "巡护站"}`,
      `本章动物 ${snapshot.animals}/${snapshot.target.animals}，还差 ${gap} 只。使用${patrol.name || "巡护站"}完成一次短巡，动物回流会计入本章。`,
      "facilityUse", Math.max(84, priority - 2), state, {
        oneStep: true,
        progress: snapshot.animals,
        target: snapshot.target.animals,
        animalPatrolAligned: true,
        facilityId: patrol.id,
        rewardText: "巡护站短巡增加动物回流",
        taskCategory: TASK_CATEGORIES.animal,
        buttonLabel: ACTION_META.facilityUse.label
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
    preparing ? "为增加动物总数先补物资" : repairLabel,
    `本章动物 ${snapshot.animals}/${snapshot.target.animals}，还差 ${gap} 只。当前${metricFocus === "water" ? "水源" : "草场"} ${metricFocus === "water" ? water : grass}。先修复${metricFocus === "water" ? "水源" : "草场"}，改善动物回流；要直接增加动物，请继续解救、安抚观察、使用巡护站或完成本章特别任务。`,
    action, Math.max(80, priority - 1), state, {
      shortage: preparing,
      oneStep: true,
      progress: snapshot.animals,
      target: snapshot.target.animals,
      metricFocus,
      intendedAction: "habitat",
      purchaseId,
      rewardText: "恢复水草并打开动物回流入口",
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
    ? `沙盘上还没有游客。去${target.nodeShort}建设${choiceName}，建成后接待人数会出现在地图上。`
    : `沙盘游客只有 ${crowd} 人。去${target.nodeShort}建设${choiceName}，把接待从临时招募变成固定步道。`;
  const missing = target.available || !(target.missing || []).length ? "" : ` 当前${target.missing[0]}。`;
  return candidate(`metric:visitors:guest-build:${target.nodeId}`, "stage", title, body + missing, "facilityBuild", empty ? 98 : 80, state, {
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
function passPercent(current, target) {
  const tgt = Math.max(0, Math.round(Number(target) || 0));
  const cur = Math.max(0, Math.round(Number(current) || 0));
  if (!tgt) return 100;
  return Math.min(100, Math.round(cur / tgt * 100));
}
function chapterPassEventFor(state, metric) {
  const reserve = reserveFor(state);
  const chapterNumber = chapterNumberOf(state);
  const snapshot = chapterCoreLiveSnapshot(reserve, chapterNumber);
  const current = Math.max(0, Math.round(Number(snapshot[metric]) || 0));
  const target = Math.max(0, Math.round(Number((snapshot.target || {})[metric]) || 0));
  const complete = target > 0 && current >= target;
  const percent = passPercent(current, target);
  const rescue = nextPoacherRescue(reserve) || nextRescueTask(reserve, chapterNumber);
  const special = chapterSpecialStatus(reserve);
  const specialVisitors = Math.max(0, Math.round(Number((special.def.success || {}).visitors) || 0));
  const specialAnimals = Math.max(0, Math.round(Number((special.def.success || {}).animals) || 0));
  const emergency = ((reserve.emergency || {}).active) || null;
  const facility = nextVisitorFacilityTarget(state);
  const reception = visitorReceptionPreview(reserve);
  const patrol = nextFacilityUseTarget(state);
  const care = reserve.animalCareGrant || {};
  const careReady = Number(care.remaining || 0) > 0;
  const careRange = comfortAnimalGainRange(chapterNumber);
  if (metric === "species") {
    if (complete) {
      return {
        id: "pass:species:done",
        title: "解锁动物 100%",
        eventTitle: "解锁动物已完成",
        body: `种群 ${current}/${target} 种，已达 100%。`,
        recommendedAction: "viewDiscovery",
        buttonLabel: "查看发现",
        icon: "leaf"
      };
    }
    if (rescue) {
      const name = rescue.speciesName || "被困动物";
      return {
        id: `pass:species:rescue:${rescue.targetId || rescue.speciesId}`,
        title: `解锁动物：解救${name}`,
        eventTitle: `解救${name}`,
        body: `解锁动物 ${current}/${target} 种。最近可做：解救${name}，放归后计入种群；水草下降只影响数量和迁入，不会扣掉已解锁物种。`,
        recommendedAction: "rescueAnimal",
        buttonLabel: ACTION_META.rescueAnimal.label,
        icon: "paw",
        animalId: rescue.speciesId,
        targetId: rescue.targetId || rescue.speciesId,
        rescueAligned: true
      };
    }
    if (special.available) {
      return {
        id: `pass:species:special:${special.def.taskTitle}`,
        title: `解锁动物：${special.def.taskTitle}`,
        eventTitle: special.def.taskTitle,
        body: `解锁动物 ${current}/${target} 种。最近可做：${special.def.taskTitle}。`,
        recommendedAction: "chapterSpecial",
        buttonLabel: ACTION_META.chapterSpecial.label,
        icon: "paw"
      };
    }
    return {
      id: "pass:species:discover",
      title: `解锁动物 ${current}/${target}`,
      eventTitle: "打开发现频道",
      body: `解锁动物 ${current}/${target} 种。最近可做：去发现频道跟踪迹，找到还没出现的种群；水草修复本身不解锁新物种。`,
      recommendedAction: "viewDiscovery",
      buttonLabel: ACTION_META.viewDiscovery.label,
      icon: "leaf"
    };
  }
  if (metric === "visitors") {
    if (complete) {
      return {
        id: "pass:visitors:done",
        title: "游客 100%",
        eventTitle: "本章游客已满",
        body: `游客 ${current}/${target} 人，已达 100%。`,
        recommendedAction: "viewVisitors",
        buttonLabel: ACTION_META.viewVisitors.label,
        icon: "community"
      };
    }
    if (emergency && (isVisitorArcheryEvent(emergency.type) || /游客/.test(String(emergency.title || "")))) {
      return {
        id: `pass:visitors:event:${emergency.id || emergency.type}`,
        title: `游客：${emergency.title || "处理游客事件"}`,
        eventTitle: emergency.title || "处理游客事件",
        body: `游客 ${current}/${target} 人 · ${percent}%。最近可做：${emergency.title || "处理现场游客事件"}，完成后会计入本章游客。`,
        recommendedAction: isVisitorArcheryEvent(emergency.type) ? "visitorAdjust" : (emergency.recommendedAction || "realEvent"),
        buttonLabel: "处理游客事件",
        icon: "community"
      };
    }
    if (special.available && specialVisitors > 0) {
      return {
        id: `pass:visitors:special:${special.def.taskTitle}`,
        title: `游客：${special.def.taskTitle}`,
        eventTitle: special.def.taskTitle,
        body: `游客 ${current}/${target} 人 · ${percent}%。最近可做：${special.def.taskTitle}，完成后游客 +${specialVisitors}。`,
        recommendedAction: "chapterSpecial",
        buttonLabel: ACTION_META.chapterSpecial.label,
        icon: "community"
      };
    }
    if (Number(reception.remaining || 0) > 0 && Number(reception.next || 0) > 0) {
      return {
        id: "pass:visitors:reception",
        title: `游客：观景接待 +${reception.next}人`,
        eventTitle: `观景接待 +${reception.next}人`,
        body: `游客 ${current}/${target} 人 · ${percent}%。最近可做：观景接待，这次 +${reception.next} 人。`,
        recommendedAction: "visitorReception",
        buttonLabel: ACTION_META.visitorReception.label,
        icon: "community"
      };
    }
    if (facility) {
      const choiceName = facility.choice.short || facility.choice.label || "游客设施";
      return {
        id: `pass:visitors:build:${facility.nodeId}`,
        title: `游客：建设${choiceName}`,
        eventTitle: `建设${choiceName}`,
        body: `游客 ${current}/${target} 人 · ${percent}%。最近可做：去${facility.nodeShort}建设${choiceName}。`,
        recommendedAction: "facilityBuild",
        buttonLabel: "建设游客设施",
        icon: "community",
        nodeId: facility.nodeId,
        preferredChoiceId: facility.choice.id,
        visitorFacilityGuidance: true,
        developmentTask: "build"
      };
    }
    return {
      id: "pass:visitors:recruit",
      title: "游客：发布一次招募",
      eventTitle: "发布游客招募",
      body: `游客 ${current}/${target} 人 · ${percent}%。最近可做：发布游客招募，点招募加几人就加几人。`,
      recommendedAction: "viewVisitors",
      buttonLabel: ACTION_META.viewVisitors.label,
      icon: "community"
    };
  }
  if (complete) {
    return {
      id: "pass:animals:done",
      title: "动物 100%",
      eventTitle: "本章动物已满",
      body: `动物 ${current}/${target} 只，已达 100%。`,
      recommendedAction: "animalCare",
      buttonLabel: ACTION_META.animalCare.label,
      icon: "paw"
    };
  }
  if (rescue) {
    const name = rescue.speciesName || "被困动物";
    return {
      id: `pass:animals:rescue:${rescue.targetId || rescue.speciesId}`,
      title: `动物：解救${name}`,
      eventTitle: `解救${name}`,
      body: `动物 ${current}/${target} 只 · ${percent}%。最近可做：解救${name}，放归数量计入本章动物。`,
      recommendedAction: "rescueAnimal",
      buttonLabel: ACTION_META.rescueAnimal.label,
      icon: "paw",
      animalId: rescue.speciesId,
      targetId: rescue.targetId || rescue.speciesId,
      rescueAligned: true
    };
  }
  if (special.available && specialAnimals > 0) {
    return {
      id: `pass:animals:special:${special.def.taskTitle}`,
      title: `动物：${special.def.taskTitle}`,
      eventTitle: special.def.taskTitle,
      body: `动物 ${current}/${target} 只 · ${percent}%。最近可做：${special.def.taskTitle}，完成后动物 +${specialAnimals}。`,
      recommendedAction: "chapterSpecial",
      buttonLabel: ACTION_META.chapterSpecial.label,
      icon: "paw"
    };
  }
  if (careReady) {
    return {
      id: "pass:animals:comfort",
      title: `动物：安抚观察 +${careRange.min}—${careRange.max}`,
      eventTitle: `安抚观察 +${careRange.min}—${careRange.max}只`,
      body: `动物 ${current}/${target} 只 · ${percent}%。最近可做：安抚观察，这次增加 ${careRange.min}—${careRange.max} 只。`,
      recommendedAction: "animalCare",
      buttonLabel: ACTION_META.animalCare.label,
      icon: "paw"
    };
  }
  if (patrol) {
    return {
      id: `pass:animals:patrol:${patrol.id}`,
      title: `动物：使用${patrol.name || "巡护站"}`,
      eventTitle: `使用${patrol.name || "巡护站"}`,
      body: `动物 ${current}/${target} 只 · ${percent}%。最近可做：使用${patrol.name || "巡护站"}短巡，计入本章动物。`,
      recommendedAction: "facilityUse",
      buttonLabel: ACTION_META.facilityUse.label,
      icon: "paw",
      facilityId: patrol.id
    };
  }
  return {
    id: "pass:animals:comfort-wait",
    title: `动物 ${current}/${target}`,
    eventTitle: "安抚或巡护站",
    body: `动物 ${current}/${target} 只 · ${percent}%。最近可做：安抚命名动物，或等巡护站短巡恢复。`,
    recommendedAction: "animalCare",
    buttonLabel: ACTION_META.animalCare.label,
    icon: "paw"
  };
}
function chapterPassGoalList(state) {
  const reserve = reserveFor(state);
  const chapterNumber = chapterNumberOf(state);
  const snapshot = chapterCoreLiveSnapshot(reserve, chapterNumber);
  return ["species", "visitors", "animals"].map((metric) => {
    const event = chapterPassEventFor(state, metric);
    const current = Math.max(0, Math.round(Number(snapshot[metric]) || 0));
    const target = Math.max(0, Math.round(Number((snapshot.target || {})[metric]) || 0));
    const complete = target > 0 && current >= target;
    const percent = passPercent(current, target);
    const labels = { species: "解锁动物", visitors: "游客", animals: "动物" };
    const units = { species: "种", visitors: "人", animals: "只" };
    const extras = {
      passMetric: metric,
      passGoal: true,
      chapterCore: true,
      coreMetricId: metric,
      chapter: chapterNumber,
      progress: current,
      target,
      percent,
      complete,
      label: labels[metric],
      unit: units[metric],
      eventTitle: event.eventTitle,
      oneStep: true,
      allowBlocked: true,
      rescueAligned: !!event.rescueAligned,
      visitorFacilityGuidance: !!event.visitorFacilityGuidance,
      nodeId: event.nodeId,
      preferredChoiceId: event.preferredChoiceId,
      developmentTask: event.developmentTask,
      animalId: event.animalId,
      targetId: event.targetId,
      facilityId: event.facilityId,
      rewardText: complete ? `${labels[metric]}已达 100%` : `完成后增加${labels[metric]}`,
      taskCategory: metric === "visitors" ? TASK_CATEGORIES.metric : TASK_CATEGORIES.animal,
      buttonLabel: event.buttonLabel,
      icon: event.icon
    };
    const priority = complete ? 40 : metric === "animals" ? 87 : metric === "visitors" ? 86 : 85;
    return candidate(event.id, "stage", event.title, event.body, event.recommendedAction, priority, state, extras);
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
  const extras = {
    shortage: preparing,
    oneStep: true,
    rewardText: "阻止生态继续恶化",
    riskMetric: risk.id,
    riskValue: risk.value,
    purchaseId
  };
  if (action === "habitat") {
    extras.metricFocus = risk.id === "grass" ? "grass" : "water";
    extras.buttonLabel = extras.metricFocus === "grass" ? "恢复草场" : "修复饮水点";
  }
  return candidate(`ecology-risk:${risk.id}`, "recovery", preparing ? `为“${risk.title}”补齐物资` : risk.title,
    preparing ? `${risk.body} 当前缺少执行物资，先恢复补给。` : risk.body,
    action, 96, state, extras);
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
function chapterThemeSavedStep(saved = {}, chapter, taskCount) {
  let step = saved.chapter === chapter
    ? Math.max(0, Math.min(taskCount, Math.round(Number(saved.step) || 0)))
    : 0;
  // Chapter 9 used to open on "连上浅滩迁徙". That habitat step never settled,
  // so it was removed. Saves that already moved past index 0 must shift back
  // once, or "截下水貂夜行" is skipped. Version 2 means this shift already ran.
  if (chapter === 9 && saved.chapter === chapter && Math.round(Number(saved.version) || 1) < 2 && step > 0) {
    step -= 1;
  }
  // Chapter 2 gained a leaderboard step at the front. Saves already past the
  // old first task move forward one index so they do not repeat 修复水源.
  if (chapter === 2 && saved.chapter === chapter && Math.round(Number(saved.version) || 1) < 4 && step > 0) {
    step += 1;
  }
  // From chapter 8 the current-task chain only keeps share and archery.
  // Older saves can be parked on a deleted patrol or habitat step. Start
  // again at the first remaining task; already finished share tasks stay retired.
  if (chapter >= 8 && saved.chapter === chapter && Math.round(Number(saved.version) || 1) < 3) {
    step = 0;
  }
  return step;
}
function chapterThemeRecordVersion(chapter, saved = {}) {
  if (chapter >= 8) return 3;
  if (chapter === 2) return 4;
  return Math.max(1, Math.round(Number(saved.version) || 1));
}
const LATE_CHAPTER_OPERATION_ACTIONS = new Set([
  "habitat", "houndScout", "antiPoacher", "intervention", "observeReserve",
  "animalCare", "facilityUse", "facilityBuild", "visitorReception", "visitorAdjust",
  "viewVisitors", "worldHoundPatrol", "buySupplies", "collectionInvestigate", "salvage"
]);
function lateChapterAutoOperationGoal(state, item) {
  if (!item || chapterNumberOf(state) < 8) return false;
  if (item.kind === "crisis") return false;
  if (item.rescueAligned || item.recommendedAction === "rescueAnimal" || item.recommendedAction === "harshNature") return false;
  if (item.chapterSpecial || item.recommendedAction === "chapterSpecial") return false;
  const action = String(item.recommendedAction || "");
  if (["sharePostcard", "captureScreen", "realEvent", "neighborExchange"].includes(action)) return false;
  if (item.themeTask) {
    const actions = [action].concat(item.validThemeActions || []);
    return !actions.some((name) => name === "sharePostcard" || name === "captureScreen" || name === "harshNature");
  }
  return LATE_CHAPTER_OPERATION_ACTIONS.has(action);
}
function chapterThemeRetiredTaskIds(state, chapter, tasks = []) {
  const reserve = reserveFor(state);
  const saved = reserve.chapterTheme || {};
  const retired = new Set(Array.isArray(saved.completedTaskIds) ? saved.completedTaskIds.filter(Boolean) : []);
  const history = (((state || {}).world || {}).goals || {}).history || [];
  tasks.forEach((task) => {
    if (!task || !task.id) return;
    const key = `theme:${chapter}:${task.id}`;
    if (history.some((item) => item
      && (item.type === "chapter_theme" || item.type === "instant")
      && item.id === key)) retired.add(task.id);
  });
  return retired;
}
function chapterThemeSupplyTaskSatisfied(reserve = {}) {
  const supplies = reserve.supplies || {};
  // Chapter 3 should gate its replenishment task on the supplies needed by
  // the patrol loop, not every item in the warehouse. Medical kits are only
  // part of this gate when the current ecology state makes the next
  // intervention a disease-care action; otherwise the next intervention
  // consumes tranquilizer. Requiring a full medical-kit stock here caused a
  // redundant "补充物资" prompt when all active patrol supplies were healthy.
  const requiredIds = [...new Set([
    "dogFood",
    "alarm",
    "tranquilizer",
    "fieldKit",
    (actionSupplyRequirement("intervention", reserve) || {}).id
  ])];
  return requiredIds.every((id) => {
    const purchase = supplyPurchaseCatalog(reserve).find((item) => item.id === id);
    if (!purchase) return true;
    const current = Math.max(0, Math.round(Number(supplies[id]) || 0));
    return current >= supplyFillLine(purchase, reserve);
  });
}
function chapterSystemRiskRetired(state, goal = {}) {
  const action = String(goal.recommendedAction || "");
  const metric = goal.riskMetric === "water" || goal.riskMetric === "grass"
    ? goal.riskMetric
    : goal.metricFocus === "water" || goal.metricFocus === "grass"
      ? goal.metricFocus
      : "";
  if (action !== "habitat" || !metric) return false;
  const chapter = chapterSystemGuideChapter(state, goal);
  const tasks = CHAPTER_THEME_TASKS[chapter] || [];
  const retired = chapterThemeRetiredTaskIds(state, chapter, tasks);
  const matchingTheme = tasks.find((task) => task
    && task.action === "habitat"
    && task.metricFocus === metric);
  if (matchingTheme && retired.has(matchingTheme.id)) return true;

  // Critical ecology recovery and animal-shortage habitat guidance are two
  // views of the same one-shot system task. Their completion is stored as an
  // `instant` goal history item, while a chapter-theme task (when present) is
  // stored separately. Read all aliases so a later metric drop or animal
  // shortage cannot resurrect the same chapter recommendation. Player-
  // initiated actions remain available from the sandbox action menu; this
  // only filters the automatic goal candidate.
  const history = (((state || {}).world || {}).goals || {}).history || [];
  const goalIds = new Set([
    `ecology-risk:${metric}`,
    `metric:animals:habitat:${metric}`
  ]);
  return history.some((item) => item
    && goalIds.has(String(item.id || ""))
    && (item.type === "instant" || item.type === "chapter_theme")
    && Number(item.chapter) === chapter);
}
function chapterThemeView(state) {
  const reserve = reserveFor(state);
  const chapter = Math.max(1, Math.round(Number((reserve.progression || {}).stage || (reserve.progression || {}).displayChapter || 1)));
  const tasks = CHAPTER_THEME_TASKS[chapter] || [];
  if (!tasks.length) return { chapter, tasks, step: tasks.length, task: null };
  const saved = reserve.chapterTheme || (reserve.chapterTheme = {});
  const retired = chapterThemeRetiredTaskIds(state, chapter, tasks);
  let step = chapterThemeSavedStep(saved, chapter, tasks.length);
  // Migrate legacy completion history into the durable chapter-theme ledger.
  // A task being shown is not completion: the current task must remain
  // available until its matching action is actually settled. Conditional
  // supply tasks are the exception: once their required safety line is already
  // met, showing the task would ask the player to repeat a satisfied state.
  while (step < tasks.length) {
    const task = tasks[step];
    const autoSatisfied = task && task.id === "replenish-supplies"
      && chapterThemeSupplyTaskSatisfied(reserve);
    if (!retired.has(task && task.id) && !autoSatisfied) break;
    if (autoSatisfied && task && task.id) retired.add(task.id);
    step += 1;
  }
  if (saved.chapter !== chapter || step !== Number(saved.step) || retired.size
    || chapterThemeRecordVersion(chapter, saved) !== Math.round(Number(saved.version) || 1)) {
    reserve.chapterTheme = Object.assign({}, saved, {
      version: chapterThemeRecordVersion(chapter, saved),
      chapter,
      step,
      completedTaskIds: [...new Set([
        ...(saved.chapter === chapter && Array.isArray(saved.completedTaskIds) ? saved.completedTaskIds : []),
        ...retired
      ])],
      completed: step >= tasks.length
    });
  }
  return { chapter, tasks, step, task: tasks[step] || null };
}
function chapterThemeActionMatches(task, action) {
  if (!task || !action) return false;
  return (task.validActions || [task.action]).includes(action);
}
function advanceChapterTheme(reserve, action) {
  const progression = reserve.progression || {};
  const chapter = Math.max(1, Math.round(Number(progression.stage || progression.displayChapter || 1)));
  const tasks = CHAPTER_THEME_TASKS[chapter] || [];
  if (!tasks.length) return null;
  const saved = reserve.chapterTheme || {};
  const currentStep = chapterThemeSavedStep(saved, chapter, tasks.length);
  const current = tasks[currentStep];
  const next = {
    version: chapterThemeRecordVersion(chapter, saved),
    chapter,
    step: currentStep,
    lastAction: saved.chapter === chapter ? (saved.lastAction || "") : "",
    completedTaskIds: saved.chapter === chapter && Array.isArray(saved.completedTaskIds)
      ? [...new Set(saved.completedTaskIds.filter(Boolean))]
      : [],
    completed: currentStep >= tasks.length
  };
  if (!current || !chapterThemeActionMatches(current, action)) {
    reserve.chapterTheme = next;
    return next;
  }
  next.step = Math.min(tasks.length, currentStep + 1);
  next.completedTaskIds = [...new Set(next.completedTaskIds.concat(current.id))];
  next.lastAction = action;
  next.completed = next.step >= tasks.length;
  next.completedAtAction = next.completed
    ? Math.max(0, Math.round(Number(progression.totalActions) || 0))
    : Number(saved.completedAtAction) || 0;
  reserve.chapterTheme = next;
  return next;
}
function themeActionFor(state, task) {
  const reserve = reserveFor(state);
  let action = task.action;
  let metricFocus = task.metricFocus || "";
  let intendedAction = "";
  let purchaseId = "";
  if (task.id === "control-visitors") {
    const emergency = ((reserve.emergency || {}).active) || null;
    if (emergency && isVisitorArcheryEvent(emergency.type)) {
      action = "visitorAdjust";
    } else {
      const reception = visitorReceptionPreview(reserve);
      action = Number(reception.remaining || 0) > 0 && Number(reception.next || 0) > 0
        ? "visitorReception"
        : "viewVisitors";
    }
  }
  if (action === "habitat" && !actionExecutable(state, action)) {
    intendedAction = action;
    const requirement = (actionSupplyRequirement(action, reserve) || {}).id || "";
    const recovery = safeRecoveryAction(state, requirement);
    action = recovery.action;
    purchaseId = recovery.purchaseId || "";
  } else if (!actionExecutable(state, action) && task.validActions) {
    const executableAlternative = task.validActions.find((candidateAction) => actionExecutable(state, candidateAction));
    if (executableAlternative) action = executableAlternative;
  }
  if (action !== "habitat" && task.metricFocus) metricFocus = "";
  return { action, metricFocus, intendedAction, purchaseId };
}
function ledgerStoryCandidate(state) {
  const reserve = reserveFor(state);
  const chain = reserve.eventChain || {};
  if (!chain || chain.completed || chain.stageBound || chain.branch !== "ledger") return null;
  const step = Math.max(1, Math.round(Number(chain.step) || 0) + 1);
  const guidance = eventStepGuidance(reserve, step, "ledger") || {};
  const next = Object.assign({}, chain.next || {}, guidance);
  const ordered = [next.recommendedAction].concat(next.validActions || [])
    .filter((action, index, all) => action && all.indexOf(action) === index);
  if (!ordered.length) return null;
  const executable = ordered.find((action) => actionExecutable(state, action));
  const action = executable || safeRecoveryAction(state, (actionSupplyRequirement(ordered[0], reserve) || {}).id).action;
  const title = next.title || "补给线继续推进";
  const body = `${next.prompt || next.waitingText || "完成补给线的下一步，继续推进阶段记录。"}${action !== ordered[0] ? " 当前执行条件不足，先补齐物资。" : ""}`;
  return candidate(`story:ledger:${chain.step || 0}:${title}`, "stage", title, body, action, 97, state, {
    storyAligned: true,
    oneStep: true,
    storyStep: step,
    storyValidActions: next.validActions || [],
    intendedAction: action === ordered[0] ? undefined : ordered[0],
    rewardText: "推进补给线剧情"
  });
}
function chapterThemeCandidate(state) {
  const reserve = reserveFor(state);
  const progression = reserve.progression || {};
  const view = chapterThemeView(state);
  if (!view.task || progression.chapterComplete) return null;
  const task = view.task;
  const selected = themeActionFor(state, task);
  const body = `${task.body}${selected.intendedAction ? " 当前执行条件不足，先补齐物资。" : ""}`;
  const featured = chapterFeaturedSpecies(view.chapter);
  return candidate(`theme:${view.chapter}:${task.id}`, "stage", task.title, body,
    selected.action, 98, state, {
      themeTask: true,
      chapter: view.chapter,
      themeChapter: view.chapter,
      themeStep: view.step + 1,
      themeTotal: view.tasks.length,
      storyAligned: true,
      oneStep: true,
      allowBlocked: !!selected.intendedAction,
      metricFocus: selected.metricFocus || undefined,
      taskVariant: task.taskVariant || undefined,
      shareSpeciesId: task.shareSpeciesId || featured.id,
      intendedAction: selected.intendedAction || undefined,
      purchaseId: selected.purchaseId || undefined,
      buttonLabel: selected.intendedAction
        ? (ACTION_META[selected.action] || ACTION_META.houndScout).label
        : (task.buttonLabel || (ACTION_META[selected.action] || ACTION_META.houndScout).label),
      validThemeActions: task.validActions,
      facilityId: task.facilityId || undefined,
      actionHint: task.actionHint || undefined,
      resultText: task.resultText || undefined,
      rewardText: `完成第${view.chapter}章主题任务链`
    });
}
function endlessContractCandidate(state) {
  const reserve = reserveFor(state);
  if (!isEndlessGuardReady(reserve)) return null;
  const contract = endlessDailyContract(reserve);
  if (!contract) return null;
  const action = contract.action || "observeReserve";
  const validActions = Array.isArray(contract.validActions) && contract.validActions.length
    ? contract.validActions
    : [action];
  const executableAction = validActions.find((item) => actionExecutable(state, item)) || action;
  const completed = Number(contract.progress) || 0;
  return candidate(
    `endless:contract:${contract.id}`,
    "endless",
    contract.title || "每日守护合同",
    `${contract.body || "完成今天的守护合同。"} 当前 ${completed}/${contract.target || 1}。`,
    executableAction,
    96,
    state,
    {
      endlessContract: true,
      taskCategory: TASK_CATEGORIES.story,
      oneStep: true,
      allowBlocked: true,
      contractId: contract.id,
      contractAction: action,
      contractValidActions: validActions,
      buttonLabel: (ACTION_META[executableAction] || {}).label || "开始合同",
      rewardText: "赛季分数 +10 · 推进每日合同"
    }
  );
}
function worldHoundPatrolCandidate(state) {
  const reserve = reserveFor(state);
  const progression = reserve.progression || {};
  const chapter = Math.max(1, Math.round(Number(progression.stage || progression.displayChapter) || 1));
  const patrol = reserve.worldHoundPatrol || {};
  const shown = Array.isArray(patrol.hintShownChapters) && patrol.hintShownChapters.includes(chapter);
  const history = Array.isArray(patrol.history) && patrol.history.some((item) => Number(item.chapter) === chapter);
  if (shown || history || progression.chapterComplete || Number(reserve.fund) < 100) return null;
  return candidate(`world-hound-patrol:${chapter}`, "sandbox", "世界榜猎犬巡逻", "从世界榜选择一个保护区，派出猎犬巡逻。每天最多巡逻8个保护区，5分钟后查看收益。", "worldHoundPatrol", 58, state, {
    oneStep: true,
    storyAligned: true,
    worldHoundPatrol: true,
    themeChapter: chapter,
    targetScreen: "league",
    buttonLabel: "打开世界榜",
    rewardText: "完成一次世界榜猎犬巡逻"
  });
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
  const chapterNumber = Math.max(1, Math.round(Number(progression.stage || progression.displayChapter || 1)));
  const showGenericStory = genericStoryGoalVisible(state);
  const liveStory = showGenericStory ? liveEventStoryBeat(reserve) : null;
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
  // The first two chapters are driven by CHAPTER_THEME_TASKS. Once that
  // chain is complete, fall back to a measurable chapter condition instead
  // of exposing a generic event-chain title such as “追踪线：夜行投票”.
  const goal = showGenericStory
    ? (storyGoal || incomplete[0])
    : incomplete.find((item) => item.id !== "chapterStory");
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
  const storyBranch = chain.branch
    || (/补给线/.test(`${chain.branchTitle || ""}${chain.title || ""}`) ? "ledger" : "");
  const storyGuidance = eventStepGuidance(reserve, Math.min(7, (chain.step || 0) + 1), storyBranch);
  const nextStory = Object.assign({}, chain.next || {}, storyGuidance);
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
  const storyExtras = {
    progress: goal.current || 0,
    target: goal.target || 1,
    oneStep: (goal.target || 1) - (goal.current || 0) <= 1,
    rewardText: goal.id === "chapterStory" ? "推进剧情与章节晋级" : "推进章节晋级",
    storyAligned: goal.id === "chapterStory",
    evidenceAligned: false,
    storyStep: goal.id === "chapterStory" ? (chain.step || 0) + 1 : 0,
    storyValidActions: goal.id === "chapterStory" ? validStoryActions : [],
    purchaseId
  };
  if (!preparingStory && action === "habitat") {
    const ecology = reserve.ecology || {};
    const waterNow = Number(ecology.water) || 0;
    const grassNow = Number(ecology.grass) || 0;
    storyExtras.metricFocus = nextStory.metricFocus === "grass" || nextStory.metricFocus === "water"
      ? nextStory.metricFocus
      : (waterNow <= grassNow ? "water" : "grass");
    storyExtras.buttonLabel = storyExtras.metricFocus === "grass" ? "恢复草场" : "修复饮水点";
  }
  return candidate(`stage:${progression.stage || 1}:${goal.id}`, "stage", title, body, action, goal.id === "chapterStory" ? 88 : 80, state, storyExtras);
}
function resolveGoals(state, suppliedGoals = null, trigger = "refresh") {
  const goals = suppliedGoals && suppliedGoals.version === 3 ? suppliedGoals : normalizeGoalState(suppliedGoals || (((state || {}).world || {}).goals), state);
  const reserve = reserveFor(state);
  const candidates = [];
  const emergency = ((reserve.emergency || {}).active) || null;
  const chapterTheme = chapterThemeCandidate(state);
  if (emergency) {
    const neighborCrisis = isNeighborEventType(emergency.type);
    const extraRealNature = isRealNatureEventType(emergency.type)
      && ((reserve.emergency || {}).history || []).some((item) => item && isRealNatureEventType(item.type));
    const deferExtraNature = !!chapterTheme && extraRealNature;
    const intendedEmergencyAction = isVisitorArcheryEvent(emergency.type)
      ? "visitorAdjust"
      : neighborCrisis
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
      body = `危机需要“${(ACTION_META[intendedEmergencyAction] || ACTION_META.houndScout).label}”，当前缺${requirement.label}。先补给，随后继续处置。`;
    }
    candidates.push(candidate(`crisis:${emergency.id || emergency.type}`, "crisis", emergency.title || "危机需要立即处理", body, emergencyAction, deferExtraNature ? 70 : 100, state, {
      allowBlocked: false,
      forcePrimary: !deferExtraNature,
      expiresSoon: (emergency.daysRemaining || 1) <= 2,
      rewardText: "恢复游客与基金收入",
      purchaseId,
      intendedAction: intendedEmergencyAction,
      allowBlocked: true,
      ...(neighborCrisis ? { buttonLabel: emergency.recommendLabel || "处理邻区事件" } : {})
    }));
  }
  const ecologyRisk = criticalEcologyCandidate(state);
  if (ecologyRisk) candidates.push(ecologyRisk);
  const chapterSpecial = chapterSpecialCandidate(state);
  if (chapterSpecial) candidates.push(chapterSpecial);
  const ledgerStory = chapterTheme ? null : ledgerStoryCandidate(state);
  if (ledgerStory) candidates.push(ledgerStory);
  if (chapterTheme) candidates.push(chapterTheme);
  const endlessContract = endlessContractCandidate(state);
  if (endlessContract) candidates.push(endlessContract);
  const worldHoundPatrol = worldHoundPatrolCandidate(state);
  if (worldHoundPatrol) candidates.push(worldHoundPatrol);
  const activeDiscoveryForSupply = ((((state || {}).world || {}).collection || {}).discovery || {}).active || null;
  const progressionForSupply = reserve.progression || {};
  const storyGoalPending = !!activeDiscoveryForSupply || (genericStoryGoalVisible(state) && (
    (progressionForSupply.objectives || []).some((item) =>
      item && ["chapterStory", "storyEvidence"].includes(item.id) && !item.complete
    ) || !!liveEventStoryBeat(reserve)
  ));
  const desiredPatrolActions = [
    emergency && emergency.recommendedAction,
    activeDiscoveryForSupply && activeDiscoveryForSupply.actionId,
    dailyGuardAction(state)
  ].filter((action) => ["houndScout", "antiPoacher", "habitat", "intervention"].includes(action));
  const missingPatrolAction = desiredPatrolActions
    .map((action) => ({ action, requirement: actionSupplyRequirement(action, reserve) }))
    .find((item) => item.requirement && !actionExecutable(state, item.action));
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
  chapterPassGoalList(state).forEach((item) => {
    if (item.complete) return;
    candidates.push(storyGoalPending
      ? Object.assign({}, item, { forcePrimary: false, priorityScore: Math.min(Number(item.priorityScore) || 0, 74) })
      : item);
  });
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
  const core = candidates.filter(isCoreReserveGoal);
  if (core.length) {
    candidates.length = 0;
    core.forEach((item) => candidates.push(item));
  }
  let valid = candidates
    .filter((item) => item.executable && TASK_CATEGORY_SET.has(item.taskCategory))
    .filter((item) => !shouldSuppressSeenSystemGoal(state, item))
    .filter((item) => !lateChapterAutoOperationGoal(state, item));
  const stalePrimary = goals.noProgressActions >= GOAL_BALANCE.rerouteAfterNoProgress
    ? ((goals.active || {}).primary || null)
    : null;
  if (stalePrimary && !["crisis", "recovery"].includes(stalePrimary.kind) && !stalePrimary.themeTask) {
    valid = valid.map((item) => item.id === stalePrimary.id
      ? Object.assign({}, item, { priorityScore: item.priorityScore - 35, rerouted: true })
      : item);
  }
  valid.sort((a, b) => b.priorityScore - a.priorityScore || a.id.localeCompare(b.id));
  // Preserve the unfinished main thread across a date rollover. Offline
  // settlement can legitimately change side metrics, but it should not make
  // the same chapter feel like it selected a new problem while the previous
  // goal is still present and executable.
  const previousPrimary = (goals.active || {}).primary || null;
  const currentChapter = chapterNumberOf(state);
  const previousChapter = previousPrimary
    ? Math.max(1, Math.round(Number(previousPrimary.themeChapter || previousPrimary.chapter || currentChapter)))
    : 0;
  const hasForcedPrimary = valid.some((item) => item && item.forcePrimary);
  if (previousPrimary
    && !emergency
    && !hasForcedPrimary
    && !["crisis", "recovery"].includes(previousPrimary.kind)
    && previousPrimary.kind !== "animal"
    && !previousPrimary.rescueAligned
    && previousPrimary.recommendedAction !== "rescueAnimal"
    && !String(previousPrimary.id || "").startsWith("pass:")
    && !String(previousPrimary.id || "").includes(":chapterStory")
    && previousChapter === currentChapter) {
    const retainedIndex = valid.findIndex((item) => item.id === previousPrimary.id);
    if (retainedIndex > 0) valid.unshift(valid.splice(retainedIndex, 1)[0]);
  }
  const deduped = [];
  const actionIds = new Set();
  valid.forEach((item) => {
    if (deduped.length >= GOAL_BALANCE.maxVisibleGoals) return;
    if (actionIds.has(item.recommendedAction) && item.kind !== "crisis") return;
    actionIds.add(item.recommendedAction);
    deduped.push(item);
  });
  if (!deduped.length && valid[0]) deduped.push(valid[0]);
  if (deduped.some((item) => item && item.themeTask)) {
    deduped.splice(2);
  }
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
      chapter: chapterNumberFromProgression(reserve.progression),
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
    const labels = { dogFood: "狗粮", alarm: "警报器", tranquilizer: "阻滞弹", fieldKit: "野外工具包", medicalKit: "医疗包" };
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
  // Actual operation settlement may use `derivedOnly` to avoid issuing the
  // same instant/daily reward twice. Chapter-theme progress is a separate
  // state transition and must still advance for that real action.
  if ((!derivedOnly || context.advanceChapterTheme) && action) {
    const previousTheme = beforeReserve.chapterTheme || {};
    const previousChapter = Math.max(1, Math.round(Number(previousTheme.chapter || (beforeReserve.progression || {}).stage || 1)));
    const previousStep = chapterThemeSavedStep(
      previousTheme,
      previousChapter,
      (CHAPTER_THEME_TASKS[previousChapter] || []).length
    );
    const nextTheme = advanceChapterTheme(reserve, action);
    const themeTasks = CHAPTER_THEME_TASKS[previousChapter] || [];
    if (nextTheme && nextTheme.chapter === previousChapter && nextTheme.step > previousStep) {
      const completedTheme = themeTasks[nextTheme.step - 1];
      if (completedTheme) {
        completions.push({
          type: "chapter_theme",
          id: `theme:${previousChapter}:${completedTheme.id}`,
          title: completedTheme.title,
          resultText: completedTheme.resultText || ""
        });
      }
    }
  }
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
        // Theme tasks also emit a chapter_theme completion below. Keep the
        // reward, but emit one presentation item so the same chapter action
        // cannot show two identical completion cards.
        if (!priorPrimary.themeTask && !/^theme:\d+:/.test(String(priorPrimary.id || ""))) {
          completions.unshift({ type: "instant", id: priorPrimary.id, title: priorPrimary.title });
        }
      }
    }
  }
  const beforeMilestones = progressionMilestones(beforeState).reduce((map, item) => { map[item.id] = item; return map; }, {});
  progressionMilestones(afterState).forEach((item) => {
    if (item.complete && !(beforeMilestones[item.id] && beforeMilestones[item.id].complete)) {
      const chapter = chapterNumberFromProgression(beforeReserve.progression || reserve.progression);
      const key = `stage:${chapter}:milestone:${item.id}`;
      if (claimFund(goals, reserve, key, GOAL_BALANCE.milestoneFundReward[level], item.label, "stage_milestone", rewards)) {
        completions.push({ type: "stage_milestone", id: key, title: `${item.label}里程碑完成` });
      }
    }
  });
  const beforeStage = chapterNumberFromProgression(beforeReserve.progression);
  const afterStage = chapterNumberFromProgression(reserve.progression);
  const beforeComplete = !!((beforeReserve.progression || {}).chapterComplete);
  const afterComplete = !!((reserve.progression || {}).chapterComplete);
  const finalJustCompleted = beforeStage === MAX_STORY_CHAPTER && !beforeComplete && afterComplete;
  if (afterStage > beforeStage || finalJustCompleted) {
    const completedStage = finalJustCompleted ? MAX_STORY_CHAPTER : beforeStage;
    const key = `stage:${completedStage}:complete`;
    if (claimFund(goals, reserve, key, chapterCompleteFund(completedStage), `第${completedStage}章完成`, "stage_complete", rewards)) {
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
    action,
    chapter: Math.max(1, Math.round(Number((reserve.progression || {}).stage || (reserve.progression || {}).displayChapter) || 1))
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
  systemGoalCanRepeat,
  CHAPTER_THEME_TASKS,
  goalDateKey,
  createGoalState,
  normalizeGoalState,
  resolveGoals,
  applyGoalProgress,
  buildGoalView,
  selectActiveGoal,
  actionMatchesObjective,
  actionExecutable,
  nextVisitorFacilityTarget,
  chapterPassGoalList,
  longTrackDefinitions,
  dailyObjectiveKinds,
  dailyNeedCount,
  dailyBatchComplete,
  SANDBOX_VISITOR_SPARSE_LIMIT,
  chapterThemeView,
  lateChapterAutoOperationGoal
};
