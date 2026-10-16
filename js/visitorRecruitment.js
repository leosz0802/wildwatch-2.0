const { TOURISM_SCORE_CAP } = require("./progressionGates");
const { recordFundChange } = require("./fundLedger");
const { eventBusinessFactors, visitorContributionRate } = require("./eventEconomy");
const { applyChapterVisitorDelta, normalizeVisitorFlowLedger: normalizeChapterVisitorLedger } = require("./chapterTargets");
const { PACE_ECONOMY } = require("./balanceConfig");
const { recordEcologyFlow } = require("./ledgerConsistency");
const DAILY_FREE_RECRUITS = PACE_ECONOMY.visitorFreeRecruits;
const AD_RECRUIT_GRANT = PACE_ECONOMY.visitorAdGrant;
const DAILY_AD_WATCH_CAP = PACE_ECONOMY.visitorAdDailyCap;
const PLAYTIME_RECRUIT_RESTORE_SECONDS = PACE_ECONOMY.visitorRestoreSeconds;
const BASE_VISITOR_RECRUITMENT = 100;
const MIN_RECRUITMENT = 20;
const MAX_RECRUITMENT = 600;
const RARE_SPECIES = new Set(["lion", "leopard", "giraffe", "owl", "elephant", "hippo", "crocodile", "wildDog", "mink", "fox", "rhino", "pangolin"]);
const n = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const whole = (value, fallback = 0) => Math.max(0, Math.round(n(value, fallback)));
const clamp = (value, min, max) => Math.max(min, Math.min(max, n(value, min)));
function visitorRealDateKey(now = Date.now()) {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function visitorAdChapter(reserve = {}) {
  const progression = (reserve && reserve.progression) || {};
  return Math.max(1, Math.round(Number(progression.displayChapter || progression.stage || 1)));
}
function defaultVisitorRecruitment(gameDay = 1, now = Date.now()) {
  return {
    version: 7, day: Math.max(1, whole(gameDay, 1)), dateKey: visitorRealDateKey(now),
    freeRemaining: DAILY_FREE_RECRUITS, adCredits: 0, adWatchedToday: 0, adChapter: 0, lastAdGrantedAt: 0,
    totalRecruited: 0, publishCount: 0, lastResult: null,
    playtimeRestoreStarted: false, restoreAnchorSeconds: 0
  };
}
function alignVisitorAdChapter(recruitment, reserve = {}) {
  const chapter = visitorAdChapter(reserve);
  const savedVersion = whole(recruitment.version, 1);
  const savedChapter = whole(recruitment.adChapter);
  const capReached = whole(recruitment.adWatchedToday) + AD_RECRUIT_GRANT > DAILY_AD_WATCH_CAP;
  // Chapters 1–3 still have today's ad watches. From chapter 5 the same
  // calendar-day counter is already full, so the recruit button switches to
  // the playtime-restore label. Give each chapter the same ad quota.
  if (savedVersion < 7 && chapter >= 5 && whole(recruitment.adCredits) <= 0 && capReached) {
    recruitment.adWatchedToday = 0;
  } else if (savedVersion >= 7 && savedChapter > 0 && savedChapter !== chapter) {
    recruitment.adWatchedToday = 0;
  }
  recruitment.adChapter = chapter;
  recruitment.version = 7;
  return recruitment;
}
function syncVisitorRecruitmentDay(recruitment, gameDay = 1, now = Date.now(), reserve = {}) {
  const currentDate = visitorRealDateKey(now);
  if (!recruitment || typeof recruitment !== "object") return defaultVisitorRecruitment(gameDay, now);
  if (!recruitment.dateKey) recruitment.dateKey = currentDate;
  if (recruitment.dateKey !== currentDate) {
    recruitment.dateKey = currentDate;
    recruitment.freeRemaining = DAILY_FREE_RECRUITS;
    recruitment.adCredits = 0;
    recruitment.adWatchedToday = 0;
    recruitment.lastAdGrantedAt = 0;
    recruitment.playtimeRestoreStarted = false;
    recruitment.restoreAnchorSeconds = 0;
  } else if (whole(recruitment.version, 1) < 3 && whole(recruitment.publishCount) <= 0 && whole(recruitment.totalRecruited) <= 0) {
    recruitment.freeRemaining = Math.max(whole(recruitment.freeRemaining), DAILY_FREE_RECRUITS);
  }
  // Android could settle one completed video twice: the close tap starts
  // another show, and the previous close is replayed as a second grant.
  // Two real watches then filled the daily counter. Refund those two
  // watches once; a later honest cap (version 5) stays full.
  const savedVersion = whole(recruitment.version, 1);
  if (savedVersion < 5 && whole(recruitment.adWatchedToday) >= DAILY_AD_WATCH_CAP) {
    recruitment.adWatchedToday = Math.max(0, DAILY_AD_WATCH_CAP - AD_RECRUIT_GRANT * 2);
  }
  // A completed recruitment video can still leave the button on the
  // playtime-restore label: the watch was counted, then the video-close
  // tap published the new credits before the player saw them. Put the
  // unspent credits back once. Watches that were actually published stay spent.
  if (savedVersion >= 5 && savedVersion < 6 && whole(recruitment.adCredits) <= 0) {
    const spentAdCredits = Math.max(0, whole(recruitment.publishCount) - DAILY_FREE_RECRUITS);
    const lostCredits = whole(recruitment.adWatchedToday) - spentAdCredits;
    if (lostCredits > 0) recruitment.adCredits = lostCredits;
  }
  recruitment.day = Math.max(1, whole(gameDay, 1));
  recruitment.freeRemaining = clamp(whole(recruitment.freeRemaining, DAILY_FREE_RECRUITS), 0, DAILY_FREE_RECRUITS);
  recruitment.adCredits = whole(recruitment.adCredits);
  recruitment.adWatchedToday = clamp(whole(recruitment.adWatchedToday), 0, DAILY_AD_WATCH_CAP);
  alignVisitorAdChapter(recruitment, reserve);
  recruitment.lastAdGrantedAt = whole(recruitment.lastAdGrantedAt);
  recruitment.totalRecruited = whole(recruitment.totalRecruited);
  recruitment.publishCount = whole(recruitment.publishCount);
  recruitment.playtimeRestoreStarted = !!recruitment.playtimeRestoreStarted;
  recruitment.restoreAnchorSeconds = whole(recruitment.restoreAnchorSeconds);
  if (recruitment.publishCount <= 0 && recruitment.totalRecruited > 0) recruitment.publishCount = 1;
  return recruitment;
}
function normalizeVisitorRecruitment(saved = {}, gameDay = 1, now = Date.now(), reserve = {}) {
  const base = defaultVisitorRecruitment(gameDay, now);
  return syncVisitorRecruitmentDay(Object.assign(base, {
    version: Math.max(1, whole(saved.version, 1)),
    day: Math.max(1, whole(saved.day, gameDay)),
    dateKey: String(saved.dateKey || base.dateKey),
    freeRemaining: clamp(whole(saved.freeRemaining, DAILY_FREE_RECRUITS), 0, DAILY_FREE_RECRUITS),
    adCredits: whole(saved.adCredits),
    adWatchedToday: clamp(whole(saved.adWatchedToday), 0, DAILY_AD_WATCH_CAP),
    adChapter: whole(saved.adChapter),
    lastAdGrantedAt: whole(saved.lastAdGrantedAt),
    totalRecruited: whole(saved.totalRecruited),
    publishCount: whole(saved.publishCount),
    playtimeRestoreStarted: !!saved.playtimeRestoreStarted,
    restoreAnchorSeconds: whole(saved.restoreAnchorSeconds),
    lastResult: saved.lastResult && typeof saved.lastResult === "object" ? Object.assign({}, saved.lastResult) : null
  }), gameDay, now, reserve);
}
function recruitmentPlaytimeSeconds(reserve = {}) {
  return Math.max(0, whole(((reserve.progression || {}).activeSeconds)));
}
function restoreVisitorRecruitmentByPlaytime(recruitment = {}, reserve = {}) {
  const cap = DAILY_FREE_RECRUITS;
  const activeSeconds = recruitmentPlaytimeSeconds(reserve);
  if (recruitment.freeRemaining >= cap) {
    recruitment.playtimeRestoreStarted = false;
    recruitment.restoreAnchorSeconds = 0;
    return recruitment;
  }
  if (recruitment.freeRemaining <= 0 && !recruitment.playtimeRestoreStarted) {
    recruitment.playtimeRestoreStarted = true;
    recruitment.restoreAnchorSeconds = activeSeconds;
  }
  if (!recruitment.playtimeRestoreStarted) return recruitment;
  const elapsed = Math.max(0, activeSeconds - whole(recruitment.restoreAnchorSeconds));
  const grant = Math.min(cap - recruitment.freeRemaining, Math.floor(elapsed / PLAYTIME_RECRUIT_RESTORE_SECONDS));
  if (grant > 0) {
    recruitment.freeRemaining += grant;
    recruitment.restoreAnchorSeconds += grant * PLAYTIME_RECRUIT_RESTORE_SECONDS;
  }
  if (recruitment.freeRemaining >= cap) {
    recruitment.playtimeRestoreStarted = false;
    recruitment.restoreAnchorSeconds = 0;
  }
  return recruitment;
}
function nextPlaytimeRestoreSeconds(recruitment = {}, reserve = {}) {
  if (!recruitment.playtimeRestoreStarted || recruitment.freeRemaining >= DAILY_FREE_RECRUITS) return 0;
  return Math.max(0, PLAYTIME_RECRUIT_RESTORE_SECONDS - Math.max(0, recruitmentPlaytimeSeconds(reserve) - whole(recruitment.restoreAnchorSeconds)));
}
function syncVisitorOperationsRealDate(operations = {}, gameDay = 1, now = Date.now()) {
  const currentDate = visitorRealDateKey(now);
  const today = operations.today || (operations.today = {});
  const previousDate = String(today.realDateKey || ((operations.recruitment || {}).dateKey) || "");
  if (previousDate && previousDate !== currentDate) {
    operations.today = {
      day: Math.max(1, whole(gameDay, 1)), realDateKey: currentDate,
      visitors: 0, recruitedVisitors: 0, recruitedIncome: 0, income: 0, survivalIncome: 0,
      ecologyScore: Math.max(0, Math.min(100, whole(today.ecologyScore))),
      safetyScore: Math.max(0, Math.min(100, whole(today.safetyScore))),
      speciesCount: whole(today.speciesCount),
      animalTotal: whole(today.animalTotal),
      tourismScore: Math.max(0, Math.min(TOURISM_SCORE_CAP, Number(today.tourismScore) || 0)),
      tourismRawScore: Math.max(0, Math.min(TOURISM_SCORE_CAP, Number(today.tourismRawScore) || 0)),
      trouble: "尚无明显麻烦"
    };
  } else {
    today.realDateKey = currentDate;
  }
  return operations.today;
}
function resetVisitorOperationsDay(operations = {}, gameDay = 1, now = Date.now()) {
  const currentDate = visitorRealDateKey(now);
  const nextDay = Math.max(1, whole(gameDay, 1));
  const today = operations.today || (operations.today = {});
  const previousDay = whole(today.day);
  if (previousDay <= 0) {
    // Old saves often start with day 0 while the initial crowd is already
    // accounted for in the chapter ledger. Mark the snapshot without
    // touching that initial contribution.
    today.day = nextDay;
    today.realDateKey = currentDate;
    return today;
  }
  if (nextDay <= previousDay) {
    today.realDateKey = currentDate;
    return today;
  }
  // A facility settlement is not guaranteed in chapter 1. Roll the daily
  // attendance snapshot here as well, otherwise narrative pressure keeps
  // consuming yesterday's recruited crowd on every later action. The
  // chapter visitor ledger is already updated at recruitment time and must
  // remain untouched.
  operations.today = Object.assign({}, today, {
    day: nextDay,
    realDateKey: currentDate,
    visitors: 0,
    recruitedVisitors: 0,
    hostedVisitors: 0,
    hostedChapter: 0,
    recruitedIncome: 0,
    income: 0,
    survivalIncome: 0,
    buildingVisitors: 0,
    buildingIncome: 0,
    buildingIncomeRaw: 0,
    buildingIncomeCap: 0,
    buildingIncomeOverflow: 0,
    incomeCapOverflow: 0,
    buildingMaintenance: 0,
    baseMaintenance: 0,
    visitorServiceMaintenance: 0,
    visitorWaterUse: 0,
    recruitmentWaterUse: 0,
    visitorWaterDelta: 0,
    facilityChanges: [],
    facilityAttendance: [],
    chapterGained: 0,
    trouble: "尚无明显麻烦"
  });
  return operations.today;
}
function populationSnapshot(reserve = {}) {
  const ecology = reserve.ecology || {};
  const groups = [ecology.predators || {}, ecology.herbivores || {}, ecology.birds || {}];
  let animalTotal = 0; let rareTotal = 0; let speciesCount = 0;
  groups.forEach((group) => Object.keys(group).forEach((id) => { const count = whole(group[id]); if (!count) return; animalTotal += count; speciesCount += 1; if (RARE_SPECIES.has(id)) rareTotal += count; }));
  return { animalTotal, rareTotal, speciesCount, rareRatio: animalTotal ? rareTotal / animalTotal : 0 };
}
function activeFacilitySnapshot(reserve = {}) {
  const nodes = ((reserve.development || {}).nodes) || {};
  const active = Object.values(nodes).filter((item) => ["operational", "managed"].includes(item.phase));
  const visitorFacilities = active.filter((item) => /visitor|boardwalk|story|border|forest_listening/.test(String(item.planId || ""))).length;
  return { activeCount: active.length, visitorFacilities };
}
const VISITOR_WATER_USE_CAP = 8;
const VISITOR_WATER_CRISIS_LINE = 25;
const VISITOR_WATER_WARNING_LINE = 35;
function visitorWaterUseForCount(count, reserve) {
  const visitors = Math.max(0, Math.round(n(count)));
  if (visitors <= 0) return 0;
  const raw = Math.min(VISITOR_WATER_USE_CAP, Math.max(1, Math.ceil(visitors / 120)));
  const water = Number((reserve && reserve.ecology || {}).water);
  if (!Number.isFinite(water)) return raw;
  if (water < VISITOR_WATER_CRISIS_LINE) return 0;
  const availableBudget = Math.max(1, Math.floor(water - 20));
  if (water < VISITOR_WATER_WARNING_LINE) return Math.min(1, raw, availableBudget);
  return Math.min(VISITOR_WATER_USE_CAP, raw, availableBudget);
}
function visitorMigrationRatio(reserve = {}) {
  const ecology = reserve.ecology || {};
  const safety = clamp(reserve.safety, 0, 100);
  const water = clamp(ecology.water, 0, 100);
  const grass = clamp(ecology.grass, 0, 100);
  const disease = clamp(ecology.disease, 0, 100);
  const quality = (safety * .50 + water * .28 + grass * .22) / 100;
  let ratio = .18 + quality * .44;
  if (disease >= 70) ratio *= .42;
  else if (disease >= 40) ratio *= .82;
  if (safety < 45) ratio *= .72;
  return clamp(ratio, .08, .62);
}
function normalizeVisitorFlowLedger(saved = {}) {
  return normalizeChapterVisitorLedger(saved);
}
function visitorRecruitmentFactors(reserve = {}) {
  const population = populationSnapshot(reserve); const ecology = reserve.ecology || {};
  const safety = clamp(reserve.safety, 0, 100); const ecologyScore = clamp(reserve.ecologyScore || ((n(ecology.water) + n(ecology.grass)) / 2), 0, 100);
  const water = clamp(ecology.water, 0, 100); const grass = clamp(ecology.grass, 0, 100);
  const disease = clamp(ecology.disease, 0, 100); const poacherPressure = clamp(reserve.poacherPressure, 0, 100); const facilities = activeFacilitySnapshot(reserve);
  const waterFactor = clamp(.58 + water / 100 * .42, .58, 1);
  const grassFactor = clamp(.72 + grass / 100 * .28, .72, 1);
  const diseaseFactor = disease >= 70
    ? clamp(.04 + (100 - disease) / 100 * .06, .04, .10)
    : clamp(1 - Math.max(0, disease - 20) / 100 * .28, .72, 1);
  const safetyFactor = clamp(.52 + safety / 100 * .78, .52, 1.3);
  const environmentFactor = clamp((.78 + ecologyScore / 100 * .22) * waterFactor * grassFactor * diseaseFactor * clamp(1 - poacherPressure / 100 * .14, .86, 1), disease >= 70 ? .04 : .18, 1.08);
  const reason = disease >= 70 ? "疾病风险过高，游客暂缓进入" : disease >= 40 ? "疾病风险偏高，客流下降" : water <= 35 ? "水源紧张，游客停留时间缩短" : grass <= 35 ? "草场退化，观赏路线减少" : poacherPressure >= 65 ? "边界安全不足，游客减少" : "生态与安全支持正常客流";
  const migrationRatio = visitorMigrationRatio(reserve);
  return { base: BASE_VISITOR_RECRUITMENT, safetyFactor, populationFactor: clamp(.88 + Math.min(.62, population.animalTotal / 300) + Math.min(.2, population.speciesCount / 30) + population.rareRatio * .35, .7, 2.05), environmentFactor, facilityFactor: clamp(1 + Math.min(.18, facilities.visitorFacilities * .045) + Math.min(.08, facilities.activeCount * .015), 1, 1.26), population, safety, ecologyScore, water, grass, disease, poacherPressure, facilities, migrationRatio, lowSafety: safety < 45, risk: disease >= 70 || water <= 35 || grass <= 35 ? "critical" : disease >= 40 || water < 50 || grass < 48 ? "warning" : "stable", reason };
}
function visitorRecruitmentStatus(reserve = {}, gameDay = 1, now = Date.now()) {
  const development = reserve.development || (reserve.development = {}); const operations = development.operations || (development.operations = {});
  syncVisitorOperationsRealDate(operations, gameDay, now);
  resetVisitorOperationsDay(operations, gameDay, now);
  operations.recruitment = restoreVisitorRecruitmentByPlaytime(normalizeVisitorRecruitment(operations.recruitment, gameDay, now, reserve), reserve);
  const recruitment = operations.recruitment;
  const nextRestoreSeconds = nextPlaytimeRestoreSeconds(recruitment, reserve);
  return {
    dateKey: recruitment.dateKey, freeRemaining: recruitment.freeRemaining, adCredits: recruitment.adCredits,
    adWatchedToday: recruitment.adWatchedToday,
    adWatchRemaining: Math.floor(Math.max(0, DAILY_AD_WATCH_CAP - recruitment.adWatchedToday) / AD_RECRUIT_GRANT),
    totalAvailable: recruitment.freeRemaining + recruitment.adCredits,
    canRecruit: recruitment.freeRemaining > 0 || recruitment.adCredits > 0,
    canWatchAd: recruitment.freeRemaining <= 0 && recruitment.adCredits <= 0 && recruitment.adWatchedToday + AD_RECRUIT_GRANT <= DAILY_AD_WATCH_CAP,
    totalRecruited: recruitment.totalRecruited, publishCount: recruitment.publishCount,
    playtimeRestoreStarted: !!recruitment.playtimeRestoreStarted,
    nextRestoreSeconds,
    nextRestoreMinutes: Math.max(0, Math.ceil(nextRestoreSeconds / 60)),
    factors: visitorRecruitmentFactors(reserve)
  };
}
function previewVisitorRecruitment(reserve = {}, gameDay = 1, random = .5, now = Date.now()) {
  const status = visitorRecruitmentStatus(reserve, gameDay, now); const factors = status.factors;
  const wave = clamp(.9 + clamp(typeof random === "function" ? random() : random, 0, 1) * .2, .9, 1.1);
  factors.eventFactor = eventBusinessFactors(reserve).demand;
  const raw = factors.base * factors.safetyFactor * factors.populationFactor * factors.environmentFactor * factors.facilityFactor * factors.eventFactor * wave;
  const progression = reserve.progression || {};
  const stage = Math.max(1, whole(progression.stage, 1));
  const firstStageRecruitment = stage === 1 && Number(status.publishCount || 0) <= 0;
  const visitors = scaleRecruitmentVisitors(raw, stage, status.publishCount, factors.disease);
  const migrationRatio = factors.migrationRatio;
  return Object.assign({}, status, { visitors, wave, raw, firstStageRecruitment, migrationRatio });
}
function recruitmentYieldBand(stage = 1, publishCount = 0, disease = 0) {
  const crisis = n(disease) >= 70;
  const stageN = Math.max(1, whole(stage, 1));
  const wave = Math.max(0, whole(publishCount));
  if (crisis) return { factor: 0.12, min: 0, max: stageN <= 1 ? 8 : 12 };
  if (stageN === 1 && wave <= 0) return { factor: 0.28, min: 8, max: 42 };
  if (stageN === 1) return { factor: 0.38, min: 16, max: 42 };
  if (stageN === 2) return { factor: 0.48, min: 20, max: 62 };
  if (stageN === 3) return { factor: 0.58, min: 24, max: 74 };
  if (stageN === 4) return { factor: 0.70, min: 28, max: 88 };
  if (stageN === 5) return { factor: 0.84, min: 32, max: 108 };
  if (stageN === 6) return { factor: 1.00, min: 40, max: 145 };
  if (stageN === 7) return { factor: 1.08, min: 44, max: 165 };
  if (stageN === 8) return { factor: 1.16, min: 48, max: 178 };
  if (stageN === 9) return { factor: 1.24, min: 52, max: 196 };
  if (stageN === 10) return { factor: 1.32, min: 56, max: 214 };
  if (stageN <= 12) return { factor: 1.40, min: 60, max: 226 };
  if (stageN <= 14) return { factor: 1.50, min: 64, max: 254 };
  if (stageN <= 17) return { factor: 1.60, min: 68, max: 280 };
  if (stageN <= 19) return { factor: 1.72, min: 72, max: 322 };
  return { factor: 1.80, min: 72, max: 348 };
}
function scaleRecruitmentVisitors(raw, stage = 1, publishCount = 0, disease = 0) {
  const band = recruitmentYieldBand(stage, publishCount, disease);
  const scale = clamp(PACE_ECONOMY.visitorRecruitmentScale, 0.1, 2);
  return Math.max(band.min, Math.min(band.max, Math.round(n(raw) * band.factor * scale)));
}
function recruitContributionIncome(reserve = {}, visitors = 0) {
  const contribution = visitorContributionRate(reserve);
  return Math.max(0, Math.round(n(visitors) * contribution.rate));
}
function consumeVisitorRecruitment(reserve = {}, gameDay = 1, random = Math.random, now = Date.now()) {
  const status = visitorRecruitmentStatus(reserve, gameDay, now); const operations = reserve.development.operations; const recruitment = operations.recruitment;
  const free = recruitment.freeRemaining > 0;
  if (free) recruitment.freeRemaining -= 1; else if (recruitment.adCredits > 0) recruitment.adCredits -= 1; else return { ok: false, reason: "no_credits", status };
  const result = previewVisitorRecruitment(reserve, gameDay, random, now); const contribution = visitorContributionRate(reserve); const income = recruitContributionIncome(reserve, result.visitors);
  const migrationRatio = result.migrationRatio;
  result.feedback = result.factors.reason;
  result.activity = contribution.activity; result.retention = contribution.retention;
  recruitment.totalRecruited += result.visitors;
  recruitment.publishCount = whole(recruitment.publishCount) + 1;
  recruitment.lastResult = { day: gameDay, dateKey: recruitment.dateKey, visitors: result.visitors, income, source: free ? "free" : "ad" };
  operations.totalIncome = whole(operations.totalIncome) + income;
  const beforeFund = whole(reserve.fund); reserve.fund = Math.max(0, beforeFund + income); recordFundChange(reserve, beforeFund, reserve.fund, "游客消费贡献收入", gameDay, "游客消费贡献");
  const ecology = reserve.ecology || (reserve.ecology = {});
  const waterBefore = clamp(ecology.water, 0, 100);
  const waterUse = visitorWaterUseForCount(result.visitors, reserve);
  ecology.water = clamp(waterBefore - waterUse, 0, 100);
  recordEcologyFlow(reserve, "water", ecology.water - waterBefore, "游客招募", gameDay);
  const today = syncVisitorOperationsRealDate(operations, gameDay, now); today.day = Math.max(1, whole(gameDay, 1)); today.recruitedIncome = whole(today.recruitedIncome) + income; today.income = whole(today.income) + income;
  today.recruitmentWaterUse = whole(today.recruitmentWaterUse) + waterUse;
  const applied = applyChapterVisitorDelta(reserve, result.visitors, "recruit");
  operations.recruitment = recruitment;
  result.migratedVisitors = 0;
  result.recruitedVisitors = result.visitors;
  result.chapterVisitors = applied;
  result.migrationRatio = migrationRatio;
  result.visitorWaterUse = waterUse;
  result.visitorWater = { before: waterBefore, after: ecology.water, delta: ecology.water - waterBefore };
  return { ok: true, visitors: result.visitors, income, result, migratedVisitors: 0, recruitedVisitors: result.visitors, migrationRatio, visitorWaterUse: waterUse, chapterVisitors: applied, status: visitorRecruitmentStatus(reserve, gameDay, now) };
}
function grantVisitorRecruitmentAd(reserve = {}, gameDay = 1, now = Date.now()) {
  const status = visitorRecruitmentStatus(reserve, gameDay, now);
  const recruitment = reserve.development.operations.recruitment;
  if (recruitment.adCredits > 0) {
    return { ok: true, granted: 0, reason: "already_granted", status };
  }
  const lastGrantedAt = whole(recruitment.lastAdGrantedAt);
  if (lastGrantedAt && now >= lastGrantedAt && now - lastGrantedAt < 8000) {
    return { ok: true, granted: 0, reason: "already_granted", status };
  }
  if (recruitment.adWatchedToday + AD_RECRUIT_GRANT > DAILY_AD_WATCH_CAP) {
    return { ok: false, reason: "daily_cap", status };
  }
  recruitment.adWatchedToday += AD_RECRUIT_GRANT;
  recruitment.adCredits += AD_RECRUIT_GRANT;
  recruitment.lastAdGrantedAt = whole(now);
  return { ok: true, granted: AD_RECRUIT_GRANT, status: visitorRecruitmentStatus(reserve, gameDay, now) };
}
module.exports = { DAILY_FREE_RECRUITS, AD_RECRUIT_GRANT, DAILY_AD_WATCH_CAP, PLAYTIME_RECRUIT_RESTORE_SECONDS, BASE_VISITOR_RECRUITMENT, MIN_RECRUITMENT, MAX_RECRUITMENT, VISITOR_WATER_USE_CAP, VISITOR_WATER_CRISIS_LINE, VISITOR_WATER_WARNING_LINE, visitorRealDateKey, normalizeVisitorRecruitment, syncVisitorRecruitmentDay, syncVisitorOperationsRealDate, resetVisitorOperationsDay, restoreVisitorRecruitmentByPlaytime, populationSnapshot, visitorWaterUseForCount, visitorMigrationRatio, normalizeVisitorFlowLedger, visitorRecruitmentFactors, visitorRecruitmentStatus, previewVisitorRecruitment, recruitmentYieldBand, scaleRecruitmentVisitors, recruitContributionIncome, consumeVisitorRecruitment, grantVisitorRecruitmentAd };
