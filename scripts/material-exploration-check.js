function createFakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (text) => ({ width: String(text || "").length * 7 });
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
  createCanvas() { return { width: 375, height: 667, getContext() { return createFakeContext(); } }; },
  createImage() { return { loaded: true, set src(value) { this._src = value; this.loaded = true; if (this.onload) this.onload(); }, get src() { return this._src; } }; },
  getStorageSync() { return null; },
  setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
const { simulateDay } = require("../js/simulator");
const { previewMaterialExploration, resolveMaterialExploration } = require("../js/materialExploration");
const { normalizeLifeMemory } = require("../js/emotionSystem");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function withRandom(value, fn) {
  const old = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = old; }
}

function setTrust(state, value) {
  (state.world.knownCharacters || []).forEach((animal) => {
    animal.relation = Object.assign({}, animal.relation || {}, { trust: value });
  });
}

const low = createCharacter(null, "保护区卫士");
low.world.reserve.progression.level = 1;
setTrust(low, 25);
const lowPreview = previewMaterialExploration(low.world.reserve, low.world.knownCharacters);

const high = createCharacter(null, "保护区卫士");
high.world.reserve.progression.level = 5;
setTrust(high, 90);
high.world.lifeMemory = normalizeLifeMemory(high.world);
high.world.lifeMemory.individuals.forEach((animal) => {
  animal.security = 90;
  animal.wildness = 88;
  animal.bond = 90;
});
const highPreview = previewMaterialExploration(high.world.reserve, high.world.knownCharacters, high.world.lifeMemory);
assert(highPreview.successChance > lowPreview.successChance, "level and animal relationship should both raise exploration chance");
assert(highPreview.levelContribution > lowPreview.levelContribution, "reserve level contribution should be explicit");
assert(highPreview.relationshipContribution > lowPreview.relationshipContribution, "animal relationship contribution should be explicit");
assert(highPreview.relationship.securityAverage === 90 && highPreview.relationship.wildnessAverage === 88, "named-animal exploration must read both security and wildness");

const lucky = resolveMaterialExploration(low.world.reserve, low.world.knownCharacters, "researchSample", () => 0.99, 6);
const unlucky = resolveMaterialExploration(low.world.reserve, low.world.knownCharacters, "researchSample", () => 0.01, 1);
assert(lucky.success && lucky.reward && lucky.total > 0, "favorable randomness should produce an exploration discovery");
assert(!unlucky.success && !unlucky.reward && unlucky.total === 0, "unfavorable randomness should be able to produce no discovery");
assert(lucky.roll > unlucky.roll, "six-sided die result should be exposed and higher should be better");

const simulation = createCharacter(null, "保护区卫士");
simulation.world.reserve.progression.level = 3;
simulation.world.reserve.actionPoints = 3;
setTrust(simulation, 88);
const beforePending = simulation.world.reserve.pendingRecovered.shedAntlerA || 0;
const beforeHoundXp = simulation.world.reserve.houndTeam.xp || 0;
const result = withRandom(0.02, () => simulateDay("跟随动物探索森林，寻找自然遗留。目标:shedAntlerA 掷骰:6", simulation));
const exploration = result.visual && result.visual.materialExploration;
assert(exploration && exploration.success, "exploration command should use the independent exploration resolver");
assert(exploration.level === 3 && exploration.relationship.average >= 80 && exploration.roll === 6, "result should expose level, relationship and six-sided die roll");
assert(exploration.qualityScore === exploration.roll + exploration.levelContribution + exploration.relationshipContribution, "exploration total should equal die plus two visible modifiers");
assert((result.world.reserve.pendingRecovered.shedAntlerA || 0) > beforePending, "exploration discovery should enter pending recovered goods");
assert((result.world.reserve.houndTeam.xp || 0) === beforeHoundXp, "material exploration should not silently become a hound patrol");
assert(result.world.reserve.lastMaterialExploration && result.world.reserve.lastMaterialExploration.roll === exploration.roll, "exploration result should persist in reserve state");

const game = new Game();
game.stopLoop();
game.ctx = createFakeContext();
game.width = 375;
game.height = 667;
game.render = () => {};
game.state = Object.assign({}, simulation, { world: result.world, character: result.character, reports: result.reports || [] });
const concreteSettlement = game.buildPatrolSettlement(game.reserveSnapshot(simulation.world.reserve), game.reserveSnapshot(result.world.reserve), result, "跟随动物探索森林，寻找自然遗留。目标:shedAntlerA 掷骰:6");
assert(concreteSettlement.title.includes(exploration.survivalFind.label), "exploration title should foreground the survival material discovery");
game.state = createCharacter(null, "保护区卫士");
game.screen = "role";
game.state.world.reserve.inventory.researchSample = 0;
game.state.world.reserve.pendingRecovered.researchSample = 0;
const detail = game.buildMaterialDetail("goods", "researchSample");
assert(detail.actionLabel === "去探索", "empty recovered good should lead to exploration instead of patrol");
detail.action();
assert(game.screen === "role", "material exploration should remain on the materials page");
assert(game.infoDetailModal && /物资与知识/.test(game.infoDetailModal.kicker), "material action should open the exploration factor modal");
const factorText = JSON.stringify(game.infoDetailModal.items || []);
["等级", "关系", "点数", "安全", "野性", "六面点数"].forEach((text) => assert(factorText.includes(text), `exploration modal should expose ${text}`));
assert(game.infoDetailModal.kind === "materialExploration" && game.infoDetailModal.actionLabel === "探索", "exploration should expose a graphical point action");
[[320, 568], [375, 667], [430, 932]].forEach(([width, height]) => {
  game.width = width;
  game.height = height;
  game.hitAreas = [];
  game.drawInfoDetailModal();
  const dieHit = game.hitAreas.find((hit) => hit.w >= 76 && hit.h >= 76 && hit.w < width);
  assert(dieHit, `graphical die should have a large tappable area at ${width}x${height}`);
  assert(dieHit.x >= 0 && dieHit.y >= 0 && dieHit.x + dieHit.w <= width && dieHit.y + dieHit.h <= height, `die should stay inside ${width}x${height}`);
  const factors = game.infoDetailModal.renderedDiceFactors || [];
  assert(factors.length === 3 && factors.every((factor) => factor.labelSize >= 9 && factor.valueSize >= 18 && factor.noteSize >= 9), `exploration modifiers should stay readable and data-forward at ${width}x${height}`);
});
let rolledTarget = "";
game.rollMaterialExplorationDice = (targetId) => { rolledTarget = targetId; };
game.infoDetailModal.action();
assert(rolledTarget === "researchSample", "the visible die action should start the selected material exploration");
assert(!/去巡护|巡护收集/.test(JSON.stringify(detail)), "empty material flow should no longer route to patrol");

console.log("material exploration check ok");
