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
const REAL_NATURE_THEME_RULES = Object.freeze({
  disease: Object.freeze({
    label: "疾病与隔离",
    visualKind: "disease-zone",
    regionId: "meadow",
    primary: "intervention",
    secondary: "houndScout",
    relationshipLine: "人要给病弱动物留出距离，同时为救护、隔离和观察保留通道。",
    animalLine: "动物可能减少接触、离开聚集地，幼体和高龄个体会先受到影响。",
    ecologicalMechanism: "病原或中毒会先改变动物健康，再改变饮水、迁徙和种群接触方式。",
    playerQuestion: "先隔离风险，还是先追踪证据？每一步都会改变动物与人的安全距离。",
    effects: (amount) => ({
      pressureEffects: { disease: 1, stability: -1 },
      resolvedEffects: { disease: -amount, stability: amount, safety: 1 },
      failedEffects: { disease: amount, stability: -amount, safety: -1 }
    })
  }),
  water: Object.freeze({
    label: "水源与栖息地",
    visualKind: "contaminated-water",
    regionId: "river",
    primary: "habitat",
    secondary: "intervention",
    relationshipLine: "人类取水、生产和动物饮水共享同一条水线，先隔离污染才能让双方继续使用。",
    animalLine: "水鸟、鱼类和来饮水的陆生动物会改变路线；水质恶化还会放大疾病风险。",
    ecologicalMechanism: "水位、水质和污染物会沿河道扩散，先影响饮水，再影响食物链和繁殖地。",
    playerQuestion: "你要先保护饮水点，还是先追踪污染源？动物会根据水线是否安全重新迁移。",
    effects: (amount, positive) => positive ? ({
      pressureEffects: {},
      resolvedEffects: { water: amount, stability: 1 },
      failedEffects: { water: -1, disease: 1 }
    }) : ({
      pressureEffects: { water: -1, disease: 1 },
      resolvedEffects: { water: amount, disease: -1, stability: amount, safety: 1 },
      failedEffects: { water: -amount, disease: amount, stability: -amount, safety: -1 }
    })
  }),
  fire: Object.freeze({
    label: "火、热浪与干旱",
    visualKind: "wildfire",
    regionId: "meadow",
    primary: "habitat",
    secondary: "houndScout",
    relationshipLine: "火线前的人类撤离、救援和巡护必须给动物留出逃生廊道，火后也不能立刻逼近。",
    animalLine: "动物会避开烟火、寻找水线和阴影；幼体、巢穴和草食动物的食物最容易先受损。",
    ecologicalMechanism: "高温、干旱和火会同时消耗草场与水源，改变迁徙路径并放大人与动物的相遇风险。",
    playerQuestion: "先开出逃生通道，还是先保护水草？错误顺序会把动物推向人类活动区。",
    effects: (amount, positive) => positive ? ({
      pressureEffects: {},
      resolvedEffects: { grass: amount, water: 1, safety: 1, stability: 1 },
      failedEffects: { grass: -1, water: -1, safety: -1 }
    }) : ({
      pressureEffects: { grass: -1, water: -1, safety: -1 },
      resolvedEffects: { grass: amount, water: 1, safety: 1, stability: amount },
      failedEffects: { grass: -amount, water: -1, safety: -1, stability: -amount }
    })
  }),
  coexistence: Object.freeze({
    label: "人和动物的共同边界",
    visualKind: "community",
    regionId: "center",
    primary: "houndScout",
    secondary: "habitat",
    relationshipLine: "保护不是把人赶走，而是和社区一起约定边界、时间和可接受的干预方式。",
    animalLine: "动物会记住安全路线，也会记住被追逐、惊扰或反复接近的地点。",
    ecologicalMechanism: "人的路线、噪声和资源使用会改变动物的停留、迁徙和繁殖选择。",
    playerQuestion: "这次行动要减少干扰，还是增加共同守护？请把动物的选择留在方案里。",
    effects: (amount, positive) => positive ? ({
      pressureEffects: {},
      resolvedEffects: { stability: amount, reputation: 1, safety: 1 },
      failedEffects: { stability: -1, reputation: -1 }
    }) : ({
      pressureEffects: { stability: -1 },
      resolvedEffects: { stability: amount, reputation: 1, safety: 1 },
      failedEffects: { stability: -amount, reputation: -1, safety: -1 }
    })
  }),
  species: Object.freeze({
    label: "物种、迁徙与照护",
    visualKind: "animal-rescue",
    regionId: "rocks",
    primary: "intervention",
    secondary: "houndScout",
    relationshipLine: "人类的帮助要服从动物的节律：救护、放归和观察都要减少不必要的打扰。",
    animalLine: "动物是否留下，取决于食物、水、同伴和安全感，不是一次操作就能决定。",
    ecologicalMechanism: "单个物种的健康会通过食物、捕食和迁徙关系传到整个生境。",
    playerQuestion: "你要救护、放归，还是先留出安静的观察距离？",
    effects: (amount, positive) => positive ? ({
      pressureEffects: {},
      resolvedEffects: { stability: amount, safety: 1 },
      failedEffects: { stability: -1, safety: -1 }
    }) : ({
      pressureEffects: { stability: -1 },
      resolvedEffects: { stability: amount, safety: 1 },
      failedEffects: { stability: -amount, safety: -1 }
    })
  })
});
function realNatureEventText(event = {}) {
  return [
    event.category, event.title, event.summary, event.impact, event.drill,
    event.metrics, event.place
  ].filter(Boolean).join(" ");
}
function realNatureTheme(event = {}) {
  const text = realNatureEventText(event);
  if (/疾病|疫情|禽流感|病毒|病原|中毒|毒藻|搁浅|异常.*死亡|集中死亡|死亡调查|白鼻|感染|病死|兽疫|疫/.test(text)) {
    return REAL_NATURE_THEME_RULES.disease;
  }
  const strongFire = /山火|火点|火季|野火|森林火|高火险/.test(text);
  const waterCue = /污染|泄漏|水质|洪水|河流|湿地|海冰|珊瑚|水华|油膜|水源|饮水|水道|湖泊|河溪|海洋|上升流|低流量/.test(text);
  if (waterCue && !strongFire) {
    return REAL_NATURE_THEME_RULES.water;
  }
  if (/山火|火灾|火点|火季|热浪|高温|干旱|干热|烟雾|烧毁|野火|森林韧性|高火险/.test(text)) {
    return REAL_NATURE_THEME_RULES.fire;
  }
  if (/社区|原住民|渔民|牧民|游客|旅游|廊道|共管|协商|治理|禁捕|保护区|巡护|盗猎|偷猎|执法/.test(text)) {
    return REAL_NATURE_THEME_RULES.coexistence;
  }
  return REAL_NATURE_THEME_RULES.species;
}
function eventType(id = "") {
  return `real_nature_${id}`;
}
function isRealNatureEventType(type = "") {
  return String(type).startsWith("real_nature_");
}
function beijingDateKey(now = Date.now()) {
  if (typeof Intl !== "undefined" && typeof Intl.DateTimeFormat === "function") {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date(now));
  }
  const timestamp = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const shifted = new Date(timestamp + 8 * 60 * 60 * 1000);
  const pad = (value) => String(value).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
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
// Use recognizable flagship animals for the first impression of the
// extinction-record system.  The remaining records stay in the pool, but
// familiar species receive a higher draw weight so the archive feels
// approachable before it expands into specialist cases.
const FAMILIAR_EXTINCTION_IDS = Object.freeze(new Set([
  "extinction-baiji",
  "extinction-western-black-rhino",
  "extinction-pinta-tortoise",
  "extinction-spix-macaw",
  "extinction-formosan-clouded-leopard",
  "extinction-caribbean-monk-seal",
  "extinction-chinese-paddlefish",
  "extinction-scimitar-oryx",
  "extinction-northern-white-rhino",
  "extinction-ivory-billed-woodpecker"
]));
function selectExtinctionEvent(candidates = [], dateKey = "") {
  if (!candidates.length) return null;
  const weighted = [];
  candidates.forEach((event) => {
    const weight = FAMILIAR_EXTINCTION_IDS.has(event.id) ? 4 : 1;
    for (let index = 0; index < weight; index += 1) weighted.push(event);
  });
  return weighted[hash(`${dateKey}:familiar-extinction`) % weighted.length] || candidates[0];
}
const REAL_NATURE_ENTRY_DELAY_SECONDS = 20;
function realNatureEventEligible(reserve = {}) {
  const progression = reserve.progression || {};
  const chapterStart = progression.chapterStart || progression.stageStart || {};
  const activeSeconds = Math.max(0, Number(progression.activeSeconds) || 0);
  const chapterStartSeconds = Math.max(0, Number(chapterStart.activeSeconds) || 0);
  return activeSeconds - chapterStartSeconds >= REAL_NATURE_ENTRY_DELAY_SECONDS;
}
function liveChapterNumber(reserve = {}) {
  const progression = reserve.progression || {};
  return Math.max(1, Math.round(Number(progression.stage || progression.displayChapter || 1) || 1));
}
const REAL_NATURE_CHAPTER_QUOTA = 2;
function realNatureChapterQuota() {
  return REAL_NATURE_CHAPTER_QUOTA;
}
function realNatureSeenCount(reserve = {}) {
  const chapter = liveChapterNumber(reserve);
  const emergency = reserve.emergency || {};
  if (Math.max(0, Math.round(Number(emergency.realNatureChapter) || 0)) !== chapter) return 0;
  const count = Math.round(Number(emergency.realNatureChapterCount) || 0);
  // A save from the one-event rule has the chapter latch and no count.
  return count > 0 ? count : 1;
}
function chapterHasExtinctionRealNature(reserve = {}) {
  const chapter = liveChapterNumber(reserve);
  if (chapter < 2) return true;
  const emergency = reserve.emergency || {};
  if (Math.max(0, Math.round(Number(emergency.realNatureExtinctionChapter) || 0)) === chapter) return true;
  const activeId = String(((emergency.active || {}).realEventId) || "");
  return activeId.startsWith("extinction-");
}
function chapterHasRequiredRealNature(reserve = {}) {
  const emergency = reserve.emergency || {};
  if (isRealNatureEventType((emergency.active || {}).type)) return true;
  return realNatureSeenCount(reserve) >= realNatureChapterQuota() && chapterHasExtinctionRealNature(reserve);
}
function chapterNeedsRequiredRealNature(reserve = {}) {
  return realNatureEventEligible(reserve) && !chapterHasRequiredRealNature(reserve);
}
function markChapterRealNatureSeen(reserve = {}) {
  const chapter = liveChapterNumber(reserve);
  const emergency = reserve.emergency || (reserve.emergency = {});
  const sameChapter = Math.max(0, Math.round(Number(emergency.realNatureChapter) || 0)) === chapter;
  const previous = sameChapter ? realNatureSeenCount(reserve) : 0;
  const activeId = String((emergency.active && (emergency.active.id || emergency.active.type)) || "");
  if (sameChapter && activeId && emergency.realNatureCountedId === activeId) return previous;
  emergency.realNatureChapter = chapter;
  emergency.realNatureChapterCount = Math.min(realNatureChapterQuota(), previous + 1);
  if (activeId) emergency.realNatureCountedId = activeId;
  const realEventId = String(((emergency.active || {}).realEventId) || "");
  if (realEventId.startsWith("extinction-")) emergency.realNatureExtinctionChapter = chapter;
  return chapter;
}
function realNatureEventForDate(reserve = {}, now = Date.now(), options = {}) {
  const dateKey = beijingDateKey(now);
  const recent = new Set(recentRealEventIds(reserve));
  const blockedTypes = options.blockedTypes instanceof Set ? options.blockedTypes : new Set(options.blockedTypes || []);
  const blockedThemes = new Set(Array.from(blockedTypes).map((type) => {
    const definition = REAL_NATURE_EVENT_DEFINITIONS[type];
    return definition && definition.themeId ? definition.themeId : "";
  }).filter(Boolean));
  // 完成章节保底后，每四个额外实录窗口仍保留一个物种消失档案，
  // 同时继续轮换水灾、火灾、污染和保护行动。
  const extinction = REAL_NATURE_EVENTS.filter((event) => event.extinction === true);
  const regular = REAL_NATURE_EVENTS.filter((event) => event.extinction !== true);
  // 第2章起，每章至少安排一次物种消失档案。旧存档如果已经看过普通
  // 实录但没见过物种消失任务，也会在下一次任务窗口补发。
  const extinctionSlot = extinction.length && (!chapterHasExtinctionRealNature(reserve) || hash(dateKey) % 4 === 0);
  const pool = extinctionSlot ? extinction : regular;
  const start = hash(`${dateKey}:${extinctionSlot ? "extinction" : "regular"}`) % pool.length;
  if (extinctionSlot) {
    const candidates = extinction.filter((event) => {
      const definition = REAL_NATURE_EVENT_DEFINITIONS[eventType(event.id)];
      return !recent.has(event.id) && !(definition && blockedThemes.has(definition.themeId));
    });
    const selected = selectExtinctionEvent(candidates, dateKey);
    if (selected) return selected;
  }
  for (let offset = 0; offset < pool.length; offset += 1) {
    const event = pool[(start + offset) % pool.length];
    const definition = REAL_NATURE_EVENT_DEFINITIONS[eventType(event.id)];
    if (!recent.has(event.id) && !(definition && blockedThemes.has(definition.themeId))) return event;
  }
  return blockedTypes.size ? null : pool[start];
}
function routeFor(event = {}) {
  const theme = realNatureTheme(event);
  const route = CATEGORY_ROUTES[event.category] || CATEGORY_ROUTES.野生动物;
  if (theme && theme !== REAL_NATURE_THEME_RULES.species) {
    return Object.assign({}, route, {
      regionId: theme.regionId,
      visualKind: theme.visualKind,
      primary: theme.primary,
      secondary: theme.secondary
    });
  }
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
  return realNatureTheme(event).effects(amount, positive);
}
function futureTimelineText(value = "", years = 5) {
  return String(value || "").replace(/\b(19|20)\d{2}\b/g, (year) => String(Number(year) + years));
}
function realNatureDefinition(event = {}) {
  const route = routeFor(event);
  const effects = effectsFor(event);
  const theme = realNatureTheme(event);
  const displayDate = futureTimelineText(event.date);
  const displayTitle = futureTimelineText(event.title);
  // The event category is already shown in the modal kicker. Keep the title
  // focused on the species and place so the header remains readable.
  const taskTitle = displayTitle;
  const displaySummary = futureTimelineText(event.summary);
  const displayImpact = futureTimelineText(event.impact);
  const displayDrill = futureTimelineText(event.drill);
  const sourceLine = `${displayDate}｜${event.place}｜来源：${event.source}`;
  const extinctionLine = event.extinction ? `这是${event.extinctionStatus || "物种消失"}档案演练，救护结果只代表本次保护区接收的动物，不代表物种已经复原。` : "";
  const startBody = `${sourceLine}。${displaySummary} ${theme.ecologicalMechanism} ${theme.relationshipLine}${extinctionLine ? ` ${extinctionLine}` : ""}`;
  const resolvedBody = event.extinction
    ? `${sourceLine}。${event.extinctionSpecies || "档案物种"}救护演练已完成。${event.thanks || "感谢你为物种保护贡献一份力量。"}`
    : `${sourceLine}。${theme.animalLine} ${theme.relationshipLine} 这次处置已记录，保护区只把演练结果写入当前生态状态。`;
  const failedBody = event.extinction
    ? `${sourceLine}。救护窗口有限，本次只接收少量${event.extinctionSpecies || "档案物种"}，但每一只都值得被留下。${event.thanks || "感谢你为物种保护贡献一份力量。"}`
    : `${sourceLine}。${theme.animalLine} 风险没有被及时隔离，${theme.playerQuestion} 保护区承担对应演练影响。`;
  return Object.freeze(Object.assign({
    type: eventType(event.id),
    realEventId: event.id,
    category: "realNature",
    categoryLabel: "保护区野外实录",
    source: "realNature",
    title: taskTitle,
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
    themeId: Object.keys(REAL_NATURE_THEME_RULES).find((key) => REAL_NATURE_THEME_RULES[key] === theme) || "species",
    themeLabel: theme.label,
    relationshipLine: theme.relationshipLine,
    animalLine: theme.animalLine,
    ecologicalMechanism: theme.ecologicalMechanism,
    playerQuestion: theme.playerQuestion,
    extinction: !!event.extinction,
    extinctionSpecies: event.extinctionSpecies || "",
    extinctionStatus: event.extinctionStatus || "",
    thanks: event.thanks || "",
    causeChain: Object.freeze([theme.ecologicalMechanism, theme.animalLine, theme.relationshipLine]),
    target: 3,
    days: 3,
    startBody,
    resolvedTitle: `${displayTitle}演练完成`,
    resolvedBody,
    failedTitle: `${displayTitle}演练未完成`,
    failedBody,
    responses: Object.freeze([
      Object.freeze({ action: route.primary, label: ACTION_LABELS[route.primary], gain: 2, preview: `${displayDrill} ${theme.playerQuestion}` })
    ])
  }, effects));
}
const REAL_NATURE_EVENT_DEFINITIONS = Object.freeze(Object.fromEntries(
  REAL_NATURE_EVENTS.map((event) => [eventType(event.id), realNatureDefinition(event)])
));
function realNatureTriggerType(reserve = {}, now = Date.now(), options = {}) {
  if (!options.ignoreQuiet && !realNatureEventEligible(reserve)) return null;
  const event = realNatureEventForDate(reserve, now, options);
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
  if (after !== before) recordFundChange(reserve, before, after, "保护区野外实录结算", ((reserve.guardianCycle || {}).day) || 0, "保护区野外实录");
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
    const { addLivingAnimals } = require("./animalSourceLedger");
    const granted = addLivingAnimals(reserve, wanted, options.inflow || "returned");
    const after = n(livingAnimalTotal(reserve));
    return { before, after, delta: granted.added };
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
  REAL_NATURE_ENTRY_DELAY_SECONDS,
  CORE_METRIC_LABELS,
  CORE_METRIC_UNITS,
  CORE_METRIC_AMOUNTS,
  applyCoreMetric,
  eventType,
  isRealNatureEventType,
  beijingDateKey,
  recentRealEventIds,
  FAMILIAR_EXTINCTION_IDS,
  realNatureEventEligible,
  chapterHasRequiredRealNature,
  REAL_NATURE_CHAPTER_QUOTA,
  realNatureChapterQuota,
  chapterNeedsRequiredRealNature,
  markChapterRealNatureSeen,
  realNatureEventForDate,
  realNatureTriggerType,
  realNatureDefinition,
  realNatureTheme,
  realNatureImpactPair,
  applyRealNatureOutcome,
  futureTimelineText
};
