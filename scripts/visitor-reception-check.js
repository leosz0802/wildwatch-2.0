"use strict";

const assert = require("node:assert/strict");
const { createInitialWorld } = require("../js/world");
const { createCharacter, normalizeReserve } = require("../js/storage");
const {
  chapterTargets,
  chapterVisitorTotal,
  chapterVisitorBreakdown,
  beginChapterVisitorCheckpoint,
  applyChapterVisitorDelta
} = require("../js/chapterTargets");
const { visitorRecruitmentStatus } = require("../js/visitorRecruitment");
const {
  applyVisitorReception,
  syncVisitorReceptionGrant,
  chapterHostedVisitors,
  chapterReceptionGained,
  visitorReceptionPreview
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

assert.deepEqual(chapterTargets(1), { species: 7, animals: 180, visitors: 95, expectedMinutes: 4 });
assert.deepEqual(chapterTargets(2), { species: 7, animals: 220, visitors: 145, expectedMinutes: 9 });
assert.equal(chapterTargets(3).visitors, 315);
assert.ok(chapterTargets(20).visitors > chapterTargets(3).visitors, "late chapter visitor gates keep rising");

const preview = visitorReceptionPreview();
assert.equal(preview.min, 4);
assert.equal(preview.max, 8);

const opening = createInitialWorld().reserve;
opening.progression = Object.assign({}, opening.progression, { stage: 1, displayChapter: 1 });
const recruitBefore = visitorRecruitmentStatus(opening, 1, day);
const before = chapterVisitorTotal(opening);
const first = applyVisitorReception(opening, 6, { chapter: 1, now: day, day: 1 });
assert.equal(first.ok, true);
assert.equal(first.applied, 6);
assert.equal(first.source, "task");
assert.equal(first.chapter, 1);
assert.equal(chapterVisitorTotal(opening), before + 6, "reception must write this chapter total, not lifetime HUD");
const mix = chapterVisitorBreakdown(opening);
assert.equal(mix.task, 6, "reception is this-chapter task flow");
assert.equal(mix.recruited, 0, "reception must not look like a recruit");
assert.equal(chapterReceptionGained(opening, day), 6);
assert.equal(chapterHostedVisitors(opening, 1), 6);
const recruitAfter = visitorRecruitmentStatus(opening, 1, day);
assert.equal(recruitAfter.freeRemaining, recruitBefore.freeRemaining, "reception must not consume recruit credits");
assert.equal(recruitAfter.adCredits, recruitBefore.adCredits);

const used = applyVisitorReception(opening, 6, { chapter: 1, now: day, day: 1 });
assert.equal(used.ok, false);
assert.equal(used.reason, "used");
assert.equal(chapterVisitorTotal(opening), before + 6, "a second same-day reception must not add visitors");

const nextMorning = applyVisitorReception(opening, 5, { chapter: 1, now: nextDay, day: 1 });
assert.equal(nextMorning.ok, true);
assert.equal(chapterVisitorTotal(opening), before + 11);
assert.equal(chapterReceptionGained(opening, nextDay), 11, "same chapter can accumulate reception across calendar days");
assert.equal(chapterVisitorBreakdown(opening).task, 11);

const previousTotal = chapterVisitorTotal(opening);
opening.progression = Object.assign({}, opening.progression, { stage: 2, displayChapter: 2 });
beginChapterVisitorCheckpoint(opening, 2, previousTotal);
syncVisitorReceptionGrant(opening, 2, nextDay);
const inherited = Math.round(previousTotal * 0.1);
assert.equal(chapterVisitorTotal(opening), inherited, "chapter 2 HUD is 10% inherit, not chapter 1 reception");
assert.equal(chapterVisitorBreakdown(opening).task, 0, "chapter 1 reception must not remain as chapter 2 task flow");
assert.equal(chapterReceptionGained(opening, nextDay), 0, "reception gained resets with the chapter");
assert.equal(chapterHostedVisitors(opening, 1), 0, "map hosted people must not follow the player into the next chapter");

const chapterTwo = applyVisitorReception(opening, 7, { chapter: 2, now: nextDay, day: 2 });
assert.equal(chapterTwo.ok, true);
assert.equal(chapterVisitorTotal(opening), inherited + 7);
assert.equal(chapterVisitorBreakdown(opening).task, 7);
assert.equal(chapterHostedVisitors(opening, 2), 7);
assert.notEqual(chapterHostedVisitors(opening, 1), 7, "hosted people belong to this chapter day only");

const restored = normalizeReserve(JSON.parse(JSON.stringify(opening)), createInitialWorld().reserve);
assert.equal(chapterVisitorTotal(restored), inherited + 7, "reload must keep this-chapter reception");
assert.equal(chapterVisitorBreakdown(restored).task, 7);
assert.equal(chapterReceptionGained(restored, nextDay), 7);
assert.equal(restored.visitorReceptionGrant.chapter, 2);

const leaked = createInitialWorld().reserve;
leaked.progression = Object.assign({}, leaked.progression, { stage: 3, displayChapter: 3 });
beginChapterVisitorCheckpoint(leaked, 3, 400);
applyChapterVisitorDelta(leaked, 40, "recruit");
leaked.visitorReceptionGrant = { chapter: 1, dateKey: "2026-09-20", remaining: 0, gained: 80 };
leaked.development.operations.today = { day: 8, hostedVisitors: 80, hostedChapter: 1 };
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
assert.equal(game.performVisitorReception(), true);
assert.equal(game.infoDetailModal.kind, "visitorReception");
assert.equal(game.infoDetailModal.phase, "result");
assert.equal(game.infoDetailModal.kind === "visitorRecruitment", false);
const afterHost = chapterVisitorTotal(game.state.world.reserve);
assert.ok(afterHost >= 4 && afterHost <= 12, `one-screen reception should add 4–12 this-chapter visitors, got ${afterHost}`);
assert.equal(chapterVisitorBreakdown(game.state.world.reserve).recruited, 0);

delete global.wx;
console.log("visitor reception check ok (chapter-scoped ledger, no recruit/daily bleed, map crowd 2–6)");
