const { ECOLOGY_THRESHOLDS } = require("./balanceConfig");
const { eventCategory, eventBusinessProfile } = require("./eventEconomy");
const {
  REAL_NATURE_EVENT_DEFINITIONS,
  realNatureTriggerType,
  chapterNeedsRequiredRealNature,
  markChapterRealNatureSeen
} = require("./realNatureEventSystem");
const OBSOLETE_GENERIC_NATURE_TYPES = Object.freeze([
  "wildfire", "flash_flood", "heatwave",
  "dust_storm", "cold_fog", "animal_water_conflict"
]);
const DISEASE_OUTBREAK_THRESHOLD = 50;
const BASE_WORLD_EVENTS = {
  poacher_ring: Object.freeze({
    title: "偷猎团伙越界",
    regionId: "river",
    visualKind: "poacher-route",
    recommendedAction: "antiPoacher",
    recommendLabel: "封锁偷猎路线",
    target: 3,
    days: 3,
    impact: "偷猎压力持续上升，动物迁移线会被切断。",
    startBody: "多组直线脚印同时越过边界，沙盘上已标出可疑路线。选择封锁路线，或派猎犬追查营地。",
    resolvedTitle: "偷猎路线已封锁",
    resolvedBody: "边界缺口重新闭合，可疑车辆撤离，动物开始恢复原有迁移线。",
    failedTitle: "偷猎团伙突破边界",
    failedBody: "处置窗口关闭，迁移线受到冲击，偷猎压力与边界风险同时上升。",
    responses: Object.freeze([
      Object.freeze({ action: "antiPoacher", label: "封锁路线", gain: 2, preview: "推进快，需要报警器并承担正面对抗风险。" }),
      Object.freeze({ action: "houndScout", label: "猎犬追踪", gain: 1, preview: "较稳妥，先确认营地和撤离方向。" })
    ])
  }),
  snare_line: Object.freeze({
    title: "密集套索带",
    regionId: "rocks",
    visualKind: "snare-field",
    recommendedAction: "houndScout",
    recommendLabel: "清查套索带",
    target: 3,
    days: 3,
    impact: "动物会绕开岩地，巡护盲区和受伤风险持续扩大。",
    startBody: "岩地边缘出现成排钢丝套索。沙盘已显示套索密集区，可先让猎犬划定安全线，也可直接组织清除。",
    resolvedTitle: "套索带已清除",
    resolvedBody: "危险钢丝被回收，岩地区域重新开放，动物不再被迫绕行。",
    failedTitle: "套索伤害扩大",
    failedBody: "未清除的套索继续伤害动物，岩地成为新的巡护盲区。",
    responses: Object.freeze([
      Object.freeze({ action: "houndScout", label: "划定安全线", gain: 2, preview: "先定位全部套索，降低巡护员和动物受伤风险。" }),
      Object.freeze({ action: "antiPoacher", label: "强行清除", gain: 1, preview: "立即拆除眼前套索，但可能遗漏隐藏点。" })
    ])
  }),
  water_contamination: Object.freeze({
    title: "水源污染扩散",
    regionId: "river",
    visualKind: "contaminated-water",
    recommendedAction: "intervention",
    recommendLabel: "取样并隔离水源",
    target: 3,
    days: 3,
    impact: "污染会压低可用水源，并快速推高疾病风险。",
    startBody: "下游水面出现异常油膜与死鱼。沙盘已标出污染带，可立即取样隔离，也可封闭并修复饮水点。",
    resolvedTitle: "污染源已被隔离",
    resolvedBody: "异常水体停止扩散，替代饮水点开放，疾病风险开始回落。",
    failedTitle: "污染进入主水系",
    failedBody: "多个饮水点暂时关闭，疾病风险和社区压力同时上升。",
    responses: Object.freeze([
      Object.freeze({ action: "intervention", label: "取样隔离", gain: 2, preview: "快速锁定污染源，需要医疗补给。" }),
      Object.freeze({ action: "habitat", label: "封闭饮水点", gain: 1, preview: "先保护动物，再逐步修复水源。" })
    ])
  }),
  community_blockade: Object.freeze({
    title: "社区阻断迁徙通道",
    regionId: "center",
    visualKind: "road-blockade",
    recommendedAction: "habitat",
    recommendLabel: "划出临时通道",
    target: 3,
    days: 3,
    impact: "社区支持继续下降，动物迁徙与保护基金收入都会受影响。",
    startBody: "施工车辆堵住了传统迁徙通道。沙盘已显示阻断位置，可划出临时生态通道，或联合巡查协商绕行。",
    resolvedTitle: "迁徙通道重新开放",
    resolvedBody: "临时通道和警示线生效，社区愿意继续配合保护区工作。",
    failedTitle: "迁徙冲突升级",
    failedBody: "动物被迫穿越居民区，社区支持与保护基金收入同时承压。",
    responses: Object.freeze([
      Object.freeze({ action: "habitat", label: "划临时通道", gain: 2, preview: "直接恢复迁徙，需要野外工具包。" }),
      Object.freeze({ action: "houndScout", label: "联合巡查", gain: 1, preview: "先确认绕行路线并积累协商线索。" })
    ])
  }),
  visitor_conflict: Object.freeze({
    source: "visitor",
    title: "游客现场需要调节",
    regionId: "river",
    visualKind: "visitor-conflict",
    recommendedAction: "visitorAdjust",
    recommendLabel: "调节现场",
    target: 1,
    days: 1,
    impact: "游客与动物路线发生短时冲突，游客满意度和当日收入会受到影响。",
    startBody: "向导报告游客现场出现拥挤或越线。请用射箭判定现场结果：3点及以上正向稳定游线，1–2点负向会引发投诉。",
    resolvedTitle: "游客现场已稳定",
    resolvedBody: "游客回到观察线，动物重新接近原来的活动区域。",
    failedTitle: "游客冲突引发投诉",
    failedBody: "射箭判定未稳住现场，部分游客离场，今日收入与口碑受到影响。",
    responses: Object.freeze([
      Object.freeze({ action: "visitorAdjust", label: "射箭调节现场", gain: 1, preview: "射箭得分 ≥3 正向，1–2 点负向并引发投诉。不得改用猎犬巡逻。" })
    ])
  }),
  disease_outbreak: Object.freeze({
    title: "疾病集中爆发",
    regionId: "meadow",
    visualKind: "disease-zone",
    recommendedAction: "intervention",
    recommendLabel: "控制疾病扩散",
    target: 3,
    days: 3,
    impact: "疾病风险继续升高，动物会避开聚集的水点和草场。",
    startBody: "水边和草场同时出现病迹，沙盘已标出扩散范围。执行生态干预，把病源从聚集路线上隔开。",
    resolvedTitle: "疾病扩散已控制",
    resolvedBody: "隔离和清理生效，动物开始回到原来的饮水与取食路线。",
    failedTitle: "疾病继续扩散",
    failedBody: "处置窗口关闭，疾病风险和群体稳定度一起下降。",
    responses: Object.freeze([
      Object.freeze({ action: "intervention", label: "生态干预", gain: 2, preview: "隔离病源并清理聚集路线，需要医疗补给。" })
    ])
  }),
  neighbor_animal_dispute: Object.freeze({
    source: "neighbor",
    title: "外区转运幼体归属争议",
    regionId: "north",
    visualKind: "neighbor-dispute",
    recommendedAction: "houndScout",
    recommendLabel: "核对脚印与记录",
    target: 3,
    days: 3,
    impact: "若无法确认来源，幼体关系、跨区信任与迁徙协作都会受损。",
    startBody: "邻区转运队带走了一只落单幼体，双方记录却不一致。可核对脚印，也可先安置并进行生态鉴别。",
    resolvedTitle: "幼体身份已确认",
    resolvedBody: "路线记录与照护档案完成比对，幼体回到正确种群，邻区恢复协作。",
    failedTitle: "跨区幼体争议升级",
    failedBody: "幼体暂时无法归群，跨区信任和本地种群稳定度下降。",
    responses: Object.freeze([
      Object.freeze({ action: "houndScout", label: "核对脚印", gain: 2, preview: "用气味线和兽道记录确认幼体来源。" }),
      Object.freeze({ action: "intervention", label: "先行安置", gain: 1, preview: "先稳定幼体状态，再等待双方档案核验。" })
    ])
  })
};
const WORLD_EVENT_DEFINITIONS = Object.freeze(Object.fromEntries(
  Object.entries(Object.assign({}, BASE_WORLD_EVENTS, require("./reserveEventCatalog"), REAL_NATURE_EVENT_DEFINITIONS))
    .filter(([type]) => !OBSOLETE_GENERIC_NATURE_TYPES.includes(type))
    .map(([type, definition]) => {
    const category = eventCategory(Object.assign({ type }, definition));
    const business = eventBusinessProfile({ type });
    return [type, Object.freeze(Object.assign({}, definition, {
      type, category: category.id, categoryLabel: category.label,
      source: definition.source || category.id,
      business, economicChain: category.chain,
      responses: Object.freeze((definition.responses || []).slice(0, 1).map((item) => Object.freeze(item)))
    }))];
  })
));
function worldEventDefinition(type) {
  return WORLD_EVENT_DEFINITIONS[type] || null;
}
function responseGain(active = {}, action = "") {
  const definition = worldEventDefinition(active.type);
  const response = definition && definition.responses.find((item) => item.action === action);
  return response ? response.gain : 0;
}
function hasVisitorTrouble(today = {}) {
  const trouble = String((today || {}).trouble || "").trim();
  if (!trouble || trouble === "尚无明显麻烦") return false;
  // Old saves and platform-specific settlement paths use several equivalent
  // resolved phrases.  Treat all of them as completed so they cannot
  // regenerate a visitor task after the incident was already handled.
  return !/(?:已回到观察线|现场(?:已|已经)?(?:妥善)?恢复|(?:已|已经)(?:妥善)?处理|处理完成|恢复完成|现场已稳定)/.test(trouble);
}
function isNeighborEventType(type = "") {
  return String(type || "").startsWith("neighbor_") || type === "neighbor_animal_dispute";
}
const VISITOR_ARCHERY_THRESHOLD = 3;
const NEIGHBOR_EXCHANGE_SELF_MIN = 5;
const NEIGHBOR_EXCHANGE_FAIR_MIN = 3;
const VISITOR_ARCHERY_EVENTS = Object.freeze([
  "visitor_conflict",
  "visitor_litter",
  "visitor_queue"
]);
function isVisitorArcheryEvent(type = "") {
  return VISITOR_ARCHERY_EVENTS.includes(String(type || ""));
}
function visitorArcherySuccess(roll) {
  return Math.max(1, Math.min(6, Math.round(Number(roll) || 0))) >= VISITOR_ARCHERY_THRESHOLD;
}
function isNeighborExchangeEvent(type = "") {
  return String(type || "") === "neighbor_exchange";
}
function neighborExchangeAdvantage(roll) {
  const score = Math.max(1, Math.min(6, Math.round(Number(roll) || 0)));
  if (score >= NEIGHBOR_EXCHANGE_SELF_MIN) return "self";
  if (score >= NEIGHBOR_EXCHANGE_FAIR_MIN) return "fair";
  return "neighbor";
}
function reserveChapterNumber(reserve = {}) {
  const progression = reserve.progression || {};
  return Math.max(1, Math.round(Number(progression.stage || progression.displayChapter || 1) || 1));
}
function lateChapterRealNatureChance(chapter = 1) {
  if (chapter < 3) return 0;
  return Math.min(0.65, (0.20 + (chapter - 3) * 0.025) * 1.25);
}
function lateChapterRealNatureWeight(chapter = 1) {
  if (chapter < 3) return 2;
  return Math.min(5.75, (2.6 + (chapter - 3) * 0.16) * 1.25);
}
function neighborEventChance(chapter = 1) {
  if (chapter < 3) return 0.08;
  return Math.min(0.24, 0.16 + (chapter - 3) * 0.008);
}
function neighborIdleWeight(chapter = 1, base = 0.65) {
  if (chapter < 3) return base;
  return Math.min(1.8, base * (1.55 + Math.min(8, chapter - 3) * 0.06));
}
function chapterThemePending(reserve = {}) {
  const chapter = reserveChapterNumber(reserve);
  if (chapter < 1 || chapter > 18) return false;
  const saved = reserve.chapterTheme || {};
  const savedChapter = Math.max(0, Math.round(Number(saved.chapter) || 0));
  if (savedChapter > 0 && savedChapter !== chapter) return true;
  if (saved.completed === true || savedChapter === 0) return false;
  return Math.max(0, Math.round(Number(saved.step) || 0)) < 3;
}
function extraRealNatureAllowed(reserve = {}) {
  if (chapterNeedsRequiredRealNature(reserve)) return true;
  return !chapterThemePending(reserve);
}
function worldEventTriggerType(reserve = {}, seasonState = {}, random = Math.random) {
  if (chapterNeedsRequiredRealNature(reserve)) return realNatureTriggerType(reserve);
  const ecology = reserve.ecology || {};
  const core = reserve.coreResources || {};
  const season = seasonState.name || "雨季";
  const chapter = reserveChapterNumber(reserve);
  const poacher = Number(reserve.poacherPressure) || 0;
  const water = Number(ecology.water) || 0;
  const grass = Number(ecology.grass) || 0;
  const disease = Number(ecology.disease) || 0;
  const visitorToday = ((((reserve.development || {}).operations || {}).today) || {});
  const social = reserve.social || {};
  const allowExtraReal = extraRealNatureAllowed(reserve);
  const lateChance = allowExtraReal ? lateChapterRealNatureChance(chapter) : 0;
  const reservedReal = lateChance > 0 ? realNatureTriggerType(reserve) : null;
  if (reservedReal && random() < lateChance) return reservedReal;
  if (poacher >= 65) return "poacher_ring";
  if (disease >= DISEASE_OUTBREAK_THRESHOLD) return "disease_outbreak";
  if (hasVisitorTrouble(visitorToday) && random() < 0.62) return "visitor_conflict";
  if ((social.pressure || 0) > 0 && random() < neighborEventChance(chapter)) return "neighbor_animal_dispute";
  if (water <= ECOLOGY_THRESHOLDS.lowWater && disease >= ECOLOGY_THRESHOLDS.earlyDisease && random() < 0.28) return "water_contamination";
  if (water <= ECOLOGY_THRESHOLDS.criticalWater && random() < 0.16) return "water_contamination";
  if (poacher >= 48 && random() < 0.15) return "snare_line";
  if (Number.isFinite(core.community) && core.community <= 30 && random() < 0.15) return "community_blockade";
  if ((visitorToday.visitors || 0) + (visitorToday.recruitedVisitors || 0) >= 80 && random() < .15) return random() < .5 ? "visitor_litter" : "visitor_queue";
  if ((social.pressure || 0) > 0 || ((reserve.progression || {}).level || 1) >= 2) {
    if (random() < neighborEventChance(chapter)) return water < ECOLOGY_THRESHOLDS.lowWater ? "neighbor_water" : grass < ECOLOGY_THRESHOLDS.earlyGrass ? "neighbor_exchange" : "neighbor_migration";
  }
  return allowExtraReal ? realNatureTriggerType(reserve) : null;
}
function worldEventIdleTriggerType(reserve = {}, seasonState = {}, random = Math.random) {
  if (chapterNeedsRequiredRealNature(reserve)) return realNatureTriggerType(reserve);
  const ecology = reserve.ecology || {};
  const season = seasonState.name || "雨季";
  const chapter = reserveChapterNumber(reserve);
  const poacher = Number(reserve.poacherPressure) || 0;
  const water = Number(ecology.water) || 0;
  const grass = Number(ecology.grass) || 0;
  const disease = Number(ecology.disease) || 0;
  const social = reserve.social || {};
  const allowExtraReal = extraRealNatureAllowed(reserve);
  const pool = [];
  const push = (type, weight) => {
    if (type && weight > 0 && WORLD_EVENT_DEFINITIONS[type]) pool.push([type, weight]);
  };
  if (poacher >= 52) push("poacher_ring", 1.6);
  if (poacher >= 38) push("snare_line", 1.2);
  if (disease >= DISEASE_OUTBREAK_THRESHOLD) push("disease_outbreak", 2.4);
  if (allowExtraReal) {
    push(realNatureTriggerType(reserve, Date.now(), { ignoreQuiet: true }), lateChapterRealNatureWeight(chapter));
  }
  if (water <= ECOLOGY_THRESHOLDS.lowWater && disease >= ECOLOGY_THRESHOLDS.earlyDisease) push("water_contamination", 1.45);
  else if (water <= ECOLOGY_THRESHOLDS.criticalWater || disease >= ECOLOGY_THRESHOLDS.warningDisease) push("water_contamination", 1.05);
  if ((social.pressure || 0) > 0) push("neighbor_animal_dispute", neighborIdleWeight(chapter, 0.72));
  if (hasVisitorTrouble((((reserve.development || {}).operations || {}).today || {}))) {
    if (chapter < 7) return "visitor_conflict";
    push("visitor_conflict", 1.35);
  }
  const today = (((reserve.development || {}).operations || {}).today) || {};
  if ((today.visitors || 0) + (today.recruitedVisitors || 0) > 0) {
    push("visitor_litter", .9);
    if ((today.visitors || 0) + (today.recruitedVisitors || 0) >= 80) push("visitor_queue", 1.05);
  }
  if ((social.pressure || 0) > 0 || ((reserve.progression || {}).level || 1) >= 2) {
    push("neighbor_water", water < ECOLOGY_THRESHOLDS.earlyWater ? neighborIdleWeight(chapter, .85) : 0);
    push("neighbor_exchange", neighborIdleWeight(chapter, grass < 70 ? .8 : .3));
    push("neighbor_migration", neighborIdleWeight(chapter, .65));
  }
  if (!pool.length && allowExtraReal) {
    push(realNatureTriggerType(reserve, Date.now(), { ignoreQuiet: true }), 1);
  }
  const total = pool.reduce((sum, item) => sum + item[1], 0);
  if (total <= 0) return null;
  let roll = random() * total;
  for (let i = 0; i < pool.length; i += 1) {
    roll -= pool[i][1];
    if (roll <= 0) return pool[i][0];
  }
  return pool[0][0];
}
module.exports = {
  WORLD_EVENT_DEFINITIONS,
  worldEventDefinition,
  worldEventTriggerType,
  worldEventIdleTriggerType,
  reserveChapterNumber,
  chapterNeedsRequiredRealNature,
  markChapterRealNatureSeen,
  lateChapterRealNatureChance,
  lateChapterRealNatureWeight,
  neighborEventChance,
  neighborIdleWeight,
  chapterThemePending,
  extraRealNatureAllowed,
  isNeighborEventType,
  isVisitorArcheryEvent,
  visitorArcherySuccess,
  VISITOR_ARCHERY_THRESHOLD,
  isNeighborExchangeEvent,
  neighborExchangeAdvantage,
  NEIGHBOR_EXCHANGE_SELF_MIN,
  NEIGHBOR_EXCHANGE_FAIR_MIN,
  responseGain,
  hasVisitorTrouble,
  OBSOLETE_GENERIC_NATURE_TYPES
};
