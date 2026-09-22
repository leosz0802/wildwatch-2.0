const { ECOLOGY_THRESHOLDS } = require("./balanceConfig");
const { applyCoreMetric } = require("./realNatureEventSystem");

const SANDBOX_TASK_CAP = 1;
const LATE_SANDBOX_TASK_CAP = 1;
const SYSTEM_TASK_CROSS_KIND_GAP_MS = 12 * 1000;
const EARLY_CHAPTER_SAME_KIND_GAP_MS = 2 * 60 * 1000 + SYSTEM_TASK_CROSS_KIND_GAP_MS;
const SAME_KIND_GAP_MS = 3 * 60 * 1000 + SYSTEM_TASK_CROSS_KIND_GAP_MS;
const EARLY_CHAPTER_GAP_LIMIT = 2;
const IDLE_HIDE_MS = 30 * 1000;

function sandboxTaskKind(item = {}) {
  const eventType = String(item.eventType || item.type || item.id || "");
  const visual = String(item.visualKind || "");
  const title = `${item.title || ""} ${item.label || ""} ${item.id || ""}`;
  if (item.kind === "friendAid" || /friendAid|交换物资|交换结果/.test(`${eventType} ${title}`)) return "exchange";
  if (eventType.startsWith("real_nature_") || item.category === "realNature" || item.recommendAction === "realEvent") return "realNature";
  if (eventType.startsWith("neighbor_") || visual.startsWith("neighbor-") || eventType === "neighbor_exchange") return "neighbor";
  if (isVisitorKind(item, eventType, title)) return "visitor";
  if (item.type === "poacherRescue" || item.kind === "rescue" || item.rescueTargetId || eventType === "poacher") return /盗猎/.test(title) || item.type === "poacherRescue" ? "rescue" : "poacher";
  if (item.type === "dailyReturnEvent" || item.kind === "dailyReturnEvent") return "dailyReturn";
  if (/wildfire|火警|山火|火灾/.test(`${eventType} ${visual} ${title}`)) return "wildfire";
  if (/flash-flood|storm-rain|sandbox_flood|水患|山洪|暴雨|水灾/.test(`${eventType} ${visual} ${title}`)) return "flood";
  if (/disease|病味|病毒|病虫害|病害/.test(`${eventType} ${visual} ${title}`)) return "disease";
  if (item.metric === "water" || /(?:^|_)water(?:_|$)/.test(String(item.id || ""))) return "flood";
  if (item.metric === "grass" || /(?:^|_)grass(?:_|$)/.test(String(item.id || ""))) return "grass";
  if (/脚印|偷猎|poacher/.test(`${eventType} ${title}`)) return "poacher";
  return eventType || item.id || "task";
}

function isVisitorKind(item, eventType, title) {
  return item.type === "visitorIncident" || item.kind === "visitorIncident"
    || eventType.startsWith("visitor_") || /游客/.test(title);
}

function isUserInitiatedSandboxTask(item = {}) {
  if (!item || typeof item !== "object") return false;
  if (item.userInitiated === true || item.source === "user") return true;
  if (item.presentation === "resource-flow") return true;
  const type = String(item.type || "");
  const kind = String(item.kind || "");
  if (type === "poacherRescue" || kind === "rescue" || item.rescueTargetId) return true;
  if (type === "animalInteraction" || kind === "animalInteraction" || item.animalInteractionId) return true;
  if (type === "friendAidParcel") return true;
  return false;
}

function normalizeSandboxTaskRhythm(value = {}) {
  const lastClosedAt = {};
  const lastShownAt = {};
  const visible = {};
  Object.entries(value.lastClosedAt || {}).forEach(([kind, stamp]) => {
    lastClosedAt[kind] = Math.max(0, Math.round(Number(stamp) || 0));
  });
  Object.entries(value.lastShownAt || {}).forEach(([kind, stamp]) => {
    lastShownAt[kind] = Math.max(0, Math.round(Number(stamp) || 0));
  });
  Object.entries(value.visible || {}).forEach(([kind, entry]) => {
    if (!entry) return;
    visible[kind] = {
      id: String(entry.id || kind),
      shownAt: Math.max(0, Math.round(Number(entry.shownAt) || 0)),
      touchedAt: Math.max(0, Math.round(Number(entry.touchedAt) || 0))
    };
  });
  return { lastClosedAt, lastShownAt, visible };
}

function reserveSandboxChapter(reserve = {}) {
  return Math.max(1, Math.round(Number((reserve.progression || {}).stage || (reserve.progression || {}).displayChapter) || 1));
}

function sandboxTaskCap(reserve = {}) {
  return reserveSandboxChapter(reserve) >= 3 ? LATE_SANDBOX_TASK_CAP : SANDBOX_TASK_CAP;
}

function sameKindGapMs(reserve = {}) {
  const stage = reserveSandboxChapter(reserve);
  return stage <= EARLY_CHAPTER_GAP_LIMIT ? EARLY_CHAPTER_SAME_KIND_GAP_MS : SAME_KIND_GAP_MS;
}

function kindReady(rhythm, kind, now, gapMs = SAME_KIND_GAP_MS) {
  if (rhythm.visible[kind]) return true;
  const closed = rhythm.lastClosedAt[kind] || 0;
  return !closed || now - closed > gapMs;
}

function crossKindReady(rhythm, kind, now, gapMs = SYSTEM_TASK_CROSS_KIND_GAP_MS) {
  if (rhythm.visible[kind]) return true;
  let lastOther = 0;
  Object.entries(rhythm.lastClosedAt || {}).forEach(([other, stamp]) => {
    if (other !== kind) lastOther = Math.max(lastOther, stamp);
  });
  Object.entries(rhythm.lastShownAt || {}).forEach(([other, stamp]) => {
    if (other !== kind) lastOther = Math.max(lastOther, stamp);
  });
  Object.entries(rhythm.visible || {}).forEach(([other, entry]) => {
    if (other === kind || !entry) return;
    lastOther = Math.max(lastOther, entry.shownAt || 0, entry.touchedAt || 0);
  });
  return !lastOther || now - lastOther > gapMs;
}

function visibleSystemKinds(rhythm = {}) {
  return Object.keys(rhythm.visible || {});
}

function proposeEcologyCrises(reserve = {}, context = {}) {
  const eco = reserve.ecology || {};
  const season = context.season || ((reserve.seasonState || {}).name) || "雨季";
  const weather = context.weather || ((reserve.seasonState || {}).weather) || "";
  const pulse = String(((reserve.weatherPulse || {}).type) || "");
  const grass = Number(eco.grass) || 0;
  const water = Number(eco.water) || 0;
  const diseaseValue = Number(eco.disease) || 0;
  const harsh = reserveSandboxChapter(reserve) >= 3;
  const crises = [];
  const fire = /wildfire|heat-haze|drought/.test(pulse)
    || grass < ECOLOGY_THRESHOLDS.lowGrass
    || (season === "旱季" && (grass < ECOLOGY_THRESHOLDS.recoveryGrass + (harsh ? 8 : 0) || /热浪|干热/.test(weather)));
  if (fire) {
    crises.push({
      id: "wildfire",
      priority: 110,
      label: "火灾预警",
      body: "干草和热压把烟线推向核心草场。射箭判定伤害：≥3 递减，1–2 递增，必有负向。",
      action: "harshNature",
      recommendLabel: "射箭判定伤害",
      marker: "crisis",
      regionId: "meadow",
      visualKind: "wildfire",
      eventType: "sandbox_wildfire"
    });
  }
  const flood = /flash-flood|storm-rain/.test(pulse)
    || water >= (harsh ? 82 : 88)
    || (season === "雨季" && (water >= (harsh ? 66 : 72) || /暴雨|大雨|阴雨/.test(weather)));
  if (flood) {
    crises.push({
      id: "flood",
      priority: 108,
      label: "水灾改道",
      body: "暴雨把浅滩抬成水道。射箭判定伤害：≥3 递减，1–2 递增，必有负向。",
      action: "harshNature",
      recommendLabel: "射箭判定伤害",
      marker: "crisis",
      regionId: "river",
      visualKind: "flash-flood",
      eventType: "sandbox_flood"
    });
  }
  const disease = pulse === "disease-zone"
    || diseaseValue >= Math.max(harsh ? 14 : 18, ECOLOGY_THRESHOLDS.earlyDisease - (harsh ? 10 : 6))
    || (Number(context.diseaseDelta) || 0) > 1;
  if (disease) {
    crises.push({
      id: "disease",
      priority: 96,
      label: "病虫害扩散",
      body: "幼体和老弱个体会先减少活动。射箭判定伤害：≥3 递减，1–2 递增，必有负向。",
      action: "harshNature",
      recommendLabel: "射箭判定伤害",
      marker: "crisis",
      regionId: "meadow",
      visualKind: "disease-zone",
      eventType: "sandbox_disease"
    });
  }
  if (harsh && (Number(reserve.poacherPressure) || 0) >= 36) {
    crises.push({
      id: "poacher",
      priority: 104,
      label: "盗猎压线",
      body: "邻界脚印和废弃套索同时出现，夜间迁移线正在被切断。",
      action: "antiPoacher",
      marker: "crisis",
      regionId: "river",
      visualKind: "poacher-route",
      eventType: "sandbox_poacher"
    });
  }
  return crises;
}

function applySandboxTaskCadence(reserve = {}, reasons = [], now = Date.now()) {
  const rhythm = normalizeSandboxTaskRhythm(reserve.sandboxTaskRhythm);
  const stamp = Math.max(1, Math.round(Number(now) || Date.now()));
  const gapMs = sameKindGapMs(reserve);
  Object.keys(rhythm.visible).forEach((kind) => {
    const entry = rhythm.visible[kind];
    const anchor = Math.max(entry.touchedAt || 0, entry.shownAt || 0);
    if (anchor && stamp - anchor >= IDLE_HIDE_MS) {
      rhythm.lastClosedAt[kind] = stamp;
      delete rhythm.visible[kind];
    }
  });
  const userReasons = [];
  const systemReasons = [];
  reasons.forEach((reason) => {
    if (isUserInitiatedSandboxTask(reason)) userReasons.push(reason);
    else systemReasons.push(reason);
  });
  const rankedSystem = systemReasons.slice().sort((left, right) => (Number(right.priority) || 0) - (Number(left.priority) || 0));
  const openSystemKinds = visibleSystemKinds(rhythm);
  const keptSystem = [];
  const acceptSystem = (reason) => {
    const kind = sandboxTaskKind(reason);
    if (!kindReady(rhythm, kind, stamp, gapMs) || !crossKindReady(rhythm, kind, stamp, SYSTEM_TASK_CROSS_KIND_GAP_MS)) return;
    if (!rhythm.visible[kind]) {
      rhythm.visible[kind] = { id: reason.id || kind, shownAt: stamp, touchedAt: 0 };
      rhythm.lastShownAt[kind] = stamp;
    }
    keptSystem.push(reason);
  };
  if (openSystemKinds.length) {
    const current = rankedSystem.find((reason) => openSystemKinds.includes(sandboxTaskKind(reason)));
    if (current) acceptSystem(current);
  } else {
    const next = rankedSystem.find((reason) => (
      kindReady(rhythm, sandboxTaskKind(reason), stamp, gapMs)
      && crossKindReady(rhythm, sandboxTaskKind(reason), stamp, SYSTEM_TASK_CROSS_KIND_GAP_MS)
    ));
    if (next) acceptSystem(next);
  }
  const kept = userReasons.concat(keptSystem);
  Object.keys(rhythm.visible).forEach((kind) => {
    if (keptSystem.some((item) => sandboxTaskKind(item) === kind)) return;
    const stillOffered = rankedSystem.some((item) => sandboxTaskKind(item) === kind);
    if (!stillOffered) {
      rhythm.lastClosedAt[kind] = stamp;
    }
    delete rhythm.visible[kind];
  });
  reserve.sandboxTaskRhythm = rhythm;
  return kept;
}

function touchSandboxTask(reserve = {}, item = {}, now = Date.now()) {
  const kind = sandboxTaskKind(item);
  const rhythm = normalizeSandboxTaskRhythm(reserve.sandboxTaskRhythm);
  if (rhythm.visible[kind]) rhythm.visible[kind].touchedAt = Math.max(1, Math.round(Number(now) || Date.now()));
  reserve.sandboxTaskRhythm = rhythm;
  return kind;
}

function closeSandboxTaskKinds(reserve = {}, kinds = [], now = Date.now()) {
  const rhythm = normalizeSandboxTaskRhythm(reserve.sandboxTaskRhythm);
  const stamp = Math.max(1, Math.round(Number(now) || Date.now()));
  (Array.isArray(kinds) ? kinds : [kinds]).filter(Boolean).forEach((kind) => {
    rhythm.lastClosedAt[kind] = stamp;
    delete rhythm.visible[kind];
  });
  reserve.sandboxTaskRhythm = rhythm;
  return rhythm;
}

function closeSandboxTasksForAction(reserve = {}, actionId = "", now = Date.now()) {
  const action = String(actionId || "");
  if (action === "harshNature") return closeSandboxTaskKinds(reserve, ["wildfire", "flood", "disease"], now);
  if (action === "habitat") return closeSandboxTaskKinds(reserve, ["grass"], now);
  if (action === "intervention") return closeSandboxTaskKinds(reserve, [], now);
  if (action === "antiPoacher") return closeSandboxTaskKinds(reserve, ["poacher"], now);
  if (action === "visitorAdjust") return closeSandboxTaskKinds(reserve, ["visitor"], now);
  if (action === "neighborExchange") return closeSandboxTaskKinds(reserve, ["neighbor", "exchange"], now);
  return reserve.sandboxTaskRhythm;
}

const HARSH_NATURE_ARCHERY_THRESHOLD = 3;
const HARSH_NATURE_DAMAGE_BY_SCORE = Object.freeze({ 1: 8, 2: 6, 3: 4, 4: 3, 5: 2, 6: 1 });
const HARSH_NATURE_PROFILES = Object.freeze({
  wildfire: Object.freeze({
    kind: "wildfire",
    title: "火灾预警",
    icon: "wildfire",
    body: "烟线已经压向核心草场。射箭判定伤害，点数越高伤害越小，但火情一定留下负向结果。",
    metrics: Object.freeze(["grass", "animals"])
  }),
  flood: Object.freeze({
    kind: "flood",
    title: "水灾改道",
    icon: "water",
    body: "暴雨改写浅滩和迁移线。射箭判定伤害，点数越高伤害越小，但水灾一定留下负向结果。",
    metrics: Object.freeze(["animals", "visitors"])
  }),
  disease: Object.freeze({
    kind: "disease",
    title: "病虫害扩散",
    icon: "medicalKit",
    body: "病味正在改写取食路线。射箭判定伤害，点数越高伤害越小，但病虫害一定留下负向结果。",
    metrics: Object.freeze(["disease", "animals"])
  })
});

function harshNatureKind(item = {}) {
  if (!item || typeof item !== "object") return "";
  if (item.presentation === "resource-flow") return "";
  if (item.category === "realNature" || item.recommendAction === "realEvent") return "";
  const eventType = String(item.eventType || item.type || "");
  if (eventType.startsWith("real_nature_") || eventType.startsWith("neighbor_") || eventType.startsWith("visitor_")) return "";
  if (["water_contamination", "animal_water_conflict", "community_blockade", "poacher_ring", "snare_line"].includes(eventType)) return "";
  const action = item.recommendAction || item.action || "";
  if ((item.responseOptions || []).length && action && action !== "harshNature") return "";
  const visual = String(item.visualKind || "");
  const title = `${item.title || ""} ${item.label || ""}`;
  if (action === "harshNature"
    || /sandbox_wildfire/.test(eventType)
    || visual === "wildfire"
    || /火灾预警/.test(title)) {
    const hinted = sandboxTaskKind(item);
    return hinted === "flood" || hinted === "disease" ? hinted : "wildfire";
  }
  if (/sandbox_flood/.test(eventType) || visual === "flash-flood" || /水灾改道/.test(title)) return "flood";
  if (/sandbox_disease/.test(eventType) || visual === "disease-zone" || /病虫害扩散/.test(title)) return "disease";
  return "";
}

function isHarshNatureEvent(item = {}) {
  return !!harshNatureKind(item);
}

function harshNatureProfile(kind = "wildfire") {
  return HARSH_NATURE_PROFILES[kind] || HARSH_NATURE_PROFILES.wildfire;
}

function harshNatureDamageForScore(score = 1) {
  const roll = Math.max(1, Math.min(6, Math.round(Number(score) || 1)));
  return HARSH_NATURE_DAMAGE_BY_SCORE[roll];
}

function applyEcologyShift(reserve, key, delta, label) {
  const ecology = reserve.ecology || (reserve.ecology = {});
  const before = Math.max(0, Math.round(Number(ecology[key]) || 0));
  const after = Math.max(0, Math.min(100, before + Math.round(Number(delta) || 0)));
  ecology[key] = after;
  return { metric: key, label, unit: "", before, after, delta: after - before };
}

function applyHarshNatureChange(reserve, metric, delta) {
  if (metric === "grass") return applyEcologyShift(reserve, "grass", delta, "草场");
  if (metric === "disease") return applyEcologyShift(reserve, "disease", delta, "病虫害");
  if (metric === "water") return applyEcologyShift(reserve, "water", delta, "水源");
  return applyCoreMetric(reserve, metric, delta, metric === "animals" ? { outflow: "died" } : {});
}

function applyHarshNatureOutcome(reserve = {}, kind = "wildfire", roll = HARSH_NATURE_ARCHERY_THRESHOLD) {
  const score = Math.max(1, Math.min(6, Math.round(Number(roll) || 1)));
  const damage = harshNatureDamageForScore(score);
  const profile = harshNatureProfile(kind);
  const reduced = score >= HARSH_NATURE_ARCHERY_THRESHOLD;
  const animalHit = -Math.max(1, Math.round(damage * 0.75));
  const visitorHit = -Math.max(4, damage * 4);
  const planned = {
    wildfire: { grass: -damage, animals: animalHit },
    flood: { animals: animalHit, visitors: visitorHit },
    disease: { disease: damage, animals: animalHit }
  }[profile.kind] || { grass: -damage, animals: animalHit };
  const changes = Object.entries(planned).map(([metric, delta]) => applyHarshNatureChange(reserve, metric, delta));
  if (!changes.some((item) => item && item.delta !== 0)) {
    changes[0] = applyEcologyShift(reserve, "grass", -Math.max(1, damage), "草场");
  }
  const pulse = reserve.weatherPulse || null;
  if (pulse && (
    (profile.kind === "wildfire" && /wildfire|heat-haze|drought/.test(String(pulse.type || "")))
    || (profile.kind === "flood" && /flash-flood|storm-rain/.test(String(pulse.type || "")))
    || (profile.kind === "disease" && /disease/.test(String(pulse.type || "")))
  )) {
    pulse.remainingDays = 0;
    pulse.expiresAt = Date.now();
  }
  closeSandboxTaskKinds(reserve, [profile.kind], Date.now());
  return {
    success: reduced,
    roll: score,
    damage,
    kind: profile.kind,
    title: profile.title,
    changes,
    impactChanges: changes,
    body: reduced
      ? `射箭 ${score} 点，伤害已压低，但${profile.title}仍留下负向结果。`
      : `射箭 ${score} 点，伤害加重，${profile.title}冲击扩大。`
  };
}

module.exports = {
  SANDBOX_TASK_CAP,
  LATE_SANDBOX_TASK_CAP,
  SYSTEM_TASK_CROSS_KIND_GAP_MS,
  sandboxTaskCap,
  EARLY_CHAPTER_SAME_KIND_GAP_MS,
  SAME_KIND_GAP_MS,
  EARLY_CHAPTER_GAP_LIMIT,
  IDLE_HIDE_MS,
  sandboxTaskKind,
  isUserInitiatedSandboxTask,
  sameKindGapMs,
  normalizeSandboxTaskRhythm,
  proposeEcologyCrises,
  applySandboxTaskCadence,
  touchSandboxTask,
  closeSandboxTaskKinds,
  closeSandboxTasksForAction,
  HARSH_NATURE_ARCHERY_THRESHOLD,
  HARSH_NATURE_DAMAGE_BY_SCORE,
  harshNatureKind,
  isHarshNatureEvent,
  harshNatureProfile,
  harshNatureDamageForScore,
  applyHarshNatureOutcome
};
