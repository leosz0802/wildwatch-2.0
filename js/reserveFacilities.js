const ROUTE_KITS = {
  enforcement: { id: "enforcement", label: "边界执法", short: "执法", color: "#98763f", atlasIndex: 0, effect: { safety: 3, poacherPressure: -2 } },
  ecology: { id: "ecology", label: "生态恢复", short: "生态", color: "#5f8b6f", atlasIndex: 1, effect: { ecologyScore: 3, water: 2 } },
  research: { id: "research", label: "科研监测", short: "科研", color: "#78969a", atlasIndex: 2, effect: { water: 1, grass: 1 } },
  community: { id: "community", label: "社区共生", short: "共生", color: "#817869", atlasIndex: 3, effect: { reputation: 3, stability: 2 } }
};
const { BALANCE_V2 } = require("./balanceConfig");

const FACILITIES = [
  { id: "old_patrol_post", caseId: "case_1", chapter: 1, name: "旧巡护站", short: "巡护站", icon: "reserve_level", x: 0.30, y: 0.31, buildCosts: [70, 100], specializeCost: 90, buildEffects: [{ safety: 1 }, { enforcement: 2, safety: 1 }], routes: [{ id: "enforcement", name: "巡护灯网", note: "夜巡灯和边界岗形成连续防线。" }, { id: "research", name: "足迹监测台", note: "把日常巡线变成可追溯数据。" }, { id: "community", name: "社区协作岗", note: "让周边居民成为最早的目击者。" }], purpose: "旧巡线的起点；修复后重新点亮夜间巡护灯。" },
  { id: "hydrology_station", caseId: "case_2", chapter: 2, name: "河湾水文站", short: "水文站", icon: "water", x: 0.72, y: 0.34, buildCosts: [100, 135], specializeCost: 120, buildEffects: [{ water: 2 }, { ecologyScore: 2, water: 1 }], routes: [{ id: "ecology", name: "河道恢复渠", note: "雨季蓄水、旱季保留动物饮水点。" }, { id: "research", name: "水文传感阵列", note: "持续记录季节、水位和疾病风险。" }, { id: "community", name: "共享水井", note: "在人与动物之间建立明确用水规则。" }], purpose: "记录旱雨季水位；修复后能看见水路重新流动。" },
  { id: "intel_room", caseId: "case_3", chapter: 3, name: "跨区情报室", short: "情报室", icon: "intel", x: 0.18, y: 0.57, buildCosts: [140, 180], specializeCost: 150, buildEffects: [{ poacherPressure: -1 }, { poacherPressure: -2, enforcement: 1 }], routes: [{ id: "enforcement", name: "联防指挥台", note: "把跨区线索快速变成执法行动。" }, { id: "research", name: "证据实验室", note: "保存样本并还原运输链细节。" }, { id: "community", name: "社区热线", note: "让匿名消息安全抵达保护区。" }], purpose: "拼接车辙、货签和暗号；修复后接入联合情报线。" },
  { id: "migration_watch", caseId: "case_4", chapter: 4, name: "迁徙观测站", short: "观测站", icon: "migration", x: 0.77, y: 0.62, buildCosts: [185, 235], specializeCost: 190, buildEffects: [{ ecologyScore: 1, reputation: 1 }, { ecologyScore: 2, stability: 1 }], routes: [{ id: "ecology", name: "迁徙走廊", note: "让象群和归来动物有一条安静的路。" }, { id: "research", name: "定位中继站", note: "把失联项圈重新接入观测网络。" }, { id: "community", name: "共护驿站", note: "迁徙季由社区共同守住关键路口。" }], purpose: "守望旧迁徙路；修复后重新记录象群与归来动物。" },
  { id: "governance_hall", caseId: "case_5", chapter: 5, name: "共同治理厅", short: "治理厅", icon: "reserve_prosperity", x: 0.52, y: 0.47, buildCosts: [240, 300], specializeCost: 240, buildEffects: [{ reputation: 2 }, { business: 2, stability: 2 }], routes: [{ id: "enforcement", name: "执法仲裁席", note: "明确保护红线和跨区追责规则。" }, { id: "ecology", name: "生态议事厅", note: "让长期承载力高于短期收益。" }, { id: "community", name: "共同契约厅", note: "让保护区成为所有参与者的承诺。" }], purpose: "让社区、巡护与研究共同决定森林的长期规则。" },
  { id: "guardian_memorial", caseId: "hidden", chapter: 1, name: "守护者纪念墙", short: "纪念墙", icon: "eye", x: 0.46, y: 0.20, buildCosts: [110, 150], specializeCost: 120, buildEffects: [{ reputation: 1 }, { stability: 2, reputation: 1 }], routes: [{ id: "research", name: "森林记忆库", note: "保存名字、日期和被重新理解的证据。" }, { id: "ecology", name: "生命花园", note: "让离开与归来的生命都留下位置。" }, { id: "community", name: "守护者信箱", note: "把动物、社区和守护者的信留在这里。" }], purpose: "保存普通日子、动物名字和守护者回信。" }
];

// V2 建设曲线集中覆盖旧表，保留设施叙事、坐标与存档 ID 不变。
const FACILITY_COSTS_V2 = {
  old_patrol_post: { buildCosts: [100, 150], specializeCost: 200 },
  hydrology_station: { buildCosts: [150, 220], specializeCost: 280 },
  intel_room: { buildCosts: [220, 300], specializeCost: 380 },
  migration_watch: { buildCosts: [300, 400], specializeCost: 500 },
  governance_hall: { buildCosts: [400, 520], specializeCost: 650 },
  guardian_memorial: { buildCosts: [240, 320], specializeCost: 420 }
};
FACILITIES.forEach((facility) => Object.assign(facility, FACILITY_COSTS_V2[facility.id]));

function facilityById(id) {
  return FACILITIES.find((facility) => facility.id === id) || null;
}

function facilityByCaseId(caseId) {
  return FACILITIES.find((facility) => facility.caseId === caseId) || null;
}

function normalizeFacilityConstruction(reserve) {
  if (!reserve || typeof reserve !== "object") return { version: 1, sites: {} };
  const source = reserve.facilityConstruction || {};
  const sourceSites = source.sites || {};
  const sites = {};
  FACILITIES.forEach((facility) => {
    const saved = sourceSites[facility.id] || {};
    const specialization = facility.routes.some((route) => route.id === saved.specialization) ? saved.specialization : null;
    const buildSteps = Math.max(0, Math.min(2, Math.round(Number(saved.buildSteps) || 0)));
    let buildStage = Math.max(0, Math.min(3, Math.round(Number(saved.buildStage) || 0)));
    if (buildSteps >= 2) buildStage = Math.max(2, buildStage);
    if (specialization) buildStage = 3;
    sites[facility.id] = {
      buildStage,
      buildSteps: buildStage >= 2 ? 2 : buildSteps,
      collectionStage: Math.max(0, Math.min(3, Math.round(Number(saved.collectionStage) || 0))),
      specialization,
      totalInvested: Math.max(0, Math.round(Number(saved.totalInvested) || 0)),
      lastBuiltDay: Math.max(0, Math.round(Number(saved.lastBuiltDay) || 0))
    };
  });
  reserve.facilityConstruction = { version: 1, sites };
  return reserve.facilityConstruction;
}

function facilityNarrativeState(state, facility) {
  const world = (state && state.world) || {};
  const collection = world.collection || {};
  const caseState = ((collection.cases || {})[facility.caseId]) || { itemIds: [] };
  const found = Array.from(new Set(caseState.itemIds || [])).length;
  const repaired = facility.caseId === "hidden" ? !!((collection.worldFlags || {}).forest_remembers) : !!caseState.ending;
  const collectionStage = repaired || found >= (facility.caseId === "hidden" ? 5 : 8) ? 3 : found >= 6 ? 2 : found >= 3 ? 1 : 0;
  return { caseState, repaired, found, collectionStage };
}

function routeChoice(facility, routeId) {
  const choice = (facility.routes || []).find((route) => route.id === routeId);
  if (!choice) return null;
  return Object.assign({}, ROUTE_KITS[choice.id], choice);
}

function effectText(effect) {
  const labels = { safety: "安全", poacherPressure: "偷猎", ecologyScore: "生态", water: "水源", grass: "草场", business: "经营", reputation: "声誉", stability: "稳定", enforcement: "执法" };
  return Object.keys(effect || {}).map((key) => `${labels[key] || key}${effect[key] > 0 ? "+" : ""}${effect[key]}`).join(" · ");
}

function facilityStates(state) {
  const world = (state && state.world) || {};
  const reserve = world.reserve || {};
  const collection = world.collection || {};
  const level = Math.max(1, Math.min(5, Math.round((((reserve.progression || {}).level) || 1))));
  const construction = normalizeFacilityConstruction(reserve);
  return FACILITIES.map((facility) => {
    const narrative = facilityNarrativeState(state, facility);
    const found = narrative.found;
    const hiddenLeadSeen = facility.caseId === "hidden" && (
      found > 0
      || !!((collection.worldFlags || {}).forest_remembers)
      || (collection.leads || []).some((lead) => lead.caseId === "hidden")
    );
    const concealed = facility.caseId === "hidden" && !hiddenLeadSeen;
    const available = !concealed && (facility.caseId === "hidden" || level >= facility.chapter);
    const savedSite = construction.sites[facility.id];
    savedSite.collectionStage = Math.max(savedSite.collectionStage || 0, narrative.collectionStage);
    // 案件进度只负责“发现/解锁建设”，不能替玩家自动完成两次建设和永久
    // 专精。旧实现把 collectionStage=3 直接当作 buildStage=3，导致建设与
    // 路线选择界面永远被跳过。
    const buildStage = Math.max(0, Math.min(3, savedSite.buildStage || 0));
    const buildSteps = buildStage >= 2 ? 2 : savedSite.buildSteps;
    const specialization = buildStage >= 3 ? routeChoice(facility, savedSite.specialization) : null;
    const nextBuildCost = buildStage < 2 ? facility.buildCosts[buildSteps] : 0;
    const nextBuildEffect = buildStage < 2 ? facility.buildEffects[buildSteps] : null;
    const repaired = narrative.repaired || buildStage > 0;
    const status = repaired ? "repaired" : narrative.collectionStage >= 1 ? "restoring" : concealed ? "hidden" : available ? "repairable" : "locked";
    const stageLabel = buildStage === 0
      ? (narrative.repaired ? "案件已结 · 待建设" : available ? "等待收藏线索" : `Lv.${facility.chapter}发现`)
      : buildStage === 1 ? `建设中 · ${buildSteps}/2`
        : buildStage === 2 ? "主体完成 · 待专精"
          : specialization ? `${specialization.short}专精 · 永久` : "永久设施";
    return Object.assign({}, facility, {
      repaired,
      concealed,
      available,
      status,
      found,
      collectionStage: narrative.collectionStage,
      total: facility.caseId === "hidden" ? 5 : 8,
      ending: narrative.caseState.ending || null,
      buildStage,
      buildSteps,
      specialization,
      nextBuildCost,
      nextBuildEffect,
      stageLabel,
      statusLabel: concealed ? "尚未发现" : buildStage > 0 ? stageLabel : available ? "等待收藏" : `Lv.${facility.chapter}发现`
    });
  });
}

function metricTarget(reserve, key) {
  if (["water", "grass", "disease"].includes(key)) return reserve.ecology || (reserve.ecology = {});
  return reserve;
}

function metricKey(key) {
  return key === "water" ? "water" : key;
}

function applyEffects(reserve, effects) {
  const changes = [];
  Object.keys(effects || {}).forEach((key) => {
    const target = metricTarget(reserve, key);
    const targetKey = metricKey(key);
    const before = Number(target[targetKey] || 0);
    const raw = before + Number(effects[key] || 0);
    const after = key === "intel" ? Math.max(0, Math.min(6, raw)) : Math.max(0, Math.min(100, raw));
    target[targetKey] = after;
    changes.push({ key, before, after, delta: after - before });
  });
  return changes;
}

function applyFacilityBuildStep(state, facilityId) {
  const reserve = (((state || {}).world || {}).reserve) || null;
  const facility = facilityStates(state).find((entry) => entry.id === facilityId);
  if (!reserve || !facility) return { ok: false, error: "设施不存在" };
  if (!facility.repaired) return { ok: false, error: "先完成对应收藏案件" };
  if (facility.buildStage >= 2) return { ok: false, error: "主体建设已经完成" };
  const cost = facility.nextBuildCost;
  if ((reserve.fund || 0) < cost) return { ok: false, error: `基金不足，还需${cost}` };
  const construction = normalizeFacilityConstruction(reserve);
  const site = construction.sites[facility.id];
  const fundBefore = reserve.fund || 0;
  reserve.fund = fundBefore - cost;
  site.buildSteps = Math.min(2, facility.buildSteps + 1);
  site.buildStage = site.buildSteps >= 2 ? 2 : 1;
  site.totalInvested += cost;
  site.lastBuiltDay = Math.max(0, Math.round(Number(((state.world || {}).day) || 0)));
  const changes = [{ key: "fund", before: fundBefore, after: reserve.fund, delta: -cost }].concat(applyEffects(reserve, facility.nextBuildEffect));
  return { ok: true, facility: facilityById(facility.id), stage: site.buildStage, buildSteps: site.buildSteps, cost, changes, effectText: effectText(facility.nextBuildEffect) };
}

function applyFacilitySpecialization(state, facilityId, routeId) {
  const reserve = (((state || {}).world || {}).reserve) || null;
  const facility = facilityStates(state).find((entry) => entry.id === facilityId);
  const choice = facility && routeChoice(facility, routeId);
  if (!reserve || !facility || !choice) return { ok: false, error: "这个专精不可用" };
  if (facility.buildStage < 2) return { ok: false, error: "先完成两次主体建设" };
  if (facility.buildStage >= 3) return { ok: false, error: "设施已经完成永久专精" };
  const discountReady = !!((reserve.facilityDiscounts || {})[facility.id]);
  const specializeCost = Math.round(facility.specializeCost * (discountReady ? 1 - BALANCE_V2.fragmentExchange.coGuardShard.discount : 1));
  if ((reserve.fund || 0) < specializeCost) return { ok: false, error: `基金不足，还需${specializeCost}` };
  const construction = normalizeFacilityConstruction(reserve);
  const site = construction.sites[facility.id];
  const fundBefore = reserve.fund || 0;
  reserve.fund = fundBefore - specializeCost;
  site.specialization = choice.id;
  site.buildStage = 3;
  site.buildSteps = 2;
  site.totalInvested += specializeCost;
  site.lastBuiltDay = Math.max(0, Math.round(Number(((state.world || {}).day) || 0)));
  const changes = [{ key: "fund", before: fundBefore, after: reserve.fund, delta: -specializeCost }].concat(applyEffects(reserve, choice.effect));
  reserve.strategy = reserve.strategy || {};
  reserve.strategy.routeScores = reserve.strategy.routeScores || {};
  const routeBefore = Number(reserve.strategy.routeScores[choice.id] || 0);
  reserve.strategy.routeScores[choice.id] = routeBefore + 2;
  changes.push({ key: `route:${choice.id}`, before: routeBefore, after: routeBefore + 2, delta: 2 });
  if (discountReady) delete reserve.facilityDiscounts[facility.id];
  return { ok: true, facility: facilityById(facility.id), specialization: choice, cost: specializeCost, discountApplied: discountReady, changes, effectText: effectText(choice.effect) };
}

function activateFacilitySpecializationDiscount(state, facilityId) {
  const reserve = (((state || {}).world || {}).reserve) || null;
  const facility = facilityStates(state).find((entry) => entry.id === facilityId);
  if (!reserve || !facility) return { ok: false, error: "设施不存在" };
  if (facility.buildStage !== 2) return { ok: false, error: "只有待专精设施可使用徽片" };
  const economy = reserve.ecologyEconomy || {};
  const fragments = economy.fragments || {};
  const recipe = BALANCE_V2.fragmentExchange.coGuardShard;
  if ((fragments.coGuardShard || 0) < recipe.amount) return { ok: false, error: "共护徽片不足" };
  if ((reserve.fund || 0) < recipe.fund) return { ok: false, error: "保护基金不足" };
  reserve.facilityDiscounts = reserve.facilityDiscounts || {};
  if (reserve.facilityDiscounts[facilityId]) return { ok: false, error: "该设施已启用专精折扣" };
  fragments.coGuardShard -= recipe.amount;
  reserve.fund -= recipe.fund;
  reserve.facilityDiscounts[facilityId] = true;
  return { ok: true, facilityId, fragmentCost: recipe.amount, fundCost: recipe.fund, discount: recipe.discount };
}

function specializedFacilityRouteCounts(reserve) {
  const construction = normalizeFacilityConstruction(reserve);
  const counts = { enforcement: 0, ecology: 0, research: 0, community: 0 };
  Object.keys(construction.sites || {}).forEach((facilityId) => {
    const site = construction.sites[facilityId] || {};
    if ((site.buildStage || 0) < 3 || !counts.hasOwnProperty(site.specialization)) return;
    counts[site.specialization] += 1;
  });
  return counts;
}

function applyFacilityOperationalEffects(reserve, action, seasonName = "雨季") {
  const counts = specializedFacilityRouteCounts(reserve);
  const construction = normalizeFacilityConstruction(reserve);
  const siteStage = (id) => (((construction.sites || {})[id] || {}).collectionStage) || (((construction.sites || {})[id] || {}).buildStage) || 0;
  const effects = {};
  const add = (key, amount) => { effects[key] = (effects[key] || 0) + amount; };
  if (counts.enforcement && ["houndScout", "antiPoacher"].includes(action)) {
    add("poacherPressure", -Math.min(3, counts.enforcement));
    if (action === "antiPoacher") add("enforcement", Math.min(2, counts.enforcement));
  }
  if (counts.ecology && ["habitat", "intervention"].includes(action)) {
    add("water", Math.min(3, counts.ecology));
    add("grass", Math.min(2, counts.ecology));
    if (seasonName === "雨季") add("disease", -Math.min(2, counts.ecology));
  }
  if (counts.research && ["houndScout", "exploreMaterials", "salvage"].includes(action)) {
    reserve.facilityForecast = Object.assign({}, reserve.facilityForecast || {}, {
      evidenceZone: action === "houndScout" ? "本次路线的证物区域已标记" : "样本来源已写入设施档案"
    });
    if (action === "salvage") add("business", Math.min(2, counts.research));
  }
  if (counts.community && ["buySupplies", "habitat", "intervention", "exploreMaterials"].includes(action)) {
    add("reputation", Math.min(2, counts.community));
    add("stability", Math.min(2, counts.community));
  }
  const functions = [];
  if (siteStage("old_patrol_post") >= 2 && ["houndScout", "antiPoacher"].includes(action)) {
    add("poacherPressure", -1);
    reserve.facilityForecast = Object.assign({}, reserve.facilityForecast || {}, { highestRisk: (reserve.poacherPressure || 0) >= 45 ? "河湾边界" : "西部林缘" });
    functions.push("巡护站标记最高风险区");
  }
  if (siteStage("hydrology_station") >= 2) {
    reserve.facilityForecast = Object.assign({}, reserve.facilityForecast || {}, {
      waterTomorrow: Math.max(0, Math.min(100, ((reserve.ecology || {}).water || 0) + (seasonName === "雨季" ? 2 : -2)))
    });
    if (action === "habitat") add("water", 1);
    functions.push("水文站给出明日水位");
  }
  if (siteStage("intel_room") >= 2) {
    reserve.facilityForecast = Object.assign({}, reserve.facilityForecast || {}, { evidenceZone: (reserve.poacherPressure || 0) >= 40 ? "河湾与北侧边界" : "旧巡护线" });
    functions.push("情报室标出证物区域");
  }
  if (siteStage("migration_watch") >= 2) {
    reserve.facilityForecast = Object.assign({}, reserve.facilityForecast || {}, { migrationTomorrow: ((reserve.migration || {}).delta || 0) >= 0 ? "有小群动物接近" : "有动物准备离开" });
    functions.push("观测站预告迁徙");
  }
  if (siteStage("governance_hall") >= 2) {
    reserve.seasonPolicy = Object.assign({ available: true, usedSeason: "" }, reserve.seasonPolicy || {});
    functions.push("治理厅开放季节策略");
  }
  if (siteStage("guardian_memorial") >= 2) {
    reserve.memoryWall = Object.assign({ active: true, latest: null }, reserve.memoryWall || {});
    functions.push("纪念墙保存动物记忆");
  }
  const changes = applyEffects(reserve, effects).filter((change) => change.delta !== 0);
  const appliedEffects = {};
  changes.forEach((change) => { appliedEffects[change.key] = change.delta; });
  const active = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const routeLabels = Object.keys(counts).filter((id) => counts[id] > 0).map((id) => `${ROUTE_KITS[id].short}×${counts[id]}`);
  const result = {
    active,
    routes: counts,
    changes,
    functions,
    summary: changes.length ? `设施联动：${effectText(appliedEffects)}` : functions.length ? functions[0] : active ? `设施待命：${routeLabels.join(" · ")}` : ""
  };
  reserve.lastFacilityEffect = result;
  return result;
}

module.exports = {
  FACILITIES,
  ROUTE_KITS,
  facilityById,
  facilityByCaseId,
  facilityStates,
  normalizeFacilityConstruction,
  effectText,
  applyFacilityBuildStep,
  applyFacilitySpecialization,
  activateFacilitySpecializationDiscount,
  applyFacilityOperationalEffects
};
