const assert = require("assert");
const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
const {
  normalizeCollectionState,
  beginStoryDiscovery,
  advanceStoryDiscovery,
  storyDiscoverySummary
} = require("../js/collectionSystem");

function quietGame(state) {
  const game = Object.create(Game.prototype);
  game.state = state;
  game.screen = "home";
  game.render = () => {};
  game.playSfx = () => {};
  game.toast = () => {};
  game.startMapHarvestFlight = () => {};
  game.setMapConsequencePulse = () => {};
  game.openDailyFullClearModal = () => {};
  game.infoDetailModal = null;
  game.patrolTaskModal = null;
  game.chapterStoryModal = null;
  game.settlementModal = null;
  game.frameMemoStore = {};
  game.pendingMissionPush = null;
  return game;
}

// A located story collectible must finish the system task at the map tap.
const storyState = createCharacter(null, "保护区卫士");
normalizeCollectionState(storyState);
storyState.world.reserve.eventChain = Object.assign({}, storyState.world.reserve.eventChain, {
  chapterLevel: 1,
  step: 1
});
const guideAnimal = storyState.world.knownCharacters[0];
const started = beginStoryDiscovery(storyState, guideAnimal, { caseId: "case_1", guaranteed: true }, () => 0);
assert(started.created, "story discovery fixture did not start");
assert(advanceStoryDiscovery(storyState, {
  actionId: started.discovery.actionId,
  actionLabel: started.discovery.actionLabel
}).advanced, "story discovery fixture did not reach located state");
const located = storyDiscoverySummary(storyState).active;
const storyGame = quietGame(storyState);
storyGame.activeTaskLock = {
  id: `stage:1:discovery:${located.itemId}`,
  kind: "collection",
  goal: { id: `stage:1:discovery:${located.itemId}`, kind: "collection", recommendedAction: "collectionInvestigate" }
};
storyGame.collectMapStoryDiscovery(located.itemId);
assert.strictEqual(storyGame.activeTaskLock, null, "story collection kept the task lock after the item was collected");
assert(storyGame.infoDetailModal && storyGame.infoDetailModal.kind === "collectionItem", "story collection result was not shown");

// Ecology drops use the same collect-first rule even when the result has a
// lightweight information card.
const ecologyState = createCharacter(null, "保护区卫士");
const reserve = ecologyState.world.reserve;
reserve.ecologyEconomy = {
  mapDrops: [{ id: "drop_collect_once", type: "fieldNote", amount: 1, x: .5, y: .5, animalName: "动物伙伴" }]
};
const ecologyGame = quietGame(ecologyState);
ecologyGame.activeTaskLock = {
  id: "goal:explore-materials",
  kind: "survival",
  goal: { id: "goal:explore-materials", kind: "survival", recommendedAction: "exploreMaterials" }
};
ecologyGame.collectAnimalEcologyDrop("drop_collect_once");
assert.strictEqual(ecologyGame.activeTaskLock, null, "ecology collection kept the task lock after the drop was collected");

// Recovered goods require one explicit detail-page view after collection so
// the user can see what was accepted and why the task completed.
const recoveredState = createCharacter(null, "保护区卫士");
recoveredState.world.reserve.pendingRecovered = Object.assign({}, recoveredState.world.reserve.pendingRecovered, { researchSample: 1 });
const recoveredGame = quietGame(recoveredState);
recoveredGame.activeTaskLock = {
  id: "goal:salvage",
  kind: "recovery",
  goal: { id: "goal:salvage", kind: "recovery", recommendedAction: "salvage" }
};
recoveredGame.collectRecoveredGood("researchSample");
assert.strictEqual(recoveredGame.activeTaskLock, null, "collecting recovered goods should finish the task by opening the detail");
assert(recoveredGame.infoDetailModal && recoveredGame.infoDetailModal.taskCompleted, "collecting recovered goods should show the completed detail");
assert.strictEqual(recoveredGame.infoDetailModal.actionLabel, "完成", "completed collection detail needs one obvious close button");
assert(/研究样本/.test(recoveredGame.infoDetailModal.title || ""), "completed collection detail must name the collected item");

console.log("collection completes on collect check ok (story, ecology drop, recovered goods)");
