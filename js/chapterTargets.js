const {
  livingAnimalTotal,
  chapterCaptiveSpeciesSet,
  normalizeChapterRescue,
  chapterRescueSummary
} = require("./chapterRescueSystem");
const { rareAnimalChapterGate } = require("./rareAnimalSystem");
const { getUnlockedSpecies, CHAPTERS } = require("./animalWorld");
const TARGETS = Object.freeze([
  [7, 70, 114], [7, 84, 174], [9, 101, 378], [11, 118, 486], [12, 137, 594],
  [14, 158, 714], [16, 182, 984], [18, 209, 1104], [20, 238, 1320], [22, 269, 1488],
  [33, 715, 3888]
]);
const CHAPTER_ANIMAL_HUD_INFLOWS = Object.freeze([
  "rescued", "comforted", "tasked", "advertised", "shared", "rareAuction", "breeding"
]);
const CHAPTER_ANIMAL_HUD_OUTFLOWS = Object.freeze(["died", "rareMigrated", "rareStolen"]);
const CHAPTER_ANIMAL_HUD_VERSION = 3;
const LEGACY_CAREER_ANIMAL_TARGETS = Object.freeze([
  180, 220, 320, 390, 470, 555, 630, 700, 745, 820,
  1070
]);
const CHAPTER_VISITOR_CARRYOVER_RATIO = 0.1;
const LATE_CHAPTER_VISITOR_CARRYOVER_RATIO = CHAPTER_VISITOR_CARRYOVER_RATIO;
const LATE_CHAPTER_VISITOR_CARRYOVER_STAGE = 14;
const VISITOR_SOURCE_BUCKETS = Object.freeze({
  recruit: "recruitedVisitors",
  migrate: "migratedVisitors",
  visit: "facilityVisitors",
  task: "taskVisitors",
  share: "shareVisitors"
});
const CHAPTER_VISITOR_GAIN_BUCKETS = Object.freeze([
  "recruitedVisitors", "migratedVisitors", "facilityVisitors", "taskVisitors", "shareVisitors"
]);
function emptyChapterVisitorRecord(stage = 1) {
  return {
    stage: Math.max(1, Math.round(Number(stage) || 1)),
    inherited: 0,
    legacySeed: 0,
    start: emptyVisitorLedgerSnapshot(),
    startLifetime: 0
  };
}
function normalizeChapterVisitorRecord(saved = {}, stage = 1) {
  return {
    stage: Math.max(1, Math.round(Number(saved.stage || stage) || 1)),
    inherited: wholeVisitors(saved.inherited),
    legacySeed: wholeVisitors(saved.legacySeed),
    start: normalizeVisitorFlowLedger(saved.start || {}),
    startLifetime: wholeVisitors(saved.startLifetime)
  };
}
function persistChapterVisitorRecord(reserve, record) {
  const development = reserve.development || (reserve.development = {});
  const operations = development.operations || (development.operations = {});
  operations.chapterVisitors = record;
  writeChapterVisitorCheckpoint(reserve, {
    stage: record.stage,
    inheritedVisitors: record.inherited
  });
  return record;
}
function chapterVisitorGains(reserve = {}, record = {}) {
  const live = normalizeVisitorFlowLedger((((reserve.development || {}).operations || {}).visitorLedger) || {});
  const start = normalizeVisitorFlowLedger(record.start || {});
  const gained = (key) => Math.max(0, wholeVisitors(live[key]) - wholeVisitors(start[key]));
  const gains = {};
  CHAPTER_VISITOR_GAIN_BUCKETS.concat(["lostVisitors"]).forEach((key) => { gains[key] = gained(key); });
  const hasFlow = CHAPTER_VISITOR_GAIN_BUCKETS.some((key) => gains[key] > 0) || gains.lostVisitors > 0;
  if (!hasFlow) {
    const legacyGain = Math.max(0, reserveLifetimeVisitors(reserve) - wholeVisitors(record.startLifetime));
    if (legacyGain > 0) gains.facilityVisitors = legacyGain;
  }
  return gains;
}
function chapterVisitorRecordTotal(reserve = {}, record = {}) {
  const gains = chapterVisitorGains(reserve, record);
  const earned = CHAPTER_VISITOR_GAIN_BUCKETS.reduce((sum, key) => sum + gains[key], 0);
  return Math.max(0, wholeVisitors(record.inherited) + wholeVisitors(record.legacySeed) + earned - gains.lostVisitors);
}
function legacyChapterVisitorInherit(stage = 1) {
  const current = Math.max(1, Math.round(Number(stage) || 1));
  if (current <= 1) return 0;
  return chapterVisitorCarryover(chapterTargets(current - 1).visitors, current);
}
function recoverLegacyInheritedVisitors(reserve = {}, record = {}, stage = 1) {
  const current = Math.max(1, Math.round(Number(stage) || 1));
  if (current <= 1) return 0;
  if (wholeVisitors(record.inherited) > 0) return wholeVisitors(record.inherited);
  const startLifetime = wholeVisitors(record.startLifetime);
  const carryover = chapterVisitorCarryover(startLifetime, current);
  if (carryover > 0) {
    const gains = chapterVisitorGains(reserve, record);
    const earned = CHAPTER_VISITOR_GAIN_BUCKETS.reduce((sum, key) => sum + gains[key], 0);
    const lifetimeGain = reserveLifetimeVisitors(reserve) - startLifetime;
    if (lifetimeGain - (earned - gains.lostVisitors) === carryover) return carryover;
  }
  return legacyChapterVisitorInherit(current);
}
function repairLegacyChapterVisitorRecord(reserve, record, stage) {
  const current = Math.max(1, Math.round(Number(stage) || 1));
  // `legacySeed` came from the old cumulative-total repair path. It is not a
  // chapter-local source and must not inflate the HUD or promotion gate.
  if (current > 1) record.legacySeed = 0;
  if (current <= 1 || wholeVisitors(record.inherited) > 0) return record;
  record.inherited = recoverLegacyInheritedVisitors(reserve, record, current);
  return record;
}
function chapterExpectedMinutes(chapter = 1) {
  const n = Math.max(1, Math.round(Number(chapter) || 1));
  if (n <= 1) return 4;
  if (n === 2) return 9;
  if (n <= 5) return 14;
  if (n <= 10) return 16;
  return 22;
}
function chapterTargets(chapter = 1) {
  const index = Math.max(0, Math.min(TARGETS.length - 1, Math.round(Number(chapter) || 1) - 1));
  const [species, animals, visitors] = TARGETS[index];
  return { species, animals, visitors, expectedMinutes: chapterExpectedMinutes(index + 1) };
}
function comfortAnimalGainRange(chapter = 1) {
  const target = Math.max(1, chapterTargets(chapter).animals);
  const min = Math.max(1, Math.round(target * 0.01));
  const max = Math.max(min, Math.round(target * 0.03));
  return { min, max, target };
}
function rollComfortAnimalGain(chapter = 1, random = Math.random) {
  const range = comfortAnimalGainRange(chapter);
  const percent = 1 + Math.floor(Math.max(0, Math.min(0.999999, Number(random()) || 0)) * 201) / 100;
  const amount = Math.round(range.target * percent / 100);
  return Math.max(range.min, Math.min(range.max, amount));
}
function visitorOperationsPresent(reserve = {}) {
  const operations = ((reserve.development || {}).operations) || {};
  const visitorLedger = operations.visitorLedger || {};
  return Number.isFinite(Number(operations.totalVisitors))
    || Number.isFinite(Number(visitorLedger.totalVisitors));
}
function reserveLifetimeVisitors(reserve = {}) {
  const operations = ((reserve.development || {}).operations || {});
  const visitorLedger = operations.visitorLedger || {};
  const developmentLedger = ((reserve.development || {}).visitorLedger) || {};
  const nodeTotal = Object.values(((reserve.development || {}).nodes) || {}).reduce((sum, node) => (
    sum + wholeVisitors(((node || {}).visitorLedger || {}).totalVisitors)
  ), 0);
  const values = [Number(operations.totalVisitors), Number(visitorLedger.totalVisitors), Number(developmentLedger.totalVisitors), nodeTotal]
    .filter((value) => Number.isFinite(value) && Number(value) > 0);
  if (values.length) return Math.max(0, Math.round(Math.max(...values)));
  const start = ((reserve.progression || {}).chapterStart)
    || ((reserve.progression || {}).stageStart)
    || {};
  const baseline = Number(start.totalVisitors);
  return Number.isFinite(baseline) && baseline > 0 ? Math.round(baseline) : 0;
}
function chapterVisitorCarryoverRatio(nextStage = 1) {
  return CHAPTER_VISITOR_CARRYOVER_RATIO;
}
function chapterVisitorCarryover(previousChapterTotal = 0, nextStage = 1) {
  return Math.max(0, Math.round((Number(previousChapterTotal) || 0) * chapterVisitorCarryoverRatio(nextStage)));
}
function chapterAnimalCarryover(previousAnimalTotal = 0, nextStage = 1) {
  return chapterVisitorCarryover(previousAnimalTotal, nextStage);
}
function scaleLivingAnimalsTo(reserve = {}, targetTotal = 0) {
  const wanted = Math.max(0, Math.round(Number(targetTotal) || 0));
  const ecology = reserve.ecology || (reserve.ecology = {});
  const captive = chapterCaptiveSpeciesSet(reserve);
  const entries = [];
  ["predators", "herbivores", "birds"].forEach((group) => {
    const bucket = ecology[group] || (ecology[group] = {});
    Object.keys(bucket).forEach((id) => {
      const pop = Math.max(0, Math.round(Number(bucket[id]) || 0));
      if (pop <= 0) return;
      entries.push({ group, id, pop, captive: captive.has(id) });
    });
  });
  const current = entries.reduce((sum, item) => sum + item.pop, 0);
  if (current <= 0 || wanted >= current) return current;
  const captiveCount = entries.filter((item) => item.captive).length;
  const freeEntries = entries.filter((item) => !item.captive);
  const freeWanted = Math.max(0, wanted - captiveCount);
  const freeCurrent = freeEntries.reduce((sum, item) => sum + item.pop, 0);
  entries.forEach((item) => {
    if (item.captive) {
      ecology[item.group][item.id] = 1;
      return;
    }
    ecology[item.group][item.id] = freeCurrent > 0
      ? Math.max(1, Math.round(item.pop * freeWanted / freeCurrent))
      : 1;
  });
  const adjust = (delta) => {
    const pool = freeEntries.slice().sort((a, b) => ecology[b.group][b.id] - ecology[a.group][a.id]);
    for (let step = 0; step < Math.abs(delta); step += 1) {
      const pick = pool.find((item) => delta < 0 ? ecology[item.group][item.id] > 1 : true);
      if (!pick) break;
      ecology[pick.group][pick.id] = Math.max(1, ecology[pick.group][pick.id] + (delta < 0 ? -1 : 1));
    }
  };
  adjust(wanted - livingAnimalTotal(reserve));
  return livingAnimalTotal(reserve);
}
function beginChapterAnimalLedger(reserve, stage) {
  require("./animalSourceLedger").beginChapterSourceLedger(reserve, stage);
}
function beginChapterAnimalCheckpoint(reserve = {}, nextStage, previousAnimalTotal) {
  const stage = Math.max(1, Math.round(Number(nextStage) || liveChapterStage(reserve)));
  const state = reserve.chapterAnimalCarryover || {};
  if (Math.round(Number(state.stage) || 0) === stage) return chapterAnimalTotal(reserve);
  if (stage <= 1) {
    reserve.chapterAnimalCarryover = { stage: 1, fromTotal: 0, inherited: 0 };
    beginChapterAnimalLedger(reserve, 1);
    return chapterAnimalTotal(reserve);
  }
  const fromTotal = Math.max(0, Math.round(Number(previousAnimalTotal) || 0));
  const inherited = Math.max(
    chapterAnimalCarryover(fromTotal, stage),
    chapterAnimalCarryover(chapterTargets(stage - 1).animals, stage)
  );
  reserve.chapterAnimalCarryover = { stage, fromTotal, inherited };
  beginChapterAnimalLedger(reserve, stage);
  return chapterAnimalTotal(reserve);
}
function legacyCareerAnimalGate(chapter = 1) {
  const index = Math.max(0, Math.min(LEGACY_CAREER_ANIMAL_TARGETS.length - 1, Math.round(Number(chapter) || 1) - 1));
  return LEGACY_CAREER_ANIMAL_TARGETS[index];
}
function chapterAnimalInherited(reserve = {}) {
  const stage = liveChapterStage(reserve);
  const state = reserve.chapterAnimalCarryover || {};
  if (Math.round(Number(state.stage) || 0) === stage) {
    if (state.legacyCompleteSeed === true && Math.round(Number(state.strategyVersion) || 0) >= 2) {
      return Math.max(0, Math.round(Number(state.inherited) || 0));
    }
    const expected = stage <= 1
      ? 0
      : Math.max(
        chapterAnimalCarryover(Number(state.fromTotal) || chapterTargets(stage - 1).animals, stage),
        chapterAnimalCarryover(chapterTargets(stage - 1).animals, stage)
      );
    const inherited = Math.max(0, Math.round(Number(state.inherited) || 0));
    if (inherited !== expected) {
      state.inherited = expected;
      state.strategyVersion = 2;
      reserve.chapterAnimalCarryover = state;
    }
    return expected;
  }
  if (stage <= 1) return 0;
  return chapterAnimalCarryover(chapterTargets(stage - 1).animals, stage);
}
function chapterHasAnimalLedgerFlow(reserve = {}) {
  const summary = require("./animalSourceLedger").animalSourceSummary(reserve);
  return ["rescued", "comforted", "tasked"]
    .some((key) => Math.max(0, Math.round(Number(summary[key]) || 0)) > 0);
}
function legacyChapterAnimalComplete(reserve = {}, chapter = 1) {
  const stage = Math.max(1, Math.round(Number(chapter) || liveChapterStage(reserve)));
  const oldGate = legacyCareerAnimalGate(stage);
  const living = livingAnimalTotal(reserve);
  const best = (reserve.progression || {}).coreBest || {};
  const peak = Math.round(Number(best.stage) || 0) === stage
    ? Math.max(0, Math.round(Number(best.animals) || 0))
    : 0;
  return living >= oldGate || peak >= oldGate;
}
function chapterAnimalFlowTotal(reserve = {}) {
  const summary = require("./animalSourceLedger").animalSourceSummary(reserve);
  const amount = (key) => Math.max(0, Math.round(Number(summary[key]) || 0));
  const earned = CHAPTER_ANIMAL_HUD_INFLOWS.reduce((sum, key) => sum + amount(key), 0);
  const losses = CHAPTER_ANIMAL_HUD_OUTFLOWS.reduce((sum, key) => sum + amount(key), 0);
  // Opening stock and immigration stay off the chapter counter. Their deaths
  // have to be absorbed there first. Otherwise a loss in the starting herd
  // cancels rescued, comforted and tasked animals, and the HUD stays at 0.
  const uncounted = amount("opening") + amount("immigrated");
  const countedLosses = Math.max(0, losses - uncounted);
  return earned - countedLosses;
}
function chapterAnimalTotal(reserve = {}) {
  return Math.max(0, chapterAnimalInherited(reserve) + chapterAnimalFlowTotal(reserve));
}
function chapterAnimalBreakdown(reserve = {}) {
  const summary = require("./animalSourceLedger").animalSourceSummary(reserve);
  const inherited = chapterAnimalInherited(reserve);
  const flow = chapterAnimalFlowTotal(reserve);
  return {
    inherited,
    rescued: Math.max(0, Math.round(Number(summary.rescued) || 0)),
    immigrated: Math.max(0, Math.round(Number(summary.immigrated) || 0)),
    breeding: Math.max(0, Math.round(Number(summary.breeding) || 0)),
    comforted: Math.max(0, Math.round(Number(summary.comforted) || 0)),
    advertised: Math.max(0, Math.round(Number(summary.advertised) || 0)),
    shared: Math.max(0, Math.round(Number(summary.shared) || 0)),
    tasked: Math.max(0, Math.round(Number(summary.tasked) || 0)),
    rareAuction: Math.max(0, Math.round(Number(summary.rareAuction) || 0)),
    emigrated: Math.max(0, Math.round(Number(summary.emigrated) || 0)),
    died: Math.max(0, Math.round(Number(summary.died) || 0)),
    living: livingAnimalTotal(reserve),
    flow,
    total: chapterAnimalTotal(reserve)
  };
}
function previousChapterVisitorClosingTotal(reserve = {}, fromStage) {
  const from = Math.max(1, Math.round(Number(fromStage) || liveChapterStage(reserve)));
  const saved = ((reserve.development || {}).operations || {}).chapterVisitors;
  if (saved && Math.round(Number(saved.stage) || 0) === from) {
    return chapterVisitorRecordTotal(reserve, normalizeChapterVisitorRecord(saved, from));
  }
  if (liveChapterStage(reserve) === from) return chapterVisitorTotal(reserve);
  return rawChapterVisitorTotal(reserve);
}
function chapterVisitorEarned(reserve = {}, record = {}) {
  const gains = chapterVisitorGains(reserve, record);
  return CHAPTER_VISITOR_GAIN_BUCKETS.reduce((sum, key) => sum + gains[key], 0);
}
function repairShortVisitorInherit(reserve, record, stage) {
  const floor = legacyChapterVisitorInherit(stage);
  if (stage <= 1 || floor <= 0) return record;
  const gains = chapterVisitorGains(reserve, record);
  if (chapterVisitorEarned(reserve, record) > 0 || gains.lostVisitors > 0) return record;
  if (wholeVisitors(record.inherited) < floor) record.inherited = floor;
  return record;
}
function repairFreshChapterAnimalCarryover(reserve) {
  const stage = liveChapterStage(reserve);
  const state = reserve.chapterAnimalCarryover || {};
  const expectedInherited = stage <= 1
    ? 0
    : Math.max(
      chapterAnimalCarryover(Number(state.fromTotal) || chapterTargets(stage - 1).animals, stage),
      chapterAnimalCarryover(chapterTargets(stage - 1).animals, stage)
    );
  if (Math.round(Number(state.stage) || 0) === stage) {
    // A previous migration could write the whole current-chapter target into
    // `inherited` (for example chapter 6 showed 132 inherited animals). The
    // chapter strategy is fixed: carry over only the configured 10% floor,
    // then earn the rest through this chapter's ledger.
    if (Math.max(0, Math.round(Number(state.inherited) || 0)) !== expectedInherited) {
      state.inherited = expectedInherited;
      state.strategyVersion = 2;
      reserve.chapterAnimalCarryover = state;
    }
    return chapterAnimalTotal(reserve);
  }
  if (stage <= 1) {
    reserve.chapterAnimalCarryover = { stage: 1, fromTotal: 0, inherited: 0, strategyVersion: 2 };
    return chapterAnimalTotal(reserve);
  }
  const fromTotal = Math.max(0, Math.round(Number(state.fromTotal) || chapterTargets(stage - 1).animals));
  reserve.chapterAnimalCarryover = {
    stage,
    fromTotal,
    inherited: Math.max(
      chapterAnimalCarryover(fromTotal, stage),
      chapterAnimalCarryover(chapterTargets(stage - 1).animals, stage)
    ),
    strategyVersion: 2
  };
  return chapterAnimalTotal(reserve);
}
function repairChapterAnimalHud(reserve = {}) {
  const progression = reserve.progression || (reserve.progression = {});
  const stage = liveChapterStage(reserve);
  const savedCarryover = reserve.chapterAnimalCarryover || {};
  const hasCurrentChapterCheckpoint = stage > 1
    && Math.round(Number(savedCarryover.stage) || 0) === stage;
  repairFreshChapterAnimalCarryover(reserve);
  if (Math.round(Number(progression.animalHudVersion) || 0) === CHAPTER_ANIMAL_HUD_VERSION) {
    return Math.round(chapterAnimalTotal(reserve));
  }
  let live = Math.round(chapterAnimalTotal(reserve));
  if (!hasCurrentChapterCheckpoint && live < chapterTargets(stage).animals && legacyChapterAnimalComplete(reserve, stage)) {
    const summary = require("./animalSourceLedger").animalSourceSummary(reserve);
    const hasChapterFlow = CHAPTER_ANIMAL_HUD_INFLOWS.concat(CHAPTER_ANIMAL_HUD_OUTFLOWS)
      .some((key) => Math.max(0, Math.round(Number(summary[key]) || 0)) > 0);
    if (!hasChapterFlow) {
      reserve.chapterAnimalCarryover = stage <= 1
        ? { stage: 1, fromTotal: 0, inherited: chapterTargets(1).animals, legacyCompleteSeed: true, strategyVersion: 2 }
        : Object.assign({}, reserve.chapterAnimalCarryover || {}, {
          stage,
          inherited: Math.max(chapterAnimalInherited(reserve), chapterTargets(stage).animals),
          legacyCompleteSeed: true,
          strategyVersion: 2
        });
      live = Math.round(chapterAnimalTotal(reserve));
    }
  }
  progression.animalHudVersion = CHAPTER_ANIMAL_HUD_VERSION;
  const best = progression.coreBest;
  if (best && Math.round(Number(best.stage) || 0) === stage) {
    best.animals = live;
  }
  return live;
}
function liveChapterStage(reserve = {}) {
  const progression = reserve.progression || {};
  return Math.max(1, Math.round(Number(progression.stage || progression.displayChapter || 1)));
}
function emptyVisitorLedgerSnapshot() {
  return {
    totalVisitors: 0,
    migratedVisitors: 0,
    recruitedVisitors: 0,
    facilityVisitors: 0,
    taskVisitors: 0,
    shareVisitors: 0,
    lostVisitors: 0
  };
}
function wholeVisitors(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}
function normalizeVisitorFlowLedger(saved = {}) {
  return {
    totalVisitors: wholeVisitors(saved.totalVisitors),
    migratedVisitors: wholeVisitors(saved.migratedVisitors),
    recruitedVisitors: wholeVisitors(saved.recruitedVisitors),
    facilityVisitors: wholeVisitors(saved.facilityVisitors),
    taskVisitors: wholeVisitors(saved.taskVisitors),
    shareVisitors: wholeVisitors(saved.shareVisitors),
    lostVisitors: wholeVisitors(saved.lostVisitors)
  };
}
function snapshotVisitorLedger(reserve = {}) {
  const ledger = normalizeVisitorFlowLedger((((reserve.development || {}).operations || {}).visitorLedger) || {});
  return Object.assign({}, ledger, {
    totalVisitors: reserveLifetimeVisitors(reserve)
  });
}
function rawChapterVisitorTotal(reserve = {}) {
  const lifetime = reserveLifetimeVisitors(reserve);
  const start = ((reserve.progression || {}).chapterStart)
    || ((reserve.progression || {}).stageStart)
    || {};
  const inherited = Math.max(0, Math.round(Number(start.inheritedVisitors) || 0));
  const baseline = Math.max(0, Math.round(Number(start.totalVisitors) || 0));
  return Math.max(0, Math.round(inherited + (lifetime - baseline)));
}
function writeChapterVisitorCheckpoint(reserve, fields = {}) {
  const progression = reserve.progression || (reserve.progression = {});
  const stage = Math.max(1, Math.round(Number(fields.stage || liveChapterStage(reserve))));
  const start = Object.assign({}, progression.chapterStart || {}, fields);
  if (fields.baselineLocked === true) start.baselineLocked = true;
  if (!start.visitorLedger) {
    start.visitorLedger = stage <= 1 ? emptyVisitorLedgerSnapshot() : snapshotVisitorLedger(reserve);
  }
  progression.chapterStart = start;
  progression.stageStart = Object.assign({}, progression.stageStart || {}, {
    stage: start.stage,
    totalVisitors: start.totalVisitors,
    inheritedVisitors: start.inheritedVisitors,
    baselineLocked: start.baselineLocked === true,
    visitorLedger: start.visitorLedger
  });
  return start;
}
function beginChapterVisitorCheckpoint(reserve = {}, nextStage, previousChapterTotal) {
  const stage = Math.max(1, Math.round(Number(nextStage) || liveChapterStage(reserve)));
  const development = reserve.development || (reserve.development = {});
  const operations = development.operations || (development.operations = {});
  const existing = normalizeChapterVisitorRecord(operations.chapterVisitors || {}, stage);
  if (existing.stage === stage && (stage <= 1 || existing.inherited > 0)) {
    return writeChapterVisitorCheckpoint(reserve, {
      stage,
      totalVisitors: existing.startLifetime,
      inheritedVisitors: existing.inherited,
      visitorLedger: existing.start,
      baselineLocked: true
    });
  }
  const record = emptyChapterVisitorRecord(stage);
  record.inherited = stage <= 1 ? 0 : chapterVisitorCarryover(previousChapterTotal, stage);
  record.start = normalizeVisitorFlowLedger(operations.visitorLedger || {});
  record.startLifetime = reserveLifetimeVisitors(reserve);
  operations.chapterVisitors = record;
  if (operations.today && typeof operations.today === "object") {
    operations.today.hostedVisitors = 0;
    operations.today.hostedChapter = stage;
  }
  return writeChapterVisitorCheckpoint(reserve, {
    stage,
    totalVisitors: reserveLifetimeVisitors(reserve),
    inheritedVisitors: stage <= 1 ? 0 : chapterVisitorCarryover(previousChapterTotal, stage),
    visitorLedger: snapshotVisitorLedger(reserve),
    baselineLocked: true
  });
}
function resetLegacyChapterVisitorCheckpoint(reserve, stage) {
  const development = reserve.development || (reserve.development = {});
  const operations = development.operations || (development.operations = {});
  const record = emptyChapterVisitorRecord(stage);
  record.start = normalizeVisitorFlowLedger(operations.visitorLedger || {});
  record.startLifetime = reserveLifetimeVisitors(reserve);
  repairLegacyChapterVisitorRecord(reserve, record, stage);
  operations.chapterVisitors = record;
  if (operations.today && typeof operations.today === "object") {
    operations.today.hostedVisitors = 0;
    operations.today.hostedChapter = stage;
  }
  return writeChapterVisitorCheckpoint(reserve, {
    stage,
    totalVisitors: record.startLifetime,
    inheritedVisitors: record.inherited,
    visitorLedger: snapshotVisitorLedger(reserve),
    baselineLocked: true
  });
}
function ensureChapterVisitorCheckpoint(reserve = {}) {
  if (!reserve || typeof reserve !== "object") {
    return { stage: 1, totalVisitors: 0, inheritedVisitors: 0, visitorLedger: emptyVisitorLedgerSnapshot() };
  }
  const progression = reserve.progression || (reserve.progression = {});
  const stage = liveChapterStage(reserve);
  const existing = ((reserve.development || {}).operations || {}).chapterVisitors;
  if (existing && Math.round(Number(existing.stage) || 0) === stage) {
    return writeChapterVisitorCheckpoint(reserve, {
      stage,
      totalVisitors: wholeVisitors(existing.startLifetime),
      inheritedVisitors: wholeVisitors(existing.inherited),
      visitorLedger: existing.start || snapshotVisitorLedger(reserve),
      baselineLocked: true
    });
  }
  const start = progression.chapterStart || progression.stageStart || {};
  const startStage = Math.max(1, Math.round(Number(start.stage) || 1));
  const lifetime = reserveLifetimeVisitors(reserve);
  const hasInherited = Object.prototype.hasOwnProperty.call(start, "inheritedVisitors");
  const hasLifetime = Object.prototype.hasOwnProperty.call(start, "totalVisitors");
  if (startStage !== stage) {
    if (stage <= 1) {
      return writeChapterVisitorCheckpoint(reserve, {
        stage: 1,
        totalVisitors: 0,
        inheritedVisitors: 0,
        visitorLedger: emptyVisitorLedgerSnapshot()
      });
    }
    if (existing && Math.round(Number(existing.stage) || 0) === stage) {
      return writeChapterVisitorCheckpoint(reserve, {
        stage,
        totalVisitors: wholeVisitors(existing.startLifetime),
        inheritedVisitors: wholeVisitors(existing.inherited),
        visitorLedger: existing.start || snapshotVisitorLedger(reserve),
        baselineLocked: true
      });
    }
    if (!hasLifetime || Math.max(0, Math.round(Number(start.totalVisitors) || 0)) === 0) {
      return resetLegacyChapterVisitorCheckpoint(reserve, stage);
    }
    const previousTotal = previousChapterVisitorClosingTotal(reserve, startStage);
    return beginChapterVisitorCheckpoint(reserve, stage, previousTotal);
  }
  if (!hasInherited) {
    if (stage <= 1) {
      return writeChapterVisitorCheckpoint(reserve, {
        stage,
        totalVisitors: hasLifetime ? Math.max(0, Math.round(Number(start.totalVisitors) || 0)) : 0,
        inheritedVisitors: 0,
        visitorLedger: start.visitorLedger || emptyVisitorLedgerSnapshot()
      });
    }
    if (!hasLifetime || Math.max(0, Math.round(Number(start.totalVisitors) || 0)) === 0) {
      return resetLegacyChapterVisitorCheckpoint(reserve, stage);
    }
    return writeChapterVisitorCheckpoint(reserve, {
      stage,
      totalVisitors: Math.max(0, Math.round(Number(start.totalVisitors) || 0)),
      inheritedVisitors: legacyChapterVisitorInherit(stage),
      visitorLedger: start.visitorLedger || snapshotVisitorLedger(reserve)
    });
  }
  if (!hasLifetime) {
    if (lifetime <= 0 && !visitorOperationsPresent(reserve)) return start;
    return writeChapterVisitorCheckpoint(reserve, {
      stage,
      totalVisitors: 0,
      inheritedVisitors: Math.max(0, Math.round(Number(start.inheritedVisitors) || 0)),
      visitorLedger: start.visitorLedger || emptyVisitorLedgerSnapshot()
    });
  }
  if (stage > 1
    && lifetime > 0
    && Math.max(0, Math.round(Number(start.totalVisitors) || 0)) === 0
    && !start.baselineLocked
    && (Math.max(0, Math.round(Number(start.inheritedVisitors) || 0)) === 0
      || wholeVisitors(start.visitorLedger && start.visitorLedger.totalVisitors) > 0)) {
    return resetLegacyChapterVisitorCheckpoint(reserve, stage);
  }
  if (!start.visitorLedger) {
    return writeChapterVisitorCheckpoint(reserve, {
      visitorLedger: snapshotVisitorLedger(reserve)
    });
  }
  return start;
}
function legacyChapterVisitorRecord(reserve = {}, stage = 1) {
  const checkpoint = ensureChapterVisitorCheckpoint(reserve) || {};
  const existing = ((reserve.development || {}).operations || {}).chapterVisitors;
  if (existing && Math.round(Number(existing.stage) || 0) === stage) {
    return repairLegacyChapterVisitorRecord(reserve, normalizeChapterVisitorRecord(existing, stage), stage);
  }
  const record = emptyChapterVisitorRecord(stage);
  record.inherited = stage > 1 ? wholeVisitors(checkpoint.inheritedVisitors) : 0;
  record.start = normalizeVisitorFlowLedger(checkpoint.visitorLedger || {});
  record.startLifetime = wholeVisitors(checkpoint.totalVisitors);
  return repairLegacyChapterVisitorRecord(reserve, record, stage);
}
function ensureChapterVisitorRecord(reserve = {}) {
  if (!reserve || typeof reserve !== "object") return emptyChapterVisitorRecord(1);
  const development = reserve.development || (reserve.development = {});
  const operations = development.operations || (development.operations = {});
  const stage = liveChapterStage(reserve);
  ensureChapterVisitorCheckpoint(reserve);
  const saved = operations.chapterVisitors;
  if (saved && typeof saved === "object") {
    const record = normalizeChapterVisitorRecord(saved, stage);
    if (record.stage === stage) {
      const repaired = repairShortVisitorInherit(reserve, repairLegacyChapterVisitorRecord(reserve, record, stage), stage);
      return persistChapterVisitorRecord(reserve, repaired);
    }
  }
  return persistChapterVisitorRecord(reserve, legacyChapterVisitorRecord(reserve, stage));
}
function chapterVisitorTotal(reserve = {}) {
  return chapterVisitorRecordTotal(reserve, ensureChapterVisitorRecord(reserve));
}
function todayChapterContribution(reserve = {}) {
  const today = (((reserve.development || {}).operations) || {}).today || {};
  if (today.chapterGained === undefined || today.chapterGained === null) return null;
  return wholeVisitors(today.chapterGained);
}
function registerUntrackedTodayCrowd(reserve, operations, today, record) {
  if (today.chapterGained !== undefined && today.chapterGained !== null) return;
  const walked = wholeVisitors(today.visitors);
  const recruited = wholeVisitors(today.recruitedVisitors);
  const crowd = walked + recruited;
  today.chapterGained = crowd;
  if (!crowd) return;
  const gains = chapterVisitorGains(reserve, record);
  const booked = CHAPTER_VISITOR_GAIN_BUCKETS.reduce((sum, key) => sum + gains[key], 0);
  const bucketShortfall = Math.max(0, crowd - booked);
  if (bucketShortfall > 0) {
    const ledger = operations.visitorLedger = normalizeVisitorFlowLedger(operations.visitorLedger || {});
    const asRecruited = Math.min(bucketShortfall, recruited);
    ledger.recruitedVisitors = wholeVisitors(ledger.recruitedVisitors) + asRecruited;
    ledger.facilityVisitors = wholeVisitors(ledger.facilityVisitors) + (bucketShortfall - asRecruited);
    ledger.totalVisitors = Math.max(wholeVisitors(ledger.totalVisitors), reserveLifetimeVisitors(reserve));
  }
  const lifetimeShortfall = Math.max(0, crowd - Math.max(0, reserveLifetimeVisitors(reserve) - wholeVisitors(record.startLifetime)));
  if (lifetimeShortfall > 0) {
    operations.totalVisitors = wholeVisitors(operations.totalVisitors) + lifetimeShortfall;
    const ledger = operations.visitorLedger = normalizeVisitorFlowLedger(operations.visitorLedger || {});
    ledger.totalVisitors = wholeVisitors(ledger.totalVisitors) + lifetimeShortfall;
  }
}
function applyChapterVisitorDelta(reserve = {}, delta = 0, source = "visit", options = {}) {
  if (!reserve || typeof reserve !== "object") return { before: 0, after: 0, delta: 0, source };
  ensureChapterVisitorCheckpoint(reserve);
  const development = reserve.development || (reserve.development = {});
  const operations = development.operations || (development.operations = {});
  const today = operations.today || (operations.today = {});
  const skipToday = options.skipToday === true;
  const record = ensureChapterVisitorRecord(reserve);
  if (!skipToday) registerUntrackedTodayCrowd(reserve, operations, today, record);
  const before = chapterVisitorRecordTotal(reserve, record);
  const wanted = Math.round(Number(delta) || 0);
  if (!wanted) return { before, after: before, delta: 0, source, applied: 0 };
  const ledger = operations.visitorLedger = normalizeVisitorFlowLedger(operations.visitorLedger || {});
  let applied = wanted;
  if (wanted > 0) {
    today.chapterGained = wholeVisitors(today.chapterGained) + wanted;
    operations.totalVisitors = wholeVisitors(operations.totalVisitors) + wanted;
    ledger.totalVisitors = wholeVisitors(ledger.totalVisitors) + wanted;
    const bucket = VISITOR_SOURCE_BUCKETS[source] || VISITOR_SOURCE_BUCKETS.visit;
    ledger[bucket] = wholeVisitors(ledger[bucket]) + wanted;
    if (!skipToday) {
      if (source === "recruit") {
        today.recruitedVisitors = wholeVisitors(today.recruitedVisitors) + wanted;
      } else {
        today.visitors = wholeVisitors(today.visitors) + wanted;
      }
    }
  } else {
    const need = Math.min(Math.abs(wanted), before);
    applied = -need;
    today.chapterGained = Math.max(0, wholeVisitors(today.chapterGained) - need);
    operations.totalVisitors = Math.max(0, wholeVisitors(operations.totalVisitors) - need);
    ledger.totalVisitors = Math.max(0, wholeVisitors(ledger.totalVisitors) - need);
    ledger.lostVisitors = wholeVisitors(ledger.lostVisitors) + need;
    if (!skipToday) {
      let left = need;
      const fromWalk = Math.min(wholeVisitors(today.visitors), left);
      today.visitors = wholeVisitors(today.visitors) - fromWalk;
      left -= fromWalk;
      today.recruitedVisitors = Math.max(0, wholeVisitors(today.recruitedVisitors) - left);
    }
  }
  operations.chapterVisitors = record;
  const after = chapterVisitorRecordTotal(reserve, record);
  return { before, after, delta: after - before, source, applied };
}
function arrivalMatchedVisitorLoss(arrivals, retention) {
  const crowd = Math.max(0, Math.round(Number(arrivals) || 0));
  if (crowd < 30) return 0;
  const pressure = Math.min(1, (crowd - 30) / 190);
  const ease = Math.max(-8, Math.min(12, retention - 62)) / 100;
  const rate = Math.max(0.15, Math.min(0.58, 0.22 + pressure * 0.28 - ease));
  return Math.max(1, Math.round(crowd * rate));
}
function chapterVisitorDailyAttrition(reserve = {}, snapshot = {}) {
  const stage = Math.max(1, Math.round(Number((reserve.progression || {}).stage || 1)));
  if (stage < 3) return 0;
  const total = chapterVisitorTotal(reserve);
  if (total <= 8) return 0;
  const tourism = snapshot.tourism || {};
  const retention = Math.max(0, Math.min(100,
    Number(tourism.retention)
    || Number(snapshot.retention)
    || 62
  ));
  const leakRate = 0.022 + Math.max(0, (70 - retention) / 100) * 0.055;
  const stockLost = Math.max(1, Math.round(total * Math.min(0.08, leakRate)));
  const arrivals = Math.max(0, Math.round(Number(snapshot.visitors) || Number(tourism.scale) || 0));
  const lost = stockLost + arrivalMatchedVisitorLoss(arrivals, retention);
  return Math.min(lost, Math.max(0, total - 4));
}
function applyChapterVisitorDailyAttrition(reserve = {}, snapshot = {}) {
  const lost = chapterVisitorDailyAttrition(reserve, snapshot);
  if (lost <= 0) return { applied: 0, lost: 0 };
  return Object.assign({ lost }, applyChapterVisitorDelta(reserve, -lost, "loss", { skipToday: true }));
}
function chapterVisitorBreakdown(reserve = {}) {
  const record = ensureChapterVisitorRecord(reserve);
  const gains = chapterVisitorGains(reserve, record);
  return {
    inherited: wholeVisitors(record.inherited),
    migrated: gains.migratedVisitors,
    recruited: gains.recruitedVisitors,
    facility: gains.facilityVisitors + wholeVisitors(record.legacySeed),
    task: gains.taskVisitors,
    share: gains.shareVisitors,
    lost: gains.lostVisitors,
    untracked: 0,
    total: chapterVisitorRecordTotal(reserve, record)
  };
}
function chapterSpeciesCount(reserve = {}, chapter = null) {
  const progression = reserve.progression || {};
  const currentChapter = Math.max(1, Math.min(CHAPTERS.length, Math.round(Number(
    chapter || progression.stage || progression.displayChapter || 1
  ) || 1)));
  const level = Math.max(1, Math.min(7, Math.round(Number(progression.level) || 1)));
  // The roster is stable even when live populations temporarily migrate or
  // hit zero. Pending rescues from a skipped chapter remain deductions until
  // the catch-up task is completed, so a legacy save cannot pass by accident.
  const captive = chapterCaptiveSpeciesSet(reserve);
  return getUnlockedSpecies(level, currentChapter).filter((species) => {
    const id = species && species.id ? species.id : species;
    return id && !captive.has(id);
  }).length;
}
function chapterCoreLiveSnapshot(reserve = {}, chapter = 1) {
  const current = Math.max(1, Math.min(CHAPTERS.length, Math.round(Number(chapter) || 1)));
  normalizeChapterRescue(reserve, current);
  const target = chapterTargets(current);
  const species = chapterSpeciesCount(reserve, current);
  const animals = Math.round(chapterAnimalTotal(reserve));
  const visitors = chapterVisitorTotal(reserve);
  const rareAnimal = rareAnimalChapterGate(reserve, current);
  const rescue = chapterRescueSummary(reserve, current);
  return {
    species,
    animals,
    visitors,
    target,
    rareAnimal,
    rescue,
    complete: species >= target.species
      && animals >= target.animals
      && visitors >= target.visitors
      && rareAnimal.met
      && rescue.complete
  };
}
function chapterCoreLiveComplete(reserve = {}, chapter = 1) {
  return chapterCoreLiveSnapshot(reserve, chapter).complete;
}
function chapterAdvanceReady(reserve = {}, chapter = 1) {
  return chapterCoreLiveComplete(reserve, chapter);
}
module.exports = {
  chapterTargets,
  comfortAnimalGainRange,
  rollComfortAnimalGain,
  chapterExpectedMinutes,
  chapterVisitorDailyAttrition,
  applyChapterVisitorDailyAttrition,
  CHAPTER_TARGETS: TARGETS,
  CHAPTER_VISITOR_CARRYOVER_RATIO,
  LATE_CHAPTER_VISITOR_CARRYOVER_RATIO,
  LATE_CHAPTER_VISITOR_CARRYOVER_STAGE,
  VISITOR_SOURCE_BUCKETS,
  reserveLifetimeVisitors,
  chapterVisitorCarryoverRatio,
  chapterVisitorCarryover,
  CHAPTER_ANIMAL_HUD_VERSION,
  LEGACY_CAREER_ANIMAL_TARGETS,
  legacyCareerAnimalGate,
  chapterAnimalCarryover,
  chapterHasAnimalLedgerFlow,
  legacyChapterAnimalComplete,
  repairFreshChapterAnimalCarryover,
  repairChapterAnimalHud,
  chapterAnimalInherited,
  chapterAnimalFlowTotal,
  chapterAnimalTotal,
  chapterAnimalBreakdown,
  scaleLivingAnimalsTo,
  beginChapterAnimalCheckpoint,
  previousChapterVisitorClosingTotal,
  rawChapterVisitorTotal,
  beginChapterVisitorCheckpoint,
  ensureChapterVisitorCheckpoint,
  ensureChapterVisitorRecord,
  emptyChapterVisitorRecord,
  normalizeChapterVisitorRecord,
  chapterVisitorRecordTotal,
  chapterVisitorTotal,
  todayChapterContribution,
  chapterVisitorBreakdown,
  applyChapterVisitorDelta,
  normalizeVisitorFlowLedger,
  emptyVisitorLedgerSnapshot,
  chapterSpeciesCount,
  chapterCoreLiveSnapshot,
  chapterCoreLiveComplete,
  chapterAdvanceReady
};
