const { createCharacter } = require("../js/storage");
const { simulateDay } = require("../js/simulator");
const { Game } = require("../js/game");
const {
  MYSTERY_RECOVERY_CATALOG,
  normalizeMysteryEvidence,
  rollMysteryRecovery
} = require("../js/mysteryRecoveries");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function withRandom(value, fn) {
  const previous = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = previous;
  }
}

const lowState = createCharacter(null, "保护区卫士");
const lowReserve = lowState.world.reserve;
lowReserve.progression.totalActions = 50;
lowReserve.eventChain.step = 7;
lowReserve.poacherPressure = 10;
lowReserve.enforcement = 90;
const lowResult = rollMysteryRecovery(lowReserve, { action: "antiPoacher", day: 20, totalActions: 51 }, () => 0);
assert(!lowResult, "mystery evidence should not appear when the required risk data is absent");

const state = createCharacter(null, "保护区卫士");
const reserve = state.world.reserve;
reserve.progression.level = 1;
reserve.progression.totalActions = 20;
reserve.eventChain.step = 3;
reserve.poacherPressure = 76;
reserve.enforcement = 78;
const beforeInventory = JSON.stringify(reserve.inventory);
const discovery = rollMysteryRecovery(reserve, { action: "antiPoacher", day: 21, totalActions: 21 }, () => 0);
assert(discovery && discovery.id === "whiteRhinoHornEvidence", `expected white rhino evidence first, got ${discovery && discovery.id}`);
assert(discovery.rarity.includes("超等级"), "mystery evidence should be explicitly marked as above-level content");
assert(reserve.mysteryEvidence.evidence.whiteRhinoHornEvidence === 1, "mystery evidence should enter the dedicated sealed archive");
assert(JSON.stringify(reserve.inventory) === beforeInventory, "mystery evidence must not enter ordinary sellable inventory");
assert(reserve.mysteryEvidence.discovered.whiteRhinoHornEvidence, "discovered evidence should be permanently recorded");
assert(reserve.fund >= 1080 && reserve.reputation > 50, "mystery recovery should clearly grant enforcement funding and reputation");

const pityState = createCharacter(null, "保护区卫士");
const pityReserve = pityState.world.reserve;
pityReserve.progression.level = 1;
pityReserve.progression.totalActions = 40;
pityReserve.eventChain.step = 4;
pityReserve.poacherPressure = 80;
pityReserve.enforcement = 80;
pityReserve.mysteryEvidence = normalizeMysteryEvidence({
  discovered: {
    whiteRhinoHornEvidence: true
  },
  failedEligibleChecks: 40
});
const pityDiscovery = rollMysteryRecovery(pityReserve, { action: "habitat", day: 41, totalActions: 41 }, () => 0.99);
assert(pityDiscovery && pityDiscovery.id === "pangolinScaleEvidence" && pityDiscovery.guaranteed, "eligible mystery recovery should eventually use pity protection");

const integrated = createCharacter(null, "保护区卫士");
integrated.world.reserve.progression.level = 1;
integrated.world.reserve.progression.totalActions = 20;
integrated.world.reserve.eventChain.step = 3;
integrated.world.reserve.poacherPressure = 76;
integrated.world.reserve.enforcement = 78;
integrated.world.reserve.supplies.alarm = 3;
const integratedResult = withRandom(0, () => simulateDay("驱赶偷猎者，检查跨区运输脚印", integrated));
assert(integratedResult.visual && integratedResult.visual.mysteryRecovery, "eligible patrol should surface mystery recovery in the action result");
assert(/神秘证物/.test(integratedResult.visual.quickFeedback || ""), "quick feedback should announce the mystery evidence");

const game = new Game();
game.render = () => {};
game.state = integratedResult;
game.openMysteryEvidenceDetail();
assert(game.infoDetailModal && /已封存/.test(game.infoDetailModal.title), "materials page should expose the sealed mystery evidence archive");
assert(!game.infoDetailModal.action && !game.infoDetailModal.actionLabel, "mystery evidence detail must not offer a sale action");

const evidenceBeforeSale = JSON.stringify(integratedResult.world.reserve.mysteryEvidence.evidence);
integratedResult.world.reserve.inventory.researchSample = 1;
const soldResult = withRandom(0.9, () => simulateDay("只出售库存中的研究样本", integratedResult));
assert(JSON.stringify(soldResult.world.reserve.mysteryEvidence.evidence) === evidenceBeforeSale, "ordinary salvage must never consume sealed mystery evidence");
assert(MYSTERY_RECOVERY_CATALOG.length >= 4, "mystery recovery pool should provide more than the two example items");

console.log("mystery recovery check ok");
