const { applyChapterVisitorDelta, chapterVisitorTotal, chapterTargets } = require("./chapterTargets");
const { localDateKey } = require("./firstReturnHook");
const { PACE_ECONOMY } = require("./balanceConfig");
const VISITOR_RECEPTION_MAX_USES = Math.max(1, Math.round(Number(PACE_ECONOMY.visitorReceptionMaxUses) || 4));
const VISITOR_RECEPTION_BUDGET_RATIO = 0.15;
function whole(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}
function receptionChapter(reserve = {}, fallback = 1) {
  const progression = reserve.progression || {};
  return Math.max(1, whole(progression.stage || progression.displayChapter || fallback) || 1);
}
function visitorReceptionPlan(chapter = 1) {
  const liveChapter = Math.max(1, whole(chapter) || 1);
  const target = Math.max(0, whole((chapterTargets(liveChapter) || {}).visitors));
  const budget = Math.floor(target * VISITOR_RECEPTION_BUDGET_RATIO);
  const scaledUses = Math.max(2, Math.ceil(target / 150));
  const uses = Math.min(VISITOR_RECEPTION_MAX_USES, scaledUses, Math.max(0, budget));
  return { chapter: liveChapter, target, budget, uses };
}
function receptionAmountFor(plan = {}, gained = 0, remainingUses = 0) {
  const room = Math.max(0, whole(plan.budget) - whole(gained));
  const usesLeft = whole(remainingUses);
  if (room <= 0 || usesLeft <= 0) return 0;
  const per = Math.floor(room / usesLeft);
  const extra = room - per * usesLeft;
  return per + (extra > 0 ? 1 : 0);
}
function emptyVisitorReceptionGrant(chapter = 1, now = Date.now()) {
  const plan = visitorReceptionPlan(chapter);
  return {
    chapter: plan.chapter,
    dateKey: localDateKey(now),
    remaining: plan.uses,
    allowance: plan.uses,
    budget: plan.budget,
    gained: 0
  };
}
function normalizeVisitorReceptionGrant(saved = {}, chapter = 1, now = Date.now()) {
  const base = emptyVisitorReceptionGrant(chapter, now);
  return {
    chapter: Math.max(1, whole(saved.chapter || chapter) || 1),
    dateKey: String(saved.dateKey || base.dateKey),
    remaining: saved.remaining == null ? base.remaining : Math.max(0, whole(saved.remaining)),
    allowance: saved.allowance == null ? 0 : whole(saved.allowance),
    budget: saved.budget == null ? 0 : whole(saved.budget),
    gained: whole(saved.gained)
  };
}
function clearChapterHostedVisitors(reserve = {}, chapter = 1) {
  const operations = ((reserve.development || {}).operations) || {};
  const today = operations.today;
  if (!today || typeof today !== "object") return 0;
  today.hostedVisitors = 0;
  today.hostedChapter = Math.max(1, whole(chapter) || 1);
  return 0;
}
function tunedRemaining(plan, gained, savedRemaining, retune) {
  const room = Math.max(0, whole(plan.budget) - whole(gained));
  if (room <= 0 || plan.uses <= 0) return 0;
  if (retune) return Math.min(plan.uses, room);
  return Math.min(plan.uses, room, whole(savedRemaining));
}
function syncVisitorReceptionGrant(reserve = {}, chapter = 1, now = Date.now()) {
  const liveChapter = receptionChapter(reserve, chapter);
  const plan = visitorReceptionPlan(liveChapter);
  const next = normalizeVisitorReceptionGrant(reserve.visitorReceptionGrant, liveChapter, now);
  const today = localDateKey(now);
  const chapterChanged = next.chapter !== liveChapter;
  if (chapterChanged) clearChapterHostedVisitors(reserve, liveChapter);
  const gained = chapterChanged ? 0 : next.gained;
  const retune = chapterChanged || next.budget !== plan.budget || next.allowance !== plan.uses;
  reserve.visitorReceptionGrant = {
    chapter: liveChapter,
    dateKey: today,
    remaining: tunedRemaining(plan, gained, next.remaining, retune),
    allowance: plan.uses,
    budget: plan.budget,
    gained
  };
  return reserve.visitorReceptionGrant;
}
function visitorReceptionPreview(reserve = {}) {
  const chapter = receptionChapter(reserve);
  const plan = visitorReceptionPlan(chapter);
  const grant = reserve.visitorReceptionGrant || {};
  const sameChapter = whole(grant.chapter) === chapter;
  const gained = sameChapter ? whole(grant.gained) : 0;
  const remaining = sameChapter && grant.remaining != null ? whole(grant.remaining) : plan.uses;
  const freshHigh = receptionAmountFor(plan, 0, plan.uses);
  const freshLow = plan.uses > 0 ? Math.floor(plan.budget / plan.uses) : 0;
  return {
    min: freshLow,
    max: Math.max(freshLow, freshHigh),
    next: receptionAmountFor(plan, gained, remaining),
    uses: plan.uses,
    budget: plan.budget,
    target: plan.target,
    remaining
  };
}
function rollVisitorReceptionGain(reserve = {}) {
  const chapter = receptionChapter(reserve);
  const plan = visitorReceptionPlan(chapter);
  const grant = reserve.visitorReceptionGrant || {};
  const sameChapter = whole(grant.chapter) === chapter;
  const gained = sameChapter ? whole(grant.gained) : 0;
  const remaining = sameChapter && grant.remaining != null ? whole(grant.remaining) : plan.uses;
  return receptionAmountFor(plan, gained, remaining);
}
function chapterHostedVisitors(reserve = {}, day) {
  const liveChapter = receptionChapter(reserve);
  const today = (((reserve.development || {}).operations) || {}).today || {};
  if (whole(today.hostedChapter) !== liveChapter) return 0;
  if (day != null && whole(today.day) !== whole(day)) return 0;
  return whole(today.hostedVisitors);
}
function chapterReceptionGained(reserve = {}, now = Date.now()) {
  const grant = syncVisitorReceptionGrant(reserve, receptionChapter(reserve), now);
  return whole(grant.gained);
}
function applyVisitorReception(reserve = {}, amount, options = {}) {
  const chapter = receptionChapter(reserve, options.chapter);
  const now = options.now == null ? Date.now() : options.now;
  const grant = syncVisitorReceptionGrant(reserve, chapter, now);
  const plan = visitorReceptionPlan(chapter);
  const planned = receptionAmountFor(plan, grant.gained, grant.remaining);
  if (whole(grant.remaining) <= 0 || planned <= 0) {
    grant.remaining = 0;
    reserve.visitorReceptionGrant = grant;
    return { ok: false, reason: "used", before: chapterVisitorTotal(reserve), after: chapterVisitorTotal(reserve), applied: 0, grant };
  }
  const requested = whole(amount);
  const wanted = requested > 0 ? Math.min(planned, requested) : planned;
  const before = chapterVisitorTotal(reserve);
  const change = applyChapterVisitorDelta(reserve, wanted, "task");
  const applied = Math.max(0, whole(change.applied));
  if (applied <= 0) {
    return { ok: false, reason: "no-change", before, after: before, applied: 0, source: "task", chapter, grant };
  }
  grant.chapter = chapter;
  grant.remaining = Math.max(0, whole(grant.remaining) - 1);
  grant.allowance = plan.uses;
  grant.budget = plan.budget;
  grant.gained = whole(grant.gained) + applied;
  if (grant.gained >= plan.budget) grant.remaining = 0;
  reserve.visitorReceptionGrant = grant;
  const operations = (reserve.development || (reserve.development = {})).operations || (reserve.development.operations = {});
  const today = operations.today || (operations.today = {});
  if (whole(today.hostedChapter) !== chapter) today.hostedVisitors = 0;
  today.hostedChapter = chapter;
  today.day = Math.max(1, whole(options.day) || whole(today.day) || whole((reserve.guardianCycle || {}).day) || 1);
  today.hostedVisitors = whole(today.hostedVisitors) + applied;
  return {
    ok: true,
    reason: "",
    before,
    after: chapterVisitorTotal(reserve),
    applied,
    source: "task",
    chapter,
    grant
  };
}
module.exports = {
  VISITOR_RECEPTION_MAX_USES,
  VISITOR_RECEPTION_BUDGET_RATIO,
  emptyVisitorReceptionGrant,
  normalizeVisitorReceptionGrant,
  syncVisitorReceptionGrant,
  visitorReceptionPlan,
  visitorReceptionPreview,
  rollVisitorReceptionGain,
  applyVisitorReception,
  receptionChapter,
  chapterHostedVisitors,
  chapterReceptionGained,
  clearChapterHostedVisitors
};
