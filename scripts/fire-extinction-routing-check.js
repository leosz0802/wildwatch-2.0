"use strict";

const assert = require("node:assert/strict");
const { createInitialWorld } = require("../js/world");
const { Game } = require("../js/game");

// A chapter goal can still point at an extinction record while the active map
// emergency has already rotated to the regular wildfire task. Tapping the
// marker must follow the active event, never the stale goal.
const game = Object.create(Game.prototype);
game.state = { world: createInitialWorld() };
game.state.character = { id: "routing-test" };
game.screen = "home";
game.infoDetailModal = null;
game.reserveViewForDisplay = () => ({ mapMarkers: [] });
game.recordSandboxInteraction = () => {};
game.markUserTaskTrigger = () => {};
game.markPopupQuiet = () => {};
game.render = () => {};
game.toast = () => {};
game.currentGoalView = () => ({
  primary: {
    kind: "crisis",
    recommendedAction: "realEvent",
    title: "白鱀豚：功能性灭绝"
  }
});
game.executeGoalAction = () => {
  throw new Error("stale extinction goal must not handle a wildfire marker");
};

const reserve = game.state.world.reserve;
reserve.emergency.active = {
  id: "wildfire-routing-test",
  type: "wildfire",
  title: "火灾预警",
  label: "火灾预警",
  regionId: "meadow",
  visualKind: "wildfire",
  recommendedAction: "habitat",
  impact: "烟线压向草场",
  daysRemaining: 3,
  progress: 0,
  target: 3
};

assert.equal(Game.prototype.openActiveWorldEventFromMap.call(game), true);
assert.equal(game.infoDetailModal.kind, "harshNatureDice");
assert.equal(game.infoDetailModal.harshKind, "wildfire");
assert.equal(game.infoDetailModal.kicker, "火灾预警");
assert.equal(game.infoDetailModal.title, "火灾预警");

// A migrated save may retain a real-nature type while the visible emergency
// has already become a fire warning.  The visible fire route must still win.
game.infoDetailModal = null;
reserve.emergency.active = {
  id: "fire-with-stale-type",
  type: "real_nature_extinction-baiji",
  title: "火灾预警",
  label: "火灾预警",
  regionId: "meadow",
  visualKind: "wildfire",
  recommendedAction: "habitat",
  daysRemaining: 3,
  progress: 0,
  target: 3
};
assert.equal(Game.prototype.openActiveWorldEventFromMap.call(game), true);
assert.equal(game.infoDetailModal.kind, "harshNatureDice");
assert.equal(game.infoDetailModal.harshKind, "wildfire");

console.log("fire/extinction routing check ok");
