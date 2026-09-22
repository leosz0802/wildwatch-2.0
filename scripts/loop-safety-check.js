const fs = require("fs");
const path = require("path");
const { Game } = require("../js/game");
const { createCharacter, normalizeReserve } = require("../js/storage");
const { simulateDay } = require("../js/simulator");
const { normalizeStrategyState, STRATEGIC_DILEMMAS } = require("../js/strategySystem");
const {
  normalizeCollectionState, beginStoryDiscovery, advanceStoryDiscovery,
  storyDiscoverySummary, collectStoryDiscovery
} = require("../js/collectionSystem");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function majorEmotion(id) {
  return { id, type: "return", day: 2, individual: { id: `animal_${id}` }, title: id };
}

const game = Object.create(Game.prototype);
game.pendingEmotionEvent = null;
game.pendingEmotionEvents = [];
game.isMajorEmotionEvent = (event) => event && event.type === "return";
for (let index = 0; index < 20; index += 1) game.enqueueEmotionEvent(majorEmotion(`event_${index}`));
assert(1 + game.pendingEmotionEvents.length <= 7, "emotion popup queue exceeded current + 6 pending events");
assert(!game.enqueueEmotionEvent(majorEmotion("event_0")), "duplicate emotion popup was accepted");
assert(!game.enqueueEmotionEvent({ id: "minor", type: "ordinary" }), "minor event entered major popup queue");
game.pendingEmotionEvents.push(majorEmotion("event_1"));
game.compactPendingEmotionEvents();
assert(new Set([game.pendingEmotionEvent].concat(game.pendingEmotionEvents).map((item) => item.id)).size === 1 + game.pendingEmotionEvents.length, "emotion queue dedupe failed");

game.state = createCharacter(null, "保护区卫士");
game.chapterStorySeen = () => false;
game.prepareChapterArt = () => {};
game.buildChapterStory = (level, phase) => ({ level, phase });
assert(game.queueChapterStoriesForSettlement({ chapterTransition: { from: 1, to: 2 } }), "chapter transition should queue a story");
assert(game.chapterStoryQueue.length === 0, "chapter progression should use one shared-image text screen");
assert(game.chapterStoryModal.level === 2 && game.chapterStoryModal.phase === "start", "chapter progression should open the next chapter directly");

const diceDilemma = STRATEGIC_DILEMMAS.find((item) => item.choices.some((choice) => choice.dice));
const diceChoice = diceDilemma.choices.find((choice) => choice.dice);
const invalidStrategy = normalizeStrategyState({
  pendingDilemma: { id: "missing_dilemma" },
  pendingSelection: { dilemmaId: "missing_dilemma", choiceId: "missing" },
  pendingRoll: { dilemmaId: "missing_dilemma", choiceId: "missing", roll: 99 }
});
assert(!invalidStrategy.pendingDilemma && !invalidStrategy.pendingSelection && !invalidStrategy.pendingRoll, "invalid strategy recovery state survived normalization");
const validStrategy = normalizeStrategyState({
  pendingDilemma: { id: diceDilemma.id, chapter: 1, day: 1 },
  pendingSelection: { dilemmaId: diceDilemma.id, choiceId: diceChoice.id },
  pendingRoll: { dilemmaId: diceDilemma.id, choiceId: diceChoice.id, roll: 99, routeModifier: 99, resourceModifier: -99 }
});
assert(validStrategy.pendingRoll && validStrategy.pendingRoll.roll === 6, "pending dice roll was not clamped to a six-sided die");
assert(validStrategy.pendingRoll.routeModifier === 6 && validStrategy.pendingRoll.resourceModifier === -6, "pending dice modifiers were not bounded");

const collectionState = createCharacter(null, "保护区卫士");
normalizeCollectionState(collectionState);
collectionState.world.collection.investigation.charges = 0;
collectionState.world.collection.investigation.pending = { leadId: "expired", methodId: "animal", startedDay: 1 };
normalizeCollectionState(collectionState);
assert(!collectionState.world.collection.investigation.pending, "expired collection roll state survived normalization");
assert(collectionState.world.collection.investigation.charges === 1, "expired collection roll did not refund its investigation chance");

// A located story item must never become a UI soft lock. The task entry now
// recenters the sandbox, raises zoom to a readable level and arms a large,
// foreground hit target. Missing legacy region ids fall back to the center.
const locatedState = createCharacter(null, "保护区卫士");
normalizeCollectionState(locatedState);
locatedState.world.reserve.eventChain = Object.assign({}, locatedState.world.reserve.eventChain, { chapterLevel: 1, step: 1 });
const guideAnimal = locatedState.world.knownCharacters[0];
const startedDiscovery = beginStoryDiscovery(locatedState, guideAnimal, { caseId: "case_1", guaranteed: true }, () => 0);
assert(startedDiscovery.created, "located-item loop fixture could not start a discovery");
assert(advanceStoryDiscovery(locatedState, {
  actionId: startedDiscovery.discovery.actionId,
  actionLabel: startedDiscovery.discovery.actionLabel
}).advanced, "located-item loop fixture could not reach the map stage");
const locatedDiscovery = storyDiscoverySummary(locatedState).active;
const focusGame = Object.create(Game.prototype);
focusGame.state = locatedState;
focusGame.mapZoom = 0;
focusGame.mapCamera = { cx: 0.05, cy: 0.95 };
focusGame.scrollY = 240;
focusGame.infoDetailModal = {};
focusGame.suppressNextHomeMission = false;
focusGame.screen = "collection";
focusGame.setScreen = function setScreen(screen) { this.screen = screen; this.scrollY = 0; };
focusGame.toast = function toast(message) { this.lastToast = message; };
focusGame.render = () => {};
assert(focusGame.focusStoryDiscovery(locatedDiscovery), "located story item could not be focused from its task");
const discoveryRegion = focusGame.findRegion(locatedDiscovery.regionId);
assert(focusGame.screen === "home" && focusGame.scrollY === 0, "story focus did not return to the visible sandbox");
assert(focusGame.mapZoom >= 1.35, "story focus did not make the collectible readable");
assert(focusGame.mapCamera.cx === discoveryRegion.x && focusGame.mapCamera.cy === discoveryRegion.y, "story focus did not center the collectible region");
assert(focusGame.storyDiscoveryGuide && focusGame.storyDiscoveryGuide.itemId === locatedDiscovery.itemId, "story focus did not arm a visible guide");
assert(/已定位/.test(focusGame.lastToast || ""), "story focus did not explain the next tap");

const missingRegionDiscovery = Object.assign({}, locatedDiscovery, { regionId: "removed_region" });
assert(focusGame.focusStoryDiscovery(missingRegionDiscovery), "legacy discovery with a missing region id became unreachable");
assert(focusGame.mapCamera.cx === focusGame.findRegion("center").x && focusGame.mapCamera.cy === focusGame.findRegion("center").y, "missing discovery region did not fall back to the map center");

const markerGame = Object.create(Game.prototype);
markerGame.state = locatedState;
markerGame.hitAreas = [];
markerGame.mapViewport = { x: 0, y: 0, w: 400, h: 600 };
markerGame.scrollY = 0;
markerGame.storyDiscoveryGuide = { itemId: locatedDiscovery.itemId, expiresAt: Date.now() + 1000 };
markerGame.mapPoint = () => ({ x: 160, y: 220 });
markerGame.animT = () => 0;
markerGame.roundRect = () => {};
markerGame.text = () => {};
markerGame.drawCollectionItemIcon = () => {};
markerGame.collectMapStoryDiscovery = (itemId) => { markerGame.collectedTap = itemId; };
const markerCtx = {
  save() {}, restore() {}, beginPath() {}, arc() {}, fill() {},
  set globalAlpha(value) { this._globalAlpha = value; },
  set fillStyle(value) { this._fillStyle = value; }
};
markerGame.addMapHit(184, 208, 100, () => { markerGame.animalTap = true; });
markerGame.drawStoryDiscoveryMarker(markerCtx, { scale: 1 }, locatedDiscovery, false);
const markerHit = markerGame.hitAreaAt(markerGame.renderedStoryDiscoveryMarker.x, markerGame.renderedStoryDiscoveryMarker.y);
assert(markerHit, "located story marker has no tappable target");
markerHit.onTap();
assert(markerGame.collectedTap === locatedDiscovery.itemId && !markerGame.animalTap, "an overlapping animal still steals the story collectible tap");

markerGame.hitAreas = [];
markerGame.mapPoint = () => ({ x: -300, y: -300 });
markerGame.drawStoryDiscoveryMarker(markerCtx, { scale: 1 }, locatedDiscovery, false);
assert(markerGame.renderedStoryDiscoveryMarker && !markerGame.renderedStoryDiscoveryMarker.visible, "off-camera story marker visibility was not detected");
assert(markerGame.hitAreas.length === 0, "off-camera story marker created a phantom edge hit");

const archivedDiscovery = collectStoryDiscovery(locatedState, locatedDiscovery.itemId);
assert(archivedDiscovery.ok && !storyDiscoverySummary(locatedState).active, "collecting a located item did not close its task loop");
assert(!collectStoryDiscovery(locatedState, locatedDiscovery.itemId).ok, "the same located item could be collected repeatedly");

const fresh = createCharacter(null, "保护区卫士").world.reserve;
const recovered = normalizeReserve(Object.assign({}, fresh, {
  fund: Infinity,
  ecology: Object.assign({}, fresh.ecology, { water: NaN, grass: Infinity }),
  progression: Object.assign({}, fresh.progression, { totalActions: Infinity, activeSeconds: NaN })
}), fresh);
assert(Number.isFinite(recovered.fund) && Number.isFinite(recovered.ecology.water) && Number.isFinite(recovered.ecology.grass) && Number.isFinite(recovered.progression.totalActions) && Number.isFinite(recovered.progression.activeSeconds), "corrupt numeric save values survived normalization");
const zeroState = createCharacter(null, "保护区卫士");
zeroState.world.reserve.fund = 0;
Object.keys(zeroState.world.reserve.inventory).forEach((key) => { zeroState.world.reserve.inventory[key] = 0; });
Object.keys(zeroState.world.reserve.pendingRecovered).forEach((key) => { zeroState.world.reserve.pendingRecovered[key] = 0; });
const recoveredDay = simulateDay("出售仓库里的回收物", zeroState);
const reserve = recoveredDay.world.reserve;
assert(reserve.fund >= 0 && Number.isFinite(reserve.ecology.water) && Number.isFinite(reserve.ecology.grass), "zero-resource recovery generated invalid values");
assert(Object.values(reserve.pendingRecovered || {}).some((value) => value > 0), "salvage fallback did not create a recovery resource");

const sourceRoot = path.resolve(__dirname, "../js");
const sources = fs.readdirSync(sourceRoot).filter((name) => name.endsWith(".js")).map((name) => fs.readFileSync(path.join(sourceRoot, name), "utf8")).join("\n");
assert(!/while\s*\(\s*true\s*\)|for\s*\(\s*;\s*;\s*\)/.test(sources), "unbounded static loop found in runtime code");
const gameSource = fs.readFileSync(path.join(sourceRoot, "game.js"), "utf8");
assert((gameSource.match(/frame\s*<\s*(8|12|frames)/g) || []).length >= 2, "dice animation lost its explicit frame cap");
const guardianSource = fs.readFileSync(path.join(sourceRoot, "guardianCycle.js"), "utf8");
assert(/actionIndex\s*=\s*0/.test(guardianSource) && /slice\(-3\)/.test(guardianSource), "守护日缺少三阶段收束或行动记录上限");

const gameDrawSource = fs.readFileSync(path.join(sourceRoot, "game.js"), "utf8");
assert(gameDrawSource.indexOf("animalHitTargets\n      .sort") < gameDrawSource.indexOf("this.drawStoryDiscoveryMarker(ctx, camera, storyDiscovery, fast,"), "story collectible is no longer drawn above animals");

console.log("loop safety check ok (queues, stale recovery, collectible reachability, hit priority, bounded guardian days)");
