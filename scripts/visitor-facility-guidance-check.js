"use strict";

const assert = require("node:assert/strict");
const { createCharacter } = require("../js/storage");
const { buildReserveDevelopmentPlan } = require("../js/reserveDevelopment");
const {
  resolveGoals,
  normalizeGoalState,
  applyGoalProgress,
  TASK_CATEGORIES,
  SANDBOX_VISITOR_SPARSE_LIMIT
} = require("../js/goalSystem");

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

function cards(goals) {
  return [goals.active && goals.active.primary]
    .concat((goals.active && goals.active.alternatives) || [])
    .filter(Boolean);
}

function chapterState(chapter, extras = {}) {
  const state = createCharacter(null, `游客设施引导第${chapter}章`);
  state.world.reserve.progression.stage = chapter;
  state.world.reserve.progression.displayChapter = chapter;
  state.world.reserve.progression.totalActions = extras.totalActions == null ? 4 : extras.totalActions;
  state.world.reserve.fund = extras.fund == null ? 1200 : extras.fund;
  const day = ((state.world.reserve.guardianCycle || {}).day) || 1;
  state.world.reserve.guardianCycle = Object.assign({}, state.world.reserve.guardianCycle || {}, { day });
  const development = state.world.reserve.development || (state.world.reserve.development = {});
  const operations = development.operations || (development.operations = {});
  operations.today = Object.assign({
    day,
    visitors: 0,
    recruitedVisitors: 0,
    hostedVisitors: 0,
    hostedChapter: chapter,
    income: 0
  }, extras.today || {});
  if (extras.recruit) operations.today.recruitedVisitors = extras.recruit;
  state.world.goals = normalizeGoalState(state.world.goals, state);
  return state;
}

function guidance(state) {
  return cards(resolveGoals(state, state.world.goals, "visitor-facility")).find((item) => item.visitorFacilityGuidance);
}

assert.equal(SANDBOX_VISITOR_SPARSE_LIMIT, 8, "sparse sandbox crowd stays below three map figures");

const opening = chapterState(1, { totalActions: 0 });
assert.equal(guidance(opening), undefined, "chapter 1 first actions must not insert a facility card");

const afterOnboarding = chapterState(1, { totalActions: 2 });
const afterOnboardingCard = guidance(afterOnboarding);
assert.ok(afterOnboardingCard, "chapter 1 with an empty sandbox must guide the first visitor facility");
assert.equal(afterOnboardingCard.taskCategory, TASK_CATEGORIES.metric);
assert.equal(afterOnboardingCard.recommendedAction, "facilityBuild");
assert.equal(afterOnboardingCard.nodeId, "river_shallows");
assert.equal(afterOnboardingCard.preferredChoiceId, "visitor_boardwalk");
assert.match(afterOnboardingCard.title, /建设高架观察步道/);
assert.equal(afterOnboardingCard.buttonLabel, "建设游客设施");
assert.ok(!/facility:/.test(afterOnboardingCard.id), "guidance id must not look like a facility filler card");
assert.ok(!/development:.+:(build|upgrade)/.test(afterOnboardingCard.id), "guidance id must not look like a development filler card");

const busyChapter = chapterState(2, { recruit: 12 });
assert.equal(guidance(busyChapter), undefined, "a sandbox already showing visitors must not nag to build");

const visitorBuilt = chapterState(4);
buildReserveDevelopmentPlan(visitorBuilt.world.reserve, "river_shallows", "visitor_boardwalk", 1);
assert.equal(guidance(visitorBuilt), undefined, "an existing visitor facility must stop the guidance task");

const sparse = chapterState(6, { recruit: 3 });
const sparseCard = guidance(sparse);
assert.ok(sparseCard, "a sandbox with few visitors still needs the visitor-facility task");
assert.match(sparseCard.title, /沙盘游客偏少/);
assert.equal(sparseCard.preferredChoiceId, "visitor_boardwalk");

const laterEmpty = chapterState(12);
const laterCard = guidance(laterEmpty);
assert.ok(laterCard, "later chapters with an empty sandbox still get one visitor-facility task");
assert.equal(laterCard.nodeId, "river_shallows");

const animalPrimary = chapterState(2);
animalPrimary.world.goals = resolveGoals(animalPrimary, animalPrimary.world.goals, "animal-first");
assert.ok(["rescueAnimal", "habitat", "animalCare"].includes(animalPrimary.world.goals.active.primary.recommendedAction), "animal shortage must stay above the visitor-facility card");
assert.ok(cards(animalPrimary.world.goals).some((item) => item.visitorFacilityGuidance), "empty sandbox still keeps the visitor-facility card as a real alternative");

const beforeDaily = JSON.stringify((laterEmpty.world.goals.daily.objectives || []).map((item) => ({
  id: item.id, kind: item.kind, progress: item.progress, complete: item.complete
})));
const afterBuildProgress = applyGoalProgress(laterEmpty, laterEmpty, { action: "facilityBuild", now: Date.now() });
const afterDaily = JSON.stringify((afterBuildProgress.state.world.goals.daily.objectives || []).map((item) => ({
  id: item.id, kind: item.kind, progress: item.progress, complete: item.complete
})));
assert.equal(afterDaily, beforeDaily, "building a visitor facility must not complete daily 招揽游客");

const game = new Game();
if (game.stopLoop) game.stopLoop();
game.render = () => {};
game.ctx = fakeContext();
game.width = 375;
game.height = 667;
game.state = chapterState(3);
game.screen = "collection";
assert.ok(game.executeGoalAction({
  id: laterCard.id,
  recommendedAction: "facilityBuild",
  nodeId: "river_shallows",
  developmentTask: "build",
  preferredChoiceId: "visitor_boardwalk",
  visitorFacilityGuidance: true
}), "guidance task must open the live-map build UI");
assert.equal(game.screen, "home");
assert.equal(game.infoDetailModal.kind, "livingReserveNode");
assert.equal(game.infoDetailModal.nodeId, "river_shallows");
assert.equal(game.infoDetailModal.selectedChoiceId, "visitor_boardwalk", "guidance must preselect the visitor-route building");

console.log("visitor facility guidance check ok");
