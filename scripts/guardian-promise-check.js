function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (value) => ({ width: String(value || "").length * 7 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (prop === "canvas") return { width: 375, height: 667 };
      if (!target[prop]) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) { target[prop] = value; return true; }
  });
}

global.wx = {
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 1 }; },
  createCanvas() { return { width: 375, height: 667, getContext() { return fakeContext(); } }; },
  createImage() { return { loaded: true, set src(value) { this._src = value; this.loaded = true; if (this.onload) this.onload(); }, get src() { return this._src; } }; },
  getStorageSync() { return null; }, setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const { createCharacter } = require("../js/storage");
const { normalizeLifeMemory, advanceLifeMemory } = require("../js/emotionSystem");
const { Game } = require("../js/game");
const { simulateDay } = require("../js/simulator");
const {
  GUARDIAN_PROMISES,
  normalizeGuardianPromises,
  maybePrepareGuardianPromise,
  selectGuardianPromiseChoice,
  applyGuardianPromiseChoice,
  applyGuardianPromiseAction,
  relationshipModifierFor,
  chosenPromiseChoices
} = require("../js/guardianPromises");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(GUARDIAN_PROMISES.length === 5, "there must be one guardian promise per chapter");
const ids = new Set();
GUARDIAN_PROMISES.forEach((promise, index) => {
  assert(promise.chapter === index + 1, `guardian promise chapter ${index + 1} missing`);
  assert(promise.choices.length === 3, `chapter ${promise.chapter} must have exactly three real choices`);
  promise.choices.forEach((choice) => {
    assert(!ids.has(choice.id), `duplicate guardian promise choice ${choice.id}`);
    ids.add(choice.id);
    assert(choice.primaryBenefit && choice.primaryCost && choice.longTerm && choice.mapTag, `${choice.id} must expose benefit, cost, permanence and map trace`);
    const immediate = Object.entries(choice.immediateEffects || {});
    const isBenefit = ([key, value]) => (key === "poacherPressure" || key === "disease") ? value < 0 : value > 0;
    assert(immediate.some(isBenefit) && immediate.some((entry) => !isBenefit(entry)), `${choice.id} needs an immediate benefit and cost`);
  });
});

const { guardianPromisesRetired, lifeCycleModifiers } = require("../js/guardianPromises");

assert(guardianPromisesRetired(), "guardian promises must stay retired");

const state = createCharacter(null, "保护区卫士");
const reserve = state.world.reserve;
reserve.progression.totalActions = 8;
reserve.guardianPromises = { pending: { id: "contact_boundary", chapter: 1, selectedChoiceId: "hands_off" }, choices: { 1: { choiceId: "hands_off" } } };
assert(!maybePrepareGuardianPromise(reserve, { day: 9, totalActions: 8 }), "a retired promise must not be queued");
assert(!reserve.guardianPromises.pending, "a saved pending promise must be cleared");
assert(!selectGuardianPromiseChoice(reserve, 1, "hands_off"), "a retired promise cannot be selected");
const grassBefore = reserve.ecology.grass;
const fundBefore = reserve.fund;
assert(!applyGuardianPromiseChoice(reserve, 1, "hands_off", { day: 9, totalActions: 8 }), "a retired promise must not grant its reward");
assert(reserve.ecology.grass === grassBefore && reserve.fund === fundBefore, "confirming a retired promise must not change ecology or fund");
assert(chosenPromiseChoices(reserve).length === 0, "old promise choices must not stay active");
const actionRule = applyGuardianPromiseAction(reserve, "habitat", { season: "雨季" });
assert(actionRule.applied.length === 0 && reserve.ecology.grass === grassBefore, "old promise rules must not change later actions");
const relationRule = relationshipModifierFor(reserve, "intervention");
assert(relationRule.security === 0 && relationRule.wildness === 0, "old promise relationship modifiers must be zero");
const lifeRule = lifeCycleModifiers(reserve);
assert(lifeRule.independenceThreshold === 0 && lifeRule.wildVisitDelay === 0, "old promise life-cycle modifiers must be zero");

const normalized = normalizeGuardianPromises({
  pending: { id: "water_covenant", chapter: 2, selectedChoiceId: "" },
  choices: { 1: { choiceId: "hands_off", chapter: 1 } }
});
assert(!normalized.pending, "save normalization must drop a pending guardian promise");

const game = new Game();
game.stopLoop();
game.ctx = fakeContext();
game.render = () => {};
game.state = createCharacter(null, "保护区卫士");
game.screen = "home";
game.state.world.reserve.progression.totalActions = 8;
game.state.world.reserve.guardianPromises = { pending: { id: "contact_boundary", chapter: 1, selectedChoiceId: "" } };
game.infoDetailModal = null;
assert(game.openPendingGuardianPromise() === false, "guardian promise popup must not open");
assert(!game.infoDetailModal || game.infoDetailModal.kind !== "guardianPromise", "guardian promise modal must stay closed");
game.hitAreas = [];
game.drawGuardianPromiseMarkers(game.ctx, { scale: 1 }, false);
assert(!game.hitAreas.some((area) => /守护承诺|守则/.test(String(area.label || area.text || ""))), "guardian promise must not leave a sandbox marker");

const oldRandom = Math.random;
Math.random = () => 0.5;
const simulated = simulateDay("修复水源和草场", createCharacter(null, "保护区卫士"));
Math.random = oldRandom;
assert(!simulated.world.reserve.guardianPromises.pending, "a simulated day must not queue a guardian promise");
assert(!simulated.visual || !simulated.visual.guardianPromiseEffect || simulated.visual.guardianPromiseEffect.applied.length === 0, "a simulated day must not apply a guardian promise reward");

console.log("guardian promise check ok (retired: no popup, reward, or sandbox marker)");
