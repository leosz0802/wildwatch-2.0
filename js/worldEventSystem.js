const { ECOLOGY_THRESHOLDS } = require("./balanceConfig");
const { eventCategory, eventBusinessProfile } = require("./eventEconomy");
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
  disease_outbreak: Object.freeze({
    title: "疾病集中爆发",
    regionId: "meadow",
    visualKind: "disease-zone",
    recommendedAction: "intervention",
    recommendLabel: "隔离病征区域",
    target: 3,
    days: 3,
    impact: "疾病会压低动物种群，并降低保护区稳定度。",
    startBody: "潮湿草场出现集中病征。沙盘已圈出异常活动区，可进行隔离救治，或先修复栖息地降低传播。",
    resolvedTitle: "疾病传播已控制",
    resolvedBody: "集中病征得到控制，幼体与老弱动物的风险开始回落。",
    failedTitle: "疾病扩散至多个区域",
    failedBody: "处置窗口已经错过，多个物种将承受种群压力。",
    responses: Object.freeze([
      Object.freeze({ action: "intervention", label: "隔离救治", gain: 2, preview: "最快控制病征，需要医疗补给。" }),
      Object.freeze({ action: "habitat", label: "修复栖息地", gain: 1, preview: "改善环境，减慢后续传播。" })
    ])
  }),
  wildfire: Object.freeze({
    title: "旱季雷火蔓延",
    regionId: "meadow",
    visualKind: "wildfire",
    recommendedAction: "habitat",
    recommendLabel: "开辟防火隔离带",
    target: 3,
    days: 3,
    impact: "火线会消耗草场和水源，并迫使动物离开核心区。",
    startBody: "干草被雷火点燃，烟带正向核心草场推进。沙盘已显示火线，可开辟隔离带，或抢救受困动物。",
    resolvedTitle: "山火已被截断",
    resolvedBody: "隔离带阻断火线，受困动物撤离，烧毁区域将逐日恢复。",
    failedTitle: "火线烧入核心草场",
    failedBody: "草场与水源同时受损，动物被迫迁出，后续修复成本上升。",
    responses: Object.freeze([
      Object.freeze({ action: "habitat", label: "修隔离带", gain: 2, preview: "快速截断火线，需要野外工具包。" }),
      Object.freeze({ action: "intervention", label: "抢救动物", gain: 1, preview: "优先降低伤亡；持续救助可完成撤离，烧区仍需修复。", resolvedTitle: "受困动物已撤离", resolvedBody: "受困动物已撤出火线，游客绕行安全区；烧毁草场仍需后续修复。" })
    ])
  }),
  flash_flood: Object.freeze({
    title: "雨季山洪突发",
    regionId: "river",
    visualKind: "flash-flood",
    recommendedAction: "habitat",
    recommendLabel: "疏导洪水通道",
    target: 3,
    days: 3,
    impact: "洪水会冲毁草场、设施和固定迁移路线。",
    startBody: "上游水位突然暴涨，漂木堵塞河道。沙盘已显示漫水区，可疏通河道，也可先撤离沿岸动物。",
    resolvedTitle: "山洪通道已疏开",
    resolvedBody: "堵塞物被清理，沿岸动物撤至高地，主河道恢复泄洪。",
    failedTitle: "洪水冲入低地",
    failedBody: "低地草场被淹，固定迁移路线中断，设施修复压力上升。",
    responses: Object.freeze([
      Object.freeze({ action: "habitat", label: "疏通河道", gain: 2, preview: "从源头降低水位，需要野外工具包。" }),
      Object.freeze({ action: "houndScout", label: "撤离动物", gain: 1, preview: "确认高地路线，连续疏导可完成撤离。", resolvedTitle: "沿岸撤离已完成", resolvedBody: "动物和游客转移到高地，低地游线改道；被淹草场仍需修复。" })
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
      startBody: "向导报告游客现场出现拥挤或越线。请直接调节现场并生成点数，3点及以上即可稳定游线。",
    resolvedTitle: "游客现场已稳定",
    resolvedBody: "游客回到观察线，动物重新接近原来的活动区域。",
    failedTitle: "游客冲突引发投诉",
    failedBody: "部分游客离场，今日收入与现场口碑受到影响。",
    responses: Object.freeze([
      Object.freeze({ action: "visitorAdjust", label: "调节现场", gain: 1, preview: "生成点数：3点及以上成功，低于3点会有游客离场。" })
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
  Object.entries(Object.assign({}, BASE_WORLD_EVENTS, require("./reserveEventCatalog"))).map(([type, definition]) => {
    const category = eventCategory(Object.assign({ type }, definition));
    const business = eventBusinessProfile({ type });
    return [type, Object.freeze(Object.assign({}, definition, {
      category: category.id, categoryLabel: category.label,
      source: definition.source || category.id,
      business, economicChain: category.chain,
      responses: Object.freeze(definition.responses.map((item) => Object.freeze(item)))
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
  return !/已回到观察线|现场恢复|已处理/.test(trouble);
}

// Neighbor events are deliberately sparse: they represent coordination with
// another reserve and should read as a meaningful interruption, not a stack of
// map badges. Keep the check in one place so action and idle scheduling agree.
function isNeighborEventType(type = "") {
  return String(type || "").startsWith("neighbor_") || type === "neighbor_animal_dispute";
}

function worldEventTriggerType(reserve = {}, seasonState = {}, random = Math.random) {
  const ecology = reserve.ecology || {};
  const core = reserve.coreResources || {};
  const season = seasonState.name || "雨季";
  const poacher = Number(reserve.poacherPressure) || 0;
  const water = Number(ecology.water) || 0;
  const grass = Number(ecology.grass) || 0;
  const disease = Number(ecology.disease) || 0;
  const visitorToday = ((((reserve.development || {}).operations || {}).today) || {});
  const social = reserve.social || {};
  if (poacher >= 65) return "poacher_ring";
  if (disease >= ECOLOGY_THRESHOLDS.criticalDisease) return "disease_outbreak";
  if (hasVisitorTrouble(visitorToday) && random() < 0.62) return "visitor_conflict";
  if ((social.pressure || 0) > 0 && random() < 0.08) return "neighbor_animal_dispute";
  if (season === "旱季" && water <= ECOLOGY_THRESHOLDS.lowWater && grass <= 58 && random() < 0.18) return "wildfire";
  if (season === "雨季" && water >= 86 && random() < 0.15) return "flash_flood";
  if (water <= ECOLOGY_THRESHOLDS.lowWater && disease >= ECOLOGY_THRESHOLDS.earlyDisease && random() < 0.18) return "water_contamination";
  if (poacher >= 48 && random() < 0.15) return "snare_line";
  if (Number.isFinite(core.community) && core.community <= 30 && random() < 0.15) return "community_blockade";
  if ((visitorToday.visitors || 0) + (visitorToday.recruitedVisitors || 0) >= 80 && random() < .15) return random() < .5 ? "visitor_litter" : "visitor_queue";
  if (water < ECOLOGY_THRESHOLDS.earlyWater && Object.values(ecology.herbivores || {}).reduce((a, b) => a + b, 0) > 100 && random() < .15) return "animal_water_conflict";
  if ((social.pressure || 0) > 0 || ((reserve.progression || {}).level || 1) >= 2) {
    if (random() < .08) return water < ECOLOGY_THRESHOLDS.lowWater ? "neighbor_water" : grass < ECOLOGY_THRESHOLDS.earlyGrass ? "neighbor_exchange" : "neighbor_migration";
  }
  return null;
}

function worldEventIdleTriggerType(reserve = {}, seasonState = {}, random = Math.random) {
  const ecology = reserve.ecology || {};
  const season = seasonState.name || "雨季";
  const poacher = Number(reserve.poacherPressure) || 0;
  const water = Number(ecology.water) || 0;
  const grass = Number(ecology.grass) || 0;
  const disease = Number(ecology.disease) || 0;
  const social = reserve.social || {};
  const pool = [];
  const push = (type, weight) => {
    if (weight > 0) pool.push([type, weight]);
  };

  if (poacher >= 52) push("poacher_ring", 1.6);
  if (poacher >= 38) push("snare_line", 1.2);
  if (disease >= ECOLOGY_THRESHOLDS.earlyDisease) push("disease_outbreak", 1.7);
  if (season === "旱季" && water <= ECOLOGY_THRESHOLDS.earlyWater && grass <= 64) push("wildfire", 1.5);
  if (season === "雨季" && water >= 78) push("flash_flood", 1.4);
  if (water <= ECOLOGY_THRESHOLDS.lowWater && disease >= ECOLOGY_THRESHOLDS.warningDisease) push("water_contamination", 1.25);
  if ((social.pressure || 0) > 0) push("neighbor_animal_dispute", 0.72);
  if (hasVisitorTrouble((((reserve.development || {}).operations || {}).today || {}))) push("visitor_conflict", 0.85);
  const today = (((reserve.development || {}).operations || {}).today) || {};
  if ((today.visitors || 0) + (today.recruitedVisitors || 0) > 0) {
    push("visitor_litter", .9);
    if ((today.visitors || 0) + (today.recruitedVisitors || 0) >= 80) push("visitor_queue", 1.05);
  }
  if (water < ECOLOGY_THRESHOLDS.earlyWater) push("animal_water_conflict", .7);
  if ((social.pressure || 0) > 0 || ((reserve.progression || {}).level || 1) >= 2) {
    push("neighbor_water", water < ECOLOGY_THRESHOLDS.earlyWater ? .85 : 0);
    push("neighbor_exchange", grass < 70 ? .8 : .3);
    push("neighbor_migration", .65);
  }

  if (!pool.length) {
    if (season === "旱季") {
      push("wildfire", 1);
      push("snare_line", 0.84);
    } else if (season === "雨季") {
      push("flash_flood", 1);
      push("water_contamination", 0.82);
    } else {
      push("disease_outbreak", 1);
      push("snare_line", 0.82);
    }
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
  isNeighborEventType,
  responseGain,
  hasVisitorTrouble
};
