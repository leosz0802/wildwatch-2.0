const { fundHealth, ECOLOGY_THRESHOLDS, levelOf } = require("./balanceConfig");
const { criticalPatrolRisk, PATROL_ACTIONS } = require("./patrolTriggerPolicy");
const { isVisitorArcheryEvent, isNeighborExchangeEvent, hasVisitorTrouble } = require("./worldEventSystem");
const { proposeEcologyCrises, applySandboxTaskCadence } = require("./sandboxTaskCadence");
const { rareAnimalMapMarker, normalizeRareAnimalState } = require("./rareAnimalSystem");
function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value || 0)));
}
function totalOf(group) {
  return Object.keys(group || {}).reduce((sum, key) => sum + ((group && group[key]) || 0), 0);
}
function toneFor(value, goodAt = 70, warnAt = 45, inverse = false) {
  const score = inverse ? 100 - (value || 0) : value || 0;
  if (score >= goodAt) return "good";
  if (score >= warnAt) return "warn";
  return "bad";
}
function signed(value) {
  const num = Math.round(value || 0);
  return num > 0 ? `+${num}` : `${num}`;
}
function metric(id, label, value, beforeValue, tone, body, action) {
  const numeric = typeof value === "number";
  const beforeNumeric = typeof beforeValue === "number";
  return {
    id,
    label,
    value,
    delta: numeric && beforeNumeric ? Math.round(value - beforeValue) : 0,
    tone,
    body,
    action
  };
}
function actionLabel(action) {
  return {
    houndScout: "派猎犬侦察",
    antiPoacher: "驱赶偷猎",
    habitat: "修复栖息地",
    intervention: "生态干预",
    exploreMaterials: "动物引路探索",
    salvage: "移交守护样本",
    buySupplies: "采购补给",
    patrol: "巡护",
    visitorAdjust: "调节游客现场",
    neighborExchange: "射箭判定交换",
    harshNature: "射箭判定伤害"
  }[action] || "巡护";
}
function animalStatusFor(reserve, context = {}) {
  const eco = reserve.ecology || {};
  const migration = reserve.migration || {};
  const disease = eco.disease || 0;
  const water = eco.water || 0;
  const grass = eco.grass || 0;
  const seasonDay = (context.time && context.time.seasonDay) || reserve.seasonDay || 1;
  if ((migration.delta || 0) > 2) {
    return { value: "回归", tone: "special", reason: migration.reason || "安全感提升，动物开始靠近", action: "habitat" };
  }
  if (disease >= ECOLOGY_THRESHOLDS.warningDisease) {
    return { value: "生病", tone: "bad", reason: "病虫害升高，幼体和老弱个体先受影响", action: "houndScout" };
  }
  if ((migration.delta || 0) < 0 || water <= ECOLOGY_THRESHOLDS.criticalWater || grass <= ECOLOGY_THRESHOLDS.criticalGrass) {
    return { value: "迁出", tone: "bad", reason: migration.reason || (water < grass ? "饮水不足，边缘动物开始退走" : "草场承载不足，动物开始寻找新食地"), action: "habitat" };
  }
  if (water < ECOLOGY_THRESHOLDS.lowWater || grass < ECOLOGY_THRESHOLDS.lowGrass || disease >= ECOLOGY_THRESHOLDS.warningDisease) {
    return { value: "承压", tone: "warn", reason: disease >= ECOLOGY_THRESHOLDS.warningDisease ? "疾病风险升高，群体活动开始收缩" : water < ECOLOGY_THRESHOLDS.lowWater ? "水线变紧，饮水路线更谨慎" : "草场吃紧，群体活动范围变大", action: disease >= ECOLOGY_THRESHOLDS.warningDisease ? "intervention" : "habitat" };
  }
  if (seasonDay % 24 >= 10 && seasonDay % 24 <= 18 && water >= 70 && grass >= 68 && disease <= ECOLOGY_THRESHOLDS.recoveryDisease) {
    return { value: "繁殖中", tone: "special", reason: "繁殖季窗口稳定，幼崽更愿意留在核心区", action: "habitat" };
  }
  return { value: "安定", tone: "good", reason: "水草和边界暂时稳定，动物愿意继续观察这里", action: "houndScout" };
}
function primaryReasons(before = {}, reserve = {}, context = {}) {
  const beforeEco = before.ecology || {};
  const eco = reserve.ecology || {};
  const reasons = [];
  const safetyDelta = (reserve.safety || reserve.stability || 0) - (before.safety || before.stability || reserve.safety || 0);
  const ecologyBefore = typeof before.ecologyScore === "number" ? before.ecologyScore : before.stability || 0;
  const ecologyAfter = typeof reserve.ecologyScore === "number" ? reserve.ecologyScore : reserve.stability || 0;
  const poacherDelta = (reserve.poacherPressure || 0) - (before.poacherPressure || 0);
  const waterDelta = (eco.water || 0) - (beforeEco.water || 0);
  const grassDelta = (eco.grass || 0) - (beforeEco.grass || 0);
  const diseaseDelta = (eco.disease || 0) - (beforeEco.disease || 0);
  const fundDelta = (reserve.fund || 0) - (before.fund || 0);
  const migrationDelta = (reserve.migration && reserve.migration.delta) || 0;
  const beforeMigrationDelta = (before.migration && before.migration.delta) || 0;
  const action = context.action || "";
  const emergency = reserve.emergency && reserve.emergency.active;
  const visitorToday = ((((reserve.development || {}).operations || {}).today) || {});
  if (emergency) {
    const visitorEvent = isVisitorArcheryEvent(emergency.type);
    const exchangeEvent = isNeighborExchangeEvent(emergency.type);
    reasons.push({
      id: emergency.type,
      eventType: emergency.type,
      priority: 120,
      label: emergency.title,
      body: emergency.category === "realNature"
        ? `${emergency.date}｜${emergency.place}｜来源：${emergency.sourceName}。${emergency.impact} 剩余 ${emergency.daysRemaining} 次处置机会，进度 ${emergency.progress || 0}/${emergency.target || 3}`
        : `${emergency.impact || "保护区危机仍在持续"} 剩余 ${emergency.daysRemaining} 次处置机会，进度 ${emergency.progress || 0}/${emergency.target || 3}`,
      category: emergency.category,
      categoryLabel: emergency.categoryLabel,
      realEventId: emergency.realEventId,
      date: emergency.date,
      dateKind: emergency.dateKind,
      place: emergency.place,
      sourceName: emergency.sourceName,
      sourceUrl: emergency.sourceUrl,
      summary: emergency.summary,
      polarity: emergency.polarity,
      drill: emergency.drill,
      metrics: emergency.metrics,
      impact: emergency.impact,
      action: visitorEvent ? "visitorAdjust" : exchangeEvent ? "neighborExchange" : emergency.recommendedAction,
      marker: visitorEvent ? "visitor" : "crisis",
      regionId: emergency.regionId || "center",
      responseOptions: (visitorEvent || exchangeEvent) ? [] : (emergency.responses || []).map((item) => Object.assign({}, item)),
      visualKind: emergency.visualKind || emergency.type
    });
  }
  if ((reserve.poacherPressure || 0) > 58 || poacherDelta > 5) reasons.push({ id: "poacher", priority: 100, label: "陌生脚印升级", body: "偷猎压力正在挤压动物路线", action: "antiPoacher", marker: "crisis", regionId: "river" });
  const visitorEmergency = !!(emergency && isVisitorArcheryEvent(emergency.type));
  if (!visitorEmergency && hasVisitorTrouble(visitorToday)) {
    reasons.push({
      id: "visitor_trouble",
      priority: 90,
      label: "游客现场需要处置",
      body: visitorToday.trouble,
      action: "visitorAdjust",
      marker: "visitor",
      visualKind: "visitor-conflict",
      regionId: "river"
    });
  }
  proposeEcologyCrises(reserve, {
    season: context.season,
    weather: context.weather,
    diseaseDelta
  }).forEach((crisis) => reasons.push(crisis));
  if ((eco.water || 0) < ECOLOGY_THRESHOLDS.earlyWater) reasons.push({ id: "water", priority: 82, label: "水线变紧", body: "饮水点会变成风险路口", action: "habitat", marker: "event", regionId: "river", presentation: "resource-flow", metric: "water", metricLabel: "水源", delta: waterDelta, value: eco.water || 0 });
  if ((eco.grass || 0) < ECOLOGY_THRESHOLDS.earlyGrass) reasons.push({ id: "grass", priority: 78, label: "草场吃紧", body: "食草动物会扩大取食范围", action: "habitat", marker: "event", regionId: "meadow", presentation: "resource-flow", metric: "grass", metricLabel: "草场", delta: grassDelta, value: eco.grass || 0 });
  if (migrationDelta < 0) reasons.push({ id: "migration_out", priority: 75, label: "迁移线变薄", body: (reserve.migration && reserve.migration.reason) || "动物开始离开边缘", action: "habitat", marker: "event", regionId: "meadow", presentation: "resource-flow", metric: "migration", metricLabel: "迁徙", delta: migrationDelta - beforeMigrationDelta, value: migrationDelta, flowKind: "consumption", beneficial: false });
  if (((eco.water || 0) < ECOLOGY_THRESHOLDS.earlyWater && waterDelta > 2) || ((eco.grass || 0) < ECOLOGY_THRESHOLDS.earlyGrass && grassDelta > 2)) {
    const waterLead = waterDelta >= grassDelta;
    reasons.push({
      id: "recovery_ecology",
      priority: 50,
      label: waterLead ? "水源恢复" : "草场恢复",
      body: "动物会更愿意试探固定路线",
      action: "habitat",
      marker: "recovery",
      regionId: context.regionId || "river",
      presentation: "resource-flow",
      metric: waterLead ? "water" : "grass",
      metricLabel: waterLead ? "水源" : "草场",
      delta: waterLead ? waterDelta : grassDelta,
      value: waterLead ? (eco.water || 0) : (eco.grass || 0)
    });
  }
  if (migrationDelta > 0) reasons.push({ id: "migration_in", priority: 48, label: "动物回流", body: (reserve.migration && reserve.migration.reason) || "动物开始靠近核心区", action: "habitat", marker: "recovery", regionId: "meadow", presentation: "resource-flow", metric: "migration", metricLabel: "迁徙", delta: migrationDelta - beforeMigrationDelta, value: migrationDelta, flowKind: "production", beneficial: true });
  const critical = criticalPatrolRisk(reserve);
  return reasons.map(reason => {
    if (reason.eventType || reason.id === "reserve_network") return reason;
    if (reason.id === "disease") reason.action = "intervention";
    if (PATROL_ACTIONS.includes(reason.action)
      && (reason.marker === "recovery" || reason.id === "stable" || !critical || critical.action !== reason.action)) {
      return Object.assign({}, reason, { action: "", readOnly: true });
    }
    return reason;
  }).sort((a, b) => b.priority - a.priority);
}
function weatherEffects(weather, season, dynamics = {}) {
  const effects = [];
  if (weather === "小雨") effects.push("小雨补水，但气味更散，猎犬追踪略难");
  else if (weather === "晴") effects.push("晴天视野好，水源会消耗更快");
  else if (weather === "雾") effects.push("雾会遮住远处动静，侦察要更谨慎");
  else effects.push("阴天影响较小，适合常规巡线");
  if (season === "雨季") effects.push(`河道改为第${dynamics.riverVariant || 1}条水路，动物活动范围扩大，疾病与幼崽机会增加`);
  if (season === "旱季") effects.push(`仅剩${dynamics.waterPointCount || 2}个主要水点，捕食、偷猎与象群迁徙向水线集中`);
  effects.push(season === "雨季" ? "水文调查会出现改道河汊藏品" : "调查会出现盐地、旧井和干河床藏品");
  return effects.slice(0, 3);
}
function buildReserveView(beforeReserve, reserve, context = {}) {
  const before = beforeReserve || reserve || {};
  const current = reserve || {};
  const eco = current.ecology || {};
  const beforeEco = before.ecology || {};
  const animal = animalStatusFor(current, context);
  const reasons = primaryReasons(before, current, context);
  const topReason = reasons[0] || {};
  const poachers = clamp(current.poacherPressure || 0);
  const beforePoachers = clamp(before.poacherPressure || poachers);
  const water = clamp(eco.water || 0);
  const beforeWater = clamp(beforeEco.water || water);
  const grass = clamp(eco.grass || 0);
  const beforeGrass = clamp(beforeEco.grass || grass);
  const disease = clamp(eco.disease || 0);
  const beforeDisease = clamp(beforeEco.disease || disease);
  const fund = Math.round(current.fund || 0);
  const beforeFund = Math.round(before.fund || fund);
  const migrationDelta = (current.migration && current.migration.delta) || 0;
  const beforeMigrationDelta = (before.migration && before.migration.delta) || 0;
  const animalBefore = animalStatusFor(before, context);
  const animalCount = totalOf(eco.predators) + totalOf(eco.herbivores) + totalOf(eco.birds);
  const beforeCount = totalOf(beforeEco.predators) + totalOf(beforeEco.herbivores) + totalOf(beforeEco.birds);
  const outcome = {
    id: "animal",
    label: "生态结果",
    value: animal.value,
    status: animal.value,
    tone: animal.tone,
    delta: animalCount - beforeCount,
    reason: animal.reason,
    action: animal.action
  };
  const action = topReason.action || context.action || "houndScout";
  const fundBand = fundHealth(levelOf(current));
  const states = [
    {
      id: "fund",
      label: "基金",
      value: fund,
      status: fund >= fundBand.healthyMin ? "充足" : fund >= fundBand.danger ? "偏低" : "紧缺",
      tone: fund >= fundBand.healthyMin ? "good" : fund >= fundBand.danger ? "warn" : "bad",
      delta: fund - beforeFund,
      reason: fund === beforeFund ? "移交回收物可获得基金" : (fund > beforeFund ? "回收物移交入账" : "采购巡护补给"),
      action: fund < fundBand.healthyMin ? "salvage" : "buySupplies",
      subMetrics: [
        metric("fund", "保护基金", fund, beforeFund, fund >= fundBand.healthyMin ? "good" : fund >= fundBand.danger ? "warn" : "bad", "来自回收物移交，用于购买巡护补给。", fund < fundBand.healthyMin ? "salvage" : "buySupplies")
      ]
    },
    {
      id: "water",
      label: "水源",
      value: water,
      status: water >= 70 ? "丰沛" : water >= 45 ? "稳定" : "紧张",
      tone: toneFor(water),
      delta: water - beforeWater,
      reason: water === beforeWater ? "决定饮水、健康与迁徙" : (water > beforeWater ? "水面正在恢复" : "水线正在收缩"),
      action: water < ECOLOGY_THRESHOLDS.earlyWater ? "habitat" : (disease >= ECOLOGY_THRESHOLDS.warningDisease ? "intervention" : "houndScout"),
      outcome,
      subMetrics: [
        metric("water", "水源", water, beforeWater, toneFor(water), "影响饮水路线、湿地和水鸟活动。", water < ECOLOGY_THRESHOLDS.lowWater ? "habitat" : "houndScout"),
        metric("disease", "疾病风险", disease, beforeDisease, toneFor(disease, 30, 18, true), "水源不足或过度聚集会提高疾病风险。", disease >= ECOLOGY_THRESHOLDS.warningDisease ? "intervention" : "houndScout"),
        metric("migration_line", "迁徙", migrationDelta, beforeMigrationDelta, migrationDelta > 0 ? "good" : migrationDelta < 0 ? "bad" : "warn", (current.migration && current.migration.reason) || "水源影响动物迁入与迁出。", migrationDelta < 0 ? "habitat" : "houndScout")
      ]
    },
    {
      id: "grass",
      label: "草场",
      value: grass,
      status: grass >= 70 ? "偏高" : grass >= 45 ? "紧平衡" : "吃紧",
      tone: grass >= 70 ? "warn" : toneFor(grass, 66, 45),
      delta: grass - beforeGrass,
      reason: grass >= 70
        ? "草场偏高，过剩产能会转成取食、踩踏和自然枯落压力"
        : (grass === beforeGrass ? "决定承载量、健康与迁徙" : (grass > beforeGrass ? "草场产能恢复，仍需观察承载" : "草场产能下降")),
      action: grass < ECOLOGY_THRESHOLDS.earlyGrass ? "habitat" : (disease >= ECOLOGY_THRESHOLDS.warningDisease ? "intervention" : "houndScout"),
      outcome,
      subMetrics: [
        metric("grass", "草场产能", grass, beforeGrass, grass >= 70 ? "warn" : toneFor(grass, 66, 45), "影响食草动物数量、健康和幼体停留；超过 70 会进入过剩承载压力。", grass < ECOLOGY_THRESHOLDS.earlyGrass ? "habitat" : "houndScout"),
        metric("disease", "疾病风险", disease, beforeDisease, toneFor(disease, 30, 18, true), "草场过载会提高疾病与营养风险。", disease >= ECOLOGY_THRESHOLDS.warningDisease ? "intervention" : "houndScout"),
        metric("migration_line", "迁徙", migrationDelta, beforeMigrationDelta, migrationDelta > 0 ? "good" : migrationDelta < 0 ? "bad" : "warn", (current.migration && current.migration.reason) || "草场承载量影响迁入与迁出。", migrationDelta < 0 ? "habitat" : "houndScout")
      ]
    }
  ];
  const todayImpact = {
    title: `${context.weather || "天气未知"} · ${context.season || "夏季"}`,
    effects: weatherEffects(context.weather, context.season, current.seasonDynamics || {})
  };
  const broadcasts = [
    {
      id: "weather",
      type: "weather",
      title: `今日：${todayImpact.title}`,
      body: todayImpact.effects[0],
      action: "houndScout"
    },
    {
      id: "main_change",
      type: "change",
      title: topReason.label || "保护区保持观望",
      body: topReason.body || "后台生态仍在变化，先听动物和看地图标记。",
      action
    },
    {
      id: "animal_hint",
      type: "animal",
      title: `生态结果：${animal.value}`,
      body: `${animal.reason}。建议：${actionLabel(animal.action)}。`,
      action: animal.action
    }
  ];
  const markerReasons = applySandboxTaskCadence(
    current,
    reasons.filter((reason) => reason.id !== "stable"),
    context.now || Date.now()
  );
  const mapMarkers = markerReasons.slice(0, 3).map((reason, index) => ({
    id: `rv_${context.day || 0}_${reason.id}_${index}`,
    type: reason.marker === "visitor" ? "visitorIncident" : reason.marker === "crisis" ? "crisis" : reason.marker === "recovery" ? "recovery" : reason.marker === "event" ? "event" : "question",
    kind: reason.marker === "visitor" ? "visitorIncident" : reason.marker === "crisis" ? "exclamation" : reason.marker === "recovery" ? "recovery" : reason.marker === "event" ? "exclamation" : "question",
    regionId: reason.regionId || context.regionId || "center",
    title: reason.label,
    label: reason.label,
    dialogue: reason.presentation === "resource-flow" ? "" : markerDialogueFor(reason, animal),
    presentation: reason.presentation || "field-event",
    metric: reason.metric || "",
    metricLabel: reason.metricLabel || "",
    delta: typeof reason.delta === "number" ? reason.delta : 0,
    value: typeof reason.value === "number" ? reason.value : 0,
    flowKind: reason.flowKind || "",
    beneficial: typeof reason.beneficial === "boolean" ? reason.beneficial : undefined,
    impact: reason.body,
    recommendAction: reason.action,
    readOnly: !!reason.readOnly,
    recommendLabel: reason.recommendLabel || actionLabel(reason.action),
    responseOptions: (reason.responseOptions || []).map((item) => Object.assign({}, item)),
    eventType: reason.eventType || "",
    visualKind: reason.visualKind || "",
    category: reason.category || "",
    categoryLabel: reason.categoryLabel || "",
    realEventId: reason.realEventId || "",
    date: reason.date || "",
    dateKind: reason.dateKind || "",
    place: reason.place || "",
    sourceName: reason.sourceName || "",
    sourceUrl: reason.sourceUrl || "",
    summary: reason.summary || "",
    polarity: reason.polarity || "",
    drill: reason.drill || "",
    metrics: reason.metrics || "",
    focused: reason.marker === "crisis" && reason.id === ((current.emergency || {}).active || {}).type,
    progress: reason.id && reason.id === ((current.emergency || {}).active || {}).type ? (((current.emergency || {}).active || {}).progress || 0) : 0,
    target: reason.id && reason.id === ((current.emergency || {}).active || {}).type ? (((current.emergency || {}).active || {}).target || 0) : 0,
    unhandled: reason.marker === "recovery" ? "继续保持，明天动物会更愿意靠近。" : `不处理：明天可能升级，${reason.body}。`,
    intensity: reason.marker === "crisis" ? 3 : reason.marker === "recovery" ? 1 : 2
  }));
  const rareMarker = rareAnimalMapMarker(current, context);
  if (rareMarker) {
    mapMarkers.push(Object.assign({
      presentation: "rare-animal",
      mapObjectType: "building",
      fixedMapPosition: { x: 0.29, y: 0.78 },
      dialogue: "",
      readOnly: false,
      responseOptions: []
    }, rareMarker));
  }
  const settlement = {
    statLine: buildStatLine(states, topReason),
    animalLine: `${animal.value === animalBefore.value
      ? `动物保持「${animal.value}」`
      : `动物从「${animalBefore.value}」变为「${animal.value}」`}，${outcome.delta ? `数量${signed(outcome.delta)}只` : "数量未变"}：${animal.reason}`,
    tomorrowRiskLine: buildTomorrowRiskLine(reasons, current),
    reasons: reasons.slice(0, 4).map((reason) => ({ label: reason.label, body: reason.body, action: reason.action }))
  };
  return {
    version: "reserve-view-v2-core3",
    states,
    outcome,
    todayImpact,
    broadcasts,
    mapMarkers,
    settlement,
    actionSystem: buildActionSystem(current, context),
    primaryReason: topReason,
    updatedAtDay: context.day || 0,
    rawHints: {
      water: eco.water || 0,
      grass: eco.grass || 0,
      disease: eco.disease || 0,
      poacherPressure: current.poacherPressure || 0,
      migrationDelta: (current.migration && current.migration.delta) || 0,
      rareAnimal: normalizeRareAnimalState(current)
    }
  };
}
function markerDialogueFor(reason = {}, animal = {}) {
  const action = actionLabel(reason.action);
  if (reason.marker === "recovery") return "";
  if (reason.marker === "crisis") return `巡护员：${reason.label}，快${action}`;
  if (reason.marker === "event") return `巡护员：${reason.label}，建议${action}`;
  return `巡护员：${reason.label}，先查线索`;
}
function buildStatLine(states, reason) {
  const changed = states
    .filter((state) => state.id !== "animal" && state.delta)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 2);
  if (!changed.length) return `数值稳定：${reason.label || "保护区保持观望"}`;
  return `${changed.map((state) => `${state.label} ${signed(state.delta)}`).join("，")}；原因：${reason.label || changed[0].reason}`;
}
function buildTomorrowRiskLine(reasons, reserve) {
  const risk = reasons.find((item) => item.marker !== "recovery") || reasons[0] || {};
  if ((reserve.migration && reserve.migration.delta) < 0) return "明日风险：迁移线继续变薄，先稳住水源和草场。";
  if ((reserve.poacherPressure || 0) > 55) return "明日风险：偷猎线可能升级，优先派猎犬和警报器。";
  if (((reserve.ecology || {}).water || 0) < 50) return "明日风险：水源会挤压饮水路线，优先修复栖息地。";
  if (risk.marker === "recovery") return "明日机会：恢复点会吸引动物回流，可以继续听动物确认路线。";
  return `明日风险：${risk.label || "暗线仍在发酵"}，建议${actionLabel(risk.action)}。`;
}
function buildActionSystem(reserve, context = {}) {
  const poacher = reserve.poacherPressure || 0;
  const eco = reserve.ecology || {};
  const supplies = reserve.supplies || {};
  const pressure = Math.max(0, Math.round(
    (poacher >= 55 ? 2 : poacher >= 42 ? 1 : 0)
    + ((eco.water || 60) < ECOLOGY_THRESHOLDS.lowWater ? 1 : 0)
    + ((eco.grass || 60) < ECOLOGY_THRESHOLDS.lowGrass ? 1 : 0)
    + ((eco.disease || 0) >= ECOLOGY_THRESHOLDS.warningDisease ? 1 : 0)
  ));
  const nextGate = poacher >= 55
    ? ((supplies.alarm || 0) > 0 ? "用警报器驱赶偷猎" : "先采购警报器")
    : (eco.water || 0) < ECOLOGY_THRESHOLDS.lowWater || (eco.grass || 0) < ECOLOGY_THRESHOLDS.lowGrass
      ? ((supplies.fieldKit || 0) > 0 ? "用工具包修复水源和草场" : "先采购野外工具包")
      : (eco.disease || 0) >= ECOLOGY_THRESHOLDS.warningDisease
        ? ((supplies.tranquilizer || 0) > 0 ? "执行生态干预" : "先采购阻滞弹")
        : "水草稳定，可听动物寻找下一条线索";
  return {
    fund: reserve.fund || 0,
    water: eco.water || 0,
    grass: eco.grass || 0,
    pressure,
    nextGate,
    summary: `基金${reserve.fund || 0} · 水源${eco.water || 0} · 草场${eco.grass || 0}`,
    eventLogic: "移交回收物获得基金，基金购买补给；巡护行动改变水源和草场，水草再影响动物健康与迁徙。"
  };
}
module.exports = {
  buildReserveView,
  actionLabel
};
