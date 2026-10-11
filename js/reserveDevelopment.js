const { visitorStoryLetter } = require("./speciesStoryLetters");
const { normalizeVisitorRecruitment, normalizeVisitorFlowLedger, visitorWaterUseForCount } = require("./visitorRecruitment");
const { applyChapterVisitorDelta, applyChapterVisitorDailyAttrition, normalizeChapterVisitorRecord, chapterTargets } = require("./chapterTargets");
const { recordFundChange } = require("./fundLedger");
const { recordEcologyFlow } = require("./ledgerConsistency");
const { eventBusinessFactors, visitorEngagement } = require("./eventEconomy");
const { PACE_ECONOMY } = require("./balanceConfig");
const { upgradeProgressionGate, BUILDING_MAX_LEVEL, TOURISM_SCORE_CAP } = require("./progressionGates");
const { facilityVisitorImpact, applyFacilityDailyEffects, normalizeFacilityConstruction, facilityById, FACILITY_USE_PROFILES, FACILITY_USE_LIMIT } = require("./reserveFacilities");
const BUILDING_FACILITY_PAIRS = Object.freeze({
  river_shallows: Object.freeze({ facilityId: "hydrology_station", buildingName: "浅滩", facilityName: "水文站" }),
  meadow_edge: Object.freeze({ facilityId: "migration_watch", buildingName: "草场", facilityName: "观测站" }),
  border_pass: Object.freeze({ facilityId: "old_patrol_post", buildingName: "边界", facilityName: "巡护站" }),
  forest_watch: Object.freeze({ facilityId: "evidence_room", buildingName: "高地", facilityName: "线索室" })
});
const BUILDING_PAIR_LEVEL_CAPS = Object.freeze({ missing: 3, built: 6, specialized: 9 });
const { rareAnimalVisitorMultiplier, rareAnimalRetentionBonus } = require("./rareAnimalSystem");
const BUILDING_OPERATION_UNLOCK_COST = 1000;
const BUILDING_AD_OPERATION_GRANT = 3;
const FACILITY_RETENTION_CAP = 0.12;
const BUILDING_COMBINED_INCOME_CAP = Object.freeze({ base: 100, perVisitor: 3, perChapter: 20, max: 1800 });
const DEVELOPMENT_ROUTE_POLICIES = Object.freeze({
  animal: Object.freeze({
    label: "动物与生态",
    primaryAxis: "动物留存与栖息",
    effectScale: Object.freeze({ visitors: .55, disturbance: .60, animal: 2.00, visitor: .45 }),
    capacityScale: .65,
    incomeMultiplier: .82,
    maintenanceMultiplier: .20,
    defaultUpkeep: 2,
    storyVisitorMultiplier: .40,
    storyIncomeMultiplier: .62,
    capitalEquivalent: 180,
    paybackTargetDays: 14
  }),
  visitor: Object.freeze({
    label: "游客体验",
    primaryAxis: "游客接待与体验",
    effectScale: Object.freeze({ visitors: 1.55, disturbance: 1.30, animal: .45, visitor: 1.70 }),
    capacityScale: 1.15,
    incomeMultiplier: 1.05,
    maintenanceMultiplier: 1.10,
    defaultUpkeep: 42,
    storyVisitorMultiplier: .62,
    storyIncomeMultiplier: .92,
    capitalEquivalent: 360,
    paybackTargetDays: 10
  }),
  economy: Object.freeze({
    label: "经营与共管",
    primaryAxis: "基金回收与稳定",
    effectScale: Object.freeze({ visitors: 1.15, disturbance: 1.08, animal: 1.15, visitor: 1.25 }),
    capacityScale: 1.15,
    incomeMultiplier: 1,
    maintenanceMultiplier: .90,
    defaultUpkeep: 30,
    storyVisitorMultiplier: .75,
    storyIncomeMultiplier: 1.02,
    capitalEquivalent: 300,
    paybackTargetDays: 12
  })
});
const TOURISM_TITLES = Object.freeze(["初探之地", "巡护看点", "自然驿站", "热门保护地", "口碑目的地", "区域名片", "明星保护区", "旅行圣地", "顶级圣地", "传奇圣地"]);
const TOURISM_THRESHOLDS = Object.freeze([0, 12, 18, 23, 28, 32, 35, 38, 40, 43]);
function tourismProgression(score = 0, context = {}) {
  const value = Math.max(0, Number(score) || 0);
  let stars = 1;
  for (let index = 1; index < TOURISM_THRESHOLDS.length; index += 1) {
    if (value >= TOURISM_THRESHOLDS[index]) stars = index + 1;
    else break;
  }
  const maxLevel = stars === TOURISM_TITLES.length;
  const currentScore = TOURISM_THRESHOLDS[stars - 1];
  const nextScore = maxLevel ? null : TOURISM_THRESHOLDS[stars];
  const progress = maxLevel ? 100 : Math.min(99, Math.max(0, Math.floor((value - currentScore) / (nextScore - currentScore) * 100)));
  const previousScore = Number.isFinite(Number(context.previousScore)) ? Number(context.previousScore) : value;
  const delta = Number.isFinite(Number(context.delta)) ? Number(context.delta) : value - previousScore;
  const reasons = [];
  if (Number(context.activity) < 60) reasons.push("游客活跃度不足");
  if (Number(context.retention) < 60) reasons.push("游客留存偏低");
  if (Number(context.environment) < 55) reasons.push("生态环境需要改善");
  if (Number(context.risk) === 1 || /warning|critical/i.test(String(context.risk || ""))) reasons.push("现场风险正在压低体验");
  if (!reasons.length) reasons.push("活跃度、留存和生态状态保持稳定");
  const nextSteps = maxLevel ? ["已达最高星级，继续保持游客体验与生态平衡"] : [`将旅游评分提升至${nextScore}分`, "提升游客活跃度与留存", "处理水源、草场、疾病和安全风险"];
  return { stars, title: TOURISM_TITLES[stars - 1], score: value, progress, maxLevel,
    nextScore, nextTitle: maxLevel ? "已达最高星级" : TOURISM_TITLES[stars],
    path: TOURISM_TITLES.map((title, index) => ({ stars: index + 1, title, score: TOURISM_THRESHOLDS[index], current: index + 1 === stars, reached: index + 1 <= stars })),
    previousScore, delta, promotionReasons: ["达到下一星级评分门槛", "保持游客活跃度、留存和生态状态"], downgradeReasons: reasons,
    nextSteps };
}
const RESERVE_DEVELOPMENT_NODES = Object.freeze([
  Object.freeze({ id: "river_shallows", name: "河岸浅滩", short: "浅滩", icon: "water", regionId: "river", x: .70, y: .47, needTitle: "晨角与幼鹿尚未形成固定饮水线", animalName: "晨角", species: Object.freeze(["鹿", "羚羊", "斑马"]), availableLine: "岸边的人声还没有固定下来。" }),
  Object.freeze({ id: "meadow_edge", name: "南部草场", short: "草场", icon: "leaf", regionId: "grassland", x: .38, y: .74, needTitle: "雨路切开了幼兽与主草场", animalName: "跳星", species: Object.freeze(["鹿", "羚羊", "斑马", "野兔"]), availableLine: "草味在路的两边，不知道该往哪边走。" }),
  Object.freeze({ id: "border_pass", name: "北侧边界", short: "边界", icon: "signal", regionId: "forest", x: .20, y: .31, needTitle: "旧兽道与巡护线在边界相撞", animalName: "沉牙", species: Object.freeze(["狼", "乌鸦", "熊"]), availableLine: "旧路还开着，陌生气味也会沿它进来。" }),
  Object.freeze({ id: "forest_watch", name: "林间高地", short: "高地", icon: "eye", regionId: "forest", x: .76, y: .25, needTitle: "密林遮住了受伤动物与火险迹象", animalName: "黑铃", species: Object.freeze(["乌鸦", "野兔", "熊", "鹿"]), availableLine: "树冠下面发生的事，很久以后才会被人看见。" })
]);
const DEVELOPMENT_BUILDING_PROFILES = Object.freeze({
  river_shallows: Object.freeze({ title: "浅滩水域", storyTitle: "水线运营", storyTask: "校准今日饮水时段", operation: "调节水线", operationType: "hydrology", storyReward: "游客更愿意在固定观景点停留", capacityPerLevel: 3, incomePerVisitor: 3, maintenancePerLevel: 18, upgradeCosts: Object.freeze([0, 220, 360, 580, 900, 1360, 1960, 2680, 3480, 3960]), storyCooldown: 2 }),
  meadow_edge: Object.freeze({ title: "草场区域", storyTitle: "草场运营", storyTask: "排定一次低扰讲解时段", operation: "安排讲解", operationType: "interpretation", storyReward: "游客停留时间增加，草场路线更清晰", capacityPerLevel: 3, incomePerVisitor: 3, maintenancePerLevel: 16, upgradeCosts: Object.freeze([0, 200, 340, 550, 850, 1280, 1860, 2540, 3300, 3740]), storyCooldown: 2 }),
  border_pass: Object.freeze({ title: "边界通行", storyTitle: "边界运营", storyTask: "签发今日低光通行批次", operation: "签发通行", operationType: "access", storyReward: "游客能更早看到安全提示，减少误入", capacityPerLevel: 2, incomePerVisitor: 4, maintenancePerLevel: 20, upgradeCosts: Object.freeze([0, 240, 380, 610, 950, 1440, 2080, 2840, 3680, 4180]), storyCooldown: 3 }),
  forest_watch: Object.freeze({ title: "高地观测", storyTitle: "高地运营", storyTask: "发布一段静音观测时段", operation: "发布静音时段", operationType: "broadcast", storyReward: "形成独家观察内容，提升游客贡献", capacityPerLevel: 3, incomePerVisitor: 4, maintenancePerLevel: 22, upgradeCosts: Object.freeze([0, 260, 400, 640, 1000, 1520, 2200, 3000, 3880, 4400]), storyCooldown: 3 })
});
const DEVELOPMENT_BUILDING_STORIES = Object.freeze({
  river_shallows: Object.freeze({ intro: "晨角带着幼鹿靠近浅滩，水线需要一个安静的入口。", action: "调节闸口时段，放置低扰提示，让饮水与观景错开。" }),
  meadow_edge: Object.freeze({ intro: "雨后的草场留下两条新路，向导需要把游客引到外缘。", action: "安排讲解时段，把游客引到外缘，让幼兽保留连续草线。" }),
  border_pass: Object.freeze({ intro: "旧兽道传来陌生车声，边界通行需要一份清晰的时段记录。", action: "签发低光通行批次，给游客可见的边界提示，不进入动物通道。" }),
  forest_watch: Object.freeze({ intro: "高地风声变了，观测台捕捉到新的活动迹象。", action: "发布静音观测时段，把独家观察内容转成低扰游线。" })
});
const RIVER_SHALLOWS_NODE = RESERVE_DEVELOPMENT_NODES[0];
const freezeChoices = (items) => Object.freeze(items.map((item) => Object.freeze(item)));
const CHOICE_IMPACT_SCALE = Object.freeze(Object.keys(DEVELOPMENT_ROUTE_POLICIES).reduce((result, route) => {
  result[route] = DEVELOPMENT_ROUTE_POLICIES[route].effectScale;
  return result;
}, {}));
const ANIMAL_EFFECT_KEYS = Object.freeze(["water", "grass", "ecologyScore", "stability", "safety", "disease", "poacherPressure"]);
const VISITOR_EFFECT_KEYS = Object.freeze(["business", "reputation"]);
function scaleEffectValue(key, value, scale) {
  const amount = Number(value) || 0;
  if (!amount || key === "fund") return amount;
  const factor = ANIMAL_EFFECT_KEYS.includes(key) ? scale.animal : VISITOR_EFFECT_KEYS.includes(key) ? scale.visitor : 1;
  return amount > 0 ? Math.max(1, Math.round(amount * factor)) : Math.min(-1, Math.round(amount * factor));
}
function scaleChoiceEffects(effects, scale) {
  const next = {};
  Object.keys(effects || {}).forEach((key) => { next[key] = scaleEffectValue(key, effects[key], scale); });
  return next;
}
function formatChoiceImpactLabel(effects = {}) {
  const names = {
    water: "水源", grass: "草场", ecologyScore: "生态", stability: "稳定", safety: "安全",
    disease: "疾病", poacherPressure: "偷猎压力", business: "经营", reputation: "声誉"
  };
  return Object.keys(names).map((key) => {
    const delta = Number(effects[key]) || 0;
    if (!delta) return "";
    return `${names[key]} ${delta > 0 ? "+" : ""}${delta}`;
  }).filter(Boolean).join(" · ");
}
function effectiveDevelopmentChoice(choice, nodeId = "") {
  if (!choice || choice.kind !== "building") return choice;
  if (choice.__effectiveDevelopmentChoice) return choice;
  const policy = DEVELOPMENT_ROUTE_POLICIES[choice.routeKey] || DEVELOPMENT_ROUTE_POLICIES.economy;
  const scale = CHOICE_IMPACT_SCALE[choice.routeKey] || CHOICE_IMPACT_SCALE.economy;
  const immediate = scaleChoiceEffects(choice.immediate, scale);
  const completed = scaleChoiceEffects(choice.completed, scale);
  const combined = {};
  [immediate, completed].forEach((group) => {
    Object.keys(group).forEach((key) => {
      if (key === "fund") return;
      combined[key] = (combined[key] || 0) + (Number(group[key]) || 0);
    });
  });
  const baseUpkeep = Number(choice.upkeep) > 0 ? Number(choice.upkeep) : policy.defaultUpkeep;
  const upkeep = Math.max(1, Math.round(baseUpkeep * policy.maintenanceMultiplier));
  const profile = buildingProfileById(nodeId);
  const firstLevelMaintenance = profile ? Math.round(profile.maintenancePerLevel * policy.maintenanceMultiplier) : 0;
  const fullDailyMaintenance = upkeep + firstLevelMaintenance;
  const baseCostLabel = String(choice.costLabel || "").replace(/\s*[·,，]\s*(?:日)?维护\s*\d+(?:\/日)?/g, "").trim();
  return Object.assign({}, choice, {
    immediate,
    completed,
    visitorBase: Math.max(0, Math.round((choice.visitorBase || 0) * scale.visitors)),
    disturbanceBase: Math.max(1, Math.round((choice.disturbanceBase || 0) * scale.disturbance)),
    incomePerVisitor: Math.max(1, Math.round((choice.incomePerVisitor || 1) * policy.incomeMultiplier)),
    upkeep,
    fullDailyMaintenance,
    costLabel: `${baseCostLabel}${baseCostLabel ? " · " : ""}日维护${fullDailyMaintenance}/日`,
    routeLabel: policy.label,
    primaryAxis: policy.primaryAxis,
    capitalEquivalent: Math.max(1, Number(choice.cost && choice.cost.fund) || policy.capitalEquivalent),
    paybackTargetDays: policy.paybackTargetDays,
    __effectiveDevelopmentChoice: true,
    immediateLabel: formatChoiceImpactLabel(combined) || choice.immediateLabel
  });
}
function upgradeImpactEffects(choice, level) {
  const rank = Math.max(1, Number(level) || 1);
  if (!choice || choice.kind !== "building") return {};
  if (choice.routeKey === "visitor") return { business: 2 + rank, reputation: 2 + Math.floor(rank / 2), water: -rank, grass: -rank };
  if (choice.routeKey === "animal") return { water: 2 + rank, grass: 2 + rank, ecologyScore: 3 + rank, stability: 1 + Math.ceil(rank / 2), business: -1 - Math.floor(rank / 2) };
  return { business: 1 + rank, stability: 1 + rank, water: 1, grass: 1, reputation: 1 };
}
function buildingRouteCapacityScale(choice) {
  if (!choice || choice.kind !== "building") return 1;
  return (DEVELOPMENT_ROUTE_POLICIES[choice.routeKey] || DEVELOPMENT_ROUTE_POLICIES.economy).capacityScale;
}
const RESERVE_DEVELOPMENT_CHOICES = Object.freeze({
  river_shallows: freezeChoices([
    { id: "reed_refuge", label: "恢复芦苇庇护区", short: "芦苇庇护区", stance: "动物友好", routeKey: "animal", kind: "building", icon: "leaf", visual: "refuge", cost: { materials: { reed_cord: 1, pinecone_humidity: 1 } }, costLabel: "芦苇纤维束×1 · 松果湿度标×1", brief: "幼体更安全 · 游客更少", summary: "扩大芦苇带，为幼鹿提供遮挡和低干扰的饮水空间。", immediateLabel: "水源 +3 · 生态 +3 · 稳定 +1", lasting: "幼体更愿意靠近，但可接待游客会减少。", immediate: { water: 1, business: -1 }, completed: { water: 2, ecologyScore: 3, stability: 1 }, visitorBase: 2, incomePerVisitor: 3, disturbanceBase: 8, touristLine: "这里应该轻声一点。", animalLine: "芦苇挡住了岸上的脚步。" },
    { id: "visitor_boardwalk", label: "修建高架观察步道", short: "高架观察步道", stance: "游客友好", routeKey: "visitor", kind: "building", icon: "eye", visual: "boardwalk", cost: { fund: 360 }, upkeep: 46, costLabel: "保护基金×360 · 日维护46", brief: "游客更多 · 惊扰上升", summary: "把游客抬离兽道，用固定步道管理观赏距离。", immediateLabel: "经营 +4 · 声誉 +2 · 水源 +1", lasting: "游客容量明显提高，但傍晚惊扰会增加。", immediate: { business: 2, reputation: 1, fund: -160 }, completed: { business: 2, reputation: 1, water: 1 }, visitorBase: 9, incomePerVisitor: 7, disturbanceBase: 28, touristLine: "站在木台上，也能看见它们。", animalLine: "木板安静时，我会靠近。" },
    { id: "community_waterpoint", label: "设立社区共管水点", short: "社区共管水点", stance: "经营友好", routeKey: "economy", kind: "building", icon: "fund", visual: "station", cost: { fund: 280 }, upkeep: 34, costLabel: "保护基金×280 · 日维护34", brief: "收入稳定 · 路线重叠", summary: "由向导和社区维护水点，以边界线分隔人兽活动。", immediateLabel: "经营 +4 · 水源 +2 · 稳定 +2", lasting: "收入更稳定，但人和动物会共享部分路线。", immediate: { fund: -110, business: 2, water: 1 }, completed: { business: 2, stability: 2, water: 1 }, visitorBase: 7, incomePerVisitor: 6, disturbanceBase: 22, touristLine: "向导说，这条线不能越过。", animalLine: "人停在线外，水边还有退路。" },
    { id: "night_water_patrol", label: "夜间运水并巡护", short: "临时运水巡护", stance: "不建设", routeKey: "animal", kind: "temporary", icon: "houndScout", visual: "patrol", cost: { supplies: { fieldKit: 1 } }, costLabel: "野外工具包×1", immediate: { water: 3, safety: 1 }, completed: {}, visitorBase: 3, incomePerVisitor: 3, disturbanceBase: 12, touristLine: "巡护员让我们在天黑前离开。", animalLine: "水桶的气味只留了一夜。" }
  ]),
  meadow_edge: freezeChoices([
    { id: "native_grass_refuge", label: "恢复本土草种带", short: "本土草种带", stance: "动物友好", routeKey: "animal", kind: "building", icon: "leaf", visual: "refuge", cost: { materials: { reed_cord: 1, seedpod_alarm: 1 } }, costLabel: "芦苇纤维束×1 · 荚果警报器×1", brief: "幼兽通行 · 游线缩短", summary: "封闭一段泥路，补种本土草并为幼兽留出连续遮蔽。", immediateLabel: "草场 +4 · 安全 +1", lasting: "幼兽更容易穿过草场，但游客可走的路线变短。", immediate: { grass: 2, safety: 1 }, completed: { grass: 2, ecologyScore: 3, stability: 1 }, visitorBase: 3, incomePerVisitor: 4, disturbanceBase: 10, touristLine: "那条小路留给幼兽了。", animalLine: "草终于从这边连到了那边。" },
    { id: "meadow_story_trail", label: "铺设低扰故事步道", short: "草场故事步道", stance: "游客友好", routeKey: "visitor", kind: "building", icon: "eye", visual: "boardwalk", cost: { fund: 340 }, upkeep: 44, costLabel: "保护基金×340 · 日维护44", brief: "体验更好 · 维护更高", summary: "把游客引到草场外缘，用沿途故事代替近距离追逐。", immediateLabel: "经营 +3 · 声誉 +2", lasting: "游客停留更久，雨季需要持续维护路面。", immediate: { fund: -145, business: 2, reputation: 1 }, completed: { business: 1, reputation: 1, grass: 1 }, visitorBase: 10, incomePerVisitor: 6, disturbanceBase: 26, touristLine: "原来这片草里住着不同的家庭。", animalLine: "人的脚步绕到了风的下游。" },
    { id: "community_seed_field", label: "共建社区种源圃", short: "社区种源圃", stance: "经营友好", routeKey: "economy", kind: "building", icon: "fund", visual: "station", cost: { fund: 260 }, upkeep: 32, costLabel: "保护基金×260 · 日维护32", brief: "持续收入 · 旱季争水", summary: "和社区保存本土种源，以参访和种苗收入反哺草场。", immediateLabel: "经营 +3 · 草场 +2", lasting: "收入较稳定，但旱季必须重新协调用水。", immediate: { fund: -105, business: 2, grass: 1 }, completed: { business: 1, stability: 2, grass: 1 }, visitorBase: 7, incomePerVisitor: 7, disturbanceBase: 21, touristLine: "我带走的是故事，不是这里的种子。", animalLine: "围绳外的嫩草仍然属于我们。" },
    { id: "meadow_field_patrol", label: "临时疏导草场", short: "临时草场疏导", stance: "不建设", routeKey: "animal", kind: "temporary", icon: "houndScout", visual: "patrol", cost: { supplies: { fieldKit: 1 } }, costLabel: "野外工具包×1", immediate: { grass: 2, safety: 1 }, completed: {}, visitorBase: 2, incomePerVisitor: 3, disturbanceBase: 9, touristLine: "今天的草场暂时不开放。", animalLine: "巡护员移开了挡路的枝条。" }
  ]),
  border_pass: freezeChoices([
    { id: "open_migration_gate", label: "重开低扰迁徙口", short: "低扰迁徙口", stance: "动物友好", routeKey: "animal", kind: "building", icon: "trail", visual: "gate", cost: { materials: { track_cast: 1, feather_wind_tag: 1 } }, costLabel: "兽道泥印板×1 · 落羽风向签×1", brief: "迁徙顺畅 · 巡护更累", summary: "保留旧兽道的转向空间，用无声标记分开巡护与动物路线。", immediateLabel: "偷猎压力 -4 · 安全 +1", lasting: "迁徙队列更完整，但边界巡护面积会扩大。", immediate: { poacherPressure: -2, safety: 1 }, completed: { poacherPressure: -2, ecologyScore: 3, stability: 1 }, visitorBase: 2, incomePerVisitor: 4, disturbanceBase: 8, touristLine: "这道门不是为人开的。", animalLine: "旧路重新闻得到风了。" },
    { id: "guided_border_hide", label: "设置边界观察隐棚", short: "边界观察隐棚", stance: "游客友好", routeKey: "visitor", kind: "building", icon: "eye", visual: "hide", cost: { fund: 350 }, upkeep: 48, costLabel: "保护基金×350 · 日维护48", brief: "夜观开放 · 灯光风险", summary: "只允许向导带队进入隐棚，从固定视窗观察夜间通行。", immediateLabel: "经营 +2 · 声誉 +3", lasting: "夜观形成特色，但灯光管理失败会暴露兽道。", immediate: { fund: -155, business: 2, reputation: 1 }, completed: { reputation: 2, safety: 1 }, visitorBase: 8, incomePerVisitor: 8, disturbanceBase: 29, touristLine: "关灯以后，才看见它们从边界经过。", animalLine: "黑暗里那块木墙没有追上来。" },
    { id: "shared_patrol_post", label: "建立社区联防站", short: "社区联防站", stance: "经营友好", routeKey: "economy", kind: "building", icon: "signal", visual: "station", cost: { fund: 300 }, upkeep: 36, costLabel: "保护基金×300 · 日维护36", brief: "边界更稳 · 线索共享", summary: "让社区向导轮值，把异常足迹和车辆信息交给巡护队。", immediateLabel: "偷猎压力 -3 · 稳定 +3", lasting: "边界成本下降，但保护区需持续回应社区诉求。", immediate: { fund: -120, poacherPressure: -2, stability: 1 }, completed: { poacherPressure: -1, stability: 2, business: 1 }, visitorBase: 5, incomePerVisitor: 7, disturbanceBase: 18, touristLine: "值守的人记得每一条旧路。", animalLine: "陌生车声比以前更早停下。" },
    { id: "border_night_watch", label: "临时夜巡边界", short: "临时边界夜巡", stance: "不建设", routeKey: "animal", kind: "temporary", icon: "houndScout", visual: "patrol", cost: { supplies: { alarm: 1 } }, costLabel: "警报器×1", immediate: { poacherPressure: -2, safety: 2 }, completed: {}, visitorBase: 1, incomePerVisitor: 2, disturbanceBase: 8, touristLine: "夜巡开始后，入口提前关闭。", animalLine: "灯光走过一次，又回到了远处。" }
  ]),
  forest_watch: freezeChoices([
    { id: "canopy_quiet_zone", label: "划出林冠静养区", short: "林冠静养区", stance: "动物友好", routeKey: "animal", kind: "building", icon: "leaf", visual: "refuge", cost: { materials: { feather_wind_tag: 1, pinecone_humidity: 1 } }, costLabel: "落羽风向签×1 · 松果湿度标×1", brief: "恢复更快 · 游客更少", summary: "保留一片不对游客开放的树冠与林下空间，供受伤动物休息。", immediateLabel: "疾病 -3 · 生态 +4", lasting: "受伤动物会来这里停留，但高地接待能力降低。", immediate: { disease: -2, ecologyScore: 1 }, completed: { disease: -1, ecologyScore: 3, stability: 1 }, visitorBase: 2, incomePerVisitor: 4, disturbanceBase: 7, touristLine: "看不见也是一种保护。", animalLine: "这里的叶子不会突然发出快门声。" },
    { id: "forest_listening_deck", label: "修建林声观察台", short: "林声观察台", stance: "游客友好", routeKey: "visitor", kind: "building", icon: "eye", visual: "tower", cost: { fund: 380 }, upkeep: 50, costLabel: "保护基金×380 · 日维护50", brief: "情感体验强 · 风季关闭", summary: "不追逐动物，只让游客在树冠高度聆听鸟声和远处活动。", immediateLabel: "经营 +2 · 声誉 +3", lasting: "形成独特体验，但大风和火险期必须停用。", immediate: { fund: -170, business: 2, reputation: 1 }, completed: { reputation: 2, ecologyScore: 1 }, visitorBase: 9, incomePerVisitor: 8, disturbanceBase: 24, touristLine: "闭上眼以后，森林反而更近了。", animalLine: "他们终于不再追着翅膀走。" },
    { id: "research_waystation", label: "设立林间研究驿站", short: "林间研究驿站", stance: "经营友好", routeKey: "economy", kind: "building", icon: "eye", visual: "station", cost: { fund: 310 }, upkeep: 38, costLabel: "保护基金×310 · 日维护38", brief: "研究增收 · 人手分流", summary: "让研究者在高地完成基础记录，以合作经费支持长期监测。", immediateLabel: "经营 +3 · 疾病 -2", lasting: "研究收入稳定，但巡护员要分出时间协助记录。", immediate: { fund: -130, business: 2, disease: -1 }, completed: { business: 1, disease: -1, stability: 2 }, visitorBase: 6, incomePerVisitor: 8, disturbanceBase: 17, touristLine: "这里记录的是变化，不是猎奇。", animalLine: "那些人只拿走纸上的痕迹。" },
    { id: "forest_listening_patrol", label: "临时驻守高地", short: "临时高地驻守", stance: "不建设", routeKey: "animal", kind: "temporary", icon: "houndScout", visual: "patrol", cost: { supplies: { evidenceTrap: 1 } }, costLabel: "诱迹机关×1", immediate: { disease: -1, safety: 1 }, completed: {}, visitorBase: 1, incomePerVisitor: 2, disturbanceBase: 6, touristLine: "今天高地只留给巡护员。", animalLine: "树下多了一双安静的眼睛。" }
  ])
});
const RIVER_SHALLOWS_CHOICES = RESERVE_DEVELOPMENT_CHOICES.river_shallows;
const MATERIAL_LABELS = Object.freeze({ fieldKit: "野外工具包", alarm: "警报器", evidenceTrap: "诱迹机关", reed_cord: "芦苇纤维束", pinecone_humidity: "松果湿度标", seedpod_alarm: "荚果警报器", track_cast: "兽道泥印板", feather_wind_tag: "落羽风向签" });
const clamp = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
const bounded = (value, max = 999999) => Math.max(0, Math.min(max, Math.round(Number(value) || 0)));
function nodeById(id) { return RESERVE_DEVELOPMENT_NODES.find((node) => node.id === id) || null; }
function buildingProfileById(id) { return DEVELOPMENT_BUILDING_PROFILES[id] || null; }
function choicesForNode(nodeId) { return RESERVE_DEVELOPMENT_CHOICES[nodeId] || []; }
function choiceById(id, nodeId = "") {
  if (nodeId) return choicesForNode(nodeId).find((choice) => choice.id === id) || null;
  for (const node of RESERVE_DEVELOPMENT_NODES) {
    const choice = choicesForNode(node.id).find((item) => item.id === id);
    if (choice) return choice;
  }
  return null;
}
function normalizedLedger(saved = {}) {
  return { lastSettlementDay: bounded(saved.lastSettlementDay, 99999), todayVisitors: bounded(saved.todayVisitors, 999), todayIncome: bounded(saved.todayIncome, 99999), totalVisitors: bounded(saved.totalVisitors), totalIncome: bounded(saved.totalIncome), troubleCount: bounded(saved.troubleCount, 9999), lastTrouble: String(saved.lastTrouble || "尚无游客麻烦").slice(0, 64) };
}
function normalizedOperations(saved = {}) {
  const today = saved.today || {};
  const recruitment = saved.recruitment || {};
  return {
    version: 1,
    lastSettlementDay: bounded(saved.lastSettlementDay, 99999),
    influence: clamp(saved.influence || 0),
    totalVisitors: bounded(saved.totalVisitors),
    totalIncome: bounded(saved.totalIncome),
    totalTrouble: bounded(saved.totalTrouble, 9999),
    visitorLedger: normalizeVisitorFlowLedger(saved.visitorLedger || {}),
    chapterVisitors: saved.chapterVisitors && typeof saved.chapterVisitors === "object"
      ? normalizeChapterVisitorRecord(saved.chapterVisitors, saved.chapterVisitors.stage)
      : undefined,
    today: {
      day: bounded(today.day, 99999), realDateKey: String(today.realDateKey || "").slice(0, 10), visitors: bounded(today.visitors, 9999), recruitedVisitors: bounded(today.recruitedVisitors, 999999), hostedVisitors: bounded(today.hostedVisitors, 9999), hostedChapter: bounded(today.hostedChapter, 99), recruitedIncome: bounded(today.recruitedIncome), income: bounded(today.income),
      survivalIncome: bounded(today.survivalIncome), ecologyScore: clamp(today.ecologyScore), safetyScore: clamp(today.safetyScore),
      speciesCount: bounded(today.speciesCount, 99), animalTotal: bounded(today.animalTotal, 99999),
      tourismScore: Object.prototype.hasOwnProperty.call(today, "tourismScore")
        ? Math.max(0, Math.min(TOURISM_SCORE_CAP, Number(today.tourismScore) || 0)) : null,
      tourismRawScore: Object.prototype.hasOwnProperty.call(today, "tourismRawScore")
        ? Math.max(0, Math.min(TOURISM_SCORE_CAP, Number(today.tourismRawScore) || 0)) : null,
      buildingVisitors: bounded(today.buildingVisitors, 9999), buildingIncome: bounded(today.buildingIncome), buildingIncomeRaw: bounded(today.buildingIncomeRaw), buildingIncomeCap: bounded(today.buildingIncomeCap), buildingIncomeOverflow: bounded(today.buildingIncomeOverflow), incomeCapOverflow: bounded(today.incomeCapOverflow), buildingMaintenance: bounded(today.buildingMaintenance),
      facilityImpact: String(today.facilityImpact || "暂无设施联动").slice(0, 180), pairImpact: String(today.pairImpact || "").slice(0, 180), facilityActiveCount: bounded(today.facilityActiveCount, 99), facilityChanges: Array.isArray(today.facilityChanges) ? today.facilityChanges.slice(-12) : [],
      weather: String(today.weather || "").slice(0, 8), trouble: String(today.trouble || "尚无明显麻烦").slice(0, 64),
      recruitmentWaterUse: bounded(today.recruitmentWaterUse, 999),
      chapterGained: today.chapterGained === undefined || today.chapterGained === null
        ? undefined : bounded(today.chapterGained, 999999)
    },
    history: (Array.isArray(saved.history) ? saved.history : []).slice(-14),
    recruitment: Object.assign({}, recruitment),
    letters: (Array.isArray(saved.letters) ? saved.letters : []).map((letter) => ({
      id: String((letter || {}).id || "").slice(0, 40),
      day: bounded((letter || {}).day, 99999),
      readAt: bounded((letter || {}).readAt, 9999999999999),
      title: String((letter || {}).title || "游客来信").slice(0, 32),
      body: String((letter || {}).body || "").slice(0, 180),
      trouble: !!(letter || {}).trouble
    })).filter((letter) => letter.id && letter.body).slice(-50)
  };
}
function normalizeReserveDevelopment(reserve = {}) {
  const source = reserve.development || {};
  const sourceNodes = source.nodes || {};
  const nodes = Object.assign({}, sourceNodes);
  RESERVE_DEVELOPMENT_NODES.forEach((config) => {
    const saved = sourceNodes[config.id] || {};
    const plan = choiceById(saved.planId, config.id);
    let phase = ["available", "construction", "operational", "managed"].includes(saved.phase) ? saved.phase : "available";
    if (!plan) phase = "available";
    if (plan && plan.kind === "temporary" && phase !== "managed") phase = "managed";
    nodes[config.id] = { id: config.id, phase, planId: plan ? plan.id : "", progress: phase === "operational" ? 2 : phase === "construction" || phase === "managed" ? 1 : 0, startedDay: bounded(saved.startedDay, 99999), completedDay: bounded(saved.completedDay, 99999), lastActionDay: bounded(saved.lastActionDay, 99999), buildingLevel: Math.max(0, Math.min(BUILDING_MAX_LEVEL, bounded(saved.buildingLevel, BUILDING_MAX_LEVEL))), storyProgress: bounded(saved.storyProgress, 99), lastStoryDay: bounded(saved.lastStoryDay, 99999), storyWindowUnlocked: saved.storyWindowUnlocked === true, storyAdGrantCount: bounded(saved.storyAdGrantCount, 999), storyAdUsesRemaining: bounded(saved.storyAdUsesRemaining, BUILDING_AD_OPERATION_GRANT), storyBusinessBonus: bounded(saved.storyBusinessBonus, 3), memory: (Array.isArray(saved.memory) ? saved.memory : []).map((entry) => String(entry || "").slice(0, 96)).filter(Boolean).slice(-8), visitorLedger: normalizedLedger(saved.visitorLedger || {}) };
  });
  reserve.development = { version: 3, identity: Object.assign({ animal: 0, visitor: 0, economy: 0 }, source.identity || {}), nodes, operations: normalizedOperations(source.operations || {}) };
  return reserve.development;
}
function developmentChapter(reserve = {}) {
  const progression = reserve.progression || {};
  return Math.max(1, Math.round(Number(progression.displayChapter || progression.stage || 1)));
}
const LATE_VISITOR_CHAPTER = 10;
function developmentVisitorScale(chapter = 1) {
  const n = Math.max(1, Math.round(Number(chapter) || 1));
  if (n < LATE_VISITOR_CHAPTER) return Math.round((1 + (n - 1) * 0.22) * 100) / 100;
  return Math.round((2.6 + (n - LATE_VISITOR_CHAPTER) * 0.1) * 100) / 100;
}
function developmentVisitorCapacityScale(chapter = 1) {
  const n = Math.max(1, Math.round(Number(chapter) || 1));
  if (n < LATE_VISITOR_CHAPTER) return Math.round((0.42 + (n - 1) * 0.05) * 100) / 100;
  return Math.round((0.82 + (n - LATE_VISITOR_CHAPTER) * 0.03) * 100) / 100;
}
function developmentDailyVisitorCap(chapter = 1) {
  const n = Math.max(1, Math.round(Number(chapter) || 1));
  return Math.max(8, Math.round(9 + n * 1.6));
}
function capLateChapterStoryVisitors(visitors, chapter = 1) {
  const n = Math.max(1, Math.round(Number(chapter) || 1));
  const amount = Math.max(0, Math.round(Number(visitors) || 0));
  if (n < LATE_VISITOR_CHAPTER) return Math.max(1, amount);
  const target = Math.max(1, chapterTargets(n).visitors);
  const cap = Math.max(36, Math.round(target * 0.05));
  return Math.max(1, Math.min(amount, cap));
}
function facilityPairStage(reserve = {}, facilityId = "") {
  const construction = normalizeFacilityConstruction(reserve);
  const site = ((construction.sites || {})[facilityId]) || {};
  const facility = facilityById(facilityId) || {};
  const profile = FACILITY_USE_PROFILES[facilityId] || {};
  const chapter = developmentChapter(reserve);
  const unlockChapter = Math.max(1, Math.round(Number(facility.chapter || profile.unlockChapter) || 1));
  const action = profile.action || "使用";
  const buildStage = Math.max(0, Math.round(Number(site.buildStage) || 0));
  const used = Math.max(0, Math.round(Number(site.lastUsedDay) || 0)) > 0
    || Math.max(0, Math.round(Number(site.lastUsedChapter) || 0)) > 0
    || Math.max(0, Math.round(Number(site.chapterUsedCount) || 0)) > 0
    || Math.max(0, Math.round(Number(site.usedCount) || 0)) > 0;
  const cleared = !!site.pairCleared
    || !!site.specialization
    || buildStage >= 3
    || (Number(site.lastUsedChapter || 0) === chapter && Math.max(0, Math.round(Number(site.chapterUsedCount) || 0)) >= FACILITY_USE_LIMIT);
  let stage = "missing";
  if (cleared) stage = "specialized";
  else if (used || buildStage >= 2) stage = "built";
  return {
    stage,
    stationReady: chapter >= unlockChapter,
    unlockChapter,
    action,
    used
  };
}
function buildingPairStatus(reserve = {}, nodeId = "", targetLevel = 0) {
  const pair = BUILDING_FACILITY_PAIRS[nodeId];
  if (!pair) {
    return {
      available: true, cap: BUILDING_MAX_LEVEL, stage: "none", missing: [], nextSteps: [],
      label: "", buildingName: "", facilityName: "", facilityId: "", nodeId,
      actionLabel: "", stationReady: false
    };
  }
  const info = facilityPairStage(reserve, pair.facilityId);
  const stage = info.stage;
  const cap = BUILDING_PAIR_LEVEL_CAPS[stage] || BUILDING_PAIR_LEVEL_CAPS.missing;
  const goal = Math.max(0, Math.round(Number(targetLevel) || 0));
  const blocked = goal > cap;
  const missing = [];
  const nextSteps = [];
  let actionLabel = `去${info.action}`;
  if (blocked && stage === "missing") {
    if (!info.stationReady) {
      missing.push(`第${info.unlockChapter}章后去${pair.facilityName}${info.action}`);
      nextSteps.push(`${pair.buildingName}升${goal}级：进入第${info.unlockChapter}章后，去${pair.facilityName}${info.action}`);
      actionLabel = `先到第${info.unlockChapter}章`;
    } else {
      missing.push(`${pair.facilityName}${info.action}`);
      nextSteps.push(`${pair.buildingName}升${goal}级：去${pair.facilityName}${info.action}一次`);
    }
  }
  if (blocked && stage === "built") {
    missing.push(`${pair.facilityName}用满3次`);
    nextSteps.push(`${pair.buildingName}升${goal}级：把${pair.facilityName}本章免费3次用完`);
  }
  const label = stage === "specialized"
    ? `${pair.facilityName}已用满 · 可升到9级`
    : stage === "built"
      ? `${pair.facilityName}已使用 · 可升到6级`
      : info.stationReady
        ? `去${pair.facilityName}${info.action} · 最高3级`
        : `第${info.unlockChapter}章开放${pair.facilityName} · 最高3级`;
  return {
    available: !blocked,
    cap,
    stage,
    missing,
    nextSteps,
    label,
    actionLabel,
    stationReady: !!info.stationReady,
    buildingName: pair.buildingName,
    facilityName: pair.facilityName,
    facilityId: pair.facilityId,
    nodeId
  };
}
function buildingPairSummary(reserve = {}) {
  const rows = Object.keys(BUILDING_FACILITY_PAIRS).map((id) => buildingPairStatus(reserve, id));
  const specialized = rows.filter((row) => row.stage === "specialized");
  const built = rows.filter((row) => row.stage === "built");
  const missing = rows.filter((row) => row.stage === "missing");
  const bits = specialized.map((row) => `${row.buildingName}×${row.facilityName}`)
    .concat(built.map((row) => `${row.buildingName}已用${row.facilityName}`))
    .concat(missing.map((row) => row.stationReady ? `${row.buildingName}还没用${row.facilityName}` : `${row.buildingName}等${row.facilityName}`));
  return {
    rows,
    specializedCount: specialized.length,
    builtCount: built.length,
    missingCount: missing.length,
    label: bits.slice(0, 2).join(" · ") || "保护站还没使用"
  };
}
function developmentBuildingView(reserve = {}, nodeId, day = 1, preparedDevelopment = null) {
  const development = preparedDevelopment || normalizeReserveDevelopment(reserve);
  const config = nodeById(nodeId) || RIVER_SHALLOWS_NODE;
  const node = development.nodes[config.id] || {};
  const profile = buildingProfileById(config.id) || DEVELOPMENT_BUILDING_PROFILES.river_shallows;
  const plan = effectiveDevelopmentChoice(choiceById(node.planId, config.id), config.id);
  const permanent = !!(plan && plan.kind === "building");
  const level = Math.max(0, Math.min(BUILDING_MAX_LEVEL, bounded(node.buildingLevel, BUILDING_MAX_LEVEL)));
  const nextCost = level >= BUILDING_MAX_LEVEL ? null : profile.upgradeCosts[level + 1] || 0;
  const targetLevel = level >= BUILDING_MAX_LEVEL ? level : level + 1;
  const pair = buildingPairStatus(reserve, config.id, targetLevel);
  const upgradeGate = nextCost ? upgradeProgressionGate(reserve, targetLevel) : { available: false, missing: [], nextSteps: [], targetLevel: level };
  upgradeGate.pair = pair;
  if (!pair.available) {
    upgradeGate.available = false;
    upgradeGate.missing = (upgradeGate.missing || []).concat(pair.missing);
    upgradeGate.nextSteps = (upgradeGate.nextSteps || []).concat(pair.nextSteps);
  }
  const story = DEVELOPMENT_BUILDING_STORIES[config.id] || { intro: "建筑需要一份运营记录。", action: "完成一次建筑专属运营。", steps: ["准备运营", "执行运营", "发布结果"] };
  const lastStoryDay = bounded(node.lastStoryDay, 99999);
  const operational = permanent && node.phase === "operational";
  const currentDay = Math.max(1, bounded(day, 99999));
  const nextAvailableDay = lastStoryDay ? lastStoryDay + profile.storyCooldown : currentDay;
  const remainingDays = operational ? Math.max(0, nextAvailableDay - currentDay) : 0;
  const adUsesRemaining = bounded(node.storyAdUsesRemaining, BUILDING_AD_OPERATION_GRANT);
  const storyReady = operational && (!remainingDays || node.storyWindowUnlocked === true || adUsesRemaining > 0);
  const canUnlock = operational && !storyReady && remainingDays > 0;
  const statusText = !operational ? "尚未建成：先在沙盘完成建设"
    : adUsesRemaining > 0 && remainingDays > 0 ? `广告已恢复，还可运营${adUsesRemaining}次`
    : node.storyWindowUnlocked ? "已提前开放，可立即运营一次"
    : storyReady ? "已开放，可立即运营"
    : `还需${remainingDays}个守护日 · 第${nextAvailableDay}日恢复`;
  const recoveryHint = !operational ? "完成建设后才能运营"
    : canUnlock ? `完成巡护并入夜，推进守护日；也可看广告立即恢复${BUILDING_AD_OPERATION_GRANT}次运营`
    : adUsesRemaining > 0 ? `看广告恢复的运营还剩${adUsesRemaining}次`
    : "完成后重新计算冷却";
  const storyProgress = bounded(node.storyProgress, 99);
  const capacityScale = buildingRouteCapacityScale(plan);
  const routePolicy = DEVELOPMENT_ROUTE_POLICIES[(plan || {}).routeKey] || DEVELOPMENT_ROUTE_POLICIES.economy;
  const chapterScale = developmentChapter(reserve);
  const visitorCapacity = Math.round(level * profile.capacityPerLevel * capacityScale * developmentVisitorCapacityScale(chapterScale));
  const routeUpkeep = permanent ? Math.max(0, bounded(plan && plan.upkeep, 9999) * chapterScale) : 0;
  const maintenance = Math.round(level * profile.maintenancePerLevel * routePolicy.maintenanceMultiplier * chapterScale);
  const totalMaintenance = routeUpkeep + maintenance;
  const conservativeVisitors = permanent
    ? Math.max(1, Math.round((plan.visitorBase || 0) + visitorCapacity * .65))
    : 0;
  const estimatedGrossIncome = permanent
    ? Math.max(0, Math.round(conservativeVisitors * (plan.incomePerVisitor || profile.incomePerVisitor) + visitorCapacity * (plan.incomePerVisitor || profile.incomePerVisitor) * .35))
    : 0;
  const estimatedNetIncomeRaw = estimatedGrossIncome - totalMaintenance;
  const estimatedNetIncome = Math.max(0, estimatedNetIncomeRaw);
  const capitalCost = permanent ? Math.max(1, Number(plan.capitalEquivalent) || 1) : 0;
  const paybackDays = permanent && estimatedNetIncome > 0 ? Math.ceil(capitalCost / estimatedNetIncome) : null;
  const paybackLabel = !permanent ? "建成后显示"
    : routePolicy.primaryAxis === "动物留存与栖息"
      ? (estimatedNetIncomeRaw < 0 ? `生态主轴 · 基金差${Math.abs(estimatedNetIncomeRaw)}/日` : "生态主轴 · 维护可覆盖")
      : paybackDays == null ? "需先形成客流" : `约${paybackDays}日回本`;
  return {
    id: config.id,
    planId: plan && plan.id ? plan.id : "",
    title: profile.title,
    level,
    levelLabel: level ? `等级${level}/${BUILDING_MAX_LEVEL}` : `未启用 · 等级1–${BUILDING_MAX_LEVEL}`,
    maintenance,
    routeUpkeep,
    totalMaintenance,
    visitorCapacity,
    incomePerVisitor: plan && plan.incomePerVisitor ? plan.incomePerVisitor : profile.incomePerVisitor,
    visitorIncomePotential: visitorCapacity * (plan && plan.incomePerVisitor ? plan.incomePerVisitor : profile.incomePerVisitor),
    estimatedGrossIncome,
    estimatedNetIncomeRaw,
    estimatedNetIncome,
    capitalCost,
    paybackDays,
    paybackLabel,
    routeLabel: plan && plan.routeLabel ? plan.routeLabel : "未选择路线",
    primaryAxis: plan && plan.primaryAxis ? plan.primaryAxis : "待选择",
    paybackTargetDays: plan && plan.paybackTargetDays ? plan.paybackTargetDays : null,
    nextUpgradeCost: nextCost,
    upgradeAvailable: !!nextCost && permanent && node.phase === "operational" && bounded(reserve.fund) >= nextCost && upgradeGate.available,
    upgradeGate,
    upgradeMissing: upgradeGate.missing,
    pair,
    pairLabel: pair.label,
    upgradeRequirement: upgradeGate.available
      ? `达到第${upgradeGate.chapterRequired}章和游客等级${upgradeGate.visitorRequired}，再准备${nextCost}基金`
      : `${upgradeGate.missing.join("；")}；达成后再准备${nextCost}基金`,
    canUpgrade: level < BUILDING_MAX_LEVEL && permanent && node.phase === "operational",
    story: { title: profile.storyTitle, task: profile.storyTask, operation: profile.operation || "建筑运营", operationType: profile.operationType || "facility", intro: story.intro, action: story.action, steps: story.steps || [], reward: profile.storyReward, progress: storyProgress, ready: storyReady, cooldown: profile.storyCooldown, lastDay: lastStoryDay, currentDay, nextAvailableDay, remainingDays, canUnlock, unlockCost: BUILDING_OPERATION_UNLOCK_COST, adUsesRemaining, adGrant: BUILDING_AD_OPERATION_GRANT, statusText, recoveryHint },
    businessBonus: bounded(node.storyBusinessBonus, 3)
  };
}
function upgradeDevelopmentBuilding(reserve = {}, nodeId, day = 1) {
  const development = normalizeReserveDevelopment(reserve);
  const config = nodeById(nodeId) || RIVER_SHALLOWS_NODE;
  const node = development.nodes[config.id];
  const view = developmentBuildingView(reserve, config.id, day, development);
  if (!view.canUpgrade) return { ok: false, error: "建筑投入运行后才能升级" };
  if (!view.nextUpgradeCost) return { ok: false, error: "建筑已达最高等级" };
  if (!view.upgradeGate.available) return { ok: false, error: `升级至${view.upgradeGate.targetLevel}级还需${view.upgradeGate.missing.join("、")}`, missing: view.upgradeGate.missing, gate: view.upgradeGate };
  if (bounded(reserve.fund) < view.nextUpgradeCost) return { ok: false, error: `保护基金还差${view.nextUpgradeCost - bounded(reserve.fund)}` };
  const before = bounded(reserve.fund);
  reserve.fund = Math.max(0, before - view.nextUpgradeCost);
  recordFundChange(reserve, before, reserve.fund, "建筑升级", bounded(day, 99999), `${config.name} ${view.level + 1}级`);
  node.buildingLevel = view.level + 1;
  node.lastActionDay = bounded(day, 99999);
  const plan = choiceById(node.planId, config.id);
  const impact = applyMetricEffects(reserve, upgradeImpactEffects(plan, node.buildingLevel));
  const route = (plan && plan.routeKey) || "visitor";
  const upgradeNote = route === "animal" ? "栖息条件改善" : route === "economy" ? "经营能力提升" : "游客接待能力提升";
  node.memory = (node.memory || []).concat(`${config.name}升级至等级${node.buildingLevel}，${upgradeNote}。`).slice(-8);
  return { ok: true, node, config, building: developmentBuildingView(reserve, config.id, day, development), cost: view.nextUpgradeCost, changes: [{ key: "fund", before, after: reserve.fund, delta: reserve.fund - before }].concat(impact), route, upgradeNote };
}
function developmentBuildingStoryTask(reserve = {}, nodeId, day = 1) {
  const view = developmentBuildingView(reserve, nodeId, day);
  return Object.assign({ nodeId: view.id }, view.story, { kind: "facilityStory", independent: true, taskMode: "facilityOperation", actionLabel: view.story.ready ? view.story.operation : "等待下次运营窗口" });
}
function unlockDevelopmentBuildingStory(reserve = {}, nodeId, day = 1) {
  if (!nodeById(nodeId)) return { ok: false, error: "建筑不存在" };
  const development = normalizeReserveDevelopment(reserve);
  const view = developmentBuildingView(reserve, nodeId, day, development);
  if (view.story.ready) return { ok: false, error: "已可运营，无需支付" };
  if (!view.story.canUnlock) return { ok: false, error: "先完成建筑建设，再开放运营" };
  const before = bounded(reserve.fund);
  if (before < BUILDING_OPERATION_UNLOCK_COST) return { ok: false, error: `星币不足，还差${BUILDING_OPERATION_UNLOCK_COST - before}星币` };
  reserve.fund = before - BUILDING_OPERATION_UNLOCK_COST;
  development.nodes[nodeId].storyWindowUnlocked = true;
  recordFundChange(reserve, before, reserve.fund, "提前开放建筑运营", bounded(day, 99999), `${view.title} · 仅提前开放本次运营`);
  return { ok: true, cost: BUILDING_OPERATION_UNLOCK_COST, building: developmentBuildingView(reserve, nodeId, day, development) };
}
function grantDevelopmentBuildingStoryAd(reserve = {}, nodeId, day = 1) {
  if (!nodeById(nodeId)) return { ok: false, error: "建筑不存在" };
  const development = normalizeReserveDevelopment(reserve);
  const view = developmentBuildingView(reserve, nodeId, day, development);
  if (view.story.ready) return { ok: false, error: "当前已经可以运营" };
  if (!view.story.canUnlock) return { ok: false, error: "先完成建筑建设，再开放运营" };
  const node = development.nodes[nodeId];
  node.storyAdUsesRemaining = BUILDING_AD_OPERATION_GRANT;
  node.storyAdGrantCount = bounded(node.storyAdGrantCount, 999) + 1;
  node.memory = (node.memory || []).concat(`完整观看广告，恢复${BUILDING_AD_OPERATION_GRANT}次建筑运营。`).slice(-8);
  return {
    ok: true,
    node,
    building: developmentBuildingView(reserve, nodeId, day, development),
    granted: BUILDING_AD_OPERATION_GRANT
  };
}
function completeDevelopmentBuildingStory(reserve = {}, nodeId, day = 1) {
  const development = normalizeReserveDevelopment(reserve);
  const config = nodeById(nodeId) || RIVER_SHALLOWS_NODE;
  const node = development.nodes[config.id];
  const view = developmentBuildingView(reserve, config.id, day, development);
  const task = Object.assign({ nodeId: view.id }, view.story, { kind: "facilityStory", independent: true, taskMode: "facilityOperation", actionLabel: view.story.ready ? view.story.operation : "等待下次运营窗口" });
  if (!task.ready) return { ok: false, error: `${task.statusText}；${task.recoveryHint}` };
  const adUses = bounded(node.storyAdUsesRemaining, BUILDING_AD_OPERATION_GRANT);
  const usingAdGrant = task.remainingDays > 0 && !node.storyWindowUnlocked && adUses > 0;
  node.storyProgress = bounded(node.storyProgress + 1, 99);
  node.storyBusinessBonus = Math.min(3, bounded(node.storyBusinessBonus) + 1);
  node.lastStoryDay = bounded(day, 99999);
  node.storyWindowUnlocked = false;
  node.storyAdUsesRemaining = usingAdGrant ? adUses - 1 : adUses;
  const plan = choiceById(node.planId, config.id);
  const route = (plan && plan.routeKey) || "visitor";
  const reward = livingReserveStoryReward(view, route, config.id, reserve);
  const visitorGain = reward.visitors;
  const incomeGain = reward.income;
  const operations = development.operations;
  const today = operations.today || (operations.today = {});
  today.recruitedIncome = bounded(today.recruitedIncome) + incomeGain;
  today.income = bounded(today.income) + incomeGain;
  operations.totalIncome = bounded(operations.totalIncome + incomeGain);
  if (visitorGain > 0) applyChapterVisitorDelta(reserve, visitorGain, "task");
  const ecologyChanges = reward.ecologyDelta
    ? applyMetricEffects(reserve, { [reward.ecologyKey]: reward.ecologyDelta })
    : [];
  const fundBefore = bounded(reserve.fund);
  reserve.fund = bounded(fundBefore + incomeGain);
  recordFundChange(reserve, fundBefore, reserve.fund, "建筑运营收入", bounded(day, 99999), `${config.name} · ${task.operation}`);
  const memory = route === "animal"
    ? `${task.operation}完成，${reward.ecologyKey === "disease" ? "疾病压力下降" : `${reward.ecologyLabel}改善`}，动物更愿停留。`
    : route === "economy"
      ? `${task.operation}完成，经营收入 +${incomeGain}。`
      : `${task.operation}完成，${visitorGain}名游客完成低扰体验。`;
  node.memory = (node.memory || []).concat(memory).slice(-8);
  return {
    ok: true,
    node,
    config,
    task,
    building: developmentBuildingView(reserve, config.id, day, development),
    businessChange: {
      visitors: visitorGain,
      income: incomeGain,
      fundDelta: incomeGain,
      operation: task.operation,
      route,
      ecologyKey: reward.ecologyKey,
      ecologyLabel: reward.ecologyLabel,
      ecologyDelta: reward.ecologyDelta,
      ecologyChanges,
      memory
    }
  };
}
function resourceAmount(reserve, type, id) {
  if (type === "fund") return bounded(reserve.fund);
  if (type === "supplies") return bounded(((reserve.supplies || {})[id]), 99);
  if (type === "materials") return bounded(((((reserve.wildernessKnowledge || {}).tradeStock) || {})[id]), 99);
  return 0;
}
function nodeStillNeedsBuildingMaterials(node = {}) {
  return !["construction", "operational", "managed"].includes(String(node.phase || "available"));
}
function reservedDevelopmentMaterials(reserve = {}) {
  const reserved = {};
  const nodes = ((reserve.development || {}).nodes) || {};
  RESERVE_DEVELOPMENT_NODES.forEach((config) => {
    if (!nodeStillNeedsBuildingMaterials(nodes[config.id] || {})) return;
    const needed = {};
    choicesForNode(config.id).forEach((choice) => {
      if (!choice || choice.kind !== "building") return;
      Object.keys((choice.cost && choice.cost.materials) || {}).forEach((id) => {
        const need = Math.max(0, Math.round(Number(choice.cost.materials[id]) || 0));
        if (need) needed[id] = Math.max(needed[id] || 0, need);
      });
    });
    Object.keys(needed).forEach((id) => {
      reserved[id] = (reserved[id] || 0) + needed[id];
    });
  });
  return reserved;
}
function surplusTradeAmount(reserve = {}, itemId = "", stock = null) {
  const have = stock == null ? resourceAmount(reserve, "materials", itemId) : bounded(stock, 99);
  const reserved = reservedDevelopmentMaterials(reserve)[itemId] || 0;
  return Math.max(0, have - reserved);
}
function choiceAvailability(reserve = {}, choiceOrId, nodeId = "") {
  const choice = typeof choiceOrId === "string" ? choiceById(choiceOrId, nodeId) : choiceOrId;
  if (!choice) return { available: false, missing: ["方案不存在"], costLabel: "" };
  const missing = [];
  if (choice.cost.fund && resourceAmount(reserve, "fund") < choice.cost.fund) missing.push(`基金还差${choice.cost.fund - resourceAmount(reserve, "fund")}`);
  ["supplies", "materials"].forEach((type) => Object.keys(choice.cost[type] || {}).forEach((id) => {
    const need = choice.cost[type][id];
    const have = resourceAmount(reserve, type, id);
    if (have < need) missing.push(`${MATERIAL_LABELS[id] || id} ${have}/${need}`);
  }));
  const progression = choice.kind === "building" ? upgradeProgressionGate(reserve, 1) : null;
  if (progression && !progression.available) missing.push(...progression.missing);
  return { available: missing.length === 0, missing, costLabel: choice.costLabel, progression };
}
function applyMetricEffects(reserve, effects = {}) {
  const changes = [];
  Object.keys(effects).forEach((key) => {
    const target = ["water", "grass", "disease"].includes(key) ? (reserve.ecology || (reserve.ecology = {})) : reserve;
    const before = Number(target[key] || 0);
    const after = key === "fund" ? Math.max(0, Math.round(before + effects[key])) : clamp(before + effects[key]);
    target[key] = after;
    changes.push({ key, before, after, delta: after - before });
  });
  return changes;
}
function consumeChoiceCost(reserve, choice) {
  if (choice.cost.fund) {
    const beforeFund = bounded(reserve.fund);
    reserve.fund = Math.max(0, beforeFund - choice.cost.fund);
    recordFundChange(reserve, beforeFund, reserve.fund, "生态建设", ((reserve.guardianCycle || {}).day) || 0, "保护区发展方案投入");
  }
  reserve.supplies = reserve.supplies || {};
  Object.keys(choice.cost.supplies || {}).forEach((id) => { reserve.supplies[id] = Math.max(0, bounded(reserve.supplies[id], 99) - choice.cost.supplies[id]); });
  Object.keys(choice.cost.materials || {}).forEach((id) => {
    const knowledge = reserve.wildernessKnowledge || (reserve.wildernessKnowledge = {});
    const stock = knowledge.tradeStock || (knowledge.tradeStock = {});
    stock[id] = Math.max(0, bounded(stock[id], 99) - choice.cost.materials[id]);
  });
}
function expireTemporaryPlan(node, nodeId, day) {
  const plan = choiceById(node && node.planId, nodeId);
  if (!node || node.phase !== "managed" || !plan || plan.kind !== "temporary" || bounded(day, 99999) <= node.lastActionDay) return false;
  node.phase = "available"; node.planId = ""; node.progress = 0;
  return true;
}
function selectReserveDevelopmentPlan(reserve = {}, nodeId, choiceId, day = 1) {
  const development = normalizeReserveDevelopment(reserve);
  const config = nodeById(nodeId);
  const node = config && development.nodes[nodeId];
  if (!config || !node) return { ok: false, error: "建设节点不存在" };
  expireTemporaryPlan(node, nodeId, day);
  const choice = effectiveDevelopmentChoice(choiceById(choiceId, nodeId), nodeId);
  if (!choice) return { ok: false, error: "建设方案不存在" };
  if (node.phase !== "available") return { ok: false, error: `${config.short}已经作出长期选择` };
  const availability = choiceAvailability(reserve, choice);
  if (!availability.available) return { ok: false, error: availability.missing.join(" · "), missing: availability.missing };
  consumeChoiceCost(reserve, choice);
  const immediate = Object.assign({}, choice.immediate); delete immediate.fund;
  const changes = applyMetricEffects(reserve, immediate);
  if (choice.cost.fund) changes.unshift({ key: "fund", before: reserve.fund + choice.cost.fund, after: reserve.fund, delta: -choice.cost.fund });
  node.planId = choice.id; node.phase = choice.kind === "temporary" ? "managed" : "construction"; node.progress = 1; node.startedDay = bounded(day, 99999); node.lastActionDay = bounded(day, 99999);
  node.memory = node.memory.concat(choice.kind === "temporary" ? `你没有修建永久设施，而是临时处理了${config.short}的问题。` : `${choice.short}开始改变${config.short}。`).slice(-8);
  development.identity[choice.routeKey] = bounded(Number(development.identity[choice.routeKey] || 0) + 2, 100);
  return { ok: true, node, nodeConfig: config, choice, changes, phase: node.phase };
}
function completeReserveDevelopmentConstruction(reserve = {}, nodeId, day = 1) {
  const development = normalizeReserveDevelopment(reserve);
  const config = nodeById(nodeId);
  const node = config && development.nodes[nodeId];
  const choice = node && effectiveDevelopmentChoice(choiceById(node.planId, nodeId), nodeId);
  if (!choice || node.phase !== "construction") return { ok: false, error: `当前没有待完成的${config ? config.short : "设施"}施工` };
  const changes = applyMetricEffects(reserve, choice.completed || {});
  node.phase = "operational"; node.progress = 2; node.completedDay = bounded(day, 99999); node.lastActionDay = bounded(day, 99999);
  node.memory = node.memory.concat(`${choice.short}投入运行。${choice.animalLine}`).slice(-8);
  return { ok: true, node, nodeConfig: config, choice, changes, phase: node.phase };
}
function buildReserveDevelopmentPlan(reserve = {}, nodeId, choiceId, day = 1) {
  const selected = selectReserveDevelopmentPlan(reserve, nodeId, choiceId, day);
  if (!selected.ok || selected.choice.kind === "temporary") return selected;
  const completed = completeReserveDevelopmentConstruction(reserve, nodeId, day);
  if (!completed.ok) return completed;
  return { ok: true, node: completed.node, nodeConfig: completed.nodeConfig, choice: completed.choice, changes: (selected.changes || []).concat(completed.changes || []), phase: completed.phase, completed: true };
}
function nodeRiskState(config, reserve) {
  const eco = reserve.ecology || {};
  if (config.id === "river_shallows") return { damaged: clamp(eco.water) < 36 || clamp(eco.disease) > 52 || clamp(reserve.poacherPressure) > 68, strained: clamp(eco.water) < 45 || clamp(eco.disease) > 38 || clamp(reserve.poacherPressure) > 54 };
  if (config.id === "meadow_edge") return { damaged: clamp(eco.grass) < 34 || clamp(eco.disease) > 55, strained: clamp(eco.grass) < 48 || clamp(eco.disease) > 40 };
  if (config.id === "border_pass") return { damaged: clamp(reserve.poacherPressure) > 70 || clamp(reserve.safety) < 30, strained: clamp(reserve.poacherPressure) > 52 || clamp(reserve.safety) < 45 };
  return { damaged: clamp(eco.disease) > 58 || clamp(reserve.safety) < 28, strained: clamp(eco.disease) > 40 || clamp(reserve.safety) < 44 };
}
function animalState(config, use, reserve) {
  if (use) return { river_shallows: "晨角正带幼鹿使用浅滩", meadow_edge: "跳星带着幼兽穿过连续草带", border_pass: "沉牙沿新留下的出口巡视边界", forest_watch: "黑铃把受伤同伴引向安静高地" }[config.id];
  const eco = reserve.ecology || {};
  if (config.id === "river_shallows") return clamp(eco.water) < 45 ? "鹿群在林缘等待水位恢复" : "鹿群正在绕开游客活动线";
  if (config.id === "meadow_edge") return clamp(eco.grass) < 48 ? "草食动物在稀薄草带间徘徊" : "幼兽正在避开人群的近路";
  if (config.id === "border_pass") return "边界动物仍在试探旧兽道是否安全";
  return "林中动物藏在看不见的树冠后方";
}
const VISITOR_ATTENDANCE_REASON = Object.freeze({
  river_shallows: Object.freeze(["鹿在饮水", "鹿离开了浅滩"]),
  meadow_edge: Object.freeze(["幼兽在穿行", "幼兽离开了草场"]),
  border_pass: Object.freeze(["动物在经过边界", "动物没有经过边界"]),
  forest_watch: Object.freeze(["鸟还在高地", "鸟离开了高地"])
});
function visitorBuildingAttendance(config, choice, phase, ready, damaged) {
  if (!choice || choice.routeKey !== "visitor" || !["operational", "managed"].includes(phase)) {
    return { active: false, reduced: false, reason: "" };
  }
  const pair = VISITOR_ATTENDANCE_REASON[config.id] || ["动物还在", "动物离开了"];
  const present = !!ready && !damaged;
  return { active: true, reduced: !present, reason: present ? pair[0] : pair[1] };
}
function troubleFor(config, phase, damaged, disturbance, visitors) {
  if (damaged) return `${config.short}受损，游客进入了未完成的封闭线`;
  if (disturbance >= 43) return { river_shallows: "拍照停留挤压了鹿群饮水时间", meadow_edge: "游客离开步道，幼兽改变了穿行时间", border_pass: "夜观灯光照进兽道，动物在边界停步", forest_watch: "交谈声持续太久，林中动物离开高地" }[config.id];
  if (visitors >= 7) return `${config.short}入口出现短时排队和遗留物`;
  if (phase === "construction") return `游客误入${config.short}施工标线`;
  return "尚无明显麻烦";
}
function reserveDevelopmentNodeView(reserve = {}, nodeId, day = 1, preparedDevelopment = null) {
  const development = preparedDevelopment || normalizeReserveDevelopment(reserve);
  const config = nodeById(nodeId) || RIVER_SHALLOWS_NODE;
  const node = development.nodes[config.id];
  expireTemporaryPlan(node, config.id, day);
  const choice = effectiveDevelopmentChoice(choiceById(node.planId, config.id), config.id);
  const risk = nodeRiskState(config, reserve);
  const building = developmentBuildingView(reserve, config.id, day, development);
  const damaged = node.phase === "operational" && risk.damaged;
  const strained = !damaged && risk.strained;
  const variation = (bounded(day, 99999) + RESERVE_DEVELOPMENT_NODES.indexOf(config)) % 3 - 1;
  const chapter = developmentChapter(reserve);
  const chapterScale = developmentVisitorScale(chapter);
  let visitors = choice ? Math.max(0, (choice.visitorBase + variation) * chapterScale) : Math.max(0, (1 + variation) * chapterScale);
  if (["operational", "managed"].includes(node.phase)) visitors += building.visitorCapacity + building.businessBonus;
  if (["operational", "managed"].includes(node.phase)) {
    visitors = Math.min(visitors, developmentDailyVisitorCap(chapter));
  }
  if (node.phase === "construction") visitors = Math.min(2, visitors);
  if (damaged) visitors = Math.floor(visitors / 2);
  const disturbance = clamp((choice ? choice.disturbanceBase : 8) + Math.max(0, visitors - 4) * 3 + (node.phase === "construction" ? 8 : 0) + Math.max(0, building.level) * (choice && choice.routeKey === "visitor" ? 6 : choice && choice.routeKey === "animal" ? -2 : 2));
  const eco = reserve.ecology || {};
  const ready = config.id === "river_shallows" ? clamp(eco.water) >= 45 : config.id === "meadow_edge" ? clamp(eco.grass) >= 45 : config.id === "border_pass" ? clamp(reserve.poacherPressure) < 58 : clamp(eco.disease) < 48;
  const attendance = visitorBuildingAttendance(config, choice, node.phase, ready, damaged);
  const animalUse = attendance.active
    ? node.phase === "operational" && !attendance.reduced
    : node.phase === "operational" && ready && disturbance < 43 && !damaged;
  if (attendance.reduced && !damaged) visitors = Math.floor(visitors / 2);
  const income = choice && ["operational", "managed"].includes(node.phase)
    ? visitors * choice.incomePerVisitor + building.visitorIncomePotential + building.businessBonus * 2
    : 0;
  const condition = damaged ? "damaged" : strained ? "strained" : "stable";
  return { node: Object.assign({}, config, node), config, choice, phase: node.phase, visualStage: damaged ? "damaged" : node.phase, condition, conditionLabel: damaged ? "受损" : strained ? "承压" : "稳定", visitors, income, disturbance, trouble: troubleFor(config, node.phase, damaged, disturbance, visitors), animalUse, attendanceReduced: attendance.reduced, attendanceReason: attendance.reason, animalState: animalState(config, animalUse, reserve), animalLine: choice ? choice.animalLine : config.availableLine, touristLine: choice ? choice.touristLine : `向导说，${config.short}还在观察期。`, building, availability: choicesForNode(config.id).map((item) => { const effective = effectiveDevelopmentChoice(item, config.id); return Object.assign({ choice: effective }, choiceAvailability(reserve, effective)); }), ledger: node.visitorLedger };
}
function livingReserveEcologyFocus(nodeId = "", reserve = {}) {
  const key = nodeId === "meadow_edge" ? "grass" : nodeId === "border_pass" ? "safety" : nodeId === "forest_watch" ? "disease" : "water";
  const label = { water: "水源", grass: "草场", safety: "安全", disease: "疾病" }[key];
  const eco = reserve.ecology || {};
  const value = key === "safety"
    ? clamp(reserve.safety || reserve.stability)
    : key === "disease"
      ? clamp(eco.disease)
      : clamp(eco[key]);
  return { key, label, value, danger: key === "disease" ? value > 48 : value < 45 };
}
function livingReserveStoryReward(building = {}, routeKey = "visitor", nodeId = "", reserve = {}) {
  const route = routeKey === "animal" || routeKey === "economy" ? routeKey : "visitor";
  const policy = DEVELOPMENT_ROUTE_POLICIES[route] || DEVELOPMENT_ROUTE_POLICIES.visitor;
  const profile = buildingProfileById(nodeId) || DEVELOPMENT_BUILDING_PROFILES.river_shallows;
  const level = Math.max(0, Number(building.level) || 0);
  const chapter = developmentChapter(reserve);
  const visitors = capLateChapterStoryVisitors(
    Math.max(1, Math.round((1 + level * profile.capacityPerLevel * .5) * developmentVisitorScale(chapter))),
    chapter
  );
  const income = Math.max(2, Math.round(visitors * Math.max(1, profile.incomePerVisitor) * .75));
  const storyRewardScale = route === "visitor"
    && (nodeId === "forest_watch" || ["guided_border_hide", "meadow_story_trail"].includes(String(building.planId || "")))
    ? Math.max(1, Number(PACE_ECONOMY.buildingStoryRewardScale) || 1)
    : 1;
  const ecology = livingReserveEcologyFocus(nodeId);
  if (route === "animal") {
    return {
      route,
      visitors: Math.max(0, Math.round(visitors * policy.storyVisitorMultiplier)),
      income: Math.max(1, Math.round(income * policy.storyIncomeMultiplier)),
      ecologyKey: ecology.key,
      ecologyLabel: ecology.label,
      ecologyDelta: ecology.key === "disease" ? -1 : 1
    };
  }
  if (route === "economy") {
    return {
      route,
      visitors: Math.max(1, Math.round(visitors * policy.storyVisitorMultiplier)),
      income: Math.max(2, Math.round(income * policy.storyIncomeMultiplier)),
      ecologyKey: ecology.key,
      ecologyLabel: ecology.label,
      ecologyDelta: 0
    };
  }
  return { route: "visitor", visitors: Math.max(1, Math.round(visitors * policy.storyVisitorMultiplier * storyRewardScale)), income: Math.max(2, Math.round(income * policy.storyIncomeMultiplier * storyRewardScale)), ecologyKey: ecology.key, ecologyLabel: ecology.label, ecologyDelta: 0 };
}
function livingReserveStoryOutcomeText(route = "visitor", change = {}, ecology = {}) {
  const visitors = Number(change.visitors) || 0;
  const income = Number(change.fundDelta != null ? change.fundDelta : change.income) || 0;
  const ecologyLabel = change.ecologyLabel || ecology.label || "栖息";
  const ecologyDelta = Number(change.ecologyDelta) || 0;
  if (route === "animal") {
    const ecologyText = ecologyDelta
      ? `${ecologyLabel} ${ecologyDelta > 0 ? "+" : ""}${ecologyDelta}`
      : (change.ecologyKey === "disease" ? "疾病压力下降" : "栖息改善");
    return `${ecologyText} · 基金 +${income}`;
  }
  if (route === "economy") return `经营收入 +${income} · 协作到访 +${visitors}`;
  return `本章游客 +${visitors} · 基金 +${income}`;
}
function livingReserveFocusMetrics(view = {}, reserve = {}) {
  const routeKey = String((view.choice || {}).routeKey || "");
  const route = routeKey === "animal" || routeKey === "economy" ? routeKey : "visitor";
  const ledger = view.ledger || {};
  const building = view.building || {};
  const nodeId = (view.config && view.config.id) || (view.node && view.node.id) || view.id || "";
  const ecology = livingReserveEcologyFocus(nodeId, reserve);
  const reward = livingReserveStoryReward(building, route, nodeId, reserve);
  const animalName = (view.config && view.config.animalName) || "动物";
  const spokenLine = view.attendanceReason ? (view.animalState || view.animalLine) : view.animalLine;
  const visitors = view.visitors || 0;
  const income = view.income || 0;
  const maintenanceText = `${building.totalMaintenance != null ? building.totalMaintenance : building.maintenance || 0}`;
  const routeText = building.primaryAxis && building.primaryAxis !== "待选择" ? ` · 主轴：${building.primaryAxis}` : "";
  const paybackText = building.paybackLabel ? ` · ${building.paybackLabel}` : "";
  const pairText = building.pairLabel ? ` · ${building.pairLabel}` : "";
  const outcomeText = (change = {}) => livingReserveStoryOutcomeText(route, change, ecology);
  if (route === "animal") {
    return {
      route,
      stance: (view.choice || {}).stance || "动物友好",
      cards: [
        { label: "动物", value: view.animalUse ? "停留" : "避开", danger: !view.animalUse },
        { label: ecology.label, value: String(ecology.value), danger: ecology.danger },
        { label: "惊扰", value: String(view.disturbance || 0), danger: (view.disturbance || 0) >= 43 }
      ],
      ledger: `低扰路线 · 累计到访 ${ledger.totalVisitors || 0} 人`,
      listLine: `动物${view.animalUse ? "停留" : "避开"} · ${ecology.label}${ecology.value}`,
      supportLine: `维护 ${maintenanceText}/日 · 升级后低扰路线更稳${paybackText}${routeText}${pairText}`,
      spoken: `${animalName}：“${spokenLine || view.animalLine || "这里更安静了。"}”`,
      upgradeCapacityLabel: "等级与栖息",
      upgradeCapacityText: `${building.level ? `${building.level}/${BUILDING_MAX_LEVEL}级` : "未启用"} · 低扰路线`,
      upgradeEconomyLabel: "生态影响",
      upgradeEconomyText: `维护 ${maintenanceText} 基金/日 · ${ecology.label}${ecology.value}${paybackText}`,
      storyRewardLabel: "动物与栖息",
      storyRewardPreview: outcomeText(reward),
      upgradeToast: "栖息条件改善",
      upgradeFooter: "升级加强栖息条件，降低惊扰；日维护也提高",
      storyFooter: "完成运营后，栖息条件和基金即时到账",
      mapVisitorCap: view.animalUse ? 0 : 2,
      outcomeText
    };
  }
  if (route === "economy") {
    return {
      route,
      stance: (view.choice || {}).stance || "经营友好",
      cards: [
        { label: "经营收入", value: `+${income}` },
        { label: "协作到访", value: `${visitors}人` },
        { label: ecology.label, value: String(ecology.value), danger: ecology.danger }
      ],
      ledger: `累计收入 ${ledger.totalIncome || 0} · 到访 ${ledger.totalVisitors || 0}`,
      listLine: `经营收入+${income} · 协作到访${visitors}人`,
      supportLine: `维护 ${maintenanceText}/日 · 升级后收入+${building.visitorIncomePotential || 0}${paybackText}${routeText}${pairText}`,
      spoken: `向导：“${view.touristLine || "这条线不能越过。"}”`,
      upgradeCapacityLabel: "等级与协作",
      upgradeCapacityText: `${building.level ? `${building.level}/${BUILDING_MAX_LEVEL}级` : "未启用"} · 协作接待 ${building.visitorCapacity || 0}人/日`,
      upgradeEconomyLabel: "经营收支",
      upgradeEconomyText: `维护 ${maintenanceText} 基金/日 · 预计收入 +${building.visitorIncomePotential || 0}/日${paybackText}`,
      storyRewardLabel: "经营与基金",
      storyRewardPreview: outcomeText(reward),
      upgradeToast: "经营能力提升",
      upgradeFooter: "升级提高每晚经营收入，日维护也提高",
      storyFooter: "完成运营后，经营收入和基金即时到账",
      mapVisitorCap: 4,
      outcomeText
    };
  }
  return {
    route: "visitor",
    stance: (view.choice || {}).stance || "游客友好",
    cards: [
      { label: "游客", value: `${visitors}人` },
      { label: "收入", value: `+${income}` },
      { label: "惊扰", value: String(view.disturbance || 0), danger: (view.disturbance || 0) >= 43 }
    ],
    ledger: `累计 ${ledger.totalVisitors || 0} 人 · 收入 ${ledger.totalIncome || 0} · 麻烦 ${ledger.troubleCount || 0} 次`,
    listLine: `游客${visitors}人 · 收入+${income}`,
    supportLine: `维护 ${maintenanceText}/日 · 升级后游客+${building.visitorCapacity || 0}${paybackText}${routeText}${pairText}`,
    spoken: `${animalName}：“${spokenLine || view.animalLine || ""}” · 游客：“${view.touristLine || ""}”`,
    upgradeCapacityLabel: "等级与容量",
    upgradeCapacityText: `${building.level ? `${building.level}/${BUILDING_MAX_LEVEL}级` : "未启用"} · 接待 ${building.visitorCapacity || 0}人/日`,
    upgradeEconomyLabel: "经营收支",
    upgradeEconomyText: `维护 ${maintenanceText} 基金/日 · 预计收入 +${building.visitorIncomePotential || 0}/日${paybackText}`,
    storyRewardLabel: "游客与基金",
    storyRewardPreview: outcomeText(reward),
    upgradeToast: "游客接待能力提升",
    upgradeFooter: "升级提高之后每晚的到访上限，日维护也提高",
    storyFooter: "完成运营后，本章游客和基金即时到账",
    mapVisitorCap: 6,
    outcomeText
  };
}
function reserveDevelopmentViews(reserve = {}, day = 1) {
  const development = normalizeReserveDevelopment(reserve);
  return RESERVE_DEVELOPMENT_NODES.map((node) => reserveDevelopmentNodeView(reserve, node.id, day, development));
}
function animalOperationsSnapshot(reserve = {}) {
  const ecology = reserve.ecology || {};
  const groups = [ecology.predators || {}, ecology.herbivores || {}, ecology.birds || {}];
  const populations = groups.reduce((all, group) => all.concat(Object.keys(group).map((id) => Number(group[id]) || 0)), []);
  const animalTotal = populations.reduce((sum, value) => sum + value, 0);
  const speciesCount = populations.filter((value) => value > 0).length;
  const predators = Object.keys(groups[0]).reduce((sum, id) => sum + (Number(groups[0][id]) || 0), 0);
  const herbivores = Object.keys(groups[1]).reduce((sum, id) => sum + (Number(groups[1][id]) || 0), 0);
  const ratio = predators > 0 ? herbivores / predators : herbivores ? 99 : 30;
  const foodChain = clamp(100 - Math.abs(ratio - 30) * 1.8);
  const safetyScore = clamp((reserve.safety || 0) * .62 + (100 - (reserve.poacherPressure || 0)) * .38);
  const ecologyScore = clamp((ecology.water || 0) * .22 + (ecology.grass || 0) * .22 + (100 - (ecology.disease || 0)) * .18 + foodChain * .18 + safetyScore * .12 + Math.min(100, speciesCount * 12) * .08);
  return { ecologyScore, safetyScore, foodChain, speciesCount, animalTotal, predators, herbivores, water: clamp(ecology.water), grass: clamp(ecology.grass), disease: clamp(ecology.disease), poacherPressure: clamp(reserve.poacherPressure) };
}
function reserveOperationsSnapshot(reserve = {}, day = 1, context = {}) {
  const development = normalizeReserveDevelopment(reserve);
  const views = context.views || reserveDevelopmentViews(reserve, day);
  const nature = animalOperationsSnapshot(reserve);
  const facilityImpact = facilityVisitorImpact(reserve);
  const pairSummary = buildingPairSummary(reserve);
  const active = views.filter((view) => ["operational", "managed"].includes(view.phase) && view.choice);
  const baseVisitors = active.reduce((sum, view) => sum + view.visitors, 0);
  const weather = String(context.weather || ((reserve.seasonState || {}).weather) || "阴");
  const weatherFactor = ({ 晴: 1.08, 阴: 1, 小雨: .84, 雨: .70, 大雨: .52, 雾: .72 }[weather] || .94);
  const reserveLevel = Math.max(1, Math.min(5, Math.round(Number(((reserve.progression || {}).displayChapter || (reserve.progression || {}).stage || (reserve.progression || {}).level) || 1))));
  const eventFactors = eventBusinessFactors(reserve);
  const scaleFactor = Math.min(1.18, .52 + nature.safetyScore * .0015 + Math.min(.22, nature.speciesCount * .028) + Math.min(.14, Math.sqrt(nature.animalTotal) / 100) + reserveLevel * .035 + nature.ecologyScore * .001);
  const engagement = visitorEngagement(reserve, { weather });
  const activity = Math.round(engagement.activity * 100);
  const retention = Math.round(engagement.retention * 100);
  const knowledge = reserve.wildernessKnowledge || {};
  const discoveries = Object.keys(knowledge.discoveries || {}).length;
  const stock = Object.keys(knowledge.tradeStock || {}).reduce((sum, id) => sum + (Number(knowledge.tradeStock[id]) || 0), 0);
  const programLevel = Math.min(8, discoveries + Math.min(3, stock));
  const facilityCapacity = facilityImpact.activeFacilities ? Math.round(facilityImpact.activeFacilities * 2) : 0;
  const rareVisitorMultiplier = rareAnimalVisitorMultiplier(reserve);
  const actualVisitors = baseVisitors ? Math.max(0, Math.round((baseVisitors + facilityCapacity) * weatherFactor * scaleFactor * eventFactors.demand * rareVisitorMultiplier)) : 0;
  const survivalIncome = actualVisitors * Math.min(4, Math.floor(programLevel / 2));
  const baseIncome = active.reduce((sum, view) => sum + view.visitors * view.choice.incomePerVisitor, 0);
  const facilityActivity = Math.max(0, Math.min(90, activity + Math.round(facilityImpact.activity * 100)));
  const rareRetention = rareAnimalRetentionBonus(reserve);
  const facilityRetention = Math.max(0, Math.min(90, retention + Math.round(facilityImpact.retention * 100) + Math.round(rareRetention * 100)));
  const qualityFactor = Math.max(0.48, Math.min(1.12, 0.56 + facilityActivity / 100 * 0.28 + facilityRetention / 100 * 0.22));
  const buildingIncomeRaw = active.reduce((sum, view) => sum + bounded((view.building || {}).visitorIncomePotential) + bounded((view.building || {}).businessBonus) * 2, 0)
    + Math.round(baseIncome * Math.max(0, Number(facilityImpact.incomeRate) || 0));
  const buildingIncomeCap = Math.min(
    BUILDING_COMBINED_INCOME_CAP.max,
    Math.max(BUILDING_COMBINED_INCOME_CAP.base, Math.round(
      BUILDING_COMBINED_INCOME_CAP.base
      + actualVisitors * BUILDING_COMBINED_INCOME_CAP.perVisitor
      + reserveLevel * BUILDING_COMBINED_INCOME_CAP.perChapter
    ))
  );
  const buildingIncome = Math.min(buildingIncomeRaw, buildingIncomeCap);
  const buildingIncomeOverflow = Math.max(0, buildingIncomeRaw - buildingIncome);
  const uncappedGrossIncome = baseVisitors ? Math.round(baseIncome * (1 + facilityImpact.incomeRate) * actualVisitors / baseVisitors * qualityFactor) + survivalIncome : 0;
  const cappedBuildingGrossIncome = Math.min(uncappedGrossIncome, buildingIncomeCap);
  const grossIncome = cappedBuildingGrossIncome + survivalIncome;
  const incomeCapOverflow = Math.max(0, uncappedGrossIncome - cappedBuildingGrossIncome);
  const baseMaintenance = reserveLevel * 3;
  const visitorServiceMaintenance = Math.ceil(actualVisitors / 80);
  const upkeep = active.reduce((sum, view) => sum + bounded((view.choice || {}).upkeep, 9999) + bounded((view.building || {}).maintenance, 9999), 0)
    + baseMaintenance + visitorServiceMaintenance;
  const income = Math.max(0, grossIncome - upkeep);
  const crowding = baseVisitors ? actualVisitors / baseVisitors : 0;
  const disturbance = active.reduce((max, view) => Math.max(max, view.disturbance), 0) + Math.max(0, Math.round((crowding - 1) * 18));
  const visitorWaterUse = visitorWaterUseForCount(actualVisitors, reserve);
  const visitorPressure = visitorWaterUse || disturbance > 40 ? "游客活动正在消耗水源并增加现场压力" : "游客活动处于可控范围";
  let trouble = "尚无明显麻烦";
  if (actualVisitors && nature.safetyScore < 45) trouble = "安全线偏薄，游客越过了临时封闭标记";
  else if (actualVisitors && ["大雨", "雨"].includes(weather)) trouble = "雨势打乱游线，出现滞留与退票投诉";
  else if (disturbance >= 46) trouble = "客流惊扰动物，向导临时缩短了游线";
  else if (crowding > 1.12) trouble = "入口拥挤，出现排队与遗留物";
  const previous = development.operations.today || {};
  const tourismRawScore = active.length
    ? Math.max(0, Math.min(TOURISM_SCORE_CAP, active.length * 5 + Math.min(16, (baseVisitors + facilityCapacity) * .25) + nature.safetyScore * .09 + nature.ecologyScore * .05 + nature.speciesCount * .5 + reserveLevel * 2 + facilityImpact.activeFacilities * 1.2))
    : 0;
  const hasPreviousTourismScore = previous.tourismScore !== null && previous.tourismScore !== undefined && Number.isFinite(Number(previous.tourismScore));
  const previousTourismScore = hasPreviousTourismScore ? Math.max(0, Math.min(TOURISM_SCORE_CAP, Number(previous.tourismScore))) : 0;
  const tourismScore = Math.max(0, Math.min(TOURISM_SCORE_CAP, previousTourismScore + (tourismRawScore - previousTourismScore) * .16));
  const tourismDelta = tourismScore - previousTourismScore;
  const tourism = tourismProgression(tourismScore, {
    previousScore: previousTourismScore,
    delta: tourismDelta,
    activity: facilityActivity,
    retention: facilityRetention,
    environment: nature.ecologyScore,
    risk: engagement.risk
  });
  return {
    day: bounded(day, 99999), weather, visitors: actualVisitors, income, grossIncome, upkeep, baseMaintenance, visitorServiceMaintenance, survivalIncome, disturbance, trouble,
    byNode: active, nature, programLevel, baseVisitors, reserveLevel,
    tourism: Object.assign(tourism, {
      scale: actualVisitors, activity: facilityActivity, retention: facilityRetention, rawScore: tourismRawScore,
      previousScore: previousTourismScore, delta: tourismDelta,
      trend: tourismDelta > .15 ? "up" : tourismDelta < -.15 ? "down" : "steady",
      formula: "规模 × 活跃度 × 留存"
    }),
    factors: { weather: weatherFactor, scale: scaleFactor, event: eventFactors.demand, rareAnimal: rareVisitorMultiplier, activity: facilityActivity / 100, retention: facilityRetention / 100, environment: engagement.environment / 100, risk: engagement.risk, feedback: engagement.risk === "critical" ? "游客明显减少，优先处理水源或疾病" : engagement.risk === "warning" ? "游客停留缩短，建议改善生态状态" : "游客体验稳定", facilities: pairSummary.label || facilityImpact.label || "暂无设施联动" },
    buildingVisitors: active.reduce((sum, view) => sum + bounded((view.building || {}).visitorCapacity) + bounded((view.building || {}).businessBonus), 0) + facilityCapacity,
    buildingIncomeRaw,
    buildingIncome,
    buildingIncomeCap,
    buildingIncomeOverflow,
    incomeCapOverflow,
    buildingMaintenance: active.reduce((sum, view) => sum + bounded((view.building || {}).maintenance), 0),
    facilityImpact,
    pairSummary,
    visitorWaterUse,
    visitorPressure,
    rareAnimalEffect: { visitorMultiplier: rareVisitorMultiplier, retentionBonus: rareRetention },
    previous, influence: development.operations.influence || 0
  };
}
function settleReserveDevelopmentDay(reserve = {}, day = 1, context = {}) {
  let development = normalizeReserveDevelopment(reserve);
  if (bounded(day, 99999) <= development.operations.lastSettlementDay) return null;
  const facilitySettlement = applyFacilityDailyEffects(reserve, day);
  const snapshot = reserveOperationsSnapshot(reserve, day, context);
  development = reserve.development;
  const byNode = [];
  const totalBase = snapshot.byNode.reduce((sum, view) => sum + view.visitors, 0);
  let assignedVisitors = 0;
  let assignedGrossIncome = 0;
  snapshot.byNode.forEach((view, index) => {
    const config = view.config;
    let node = development.nodes[config.id];
    const visitors = index === snapshot.byNode.length - 1 ? snapshot.visitors - assignedVisitors : Math.round(snapshot.visitors * view.visitors / Math.max(1, totalBase));
    assignedVisitors += visitors;
    const grossIncome = index === snapshot.byNode.length - 1
      ? Math.max(0, snapshot.grossIncome - assignedGrossIncome)
      : Math.max(0, Math.round(snapshot.grossIncome * view.visitors / Math.max(1, totalBase)));
    assignedGrossIncome += grossIncome;
    const upkeep = bounded((view.choice || {}).upkeep, 9999) + bounded((view.building || {}).maintenance, 9999);
    const income = Math.max(0, grossIncome - upkeep);
    const trouble = snapshot.trouble !== "尚无明显麻烦" ? snapshot.trouble : view.trouble;
    node.visitorLedger.lastSettlementDay = snapshot.day; node.visitorLedger.todayVisitors = visitors; node.visitorLedger.todayIncome = income; node.visitorLedger.totalVisitors = bounded(node.visitorLedger.totalVisitors + visitors); node.visitorLedger.totalIncome = bounded(node.visitorLedger.totalIncome + income); node.visitorLedger.lastTrouble = trouble;
    if (trouble !== "尚无明显麻烦") node.visitorLedger.troubleCount = bounded(node.visitorLedger.troubleCount + 1, 9999);
    byNode.push({ nodeId: config.id, nodeName: config.name, choiceName: (view.choice && (view.choice.short || view.choice.label)) || config.short || config.name, visitors, income, grossIncome, upkeep, disturbance: snapshot.disturbance, trouble, animalUse: view.animalUse, attendanceReduced: !!view.attendanceReduced, attendanceReason: view.attendanceReason || "" });
  });
  if (!byNode.length) return null;
  const nodeIncome = byNode.reduce((sum, row) => sum + Math.max(0, Math.round(Number(row.income) || 0)), 0);
  const result = Object.assign({}, snapshot, {
    byNode,
    facilitySettlement,
    income: nodeIncome,
    animalUse: byNode.some((row) => row.animalUse),
    facilityAttendance: byNode.filter((row) => row.attendanceReason).map((row) => ({
      nodeId: row.nodeId,
      nodeName: row.choiceName || row.nodeName,
      visitors: row.visitors,
      reduced: !!row.attendanceReduced,
      reason: row.attendanceReason
    }))
  });
  const ecology = reserve.ecology || (reserve.ecology = {});
  const beforeWater = bounded(ecology.water);
  if (result.visitorWaterUse > 0) ecology.water = clamp(beforeWater - result.visitorWaterUse);
  recordEcologyFlow(reserve, "water", bounded(ecology.water) - beforeWater, "游客日结算", snapshot.day);
  result.visitorWater = { before: beforeWater, after: bounded(ecology.water), delta: bounded(ecology.water) - beforeWater, reason: result.visitorPressure };
  const fundBefore = bounded(reserve.fund);
  reserve.fund = Math.max(0, fundBefore + result.income);
  recordFundChange(reserve, fundBefore, reserve.fund, "游客运营收入", snapshot.day, "游客结算");
  const operations = development.operations;
  operations.lastSettlementDay = snapshot.day;
  operations.totalIncome = bounded(operations.totalIncome + result.income);
  applyChapterVisitorDelta(reserve, result.visitors, "visit", { skipToday: true });
  result.visitorAttrition = applyChapterVisitorDailyAttrition(reserve, result);
  if (result.trouble !== "尚无明显麻烦") operations.totalTrouble = bounded(operations.totalTrouble + 1, 9999);
  const influenceDelta = result.visitors > 0 ? (result.trouble === "尚无明显麻烦" ? 2 : -1) : 0;
  operations.influence = clamp(operations.influence + influenceDelta);
  const sameDay = Number((snapshot.previous || {}).day) === snapshot.day;
  const currentChapter = Math.max(1, Math.round(Number((reserve.progression || {}).stage || (reserve.progression || {}).displayChapter) || 1));
  const previousHostedChapter = Math.max(0, Math.round(Number((snapshot.previous || {}).hostedChapter) || 0));
  const recruitedToday = sameDay ? bounded((snapshot.previous || {}).recruitedVisitors) : 0;
  const recruitedIncome = sameDay ? bounded((snapshot.previous || {}).recruitedIncome) : 0;
  const recruitmentWaterUse = sameDay ? bounded((snapshot.previous || {}).recruitmentWaterUse, 999) : 0;
  const hostedToday = sameDay && previousHostedChapter === currentChapter
    ? bounded((snapshot.previous || {}).hostedVisitors)
    : 0;
  const chapterGained = sameDay ? bounded((snapshot.previous || {}).chapterGained) : bounded(result.visitors);
  operations.today = { day: snapshot.day, visitors: result.visitors, recruitedVisitors: recruitedToday, hostedVisitors: hostedToday, hostedChapter: currentChapter, recruitedIncome, income: result.income + recruitedIncome, survivalIncome: result.survivalIncome, buildingVisitors: snapshot.buildingVisitors, buildingIncome: snapshot.buildingIncome, buildingIncomeRaw: snapshot.buildingIncomeRaw, buildingIncomeCap: snapshot.buildingIncomeCap, buildingIncomeOverflow: snapshot.buildingIncomeOverflow, incomeCapOverflow: snapshot.incomeCapOverflow, buildingMaintenance: snapshot.buildingMaintenance, baseMaintenance: snapshot.baseMaintenance, visitorServiceMaintenance: snapshot.visitorServiceMaintenance, visitorWaterUse: snapshot.visitorWaterUse, recruitmentWaterUse, visitorWaterDelta: result.visitorWater.delta, ecologyScore: snapshot.nature.ecologyScore, safetyScore: snapshot.nature.safetyScore, speciesCount: snapshot.nature.speciesCount, animalTotal: snapshot.nature.animalTotal, tourismScore: snapshot.tourism.score, tourismRawScore: snapshot.tourism.rawScore, facilityImpact: snapshot.facilityImpact.label || "暂无设施联动", pairImpact: snapshot.pairSummary.label || "暂无设施配对", facilityActiveCount: snapshot.facilityImpact.activeFacilities || 0, facilityChanges: facilitySettlement.changes, rareAnimalEffect: snapshot.rareAnimalEffect, weather: snapshot.weather, trouble: result.trouble, chapterGained, facilityAttendance: result.facilityAttendance || [] };
  operations.history = operations.history.concat(Object.assign({}, operations.today)).slice(-14);
  if (result.visitors > 0) {
    const troubled = result.trouble !== "尚无明显麻烦";
    const progression = reserve.progression || {};
    const ecology = reserve.ecology || {};
    const chapter = Math.max(1, Math.round(Number(progression.displayChapter || progression.stage || 1)));
    const level = Math.max(1, Math.round(Number(progression.level || chapter)));
    const rotation = Math.floor(Math.max(0, Number(snapshot.day) - 1) / 3);
    const letter = {
      id: `visitor_${snapshot.day}_${rotation}`,
      day: snapshot.day,
      title: troubled ? `第${chapter}章·游线观察来信` : `第${chapter}章·游客感谢信`,
      body: troubled
        ? `今天的路线有些混乱，安全${Math.round(Number(reserve.safety) || 0)}、水源${Math.round(Number(ecology.water) || 0)}。向导一直在保护我们和动物，希望第${chapter}章的下一次回访能看见更安静的路。`
        : `谢谢你没有把动物赶到镜头前。第${chapter}章·等级${level}的今天，最难忘的是它们愿意自己走近水边；当前草场${Math.round(Number(ecology.grass) || 0)}。`,
      trouble: troubled,
      sourceKind: "visitor",
      chapter,
      level,
      rotation,
      contentKey: `visitor|${snapshot.day}|${rotation}|${chapter}|${level}|${troubled ? "trouble" : "thanks"}|${Math.round(Number(ecology.water) || 0)}|${Math.round(Number(ecology.grass) || 0)}`
    };
    const storyLetter = visitorStoryLetter(reserve, snapshot.day, operations.letters);
    if (storyLetter) operations.letters = operations.letters.concat(storyLetter).slice(-50);
    else if (!operations.letters.some(item => item.body === letter.body)) operations.letters = operations.letters.concat(letter).slice(-50);
  }
  reserve.reputation = clamp((reserve.reputation || 0) + (influenceDelta > 0 ? 1 : influenceDelta));
  return result;
}
function reserveDevelopmentAnimalTarget(species, reserve = {}, day = 1, views = null) {
  const snapshots = Array.isArray(views) ? views : reserveDevelopmentViews(reserve, day);
  const candidates = snapshots.map((view) => ({ node: nodeById((view.node || {}).id), view })).filter((entry) => entry.node && entry.node.species.includes(species) && entry.view.phase !== "available").sort((a, b) => Number(b.view.animalUse) - Number(a.view.animalUse));
  if (!candidates.length) return null;
  const target = candidates[0];
  const using = !!target.view.animalUse;
  const scatter = Math.abs(String(species || "").split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0));
  const angle = (scatter % 8) * (Math.PI / 4) + (using ? 0.18 : 0.9);
  const radius = using ? 0.055 : 0.09;
  return {
    x: target.node.x + Math.cos(angle) * radius,
    y: target.node.y + Math.sin(angle) * radius * 0.72,
    weight: using ? (["鹿", "狼"].includes(species) ? .32 : .22) : .12,
    state: using ? "using" : "avoiding",
    nodeId: target.node.id
  };
}
function selectRiverShallowsPlan(reserve = {}, choiceId, day = 1) { return selectReserveDevelopmentPlan(reserve, RIVER_SHALLOWS_NODE.id, choiceId, day); }
function completeRiverShallowsConstruction(reserve = {}, day = 1) { return completeReserveDevelopmentConstruction(reserve, RIVER_SHALLOWS_NODE.id, day); }
function buildRiverShallowsPlan(reserve = {}, choiceId, day = 1) { return buildReserveDevelopmentPlan(reserve, RIVER_SHALLOWS_NODE.id, choiceId, day); }
function riverShallowsView(reserve = {}, day = 1) { return reserveDevelopmentNodeView(reserve, RIVER_SHALLOWS_NODE.id, day); }
function riverShallowsAnimalTarget(species, reserve = {}, day = 1) {
  if (!RIVER_SHALLOWS_NODE.species.includes(species)) return null;
  const view = riverShallowsView(reserve, day);
  if (view.animalUse) return { x: RIVER_SHALLOWS_NODE.x - .035, y: RIVER_SHALLOWS_NODE.y + .035, weight: species === "鹿" ? .72 : .46, state: "using", nodeId: RIVER_SHALLOWS_NODE.id };
  if (view.phase !== "available") return { x: RIVER_SHALLOWS_NODE.x - .16, y: RIVER_SHALLOWS_NODE.y + .10, weight: species === "鹿" ? .42 : .25, state: "avoiding", nodeId: RIVER_SHALLOWS_NODE.id };
  return null;
}
module.exports = { BUILDING_OPERATION_UNLOCK_COST, BUILDING_AD_OPERATION_GRANT, BUILDING_MAX_LEVEL, FACILITY_RETENTION_CAP, BUILDING_COMBINED_INCOME_CAP, BUILDING_FACILITY_PAIRS, BUILDING_PAIR_LEVEL_CAPS, DEVELOPMENT_ROUTE_POLICIES, LATE_VISITOR_CHAPTER, developmentChapter, developmentVisitorScale, developmentVisitorCapacityScale, capLateChapterStoryVisitors, unlockDevelopmentBuildingStory, grantDevelopmentBuildingStoryAd, tourismProgression, TOURISM_THRESHOLDS, RESERVE_DEVELOPMENT_NODES, RESERVE_DEVELOPMENT_CHOICES, DEVELOPMENT_BUILDING_PROFILES, RIVER_SHALLOWS_NODE, RIVER_SHALLOWS_CHOICES, normalizeReserveDevelopment, nodeById, buildingProfileById, choicesForNode, choiceById, effectiveDevelopmentChoice, choiceAvailability, reservedDevelopmentMaterials, surplusTradeAmount, developmentBuildingView, upgradeDevelopmentBuilding, developmentBuildingStoryTask, completeDevelopmentBuildingStory, selectReserveDevelopmentPlan, buildReserveDevelopmentPlan, completeReserveDevelopmentConstruction, reserveDevelopmentNodeView, livingReserveEcologyFocus, livingReserveStoryReward, livingReserveFocusMetrics, reserveDevelopmentViews, reserveDevelopmentAnimalTarget, reserveOperationsSnapshot, settleReserveDevelopmentDay, selectRiverShallowsPlan, buildRiverShallowsPlan, completeRiverShallowsConstruction, riverShallowsView, riverShallowsAnimalTarget, buildingPairStatus, buildingPairSummary };
