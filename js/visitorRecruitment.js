const { recordFundChange } = require("./fundLedger");
const { eventBusinessFactors, visitorContributionRate } = require("./eventEconomy");

const DAILY_FREE_RECRUITS = 2;
const AD_RECRUIT_GRANT = 2;
const DAILY_AD_WATCH_CAP = 8;
const BASE_VISITOR_RECRUITMENT = 100;
const MIN_RECRUITMENT = 20;
const MAX_RECRUITMENT = 600;
const RARE_SPECIES = new Set(["lion", "leopard", "giraffe", "owl", "elephant", "hippo", "crocodile", "wildDog", "mink", "fox", "rhino", "pangolin", "cheetah", "hyena"]);
const n = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const whole = (value, fallback = 0) => Math.max(0, Math.round(n(value, fallback)));
const clamp = (value, min, max) => Math.max(min, Math.min(max, n(value, min)));

function visitorRealDateKey(now = Date.now()) {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function defaultVisitorRecruitment(gameDay = 1, now = Date.now()) {
  return { version: 2, day: Math.max(1, whole(gameDay, 1)), dateKey: visitorRealDateKey(now), freeRemaining: DAILY_FREE_RECRUITS, adCredits: 0, adWatchedToday: 0, totalRecruited: 0, lastResult: null };
}

// 兼容旧调用名；免费次数只按真实自然日重置，不再按游戏守护日重置。
function syncVisitorRecruitmentDay(recruitment, gameDay = 1, now = Date.now()) {
  const currentDate = visitorRealDateKey(now);
  if (!recruitment || typeof recruitment !== "object") return defaultVisitorRecruitment(gameDay, now);
  if (!recruitment.dateKey) recruitment.dateKey = currentDate;
  if (recruitment.dateKey !== currentDate) {
    recruitment.dateKey = currentDate;
    recruitment.freeRemaining = DAILY_FREE_RECRUITS;
    recruitment.adCredits = 0;
    recruitment.adWatchedToday = 0;
  }
  recruitment.version = 2;
  recruitment.day = Math.max(1, whole(gameDay, 1));
  recruitment.freeRemaining = clamp(whole(recruitment.freeRemaining, DAILY_FREE_RECRUITS), 0, DAILY_FREE_RECRUITS);
  recruitment.adCredits = whole(recruitment.adCredits);
  recruitment.adWatchedToday = clamp(whole(recruitment.adWatchedToday), 0, DAILY_AD_WATCH_CAP);
  recruitment.totalRecruited = whole(recruitment.totalRecruited);
  return recruitment;
}

function normalizeVisitorRecruitment(saved = {}, gameDay = 1, now = Date.now()) {
  const base = defaultVisitorRecruitment(gameDay, now);
  return syncVisitorRecruitmentDay(Object.assign(base, {
    version: 2,
    day: Math.max(1, whole(saved.day, gameDay)),
    dateKey: String(saved.dateKey || base.dateKey),
    freeRemaining: clamp(whole(saved.freeRemaining, DAILY_FREE_RECRUITS), 0, DAILY_FREE_RECRUITS),
    adCredits: whole(saved.adCredits),
    adWatchedToday: clamp(whole(saved.adWatchedToday), 0, DAILY_AD_WATCH_CAP),
    totalRecruited: whole(saved.totalRecruited),
    lastResult: saved.lastResult && typeof saved.lastResult === "object" ? Object.assign({}, saved.lastResult) : null
  }), gameDay, now);
}

function syncVisitorOperationsRealDate(operations = {}, gameDay = 1, now = Date.now()) {
  const currentDate = visitorRealDateKey(now);
  const today = operations.today || (operations.today = {});
  const previousDate = String(today.realDateKey || ((operations.recruitment || {}).dateKey) || "");
  if (previousDate && previousDate !== currentDate) {
    // 新的一天清空客流账本，但保留上一日的旅游评分作为缓慢晋级的起点。
    // 评分属于保护区经营状态，不应因日期切换或招募入口刷新而突然归零。
    operations.today = {
      day: Math.max(1, whole(gameDay, 1)), realDateKey: currentDate,
      visitors: 0, recruitedVisitors: 0, recruitedIncome: 0, income: 0, survivalIncome: 0,
      tourismScore: Math.max(0, Math.min(40, Number(today.tourismScore) || 0)),
      tourismRawScore: Math.max(0, Math.min(40, Number(today.tourismRawScore) || 0)),
      trouble: "尚无明显麻烦"
    };
  } else {
    today.realDateKey = currentDate;
  }
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

function visitorRecruitmentFactors(reserve = {}) {
  const population = populationSnapshot(reserve); const ecology = reserve.ecology || {};
  const safety = clamp(reserve.safety, 0, 100); const ecologyScore = clamp(reserve.ecologyScore || ((n(ecology.water) + n(ecology.grass)) / 2), 0, 100);
  const water = clamp(ecology.water, 0, 100); const grass = clamp(ecology.grass, 0, 100);
  const disease = clamp(ecology.disease, 0, 100); const poacherPressure = clamp(reserve.poacherPressure, 0, 100); const facilities = activeFacilitySnapshot(reserve);
  const waterFactor = clamp(.58 + water / 100 * .42, .58, 1);
  const grassFactor = clamp(.72 + grass / 100 * .28, .72, 1);
  const diseaseFactor = clamp(1 - Math.max(0, disease - 20) / 100 * .22, .78, 1);
  const safetyFactor = clamp(.52 + safety / 100 * .78, .52, 1.3);
  const environmentFactor = clamp((.78 + ecologyScore / 100 * .22) * waterFactor * grassFactor * diseaseFactor * clamp(1 - poacherPressure / 100 * .14, .86, 1), .45, 1.08);
  const reason = disease >= 70 ? "疾病风险过高，游客暂缓进入" : water <= 35 ? "水源紧张，游客停留时间缩短" : grass <= 35 ? "草场退化，观赏路线减少" : poacherPressure >= 65 ? "边界安全不足，游客减少" : "生态与安全支持正常客流";
  return { base: BASE_VISITOR_RECRUITMENT, safetyFactor, populationFactor: clamp(.88 + Math.min(.62, population.animalTotal / 300) + Math.min(.2, population.speciesCount / 30) + population.rareRatio * .35, .7, 2.05), environmentFactor, facilityFactor: clamp(1 + Math.min(.18, facilities.visitorFacilities * .045) + Math.min(.08, facilities.activeCount * .015), 1, 1.26), population, safety, ecologyScore, water, grass, disease, poacherPressure, facilities, lowSafety: safety < 45, risk: disease >= 70 || water <= 35 || grass <= 35 ? "critical" : disease >= 40 || water < 50 || grass < 48 ? "warning" : "stable", reason };
}

function visitorRecruitmentStatus(reserve = {}, gameDay = 1, now = Date.now()) {
  const development = reserve.development || (reserve.development = {}); const operations = development.operations || (development.operations = {});
  syncVisitorOperationsRealDate(operations, gameDay, now); operations.recruitment = normalizeVisitorRecruitment(operations.recruitment, gameDay, now);
  const recruitment = operations.recruitment;
  return { dateKey: recruitment.dateKey, freeRemaining: recruitment.freeRemaining, adCredits: recruitment.adCredits, adWatchedToday: recruitment.adWatchedToday, adWatchRemaining: Math.floor(Math.max(0, DAILY_AD_WATCH_CAP - recruitment.adWatchedToday) / AD_RECRUIT_GRANT), totalAvailable: recruitment.freeRemaining + recruitment.adCredits, canRecruit: recruitment.freeRemaining > 0 || recruitment.adCredits > 0, canWatchAd: recruitment.freeRemaining <= 0 && recruitment.adCredits <= 0 && recruitment.adWatchedToday + AD_RECRUIT_GRANT <= DAILY_AD_WATCH_CAP, totalRecruited: recruitment.totalRecruited, factors: visitorRecruitmentFactors(reserve) };
}

function previewVisitorRecruitment(reserve = {}, gameDay = 1, random = .5, now = Date.now()) {
  const status = visitorRecruitmentStatus(reserve, gameDay, now); const factors = status.factors;
  const wave = clamp(.9 + clamp(typeof random === "function" ? random() : random, 0, 1) * .2, .9, 1.1);
  factors.eventFactor = eventBusinessFactors(reserve).demand;
  const raw = factors.base * factors.safetyFactor * factors.populationFactor * factors.environmentFactor * factors.facilityFactor * factors.eventFactor * wave;
  const progression = reserve.progression || {};
  const firstStageRecruitment = Number(progression.stage || 1) === 1 && Number(status.totalRecruited || 0) <= 0;
  const visitors = firstStageRecruitment
    ? Math.max(8, Math.min(20, Math.round(raw / 10)))
    : Math.max(MIN_RECRUITMENT, Math.min(MAX_RECRUITMENT, Math.round(raw)));
  return Object.assign({}, status, { visitors, wave, raw, firstStageRecruitment });
}

function consumeVisitorRecruitment(reserve = {}, gameDay = 1, random = Math.random, now = Date.now()) {
  const status = visitorRecruitmentStatus(reserve, gameDay, now); const operations = reserve.development.operations; const recruitment = operations.recruitment;
  const free = recruitment.freeRemaining > 0;
  if (free) recruitment.freeRemaining -= 1; else if (recruitment.adCredits > 0) recruitment.adCredits -= 1; else return { ok: false, reason: "no_credits", status };
  const result = previewVisitorRecruitment(reserve, gameDay, random, now); const contribution = visitorContributionRate(reserve); const income = Math.round(result.visitors * contribution.rate);
  result.feedback = result.factors.reason;
  result.activity = contribution.activity; result.retention = contribution.retention;
  recruitment.totalRecruited += result.visitors; recruitment.lastResult = { day: gameDay, dateKey: recruitment.dateKey, visitors: result.visitors, income, source: free ? "free" : "ad" };
  operations.totalVisitors = whole(operations.totalVisitors) + result.visitors; operations.totalIncome = whole(operations.totalIncome) + income;
  const beforeFund = whole(reserve.fund); reserve.fund = Math.max(0, beforeFund + income); recordFundChange(reserve, beforeFund, reserve.fund, "游客消费贡献收入", gameDay, "游客消费贡献");
  const today = syncVisitorOperationsRealDate(operations, gameDay, now); today.day = Math.max(1, whole(gameDay, 1)); today.recruitedVisitors = whole(today.recruitedVisitors) + result.visitors; today.recruitedIncome = whole(today.recruitedIncome) + income; today.income = whole(today.income) + income;
  operations.recruitment = recruitment;
  return { ok: true, visitors: result.visitors, income, result, status: visitorRecruitmentStatus(reserve, gameDay, now) };
}

function grantVisitorRecruitmentAd(reserve = {}, gameDay = 1, now = Date.now()) {
  const status = visitorRecruitmentStatus(reserve, gameDay, now); const recruitment = reserve.development.operations.recruitment;
  if (!status.canWatchAd) return { ok: false, reason: status.freeRemaining > 0 ? "free_remaining" : status.adCredits > 0 ? "credits_remaining" : "daily_cap", status };
  recruitment.adWatchedToday += AD_RECRUIT_GRANT; recruitment.adCredits += AD_RECRUIT_GRANT;
  return { ok: true, granted: AD_RECRUIT_GRANT, status: visitorRecruitmentStatus(reserve, gameDay, now) };
}

module.exports = { DAILY_FREE_RECRUITS, AD_RECRUIT_GRANT, DAILY_AD_WATCH_CAP, BASE_VISITOR_RECRUITMENT, MIN_RECRUITMENT, MAX_RECRUITMENT, visitorRealDateKey, normalizeVisitorRecruitment, syncVisitorRecruitmentDay, syncVisitorOperationsRealDate, populationSnapshot, visitorRecruitmentFactors, visitorRecruitmentStatus, previewVisitorRecruitment, consumeVisitorRecruitment, grantVisitorRecruitmentAd };
