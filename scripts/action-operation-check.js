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
    set(target, prop, value) {
      target[prop] = value;
      return true;
    }
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

const { createCharacter } = require("../js/storage");
const { simulateDay } = require("../js/simulator");
const { Game } = require("../js/game");
const {
  ACTION_OPERATION_CONFIG,
  operationProfiles,
  operationRouteProfile,
  operationPlanPreview,
  normalizeOperationPlan,
  encodeOperationPlan,
  parseOperationPlan,
  applyOperationPlan,
  scaledDelta
} = require("../js/actionOperations");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const actionIds = ["houndScout", "antiPoacher", "habitat", "intervention"];
assert(Object.keys(ACTION_OPERATION_CONFIG).length === 4, "all four frequent patrol actions need an operation board");
actionIds.forEach((actionId) => {
  const config = ACTION_OPERATION_CONFIG[actionId];
  assert(config.nodes.length === 3 && new Set(config.nodes.map((node) => node.id)).size === 3, `${actionId} should expose three distinct map nodes`);
  config.nodes.forEach((node) => {
    assert(node.label && node.role && node.short && Object.keys(node.effects || {}).length >= 2, `${actionId}.${node.id} needs a visible strategic role and real effects`);
  });
  const profiles = operationProfiles(actionId);
  assert(profiles.length === 3 && new Set(profiles.map((profile) => profile.id)).size === 3, `${actionId} should expose three distinct pair strategies`);
  assert(new Set(profiles.map((profile) => profile.label)).size === 3, `${actionId} strategy names should make all three pairs distinguishable`);
  profiles.forEach((profile) => {
    assert(profile.risk && profile.promise && Number.isFinite(profile.chanceBonus), `${actionId}.${profile.id} needs risk, intent, and a success modifier`);
    assert(operationRouteProfile(actionId, profile.nodeIds).id === profile.id, `${actionId}.${profile.id} should resolve from either node order`);
  });
  assert(!normalizeOperationPlan(actionId, [config.nodes[0].id]), `${actionId} should require exactly two nodes`);
  assert(!normalizeOperationPlan(actionId, [config.nodes[0].id, config.nodes[0].id]), `${actionId} should reject duplicate nodes`);
});

assert(scaledDelta(5, 0) === 5 && scaledDelta(5, 1) === 3, "first node should resolve at 100% and second at 60%");
assert(scaledDelta(-3, 1) === -2, "negative secondary effects should retain their cost direction");

const habitatNodes = ACTION_OPERATION_CONFIG.habitat.nodes;
const forward = normalizeOperationPlan("habitat", [habitatNodes[0].id, habitatNodes[1].id]);
const reverse = normalizeOperationPlan("habitat", [habitatNodes[1].id, habitatNodes[0].id]);
assert(parseOperationPlan(`修复栖息地 ${encodeOperationPlan(forward)}`, "habitat").nodeIds.join(",") === forward.nodeIds.join(","), "route should survive command encoding and parsing");
const baseReserve = { fund: 1000, intel: 1, safety: 60, stability: 60, reputation: 60, enforcement: 50, poacherPressure: 40, ecology: { water: 50, grass: 50, disease: 20 } };
const forwardReserve = clone(baseReserve);
const reverseReserve = clone(baseReserve);
const forwardOutcome = applyOperationPlan(forwardReserve, "habitat", forward);
const reverseOutcome = applyOperationPlan(reverseReserve, "habitat", reverse);
assert(forwardReserve.ecology.water === 54 && forwardReserve.ecology.grass === 53, "spring-first route should prioritize water and receive its water-grass strategy bonus");
assert(reverseReserve.ecology.grass === 55 && reverseReserve.ecology.water === 52, "reversing the same two nodes should prioritize grass while keeping the pair bonus");
assert(forwardOutcome.summary !== reverseOutcome.summary, "route order should remain visible in settlement");
assert(forwardOutcome.strategyLabel === "水草复苏" && reverseOutcome.strategyLabel === "水草复苏", "node order should change priority without changing the selected pair strategy");

const houndPreviews = [["scent", "herd"], ["scent", "ridge"], ["herd", "ridge"]].map((nodes) => operationPlanPreview("houndScout", nodes));
assert(new Set(houndPreviews.map((preview) => preview.profile.id)).size === 3, "three hound pairs should resolve to three different strategies");
assert(new Set(houndPreviews.map((preview) => `${preview.profile.chanceBonus}:${preview.deltaText}`)).size === 3, "three hound strategies should create measurably different risk and reward profiles");
assert(houndPreviews.some((preview) => preview.profile.risk === "低风险") && houndPreviews.some((preview) => preview.profile.risk === "高风险"), "hound planner should show a meaningful low-to-high risk range");

// The graphical operation must enter the real simulation and final saved values.
const state = createCharacter(null, "保护区卫士");
const before = clone(state.world.reserve);
const result = simulateDay(`猎犬侦察：沿河岸确认陌生气味 [路线:scent>ridge]`, state);
assert(result.visual.patrolOperation && result.visual.patrolOperation.nodeIds.join(",") === "scent,ridge", "simulation should settle the player's selected route");
assert(result.world.reserve.lastActionOperation.summary === "先到气味线 → 后到高地捷径", "selected route should be stored in the reserve save");
assert(result.visual.patrolOperation.strategyLabel === "强攻追踪", "simulation should retain the pair strategy, not only node order");
assert(result.visual.patrolOperation.changes.some((item) => item.key === "poacherPressure" && item.delta < 0), "route should create a concrete anti-poaching effect without reviving retired intel");
assert(result.world.reserve.poacherPressure < before.poacherPressure, "route effects should reach the shared poacher value");

// The former four-choice route planner is retired. Existing action IDs still open their
// task card and settle immediately through the real command path.
const game = new Game(); game.stopLoop(); game.render = () => {};
game.state = createCharacter(null, "保护区卫士");
game.state.world.reserve.fund = 10000;
game.state.world.reserve.supplies = { dogFood: 10, alarm: 10, fieldKit: 10, tranquilizer: 10, medicalKit: 10, evidenceTrap: 2 };
for (const actionId of actionIds) {
  const option = game.reserveActionOptions().find(item => item.id === actionId);
  game.settlementModal = null;
  game.openPatrolTaskModal(option);
  if (actionId !== "antiPoacher") {
    assert(game.confirmPatrolTask(option), `${actionId} should settle directly`);
  }
  assert(game.settlementModal && !game.patrolOperationPlan, `${actionId} must not open a route second step`);
  game.settlementModal = null;
}
console.log("action operation check ok (legacy simulation data, four task cards, direct one-step settlement)");
