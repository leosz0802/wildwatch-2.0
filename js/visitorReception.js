const { applyChapterVisitorDelta, chapterVisitorTotal } = require("./chapterTargets");
const { localDateKey } = require("./firstReturnHook");

const VISITOR_RECEPTION_MIN = 4;
const VISITOR_RECEPTION_SPAN = 5;
const VISITOR_RECEPTION_CAP = 12;

function whole(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function receptionChapter(reserve = {}, fallback = 1) {
  const progression = reserve.progression || {};
  return Math.max(1, whole(progression.stage || progression.displayChapter || fallback) || 1);
}

function emptyVisitorReceptionGrant(chapter = 1, now = Date.now()) {
  return {
    chapter: Math.max(1, whole(chapter) || 1),
    dateKey: localDateKey(now),
    remaining: 1,
    gained: 0
  };
}

function normalizeVisitorReceptionGrant(saved = {}, chapter = 1, now = Date.now()) {
  const base = emptyVisitorReceptionGrant(chapter, now);
  return {
    chapter: Math.max(1, whole(saved.chapter || chapter) || 1),
    dateKey: String(saved.dateKey || base.dateKey),
    remaining: saved.remaining == null ? 1 : Math.max(0, whole(saved.remaining)),
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

function syncVisitorReceptionGrant(reserve = {}, chapter = 1, now = Date.now()) {
  const liveChapter = receptionChapter(reserve, chapter);
  const next = normalizeVisitorReceptionGrant(reserve.visitorReceptionGrant, liveChapter, now);
  const today = localDateKey(now);
  const chapterChanged = next.chapter !== liveChapter;
  const dayChanged = next.dateKey !== today;
  if (chapterChanged) {
    clearChapterHostedVisitors(reserve, liveChapter);
  }
  if (chapterChanged || dayChanged) {
    reserve.visitorReceptionGrant = {
      chapter: liveChapter,
      dateKey: today,
      remaining: 1,
      gained: chapterChanged ? 0 : next.gained
    };
  } else {
    reserve.visitorReceptionGrant = Object.assign({}, next, { chapter: liveChapter });
  }
  return reserve.visitorReceptionGrant;
}

function visitorReceptionPreview() {
  return { min: VISITOR_RECEPTION_MIN, max: VISITOR_RECEPTION_MIN + VISITOR_RECEPTION_SPAN - 1 };
}

function rollVisitorReceptionGain(reserve = {}, random = Math.random) {
  const safety = Number(reserve.safety) || 0;
  const bonus = safety >= 80 ? 2 : safety >= 60 ? 1 : 0;
  return Math.min(VISITOR_RECEPTION_CAP, VISITOR_RECEPTION_MIN + Math.floor(random() * VISITOR_RECEPTION_SPAN) + bonus);
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
  if (whole(grant.remaining) <= 0) {
    return { ok: false, reason: "used", before: chapterVisitorTotal(reserve), after: chapterVisitorTotal(reserve), applied: 0, grant };
  }
  const wanted = Math.max(1, Math.min(VISITOR_RECEPTION_CAP, whole(amount) || rollVisitorReceptionGain(reserve, options.random)));
  const before = chapterVisitorTotal(reserve);
  const change = applyChapterVisitorDelta(reserve, wanted, "task");
  const applied = Math.max(0, whole(change.applied));
  grant.chapter = chapter;
  grant.remaining = 0;
  grant.gained = whole(grant.gained) + applied;
  reserve.visitorReceptionGrant = grant;
  const operations = (reserve.development || (reserve.development = {})).operations || (reserve.development.operations = {});
  const today = operations.today || (operations.today = {});
  if (whole(today.hostedChapter) !== chapter) {
    today.hostedVisitors = 0;
  }
  today.hostedChapter = chapter;
  today.day = Math.max(1, whole(options.day) || whole(today.day) || whole((reserve.guardianCycle || {}).day) || 1);
  today.hostedVisitors = whole(today.hostedVisitors) + applied;
  return {
    ok: applied > 0,
    reason: applied > 0 ? "" : "no-change",
    before,
    after: chapterVisitorTotal(reserve),
    applied,
    source: "task",
    chapter,
    grant
  };
}

module.exports = {
  VISITOR_RECEPTION_MIN,
  VISITOR_RECEPTION_CAP,
  emptyVisitorReceptionGrant,
  normalizeVisitorReceptionGrant,
  syncVisitorReceptionGrant,
  visitorReceptionPreview,
  rollVisitorReceptionGain,
  applyVisitorReception,
  receptionChapter,
  chapterHostedVisitors,
  chapterReceptionGained,
  clearChapterHostedVisitors
};
