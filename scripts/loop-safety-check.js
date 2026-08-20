const fs = require("fs");
const path = require("path");
const { Game } = require("../js/game");
const { createCharacter, normalizeReserve } = require("../js/storage");
const { simulateDay } = require("../js/simulator");
const { normalizeStrategyState, STRATEGIC_DILEMMAS } = require("../js/strategySystem");
const { normalizeCollectionState } = require("../js/collectionSystem");

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
assert(game.chapterStoryQueue.length <= 1, "chapter story queue exceeded two total story screens");
assert(`${game.chapterStoryModal.level}:${game.chapterStoryModal.phase}` !== `${game.chapterStoryQueue[0].level}:${game.chapterStoryQueue[0].phase}`, "chapter story queue contains duplicate keys");

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
assert((gameSource.match(/frame\s*<\s*8/g) || []).length >= 2, "dice animation lost its explicit frame cap");
const guardianSource = fs.readFileSync(path.join(sourceRoot, "guardianCycle.js"), "utf8");
assert(/actionIndex\s*=\s*0/.test(guardianSource) && /slice\(-3\)/.test(guardianSource), "守护日缺少三阶段收束或行动记录上限");

console.log("loop safety check ok (queues, stale recovery, three-resource recovery, bounded guardian days)");
