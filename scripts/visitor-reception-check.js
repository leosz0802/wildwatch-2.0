"use strict";

const assert = require("node:assert/strict");
const { createInitialWorld } = require("../js/world");
const { createCharacter, normalizeReserve } = require("../js/storage");
const {
  chapterTargets,
  chapterVisitorTotal,
  chapterVisitorBreakdown,
  chapterVisitorCarryover,
  beginChapterVisitorCheckpoint,
  applyChapterVisitorDelta
} = require("../js/chapterTargets");
const { visitorRecruitmentStatus } = require("../js/visitorRecruitment");
const {
  applyVisitorReception,
  syncVisitorReceptionGrant,
  chapterHostedVisitors,
  chapterReceptionGained,
  visitorReceptionPreview,
  visitorReceptionPlan
} = require("../js/visitorReception");
const { applyGoalProgress, normalizeGoalState } = require("../js/goalSystem");

function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, key) {
      if (key === "measureText") return (text) => ({ width: String(text || "").length * 7 });
      if (key === "createLinearGradient" || key === "createRadialGradient") return () => gradient;
      if (key === "canvas") return { width: 375, height: 667 };
      if (!target[key]) target[key] = () => {};
      return target[key];
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    }
  });
}

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
  createCanvas: () => ({ width: 375, height: 667, getContext: () => fakeContext() }),
  createImage: () => ({ loaded: true, set src(value) { this._src = value; if (this.onload) this.onload(); } }),
  getStorageSync: () => null,
  setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const { Game } = require("../js/game");

const day = new Date(2026, 8, 22, 10, 0, 0).getTime();
const nextDay = new Date(2026, 8, 23, 0, 10, 0).getTime();

assert.deepEqual(chapterTargets(1), { species: 7, animals: 70, visitors: 114, expectedMinutes: 4 });
assert.deepEqual(chapterTargets(2), { species: 7, animals: 84, visitors: 174, expectedMinutes: 9 });
assert.equal(chapterTargets(3).visitors, 378);
assert.ok(chapterTargets(20).visitors > chapterTargets(3).visitors, "late chapter visitor gates keep rising");

const chapterOnePlan = visitorReceptionPlan(1);
assert.equal(chapterOnePlan.budget, Math.floor(chapterTargets(1).visitors * 0.15));
assert.ok(chapterOnePlan.uses >= 2 && chapterOnePlan.uses <= 6);
const chapterTwentyPlan = visitorReceptionPlan(20);
assert.equal(chapterTwentyPlan.uses, 6, "a chapter can host at most 6 receptions");
const lateVisitors = chapterTargets(20).visitors;
assert.equal(chapterTwentyPlan.budget, Math.floor(lateVisitors * 0.15));
assert.ok(chapterTwentyPlan.budget / lateVisitors <= 0.15);

const opening = createInitialWorld().reserve;
opening.progression = Object.assign({}, opening.progression, { stage: 1, displayChapter: 1 });
const recruitBefore = visitorRecruitmentStatus(opening, 1, day);
const before = chapterVisitorTotal(opening);
let received = 0;
for (let turn = 0; turn < chapterOnePlan.uses; turn += 1) {
  const step = applyVisitorReception(opening, 0, { chapter: 1, now: day, day: 1 });
  assert.equal(step.ok, true, `chapter 1 reception ${turn + 1} should succeed`);
  assert.equal(step.source, "task");
  received += step.applied;
}
assert.equal(received, chapterOnePlan.budget, "chapter reception sums to 15% of the visitor target");
assert.equal(chapterVisitorTotal(opening), before + received, "reception must write this chapter total, not lifetime HUD");
const mix = chapterVisitorBreakdown(opening);
assert.equal(mix.task, received, "reception is this-chapter task flow");
assert.equal(mix.recruited, 0, "reception must not look like a recruit");
assert.equal(chapterReceptionGained(opening, day), received);
assert.equal(chapterHostedVisitors(opening, 1), received);
const recruitAfter = visitorRecruitmentStatus(opening, 1, day);
assert.equal(recruitAfter.freeRemaining, recruitBefore.freeRemaining, "reception must not consume recruit credits");
assert.equal(recruitAfter.adCredits, recruitBefore.adCredits);

const used = applyVisitorReception(opening, 99, { chapter: 1, now: day, day: 1 });
assert.equal(used.ok, false);
assert.equal(used.reason, "used");
assert.equal(chapterVisitorTotal(opening), before + received, "uses beyond the chapter cap must not add visitors");

const nextMorning = applyVisitorReception(opening, 0, { chapter: 1, now: nextDay, day: 1 });
assert.equal(nextMorning.ok, false, "a new calendar day must not refill this chapter's receptions");
assert.equal(chapterVisitorTotal(opening), before + received);
assert.equal(chapterReceptionGained(opening, nextDay), received);

const previousTotal = chapterVisitorTotal(opening);
opening.progression = Object.assign({}, opening.progression, { stage: 2, displayChapter: 2 });
beginChapterVisitorCheckpoint(opening, 2, previousTotal);
syncVisitorReceptionGrant(opening, 2, nextDay);
const inherited = Math.max(
  Math.round(previousTotal * 0.1),
  chapterVisitorCarryover(chapterTargets(1).visitors, 2)
);
assert.equal(chapterVisitorTotal(opening), inherited, "chapter 2 HUD is 10% inherit, not chapter 1 reception");
assert.equal(chapterVisitorBreakdown(opening).task, 0, "chapter 1 reception must not remain as chapter 2 task flow");
assert.equal(chapterReceptionGained(opening, nextDay), 0, "reception gained resets with the chapter");
assert.equal(chapterHostedVisitors(opening, 1), 0, "map hosted people must not follow the player into the next chapter");

const chapterTwoPlan = visitorReceptionPlan(2);
let chapterTwoReceived = 0;
for (let turn = 0; turn < chapterTwoPlan.uses; turn += 1) {
  const step = applyVisitorReception(opening, 0, { chapter: 2, now: nextDay, day: 2 });
  assert.equal(step.ok, true);
  chapterTwoReceived += step.applied;
}
assert.equal(chapterTwoReceived, chapterTwoPlan.budget);
assert.equal(chapterVisitorTotal(opening), inherited + chapterTwoReceived);
assert.equal(chapterVisitorBreakdown(opening).task, chapterTwoReceived);
assert.equal(chapterHostedVisitors(opening, 2), chapterTwoReceived);
assert.equal(chapterHostedVisitors(opening, 1), 0, "hosted people belong to this chapter day only");

opening.chapterRescue = {
  version: 10,
  chapter: 2,
  _normalizedChapter: 2,
  targets: [],
  animals: {},
  completedTargets: {}
};
const restored = normalizeReserve(JSON.parse(JSON.stringify(opening)), createInitialWorld().reserve);
assert.equal(chapterVisitorTotal(restored), inherited + chapterTwoReceived, "reload must keep this-chapter reception");
assert.equal(chapterVisitorBreakdown(restored).task, chapterTwoReceived);
assert.equal(chapterReceptionGained(restored, nextDay), chapterTwoReceived);
assert.equal(restored.visitorReceptionGrant.chapter, 2);
assert.equal(restored.visitorReceptionGrant.remaining, 0);

const leaked = createInitialWorld().reserve;
leaked.progression = Object.assign({}, leaked.progression, { stage: 3, displayChapter: 3 });
beginChapterVisitorCheckpoint(leaked, 3, 400);
applyChapterVisitorDelta(leaked, 40, "recruit");
leaked.visitorReceptionGrant = { chapter: 1, dateKey: "2026-09-20", remaining: 0, gained: 80 };
leaked.development.operations.today = { day: 8, hostedVisitors: 80, hostedChapter: 1 };
leaked.chapterRescue = {
  version: 10,
  chapter: 3,
  _normalizedChapter: 3,
  targets: [],
  animals: {},
  completedTargets: {}
};
const savedLeak = normalizeReserve(JSON.parse(JSON.stringify(leaked)), createInitialWorld().reserve);
assert.equal(savedLeak.visitorReceptionGrant.gained, 0, "loading a later chapter must drop earlier reception gained");
assert.equal(chapterHostedVisitors(savedLeak, 8), 0, "loading a later chapter must drop earlier map hosted people");
assert.equal(chapterVisitorBreakdown(savedLeak).task, 0, "reloaded later chapter must not inherit earlier reception as task");
assert.equal(chapterVisitorTotal(savedLeak), Math.round(400 * 0.1) + 40);

const dailyState = createCharacter(null, "接待不完成每日招募");
dailyState.world.reserve.progression.stage = 2;
dailyState.world.reserve.progression.displayChapter = 2;
dailyState.world.goals = normalizeGoalState(dailyState.world.goals, dailyState);
const beforeDaily = JSON.parse(JSON.stringify(dailyState));
applyVisitorReception(dailyState.world.reserve, 6, { now: day, day: 1 });
const dailyResult = applyGoalProgress(beforeDaily, dailyState, { action: "visitorReception", now: day });
assert.equal(
  (dailyResult.completions || []).some((item) => item.type === "daily_objective" && item.id === "daily_visitor"),
  false,
  "reception must not complete daily recruit"
);

const game = new Game();
game.stopLoop();
game.render = () => {};
game.toast = () => {};
game.playSfx = () => {};
game.state = createCharacter(null, "观景接待界面");
game.state.world.reserve.progression.stage = 1;
game.state.world.reserve.progression.displayChapter = 1;
assert.equal(game.mapVisitorPlacements({ visitors: 0 }).length, 0);
assert.equal(game.mapVisitorPlacements({ visitors: 8 }).length, 2);
assert.equal(game.mapVisitorPlacements({ visitors: 24 }).length, 6);
assert.ok(game.mapVisitorPlacements({ visitors: 40 }).length <= 6);

game.openVisitorReception();
assert.equal(game.infoDetailModal.kind, "visitorReception");
assert.equal(game.infoDetailModal.phase, "ready");
const expectedFirst = game.infoDetailModal.preview.next;
const hostBefore = chapterVisitorTotal(game.state.world.reserve);
assert.equal(game.performVisitorReception(), true);
assert.equal(game.infoDetailModal.kind, "visitorReception");
assert.equal(game.infoDetailModal.phase, "result");
assert.equal(game.infoDetailModal.kind === "visitorRecruitment", false);
assert.equal(chapterVisitorTotal(game.state.world.reserve) - hostBefore, expectedFirst);
assert.ok(expectedFirst > 0 && expectedFirst <= chapterOnePlan.budget);
assert.equal(chapterVisitorBreakdown(game.state.world.reserve).recruited, 0);

const late = createInitialWorld().reserve;
late.progression = Object.assign({}, late.progression, { stage: 20, displayChapter: 20 });
beginChapterVisitorCheckpoint(late, 20, 0);
let lateSum = 0;
for (let turn = 0; turn < 8; turn += 1) {
  const step = applyVisitorReception(late, 500, { chapter: 20, now: day, day: 20 });
  if (turn < chapterTwentyPlan.uses) {
    assert.equal(step.ok, true);
    assert.ok(step.applied < 500, "a requested crowd cannot exceed this visit's share of the 15% budget");
    lateSum += step.applied;
  } else {
    assert.equal(step.ok, false);
  }
}
assert.equal(lateSum, chapterTwentyPlan.budget);
assert.ok(lateSum <= Math.floor(chapterTargets(20).visitors * 0.15));

delete global.wx;
console.log("visitor reception check ok (chapter-scoped ledger, no recruit/daily bleed, map crowd 2–6)");
