const { REAL_NATURE_EVENTS } = require("./realNatureEventCatalog");
const { recordFundChange } = require("./fundLedger");
const { recordIncrease, recordDecrease } = require("./animalSourceLedger");
const { livingAnimalTotal, chapterCaptiveSpeciesSet } = require("./chapterRescueSystem");
const { getChapterSandboxSpecies, speciesPopulationGroup, SPECIES_DB } = require("./animalWorld");
const { applyChapterVisitorDelta, chapterVisitorTotal } = require("./chapterTargets");

const REAL_NATURE_ARCHERY_THRESHOLD = 3;
const CORE_METRICS = Object.freeze(["fund", "visitors", "animals"]);
const CORE_METRIC_LABELS = Object.freeze({ fund: "保护基金", visitors: "游客", animals: "动物总数" });
const CORE_METRIC_UNITS = Object.freeze({ fund: "星币", visitors: "人", animals: "只" });
const CORE_METRIC_AMOUNTS = Object.freeze({
  fund: Object.freeze({ 重: 80, 中: 48, 轻: 24 }),
  visitors: Object.freeze({ 重: 16, 中: 10, 轻: 6 }),
  animals: Object.freeze({ 重: 5, 中: 3, 轻: 2 })
});
const n = (value, fallback = 0) => Math.max(0, Math.round(Number.isFinite(Number(value)) ? Number(value) : fallback));

const CATEGORY_ROUTES = Object.freeze({
  海洋水域: Object.freeze({ regionId: "river", visualKind: "contaminated-water", primary: "habitat", secondary: "intervention" }),
  保育政策: Object.freeze({ regionId: "center", visualKind: "community", primary: "houndScout", secondary: "habitat" }),
  物种科研: Object.freeze({ regionId: "north", visualKind: "research", primary: "houndScout", secondary: "intervention" }),
  野生动物: Object.freeze({ regionId: "rocks", visualKind: "animal-rescue", primary: "antiPoacher", secondary: "intervention" }),
  极端气候: Object.freeze({ regionId: "meadow", visualKind: "weather-risk", primary: "habitat", secondary: "houndScout" })
});

const ACTION_LABELS = Object.freeze({
  habitat: "修复受影响生境",
  intervention: "救护并隔离风险",
  houndScout: "巡查并记录现场",
  antiPoacher: "封控高风险路线"
});

function eventType(id = "") {
  return `real_nature_${id}`;
}

function isRealNatureEventType(type = "") {
  return String(type).startsWith("real_nature_");
}

function beijingDateKey(now = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date(now));
}

function hash(value = "") {
  let result = 2166136261;
  for (const char of String(value)) {
    result ^= char.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function recentRealEventIds(reserve = {}) {
  const emergency = reserve.emergency || {};
  const ids = [];
  if (emergency.active && emergency.active.realEventId) ids.push(emergency.active.realEventId);
  (emergency.history || []).slice(-12).forEach((item) => {
    if (item.realEventId) ids.push(item.realEventId);
    else if (isRealNatureEventType(item.type)) ids.push(String(item.type).slice("real_nature_".length));
  });
  return Array.from(new Set(ids)).slice(-8);
}

function realNatureEventEligible(reserve = {}) {
  const progression = reserve.progression || {};
  const chapterStart = progression.chapterStart || progression.stageStart || {};
  const activeSeconds = Math.max(0, Number(progression.activeSeconds) || 0);
  const chapterStartSeconds = Math.max(0, Number(chapterStart.activeSeconds) || 0);
  return activeSeconds - chapterStartSeconds >= 30;
}

function liveChapterNumber(reserve = {}) {
  const progression = reserve.progression || {};
  return Math.max(1, Math.round(Number(progression.stage || progression.displayChapter || 1) || 1));
}

function chapterHasRequiredRealNature(reserve = {}) {
  const chapter = liveChapterNumber(reserve);
  const emergency = reserve.emergency || {};
  if (Math.max(0, Math.round(Number(emergency.realNatureChapter) || 0)) === chapter) return true;
  return isRealNatureEventType((emergency.active || {}).type);
}

function chapterNeedsRequiredRealNature(reserve = {}) {
  return realNatureEventEligible(reserve) && !chapterHasRequiredRealNature(reserve);
}

function markChapterRealNatureSeen(reserve = {}) {
  const chapter = liveChapterNumber(reserve);
  const emergency = reserve.emergency || (reserve.emergency = {});
  emergency.realNatureChapter = chapter;
  return chapter;
}

function realNatureEventForDate(reserve = {}, now = Date.now()) {
  const dateKey = beijingDateKey(now);
  const recent = new Set(recentRealEventIds(reserve));
  const start = hash(dateKey) % REAL_NATURE_EVENTS.length;
  for (let offset = 0; offset < REAL_NATURE_EVENTS.length; offset += 1) {
    const event = REAL_NATURE_EVENTS[(start + offset) % REAL_NATURE_EVENTS.length];
    if (!recent.has(event.id)) return event;
  }
  return REAL_NATURE_EVENTS[start];
}

function routeFor(event = {}) {
  const route = CATEGORY_ROUTES[event.category] || CATEGORY_ROUTES.野生动物;
  if (/污染|泄漏|水质|洪水|河流|湿地|海冰|珊瑚/.test(`${event.title}${event.drill}`)) {
    return Object.assign({}, route, { regionId: "river", primary: "habitat", secondary: "intervention" });
  }
  if (/盗猎|贩运|执法|禁捕|巡护/.test(`${event.title}${event.drill}`)) {
    return Object.assign({}, route, { primary: "antiPoacher", secondary: "houndScout" });
  }
  if (/放归|救护|转移|检疫/.test(`${event.title}${event.drill}`)) {
    return Object.assign({}, route, { primary: "intervention", secondary: "houndScout" });
  }
  return route;
}

function effectsFor(event = {}) {
  const positive = event.polarity === "正向";
  const severe = /重/.test(event.metrics || "");
  const amount = severe ? 3 : 2;
  if (positive) return {
    pressureEffects: {},
    resolvedEffects: { stability: amount, reputation: 1 },
    failedEffects: {}
  };
  if (/water↓|水质|洪水|泄漏|海洋|河流/.test(`${event.metrics}${event.title}`)) return {
    pressureEffects: { water: -1 },
    resolvedEffects: { water: amount },
    failedEffects: { water: -amount }
  };
  if (/grass↓|山火|热浪|干旱/.test(`${event.metrics}${event.title}`)) return {
    pressureEffects: { grass: -1 },
    resolvedEffects: { grass: amount },
    failedEffects: { grass: -amount }
  };
  return {
    pressureEffects: {},
    resolvedEffects: { stability: amount },
    failedEffects: { stability: -amount }
  };
}

function futureTimelineText(value = "", years = 5) {
  return String(value || "").replace(/\b(19|20)\d{2}\b/g, (year) => String(Number(year) + years));
}

function realNatureDefinition(event = {}) {
  const route = routeFor(event);
  const effects = effectsFor(event);
  const displayDate = futureTimelineText(event.date);
  const displayTitle = futureTimelineText(event.title);
  const displaySummary = futureTimelineText(event.summary);
  const displayImpact = futureTimelineText(event.impact);
  const displayDrill = futureTimelineText(event.drill);
  const sourceLine = `${displayDate}｜${event.place}｜来源：${event.source}`;
  return Object.freeze(Object.assign({
    type: eventType(event.id),
    realEventId: event.id,
    category: "realNature",
    categoryLabel: "真实事件",
    source: "realNature",
    title: displayTitle,
    date: displayDate,
    realDate: event.date,
    dateKind: event.dateKind,
    place: event.place,
    summary: displaySummary,
    sourceName: event.source,
    sourceUrl: event.url,
    url: event.url,
    impact: displayImpact,
    polarity: event.polarity,
    drill: displayDrill,
    metrics: event.metrics,
    regionId: route.regionId,
    visualKind: route.visualKind,
    recommendedAction: route.primary,
    recommendLabel: ACTION_LABELS[route.primary],
    target: 3,
    days: 3,
    startBody: `${sourceLine}。${displaySummary} 本任务为基于该真实事件的保护演练。`,
    resolvedTitle: `${displayTitle}演练完成`,
    resolvedBody: `${sourceLine}。处置已完成记录，效果仅作用于保护区演练。`,
    failedTitle: `${displayTitle}演练未完成`,
    failedBody: `${sourceLine}。处置窗口关闭，保护区承担有限演练影响。`,
    responses: Object.freeze([
      Object.freeze({ action: route.primary, label: ACTION_LABELS[route.primary], gain: 2, preview: `${displayDrill} 优先推进，效果有限且不改写现实事件结论。` })
    ])
  }, effects));
}

const REAL_NATURE_EVENT_DEFINITIONS = Object.freeze(Object.fromEntries(
  REAL_NATURE_EVENTS.map((event) => [eventType(event.id), realNatureDefinition(event)])
));

function realNatureTriggerType(reserve = {}, now = Date.now(), options = {}) {
  if (!options.ignoreQuiet && !realNatureEventEligible(reserve)) return null;
  const event = realNatureEventForDate(reserve, now);
  return event ? eventType(event.id) : null;
}

function tokenCoreMetric(token = "") {
  const text = String(token || "");
  if (/animal|health|物种|动物|救护|放归|检疫|幼体|种群|野生/.test(text)) return "animals";
  if (/visitor|游客|旅游|社区|观赏|客流/.test(text)) return "visitors";
  if (/fund|基金|收入|经营|拨款|经费|星币/.test(text)) return "fund";
  if (/water|grass|habitat|水源|草场|湿地|污染|水质|河道|珊瑚/.test(text)) return "habitat";
  return "";
}

function categoryFallbackPair(category = "") {
  if (/保育政策/.test(category)) return ["fund", "visitors"];
  if (/物种科研|极端气候/.test(category)) return ["animals", "fund"];
  return ["animals", "visitors"];
}

function realNatureImpactPair(event = {}) {
  const parts = String(event.metrics || "").split(/[·,，]/).map((part) => String(part || "").trim()).filter(Boolean);
  const chosen = [];
  const seen = new Set();
  const habitatWeights = [];
  const add = (metric, weight = "中") => {
    if (!CORE_METRICS.includes(metric) || seen.has(metric) || chosen.length >= 2) return;
    seen.add(metric);
    chosen.push({ metric, weight: /重|中|轻/.test(weight) ? weight : "中", label: CORE_METRIC_LABELS[metric], unit: CORE_METRIC_UNITS[metric] });
  };
  parts.forEach((part) => {
    const core = tokenCoreMetric(part);
    const weight = /重/.test(part) ? "重" : /轻/.test(part) ? "轻" : "中";
    if (core === "habitat") habitatWeights.push(weight);
    else add(core, weight);
  });
  habitatWeights.forEach((weight) => {
    if (!seen.has("animals")) add("animals", weight);
    else if (!seen.has("fund")) add("fund", weight);
    else add("visitors", weight);
  });
  const textHint = `${event.title || ""} ${event.impact || ""} ${event.summary || ""} ${event.drill || ""}`;
  if (/游客|旅游|参观|社区|客流/.test(textHint)) add("visitors", "中");
  if (/基金|拨款|经费|收入|经营|星币/.test(textHint)) add("fund", "中");
  if (/动物|物种|救护|放归|种群|幼体|野生/.test(textHint)) add("animals", "中");
  categoryFallbackPair(event.category).forEach((metric) => add(metric, "中"));
  CORE_METRICS.forEach((metric) => add(metric, "中"));
  return chosen.slice(0, 2);
}

function applyFundImpact(reserve, delta) {
  const before = n(reserve.fund);
  const after = Math.max(0, before + Math.round(Number(delta) || 0));
  reserve.fund = after;
  if (after !== before) recordFundChange(reserve, before, after, "真实事件结算", ((reserve.guardianCycle || {}).day) || 0, "真实事件");
  return { before, after, delta: after - before };
}

function applyVisitorImpact(reserve, delta) {
  const wanted = Math.round(Number(delta) || 0);
  const applied = applyChapterVisitorDelta(reserve, wanted, wanted >= 0 ? "visit" : "loss");
  return { before: applied.before, after: applied.after, delta: applied.delta };
}

function applyAnimalImpact(reserve, delta, options = {}) {
  const before = n(livingAnimalTotal(reserve));
  const wanted = Math.round(Number(delta) || 0);
  if (!wanted) return { before, after: before, delta: 0 };
  const ecology = reserve.ecology || (reserve.ecology = {});
  const chapter = Math.max(1, Math.round(Number((reserve.progression || {}).stage || (reserve.progression || {}).displayChapter || 1)));
  const captive = chapterCaptiveSpeciesSet(reserve);
  const candidates = [];
  getChapterSandboxSpecies(chapter).forEach((species) => {
    const id = species && species.id ? species.id : species;
    if (!id || captive.has(id)) return;
    const group = speciesPopulationGroup(id);
    const pop = n((ecology[group] || {})[id]);
    if (pop <= 0) return;
    candidates.push({ id, group, pop, maxPop: Math.max(1, n((SPECIES_DB[id] || {}).maxPop) || 999) });
  });
  candidates.sort((a, b) => b.pop - a.pop);
  if (wanted > 0) {
    let added = 0;
    for (let index = 0; index < wanted; index += 1) {
      const open = candidates.filter((item) => item.pop < item.maxPop);
      if (!open.length) break;
      const pick = open[added % open.length];
      const bucket = ecology[pick.group] || (ecology[pick.group] = {});
      pick.pop += 1;
      bucket[pick.id] = pick.pop;
      added += 1;
    }
    if (added) recordIncrease(reserve, options.inflow || "returned", added);
  } else {
    let removed = 0;
    const need = Math.abs(wanted);
    for (let index = 0; index < need; index += 1) {
      const open = candidates.filter((item) => item.pop > 1);
      if (!open.length) break;
      const pick = open[removed % open.length];
      const bucket = ecology[pick.group] || (ecology[pick.group] = {});
      pick.pop -= 1;
      bucket[pick.id] = pick.pop;
      removed += 1;
    }
    if (removed) recordDecrease(reserve, options.outflow || "emigrated", removed);
  }
  const after = n(livingAnimalTotal(reserve));
  return { before, after, delta: after - before };
}

function applyCoreMetric(reserve, metric, delta, options = {}) {
  const applied = metric === "fund" ? applyFundImpact(reserve, delta)
    : metric === "visitors" ? applyVisitorImpact(reserve, delta)
    : applyAnimalImpact(reserve, delta, options);
  return Object.assign({ metric, label: CORE_METRIC_LABELS[metric], unit: CORE_METRIC_UNITS[metric] }, applied);
}

function applyRealNatureOutcome(reserve = {}, event = {}, roll = REAL_NATURE_ARCHERY_THRESHOLD) {
  const score = Math.max(1, Math.min(6, Math.round(Number(roll) || 0)));
  const success = score >= REAL_NATURE_ARCHERY_THRESHOLD;
  const pair = realNatureImpactPair(event);
  const sign = success ? 1 : -1;
  const changes = pair.map((item) => {
    const amount = (CORE_METRIC_AMOUNTS[item.metric][item.weight] || CORE_METRIC_AMOUNTS[item.metric].中) * sign;
    return applyCoreMetric(reserve, item.metric, amount);
  });
  const currentVisitors = () => chapterVisitorTotal(reserve);
  const byMetric = (metric) => changes.find((item) => item.metric === metric) || {
    before: metric === "fund" ? n(reserve.fund) : metric === "visitors" ? currentVisitors() : n(livingAnimalTotal(reserve)),
    after: metric === "fund" ? n(reserve.fund) : metric === "visitors" ? currentVisitors() : n(livingAnimalTotal(reserve)),
    delta: 0
  };
  const visitors = byMetric("visitors");
  const fund = byMetric("fund");
  const animals = byMetric("animals");
  return {
    success,
    roll: score,
    pair,
    changes,
    businessChange: {
      visitorsBefore: visitors.before,
      visitorsAfter: visitors.after,
      visitorsDelta: visitors.delta,
      fundBefore: fund.before,
      fundAfter: fund.after,
      fundDelta: fund.delta,
      animalsBefore: animals.before,
      animalsAfter: animals.after,
      animalsDelta: animals.delta,
      impactChanges: changes
    }
  };
}

module.exports = {
  REAL_NATURE_EVENT_DEFINITIONS,
  REAL_NATURE_ARCHERY_THRESHOLD,
  CORE_METRIC_LABELS,
  CORE_METRIC_UNITS,
  CORE_METRIC_AMOUNTS,
  applyCoreMetric,
  eventType,
  isRealNatureEventType,
  beijingDateKey,
  recentRealEventIds,
  realNatureEventEligible,
  chapterHasRequiredRealNature,
  chapterNeedsRequiredRealNature,
  markChapterRealNatureSeen,
  realNatureEventForDate,
  realNatureTriggerType,
  realNatureDefinition,
  realNatureImpactPair,
  applyRealNatureOutcome,
  futureTimelineText
};
