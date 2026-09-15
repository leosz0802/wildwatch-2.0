const assert = require("assert");
const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");

function setup() {
  const game = new Game();
  game.stopLoop();
  game.render = () => {};
  game.state = createCharacter(null, "保护区卫士");
  game.state.ui = { onboarding: { version: 2, completed: true, seen: {} } };
  game.state.world.reserve.progression.totalActions = 30;
  game.state.world.reserve.progression.activeSeconds = 60;
  game.screen = "home";
  game.infoDetailModal = null;
  game.patrolTaskModal = null;
  game.settlementModal = null;
  return game;
}

const realNow = Date.now;
let clock = realNow();
Date.now = () => clock;
try {
const game = setup();
assert(game.maybeOpenMissionPush("login"), "first task push should remain available");
game.infoDetailModal = null;
game.state.ui.missionPushSeenKey = "";
game.state.ui.lastMissionAutoPushAt = Date.now();
assert(!game.maybeOpenMissionPush("home"), "a second task must wait inside the 30 second window");
// Advance the clock, not just one timestamp: both user/system quiet windows
// and the current 65-second card cadence must actually have elapsed.
clock += 65001;
game.state.ui.missionPushSeenKey = "";
game.state.ui.lastMissionAutoAction = 0;
assert(game.maybeOpenMissionPush("home"), "task push should resume after shared quiet time and card cadence");

const highLevel = setup();
highLevel.state.world.reserve.progression.level = 3;
highLevel.state.ui.lastMissionAutoPushAt = Date.now();
highLevel.state.ui.missionPushSeenKey = "old";
assert(!highLevel.maybeOpenMissionPush("home"), "level 3 must retain its longer card interval");
clock += 81001;
highLevel.state.ui.missionPushSeenKey = "";
highLevel.state.ui.lastMissionAutoAction = 0;
assert(highLevel.maybeOpenMissionPush("home"), "level 3 task push should resume after 65 + 2*8 seconds");

const syncGame = setup();
syncGame.pendingMissionPush = { key: "old", reason: "settlement" };
syncGame.state.ui.pendingMissionPush = Object.assign({}, syncGame.pendingMissionPush);
const before = JSON.parse(JSON.stringify(syncGame.state));
const progress = syncGame.syncSandboxGoalState(before, "exploreMaterials");
assert(progress && progress.goals, "sandbox action should refresh the shared goal projection");
assert.strictEqual(syncGame.pendingMissionPush, null, "stale queued task should be cleared after sandbox sync");
assert.strictEqual(syncGame.state.ui.missionPushSeenKey, syncGame.missionPushKey(), "new primary task should be marked as seen");
assert(syncGame.state.ui.lastSandboxTaskSync && syncGame.state.ui.lastSandboxTaskSync.action === "exploreMaterials", "sandbox action should be recorded for dedupe");

const animalGame = setup();
animalGame.render = () => {};
animalGame.openAnimalThought((animalGame.state.world.knownCharacters || [])[0]);
assert(animalGame.state.ui.lastSandboxTaskSync && animalGame.state.ui.lastSandboxTaskSync.action === "story-sync", "animal map interaction should refresh the shared story task");

console.log("sandbox task sync check ok");
} finally { Date.now = realNow; }
