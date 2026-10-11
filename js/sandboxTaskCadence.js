const { ECOLOGY_THRESHOLDS } = require("./balanceConfig");
const { applyCoreMetric } = require("./realNatureEventSystem");
const { livingAnimalTotal } = require("./chapterRescueSystem");
const { chapterVisitorTotal } = require("./chapterTargets");
const SANDBOX_TASK_CAP = 1;
const DISASTER_KINDS = Object.freeze(["wildfire", "flood", "disease"]);
const DISASTER_DRAIN_INTERVAL_MS = 60 * 1000;
const DISASTER_DRAIN_RATE = 0.01;
const DISASTER_TITLES = Object.freeze({
  wildfire: "火灾预警",
  flood: "水灾改道",
  disease: "病虫害扩散"
});
const LATE_SANDBOX_TASK_CAP = 1;
// System ecology tasks should keep moving without waiting several minutes.
// The chapter-level seenTaskKeys/disaster-theme guards still prevent a task
// from repeating in the same chapter; these values only control the minimum
// time before another eligible task can take the slot.
const SYSTEM_TASK_CROSS_KIND_GAP_MS = 20 * 1000;
const EARLY_CHAPTER_SAME_KIND_GAP_MS = 20 * 1000;
const SAME_KIND_GAP_MS = 20 * 1000;
const EARLY_CHAPTER_GAP_LIMIT = 2;
const IDLE_HIDE_MS = 30 * 1000;
const SANDBOX_TASK_HISTORY_LIMIT = 64;
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
  const seenTaskKeys = Array.from(new Set(
    (Array.isArray(value.seenTaskKeys) ? value.seenTaskKeys : [])
      .map((key) => String(key || "").trim())
      .filter(Boolean)
  )).slice(-SANDBOX_TASK_HISTORY_LIMIT);
  const chapter = Math.max(0, Math.round(Number(value.chapter) || 0));
  return { chapter, lastClosedAt, lastShownAt, visible, seenTaskKeys };
}
function reserveSandboxChapter(reserve = {}) {
  return Math.max(1, Math.round(Number((reserve.progression || {}).stage || (reserve.progression || {}).displayChapter) || 1));
}
function prepareSandboxTaskRhythm(reserve = {}, rhythm = {}) {
  const chapter = reserveSandboxChapter(reserve);
  // A rhythm belongs to one chapter.  This clears an old visible marker and
  // its history when a save advances, while preserving legacy saves that do
  // not have a chapter field yet.
  if (rhythm.chapter && rhythm.chapter !== chapter) {
    return { chapter, lastClosedAt: {}, lastShownAt: {}, visible: {}, seenTaskKeys: [] };
  }
  rhythm.chapter = chapter;
  rhythm.seenTaskKeys = Array.isArray(rhythm.seenTaskKeys) ? rhythm.seenTaskKeys : [];
  return rhythm;
}
function sandboxTaskKey(item = {}) {
  const kind = sandboxTaskKind(item);
  if (item.presentation === "resource-flow") {
    return `flow:${String(item.id || item.metric || kind)}`;
  }
  if (DISASTER_KINDS.includes(kind)) return `disaster:${kind}`;
  if (kind === "realNature") {
    return `realNature:${String(item.realEventId || item.eventType || item.id || item.label || "event")}`;
  }
  return `${kind}:${String(item.eventType || item.id || item.label || item.title || "task")}`;
}
function sandboxTaskWasSeen(rhythm, item) {
  return rhythm.seenTaskKeys.includes(sandboxTaskKey(item));
}
function rememberSandboxTask(rhythm, item) {
  const key = sandboxTaskKey(item);
  if (!rhythm.seenTaskKeys.includes(key)) rhythm.seenTaskKeys.push(key);
  if (rhythm.seenTaskKeys.length > SANDBOX_TASK_HISTORY_LIMIT) {
    rhythm.seenTaskKeys.splice(0, rhythm.seenTaskKeys.length - SANDBOX_TASK_HISTORY_LIMIT);
  }
}
function sandboxPoolHash(item = {}) {
  const text = String(item.eventType || item.id || item.label || "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
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
function riverShallowsBuilt(reserve = {}) {
  const node = (((reserve.development || {}).nodes || {}).river_shallows) || {};
  return node.phase === "operational";
}
function chapterEcologyTaskPool(reserve = {}) {
  const chapter = reserveSandboxChapter(reserve);
  // Keep a small, actionable pool alive in every chapter.  Crisis markers are
  // still higher priority, but once one has been handled the player gets a
  // different field task instead of seeing the same crisis occupy the slot
  // forever.  Chapter-scoped ids make the pool reset naturally on advancement.
  return [
    {
      id: `river_watch_${chapter}`,
      priority: 86,
      label: "巡查新水线",
      body: "记录水位和动物饮水路线，确认改道后的安全落脚点。",
      action: "houndScout",
      marker: "event",
      regionId: "river",
      visualKind: "river-watch",
      eventType: "sandbox_river_watch"
    },
    {
      id: `migration_trace_${chapter}`,
      priority: 86,
      label: "记录迁徙路线",
      body: "沿脚印确认迁徙方向，给动物留出下一段通行空间。",
      action: "habitat",
      marker: "event",
      regionId: "meadow",
      visualKind: "migration-trace",
      eventType: "sandbox_migration_trace"
    },
    {
      id: `species_observation_${chapter}`,
      priority: 86,
      label: "观察物种踪迹",
      body: "完成一次野外观察，记录本章最需要关注的动物变化。",
      action: "houndScout",
      marker: "event",
      regionId: "center",
      visualKind: "species-observation",
      eventType: "sandbox_species_observation"
    }
  ];
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
  const weatherFlood = /flash-flood|storm-rain/.test(pulse)
    || water >= (harsh ? 82 : 88)
    || (season === "雨季" && (water >= (harsh ? 66 : 72) || /暴雨|大雨|阴雨/.test(weather)));
  const riverOpen = riverShallowsBuilt(reserve);
  if (weatherFlood || !riverOpen) {
    const hazardOnly = !weatherFlood && !riverOpen;
    crises.push({
      id: "flood",
      priority: hazardOnly ? 107 : 108,
      label: hazardOnly ? "水灾隐患" : "水灾改道",
      body: hazardOnly
        ? "浅滩还没建成，水灾隐患会反复出现。射箭能压低这一次，建成浅滩后才会停。"
        : "暴雨把浅滩抬成水道。射箭判定伤害：≥3 递减，1–2 递增，必有负向。",
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
  return crises.concat(chapterEcologyTaskPool(reserve));
}
function applySandboxTaskCadence(reserve = {}, reasons = [], now = Date.now()) {
  const rhythm = prepareSandboxTaskRhythm(reserve, normalizeSandboxTaskRhythm(reserve.sandboxTaskRhythm));
  const stamp = Math.max(1, Math.round(Number(now) || Date.now()));
  const gapMs = sameKindGapMs(reserve);
  Object.keys(rhythm.visible).forEach((kind) => {
    if (DISASTER_KINDS.includes(kind)) return;
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
  const rankedSystem = systemReasons.slice().sort((left, right) => {
    const leftPool = String(left.eventType || "").startsWith("sandbox_") && !DISASTER_KINDS.includes(sandboxTaskKind(left));
    const rightPool = String(right.eventType || "").startsWith("sandbox_") && !DISASTER_KINDS.includes(sandboxTaskKind(right));
    if (leftPool && rightPool) return sandboxPoolHash(left) - sandboxPoolHash(right);
    return (Number(right.priority) || 0) - (Number(left.priority) || 0);
  });
  const openSystemKinds = visibleSystemKinds(rhythm);
  const keptSystem = [];
  const acceptSystem = (reason, ignoreCrossGap = false) => {
    const kind = sandboxTaskKind(reason);
    const alreadyVisible = !!rhythm.visible[kind];
    if (!alreadyVisible && sandboxTaskWasSeen(rhythm, reason)) return;
    if (!kindReady(rhythm, kind, stamp, gapMs)) return;
    if (!ignoreCrossGap && !crossKindReady(rhythm, kind, stamp, SYSTEM_TASK_CROSS_KIND_GAP_MS)) return;
    if (!alreadyVisible) {
      rhythm.visible[kind] = { id: reason.id || kind, shownAt: stamp, touchedAt: 0 };
      rhythm.lastShownAt[kind] = stamp;
    }
    rememberSandboxTask(rhythm, reason);
    keptSystem.push(reason);
  };
  if (openSystemKinds.length) {
    const current = rankedSystem.find((reason) => openSystemKinds.includes(sandboxTaskKind(reason)));
    const currentPriority = current ? Number(current.priority) || 0 : 0;
    // A standing flood hazard used to keep the only map slot forever, so a
    // higher fire warning never reached the sandbox and could not be finished.
    // The chapter's required real event is the same kind of blocker: while it
    // is active it has to be able to take the slot, or the task bar and the
    // map show different tasks and neither one can be finished.
    const challenger = rankedSystem.find((reason) => {
      const kind = sandboxTaskKind(reason);
      if (openSystemKinds.includes(kind)) return false;
      if (sandboxTaskWasSeen(rhythm, reason)) return false;
      const requiredRealEvent = kind === "realNature";
      // A critical return task is created from the player's current reserve
      // risk and must be visible immediately when the player returns.  It is
      // allowed to replace a standing ecology marker; otherwise the ordinary
      // flood/water marker can occupy the single system-task slot and hide
      // the actionable recovery task behind the cross-kind cooldown.
      const requiredReturnEvent = kind === "dailyReturn";
      if (!requiredRealEvent && !requiredReturnEvent && !DISASTER_KINDS.includes(kind)) return false;
      if ((Number(reason.priority) || 0) <= currentPriority) return false;
      if (!kindReady(rhythm, kind, stamp, gapMs)) return false;
      return requiredRealEvent || requiredReturnEvent || crossKindReady(rhythm, kind, stamp, SYSTEM_TASK_CROSS_KIND_GAP_MS);
    });
    if (challenger) {
      openSystemKinds.forEach((kind) => {
        delete rhythm.visible[kind];
      });
      const challengerKind = sandboxTaskKind(challenger);
      acceptSystem(challenger, challengerKind === "realNature" || challengerKind === "dailyReturn");
    } else if (current) acceptSystem(current);
  } else {
    const next = rankedSystem.find((reason) => {
      const kind = sandboxTaskKind(reason);
      if (sandboxTaskWasSeen(rhythm, reason)) return false;
      return kindReady(rhythm, kind, stamp, gapMs)
        && (kind === "realNature" || kind === "dailyReturn"
          || crossKindReady(rhythm, kind, stamp, SYSTEM_TASK_CROSS_KIND_GAP_MS));
    });
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
  const rhythm = prepareSandboxTaskRhythm(reserve, normalizeSandboxTaskRhythm(reserve.sandboxTaskRhythm));
  if (rhythm.visible[kind]) rhythm.visible[kind].touchedAt = Math.max(1, Math.round(Number(now) || Date.now()));
  reserve.sandboxTaskRhythm = rhythm;
  return kind;
}
function closeSandboxTaskKinds(reserve = {}, kinds = [], now = Date.now()) {
  const rhythm = prepareSandboxTaskRhythm(reserve, normalizeSandboxTaskRhythm(reserve.sandboxTaskRhythm));
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
  if (action === "habitat") {
    const rhythm = normalizeSandboxTaskRhythm(reserve.sandboxTaskRhythm);
    const visible = Object.keys(rhythm.visible || {}).filter((kind) => !DISASTER_KINDS.includes(kind));
    return closeSandboxTaskKinds(reserve, ["grass"].concat(visible), now);
  }
  if (action === "houndScout") {
    const rhythm = normalizeSandboxTaskRhythm(reserve.sandboxTaskRhythm);
    const visible = Object.keys(rhythm.visible || {}).filter((kind) => !DISASTER_KINDS.includes(kind));
    return closeSandboxTaskKinds(reserve, visible, now);
  }
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
  if (/sandbox_flood/.test(eventType) || visual === "flash-flood" || /水灾改道|水灾隐患/.test(title)) return "flood";
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
function harshNaturePopulationScale(reserve = {}) {
  const chapter = reserveSandboxChapter(reserve);
  return Math.max(1, 1 + Math.floor((chapter - 1) / 3));
}
function harshNatureMeterScale(reserve = {}) {
  const chapter = reserveSandboxChapter(reserve);
  return Math.max(1, 1 + Math.floor((chapter - 1) / 4));
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
  const meterScale = harshNatureMeterScale(reserve);
  const meterDamage = Math.max(1, Math.round(damage * meterScale));
  const populationScale = harshNaturePopulationScale(reserve);
  const animalHit = -Math.max(1, Math.round(damage * 0.5)) * populationScale;
  const visitorHit = -Math.max(1, Math.round(damage * 0.75)) * populationScale;
  const fireGrass = -Math.max(1, Math.round(damage * 0.5 * meterScale));
  const planned = {
    wildfire: { grass: fireGrass, animals: animalHit },
    flood: { animals: animalHit, visitors: visitorHit },
    disease: { disease: meterDamage, animals: animalHit }
  }[profile.kind] || { grass: fireGrass, animals: animalHit };
  const changes = Object.entries(planned).map(([metric, delta]) => applyHarshNatureChange(reserve, metric, delta));
  if (!changes.some((item) => item && item.delta !== 0)) {
    changes[0] = applyEcologyShift(reserve, "grass", -Math.max(1, meterDamage), "草场");
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
function isDisasterEmergency(active = {}) {
  if (!active || typeof active !== "object") return false;
  const type = String(active.type || active.eventType || "");
  const title = `${active.title || ""} ${active.id || ""} ${active.visualKind || ""} ${active.summary || ""} ${active.impact || ""}`;
  if (/visitor_|neighbor_/.test(type) || /游客现场|邻区/.test(title)) return false;
  if (/wildfire|flash_flood|disease_outbreak|heatwave|sandbox_wildfire|sandbox_flood|sandbox_disease/.test(type)) return true;
  if (/火灾|水灾|山火|洪水|山洪|火警|病虫害|疫病|干旱|热浪/.test(title)) return true;
  if (type.startsWith("real_nature_") && /山火|火灾|火点|火季|热浪|干旱|洪水|水质|污染|疾病|疫情|野火/.test(`${type} ${title}`)) return true;
  return false;
}
function disasterKindFromEmergency(active = {}) {
  const text = `${active.type || ""} ${active.title || ""} ${active.visualKind || ""}`;
  if (/flood|flash_flood|水灾|山洪|水质|污染/.test(text)) return "flood";
  if (/disease|病/.test(text)) return "disease";
  return "wildfire";
}
function untreatedDisasterKinds(reserve = {}) {
  const kinds = [];
  const rhythm = normalizeSandboxTaskRhythm(reserve.sandboxTaskRhythm);
  DISASTER_KINDS.forEach((kind) => {
    if (rhythm.visible[kind]) kinds.push(kind);
  });
  const active = ((reserve.emergency || {}).active) || null;
  if (active && isDisasterEmergency(active)) {
    const kind = disasterKindFromEmergency(active);
    if (!kinds.includes(kind)) kinds.push(kind);
  }
  return kinds;
}
function hasUntreatedDisaster(reserve = {}) {
  return untreatedDisasterKinds(reserve).length > 0;
}
function normalizeDisasterDrain(value = {}) {
  return {
    lastTickAt: Math.max(0, Math.round(Number(value.lastTickAt) || 0)),
    pausedAt: Math.max(0, Math.round(Number(value.pausedAt) || 0))
  };
}
function disasterLossAmount(total) {
  const count = Math.max(0, Math.round(Number(total) || 0));
  if (count <= 0) return 0;
  return Math.max(1, Math.round(count * DISASTER_DRAIN_RATE));
}
function tickUntreatedDisasters(reserve = {}, now = Date.now(), options = {}) {
  const stamp = Math.max(1, Math.round(Number(now) || Date.now()));
  const drain = reserve.disasterDrain && typeof reserve.disasterDrain === "object"
    ? reserve.disasterDrain
    : (reserve.disasterDrain = { lastTickAt: 0, pausedAt: 0 });
  drain.lastTickAt = Math.max(0, Math.round(Number(drain.lastTickAt) || 0));
  drain.pausedAt = Math.max(0, Math.round(Number(drain.pausedAt) || 0));
  const foreground = options.foreground !== false;
  if (!foreground) {
    drain.pausedAt = stamp;
    return null;
  }
  if (drain.pausedAt) {
    drain.lastTickAt = stamp;
    drain.pausedAt = 0;
    return null;
  }
  const kinds = untreatedDisasterKinds(reserve);
  if (!kinds.length) {
    drain.lastTickAt = 0;
    return null;
  }
  if (!drain.lastTickAt) {
    drain.lastTickAt = stamp;
    return null;
  }
  if (stamp - drain.lastTickAt < DISASTER_DRAIN_INTERVAL_MS) {
    return null;
  }
  drain.lastTickAt = stamp;
  const animalsBefore = Math.max(0, Math.round(Number(livingAnimalTotal(reserve)) || 0));
  const visitorsBefore = Math.max(0, Math.round(Number(chapterVisitorTotal(reserve)) || 0));
  const animalHit = -disasterLossAmount(animalsBefore);
  const visitorHit = -disasterLossAmount(visitorsBefore);
  const changes = [];
  if (visitorHit) changes.push(applyCoreMetric(reserve, "visitors", visitorHit));
  if (animalHit) changes.push(applyCoreMetric(reserve, "animals", animalHit, { outflow: "died" }));
  if (!changes.some((item) => item && item.delta)) return null;
  const kind = kinds[0];
  const title = DISASTER_TITLES[kind] || "灾害持续";
  return {
    kind,
    kinds,
    title,
    changes,
    body: `${title}仍未处理，游客和动物继续流失。`,
    animalsBefore,
    visitorsBefore
  };
}
module.exports = {
  SANDBOX_TASK_CAP,
  LATE_SANDBOX_TASK_CAP,
  DISASTER_KINDS,
  DISASTER_DRAIN_INTERVAL_MS,
  DISASTER_DRAIN_RATE,
  SYSTEM_TASK_CROSS_KIND_GAP_MS,
  sandboxTaskCap,
  EARLY_CHAPTER_SAME_KIND_GAP_MS,
  SAME_KIND_GAP_MS,
  EARLY_CHAPTER_GAP_LIMIT,
  IDLE_HIDE_MS,
  sandboxTaskKind,
  sandboxTaskKey,
  isUserInitiatedSandboxTask,
  sameKindGapMs,
  normalizeSandboxTaskRhythm,
  proposeEcologyCrises,
  chapterEcologyTaskPool,
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
  harshNaturePopulationScale,
  harshNatureMeterScale,
  applyHarshNatureOutcome,
  isDisasterEmergency,
  untreatedDisasterKinds,
  hasUntreatedDisaster,
  normalizeDisasterDrain,
  tickUntreatedDisasters
};
