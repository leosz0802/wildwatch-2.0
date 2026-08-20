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
    assert(node.label && node.short && Object.keys(node.effects || {}).length >= 2, `${actionId}.${node.id} needs visible and real effects`);
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
assert(forwardReserve.ecology.water === 54 && forwardReserve.ecology.grass === 52, "spring-first route should prioritize water and then partially restore grass");
assert(reverseReserve.ecology.grass === 54 && reverseReserve.ecology.water === 52, "reversing the same two nodes should prioritize grass instead");
assert(forwardOutcome.summary !== reverseOutcome.summary, "route order should remain visible in settlement");

// The graphical operation must enter the real simulation and final saved values.
const state = createCharacter(null, "保护区卫士");
const before = clone(state.world.reserve);
const result = simulateDay(`猎犬侦察：沿河岸确认陌生气味 [路线:scent>ridge]`, state);
assert(result.visual.patrolOperation && result.visual.patrolOperation.nodeIds.join(",") === "scent,ridge", "simulation should settle the player's selected route");
assert(result.world.reserve.lastActionOperation.summary === "先到气味线 → 后到高地捷径", "selected route should be stored in the reserve save");
assert(result.visual.patrolOperation.changes.some((item) => item.key === "intel" && item.delta > 0), "route should create concrete collected information");
assert(result.world.reserve.poacherPressure < before.poacherPressure, "route effects should reach the shared poacher value");

// UI: choose two nodes in order, change the secondary node, encode the route, and settle it.
const game = new Game();
game.stopLoop();
game.render = () => {};
game.state = createCharacter(null, "保护区卫士");
const option = game.reserveActionOptions().find((item) => item.id === "houndScout");
game.openPatrolTaskModal(option);
assert(game.startPatrolOperation(option), "patrol confirmation should enter route planning");
game.togglePatrolOperationNode("scent");
game.togglePatrolOperationNode("herd");
assert(game.patrolOperationPlan.nodeIds.join(",") === "scent,herd", "tap order should be recorded");
game.togglePatrolOperationNode("ridge");
assert(game.patrolOperationPlan.nodeIds.join(",") === "scent,ridge", "third tap should replace the secondary node without losing the primary choice");
assert(/\[路线:scent>ridge\]/.test(game.buildSubmittedCommand()), "submitted command should carry the player's graphical route");

const sizes = [[320, 568], [375, 667], [430, 932]];
sizes.forEach(([width, height]) => {
  game.width = width;
  game.height = height;
  game.scrollY = 0;
  game.hitAreas = [];
  game.drawPatrolOperationPlanner(option, game.actionResourceStatus(option.id, game.state.world.reserve));
  assert((game.renderedOperationNodes || []).length === 3
    && game.renderedOperationNodes.every((node) => node.graphical && node.icon && node.iconSize >= 30 && node.h >= 72), `${width}x${height} should show three pictorial field nodes, not text-only cards`);
  const actionable = game.hitAreas.filter((area) => area.w < width || area.h < height);
  assert(actionable.length >= 5, `${width}x${height} should expose three nodes and two buttons`);
  actionable.forEach((area) => {
    assert(area.x >= 0 && area.y >= 0 && area.x + area.w <= width + 0.01 && area.y + area.h <= height + 0.01, `${width}x${height} operation hit area is out of bounds`);
  });
});

game.width = 375;
game.height = 667;
assert(game.confirmPatrolOperation(), "two selected nodes should execute the action");
assert(!game.patrolOperationPlan, "operation plan should clear after settlement");
assert(game.settlementModal && game.settlementModal.patrolOperation, "settlement should retain the route operation result");
assert((game.settlementModal.rewards || []).some((line) => /路线：先到气味线/.test(line)), "settlement should clearly show route and concrete deltas");
assert(/先去气味线，再去高地捷径/.test(game.settlementModal.speech || ""), "animal response should acknowledge the route order the player actually chose");

console.log("action operation check ok (4 boards, ordered route, real values, settlement, 3 sizes)");
