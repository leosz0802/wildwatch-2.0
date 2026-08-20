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

const state = createCharacter(null, "保护区卫士");
const reserve = state.world.reserve;
reserve.progression.totalActions = 2;
assert(!maybePrepareGuardianPromise(reserve, { day: 8, totalActions: 2 }), "chapter 1 promise must not interrupt the first 30 seconds");
reserve.progression.totalActions = 3;
const pending = maybePrepareGuardianPromise(reserve, { day: 9, totalActions: 3 });
assert(pending && pending.chapter === 1, "chapter 1 promise should appear after three meaningful operations");
assert(selectGuardianPromiseChoice(reserve, 1, "hands_off").selectedChoiceId === "hands_off", "promise choice should persist before confirmation");
const grassBefore = reserve.ecology.grass;
const fundBefore = reserve.fund;
const supplyBefore = Object.values(reserve.supplies || {}).reduce((sum, value) => sum + (value || 0), 0);
const settled = applyGuardianPromiseChoice(reserve, 1, "hands_off", { day: 9, totalActions: 3 });
const supplyAfter = Object.values(reserve.supplies || {}).reduce((sum, value) => sum + (value || 0), 0);
assert(settled && reserve.ecology.grass === grassBefore + 3 && reserve.fund === fundBefore && supplyAfter === supplyBefore, "sub-100 project preparation must accumulate instead of rounding up a supply cost");
assert((reserve.resourceAging || {}).projectCostCarry === 60, "promise project preparation remainder must persist");
assert(!applyGuardianPromiseChoice(reserve, 1, "rescue_station", { day: 10 }), "a chapter promise must not be replaceable by ordinary confirmation");
assert(chosenPromiseChoices(reserve).length === 1, "confirmed promise should remain in the permanent archive");

const simulationState = createCharacter(null, "保护区卫士");
simulationState.world.reserve.progression.level = 2;
selectGuardianPromiseChoice(simulationState.world.reserve, 2, "rotating_water_promise");
applyGuardianPromiseChoice(simulationState.world.reserve, 2, "rotating_water_promise", { day: 8 });
const oldRandom = Math.random;
Math.random = () => 0.5;
const promisedAction = simulateDay("修复水源和草场", simulationState);
Math.random = oldRandom;
assert(promisedAction.visual.guardianPromiseEffect.applied.length === 1, "later action must expose the permanent promise modifier");
assert(promisedAction.world.lastPlayerAction.delta.migration === promisedAction.world.reserve.migration.delta, "chapter, report and sandbox must use the same post-promise migration value");
assert(chosenPromiseChoices(promisedAction.world.reserve).some((entry) => entry.choice.id === "rotating_water_promise"), "daily simulation must preserve permanent promises in the single reserve state");

const beforeRuleGrass = reserve.ecology.grass;
const beforeRuleFund = reserve.fund;
const beforeRuleSupply = Object.values(reserve.supplies || {}).reduce((sum, value) => sum + (value || 0), 0);
const actionRule = applyGuardianPromiseAction(reserve, "habitat", { season: "雨季" });
const afterRuleSupply = Object.values(reserve.supplies || {}).reduce((sum, value) => sum + (value || 0), 0);
assert(actionRule.applied.length === 1 && reserve.ecology.grass === beforeRuleGrass + 2 && reserve.fund === beforeRuleFund && afterRuleSupply === beforeRuleSupply, "permanent promise must change later action settlement without rounding a small recurring cost upward");
assert((reserve.resourceAging || {}).projectCostCarry === 75, "recurring promise preparation must accumulate proportionally");
const relationRule = relationshipModifierFor(reserve, "intervention");
assert(relationRule.security === -2 && relationRule.wildness === 4, "hands-off promise must trade faster trust for restored wildness");

state.world.lifeMemory = normalizeLifeMemory(state.world);
const beforeFriend = state.world.lifeMemory.individuals[0];
const beforeAxes = { security: beforeFriend.security, wildness: beforeFriend.wildness };
const nextWorld = JSON.parse(JSON.stringify(state.world));
nextWorld.day += 1;
const lifeUpdate = advanceLifeMemory(state.world, nextWorld, { actionId: "intervention", command: "许可内干预" });
const changedFriend = lifeUpdate.state.individuals.find((item) => item.id === lifeUpdate.relationshipChange.individualId);
assert(lifeUpdate.relationshipChange.securityDelta === 3 && lifeUpdate.relationshipChange.wildnessDelta === -2, "base rescue shift must be permanently rewritten by the promise");
assert(changedFriend && (changedFriend.security !== beforeAxes.security || changedFriend.wildness !== beforeAxes.wildness), "promise relationship result must reach named-animal state");

reserve.progression.level = 5;
for (let chapter = 2; chapter <= 5; chapter += 1) {
  const next = maybePrepareGuardianPromise(reserve, { day: 10 + chapter, totalActions: 3 + chapter });
  assert(next && next.chapter === chapter, `missing queued promise for chapter ${chapter}`);
  const choice = GUARDIAN_PROMISES[chapter - 1].choices[2];
  selectGuardianPromiseChoice(reserve, chapter, choice.id);
  assert(applyGuardianPromiseChoice(reserve, chapter, choice.id, { day: 10 + chapter }), `chapter ${chapter} choice failed`);
}
assert(chosenPromiseChoices(reserve).length === 5, "all five permanent promises should coexist");
const normalizedPromises = normalizeGuardianPromises(JSON.parse(JSON.stringify(state.world.reserve.guardianPromises)));
assert(Object.keys(normalizedPromises.choices).length === 5, "all guardian promises must survive save normalization");

const uiState = createCharacter(null, "保护区卫士");
uiState.world.reserve.progression.totalActions = 3;
maybePrepareGuardianPromise(uiState.world.reserve, { day: 10, totalActions: 3 });
const game = new Game();
game.stopLoop();
game.ctx = fakeContext();
game.render = () => {};
game.state = uiState;
game.infoDetailModal = null;
assert(game.openPendingGuardianPromise(), "pending promise should open in the shared progressive choice UI");
assert(game.infoDetailModal.kind === "guardianPromise" && game.infoDetailModal.choiceCards.length === 3, "promise UI must present exactly three choices");
[[320, 568], [375, 667], [430, 932]].forEach(([width, height]) => {
  game.width = width;
  game.height = height;
  game.hitAreas = [];
  game.drawInfoDetailModal();
  const cardHits = game.infoDetailModal.renderedChoiceLayout || [];
  const summaries = game.infoDetailModal.renderedChoiceSummaries || [];
  assert(cardHits.length >= 3, `all promise choices must remain tappable at ${width}x${height}`);
  cardHits.forEach((hit) => assert(hit.x >= 0 && hit.y >= 0 && hit.x + hit.w <= width && hit.y + hit.h <= height, `promise card overflow at ${width}x${height}`));
  assert(game.infoDetailModal.renderedPromiseMode === "overview", `promise must begin as a calm overview at ${width}x${height}`);
  assert(cardHits.every((hit) => hit.h <= 70), `unselected promise cards must stay compact at ${width}x${height}`);
  assert(summaries.length === 3 && summaries.every((summary) => !summary.truncated && summary.costVisible === false), `overview must show one complete core result per choice at ${width}x${height}`);
});
game.selectGuardianPromise(1, "adaptive_contact");
assert(game.infoDetailModal.selectedChoiceId === "adaptive_contact", "promise UI should use select then confirm");
game.confirmGuardianPromise(1, "adaptive_contact");
assert(game.screen === "home" && game.mapConsequencePulse, "confirmation must return to sandbox and reveal visible causality first");
assert(game.infoDetailModal && game.infoDetailModal.revealAt > Date.now(), "numeric promise result must wait until the sandbox consequence is visible");

GUARDIAN_PROMISES.forEach((promise) => {
  promise.choices.forEach((choice) => {
    const compactGame = new Game();
    compactGame.stopLoop();
    compactGame.ctx = fakeContext();
    compactGame.render = () => {};
    compactGame.width = 320;
    compactGame.height = 568;
    compactGame.state = createCharacter(null, "保护区卫士");
    compactGame.state.world.reserve.guardianPromises = normalizeGuardianPromises({
      pending: { id: promise.id, chapter: promise.chapter, day: 10, actionIndex: 12, selectedChoiceId: "" }
    });
    compactGame.infoDetailModal = null;
    assert(compactGame.openPendingGuardianPromise(), `chapter ${promise.chapter} promise should open at 320x568`);
    compactGame.selectGuardianPromise(promise.chapter, choice.id);
    compactGame.hitAreas = [];
    compactGame.drawInfoDetailModal();
    const layout = compactGame.infoDetailModal.renderedChoiceLayout || [];
    const textLayout = compactGame.infoDetailModal.renderedChoiceText || [];
    assert(layout.length === 3 && layout.every((item) => item.x >= 0 && item.y >= 0 && item.x + item.w <= 320 && item.y + item.h <= 568), `chapter ${promise.chapter}/${choice.id} promise layout overflow`);
    const selectedLayout = layout.filter((entry) => entry.selected);
    const collapsedLayout = layout.filter((entry) => entry.collapsed);
    assert(compactGame.infoDetailModal.renderedPromiseMode === "focused" && selectedLayout.length === 1 && collapsedLayout.length === 2, `chapter ${promise.chapter}/${choice.id} must expand only the selected promise`);
    assert(textLayout.length === 3 && ["benefit", "cost", "permanent"].every((field) => textLayout.some((entry) => entry.field === field)), `chapter ${promise.chapter}/${choice.id} focused disclosure is incomplete`);
    assert(textLayout.every((entry) => entry.layout && !entry.layout.truncated), `chapter ${promise.chapter}/${choice.id} promise text truncation`);
  });
});

console.log("guardian promise check ok (all 5 chapters / 15 choices / compact layout)");
