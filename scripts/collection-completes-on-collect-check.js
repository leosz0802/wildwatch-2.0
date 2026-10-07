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
assert(recoveredGame.activeTaskLock && recoveredGame.activeTaskLock.awaitingMaterialDetail, "recovered goods did not enter the detail guidance state");
assert.strictEqual(recoveredGame.activeTaskLock.requiredMaterialId, "researchSample");
assert(/任务未完成/.test(recoveredGame.activeTaskLock.taskHint) && /研究样本/.test(recoveredGame.activeTaskLock.taskHint) && /物资详情/.test(recoveredGame.activeTaskLock.taskHint), "recovered goods prompt must name the item and say the task is unfinished until its detail opens");
const detailPrompt = recoveredGame.recoveredGoodsDetailPrompt("研究样本");
assert(detailPrompt.banner.includes("研究样本") && detailPrompt.banner.includes("打开详情") && detailPrompt.goalTitle.includes("任务才完成"), "recovered goods banner and goal must say opening this item's detail finishes the task");
recoveredGame.openMaterialDetail("goods", "researchSample");
assert.strictEqual(recoveredGame.activeTaskLock, null, "recovered goods detail view did not complete the task");
assert(recoveredGame.infoDetailModal && recoveredGame.infoDetailModal.taskCompleted, "recovered goods detail view did not show completion guidance");

console.log("collection completes on collect check ok (story, ecology drop, recovered goods)");
