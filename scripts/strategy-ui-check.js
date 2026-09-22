function createFakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (text) => ({ width: String(text || "").length * 7 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (prop === "canvas") return { width: 430, height: 932 };
      if (!target[prop]) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) { target[prop] = value; return true; }
  });
}

global.wx = {
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 1 }; },
  createCanvas() { return { width: 430, height: 932, getContext() { return createFakeContext(); } }; },
  createImage() { return { loaded: true, set src(value) { this._src = value; this.loaded = true; if (this.onload) this.onload(); }, get src() { return this._src; } }; },
  getStorageSync() { return null; }, setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
const { STRATEGIC_DILEMMAS, normalizeStrategyState, strategicDilemmaById, setPendingStrategicRoll } = require("../js/strategySystem");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeGame(dilemmaId) {
  const game = new Game();
  game.stopLoop();
  game.ctx = createFakeContext();
  game.render = () => {};
  game.state = createCharacter(null, "保护区卫士");
  game.screen = "home";
  const dilemma = strategicDilemmaById(dilemmaId);
  game.state.world.reserve.strategy = normalizeStrategyState({
    pendingDilemma: { id: dilemma.id, tier: dilemma.tier, day: 10, actionIndex: 10, chapter: 1 }
  });
  game.infoDetailModal = null;
  assert(game.openPendingStrategicDilemma(), `${dilemmaId} should open`);
  return game;
}

[[320, 568], [375, 667], [430, 932]].forEach(([width, height]) => {
  const game = makeGame("water_access");
  game.width = width;
  game.height = height;
  game.hitAreas = [];
  game.drawInfoDetailModal();
  assert(game.infoDetailModal.choiceCards.length === 3, `three choices should remain visible at ${width}x${height}`);
  game.infoDetailModal.choiceCards.forEach((card) => {
    assert(card.primaryBenefit && card.primaryCost, `strategy card should expose one benefit and one cost at ${width}x${height}`);
  });
  const initialLayout = game.infoDetailModal.renderedChoiceLayout || [];
  assert(initialLayout.length === 3, `three choice cards need independent layouts at ${width}x${height}`);
  assert(game.infoDetailModal.renderedDecisionDensity && game.infoDetailModal.renderedDecisionDensity.mode === "summary-first", `strategy modal should use summary-first disclosure at ${width}x${height}`);
  assert(game.infoDetailModal.renderedInfoFrame && game.infoDetailModal.renderedInfoFrame.h <= 430, `three-choice strategy modal should remain compact at ${width}x${height}`);
  assert(initialLayout.every((item) => item.h <= 72), `unselected strategy cards should stay compact at ${width}x${height}`);
  assert(initialLayout.every((item) => item.routeSize >= 9 && item.riskSize >= 9 && item.labelSize >= 10), `strategy route, risk and option labels must remain readable at ${width}x${height}`);
  const initialSummaries = game.infoDetailModal.renderedChoiceSummaries || [];
  assert(initialSummaries.length === 3, `every unselected option must foreground benefit and cost at ${width}x${height}`);
  assert(initialSummaries.every((item) => item.benefit.compact && item.cost.compact && item.benefit.valueSize >= 11 && item.cost.valueSize >= 11 && !item.benefit.truncated && !item.cost.truncated), `strategy benefit or cost is too small, dense or truncated at ${width}x${height}`);
  initialLayout.forEach((hit) => assert(hit.x >= 0 && hit.y >= 0 && hit.x + hit.w <= width && hit.y + hit.h <= height, `choice card should stay inside ${width}x${height}`));
  game.selectStrategicDilemmaChoice("water_access", "open_water");
  assert(game.state.world.reserve.strategy.pendingDilemma, "selecting should not settle before confirmation");
  assert(game.infoDetailModal.selectedChoiceId === "open_water", "selected card should remain highlighted");
  game.hitAreas = [];
  game.drawInfoDetailModal();
  const disclosedHits = game.infoDetailModal.renderedChoiceLayout || [];
  assert(disclosedHits.length === 3, `all strategy options should remain tappable after disclosure at ${width}x${height}`);
  const disclosedHeights = disclosedHits.map((hit) => hit.h);
  assert(Math.max(...disclosedHeights) - Math.min(...disclosedHeights) >= 24, `selected strategy should expand while alternatives collapse at ${width}x${height}`);
  assert(disclosedHits.find((hit) => hit.selected).h >= 116, `selected strategy needs enough room for benefit, cost and duration at ${width}x${height}`);
  assert(disclosedHits.filter((hit) => !hit.selected).every((hit) => hit.h <= 64), `unselected strategies should collapse instead of wasting vertical room at ${width}x${height}`);
  disclosedHits.forEach((hit) => assert(hit.x >= 0 && hit.y >= 0 && hit.x + hit.w <= width && hit.y + hit.h <= height, `disclosed card should stay inside ${width}x${height}`));
  const disclosedText = game.infoDetailModal.renderedChoiceText || [];
  assert(disclosedText.length === 3, `selected strategy should show only benefit, cost and duration at ${width}x${height}`);
  assert(disclosedText.every((entry) => entry.layout && !entry.layout.truncated), `selected strategy must not hide benefit, cost or duration at ${width}x${height}`);
  game.confirmStrategicChoice("water_access", "open_water");
  assert(game.infoDetailModal.kind === "strategicDice", "risky option should open the six-sided-die view");
  game.hitAreas = [];
  game.drawInfoDetailModal();
  const dieHit = game.hitAreas.find((hit) => hit.w >= 78 && hit.h >= 78 && hit.w < width);
  assert(dieHit && dieHit.x >= 0 && dieHit.y >= 0 && dieHit.x + dieHit.w <= width && dieHit.y + dieHit.h <= height, `strategic die should stay tappable at ${width}x${height}`);
  const diceFactors = game.infoDetailModal.renderedDiceFactors || [];
  assert(diceFactors.length === 3 && diceFactors.every((factor) => factor.labelSize >= 10 && factor.valueSize >= 18), `dice modifiers must be readable and data-forward at ${width}x${height}`);
});

const tacticalGame = makeGame("patrol_split");
assert(tacticalGame.infoDetailModal.choiceCards.length === 1, "tactical popup should show exactly one card");
tacticalGame.selectStrategicDilemmaChoice("patrol_split", "patrol_river");
tacticalGame.confirmStrategicChoice("patrol_split", "patrol_river");
assert(tacticalGame.infoDetailModal.items.some((item) => /→/.test(item.title)), "deterministic result should show old-to-new values");

const shortfallGame = makeGame("water_access");
shortfallGame.width = 320;
shortfallGame.height = 568;
shortfallGame.state.world.reserve.fund = 0;
shortfallGame.infoDetailModal = null;
assert(shortfallGame.openPendingStrategicDilemma(), "low-resource strategic choice should reopen");
assert(shortfallGame.infoDetailModal.choiceCards.some((card) => /巡护补给/.test(card.primaryCost)), "choice preview should state its fund-equivalent cost");
shortfallGame.selectStrategicDilemmaChoice("water_access", "hide_springs");
shortfallGame.confirmStrategicChoice("water_access", "hide_springs");
assert((shortfallGame.state.world.reserve.fund || 0) >= 0, "strategic settlement must not create a negative fund balance");
shortfallGame.hitAreas = [];
shortfallGame.drawInfoDetailModal();
shortfallGame.hitAreas.forEach((hit) => assert(hit.x >= 0 && hit.y >= 0 && hit.x + hit.w <= 320 && hit.y + hit.h <= 568, "shortfall result controls should remain inside 320x568"));

const restoreGame = makeGame("water_access");
setPendingStrategicRoll(restoreGame.state.world.reserve, { dilemmaId: "water_access", choiceId: "open_water", roll: 4, routeModifier: 0, resourceModifier: 1, phase: "resolved" });
restoreGame.infoDetailModal = null;
assert(restoreGame.openPendingStrategicDilemma() && restoreGame.infoDetailModal.kind === "strategicDice", "saved pending die should restore to the dice view");
assert(restoreGame.infoDetailModal.displayRoll === 4 && /结算 4 点/.test(restoreGame.infoDetailModal.actionLabel), "restored die should preserve its exact face");

const animationGame = makeGame("patrol_split");
animationGame.displayReserveStats = animationGame.reserveDynamicTargets(animationGame.state.world.reserve);
animationGame.selectStrategicDilemmaChoice("patrol_split", "patrol_river");
animationGame.confirmStrategicChoice("patrol_split", "patrol_river");
const targetPoacher = animationGame.state.world.reserve.poacherPressure;
const startPoacher = animationGame.displayReserveStats.poacherPressure;
animationGame.tweenDisplayReserveStats(300);
const middlePoacher = animationGame.displayReserveStats.poacherPressure;
assert(middlePoacher !== startPoacher && middlePoacher !== targetPoacher, "strategy numeric animation should have a real 300ms middle frame");
animationGame.tweenDisplayReserveStats(300);
assert(Math.round(animationGame.displayReserveStats.poacherPressure) === targetPoacher, "strategy numeric animation should land exactly on the stored value at 600ms");
assert(animationGame.reserveDisplayDelta("poacherPressure", targetPoacher) !== 0, "strategy delta tag should remain visible during the hold period");
animationGame.tweenDisplayReserveStats(220);
assert(animationGame.reserveDisplayDelta("poacherPressure", targetPoacher) === 0, "strategy delta tag should clear after the hold period");

STRATEGIC_DILEMMAS.forEach((dilemma) => {
  dilemma.choices.forEach((choice) => {
    const game = makeGame(dilemma.id);
    game.width = 320;
    game.height = 568;
    game.hitAreas = [];
    game.drawInfoDetailModal();
    const summaries = game.infoDetailModal.renderedChoiceSummaries || [];
    assert(summaries.length === dilemma.choices.length, `${dilemma.id} does not show one benefit/cost summary per option at 320x568`);
    assert(summaries.every((item) => !item.benefit.truncated && !item.cost.truncated), `${dilemma.id} truncates a benefit or cost before selection at 320x568`);
    game.selectStrategicDilemmaChoice(dilemma.id, choice.id);
    game.hitAreas = [];
    game.drawInfoDetailModal();
    const layout = game.infoDetailModal.renderedChoiceLayout || [];
    const textLayout = game.infoDetailModal.renderedChoiceText || [];
    assert(layout.length === dilemma.choices.length, `${dilemma.id}/${choice.id} lost a choice card at 320x568`);
    assert(layout.every((item) => item.x >= 0 && item.y >= 0 && item.x + item.w <= 320 && item.y + item.h <= 568), `${dilemma.id}/${choice.id} overflows 320x568`);
    assert(textLayout.length === 3 && textLayout.every((entry) => entry.layout && !entry.layout.truncated), `${dilemma.id}/${choice.id} truncates selected benefit, cost or duration at 320x568`);
  });
});

console.log("strategy UI check ok (all 28 dilemmas, 2/3 choices, confirm, dice, restore, 3 sizes, 600ms animation)");
