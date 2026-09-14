const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createCharacter } = require("../js/storage");
const {
  normalizeCollectionState,
  collectionItemById,
  collectionDiscoveryActivation,
  offerAnimalCollectionLead,
  advanceStoryDiscovery,
  collectStoryDiscovery,
  beginStoryDiscovery
} = require("../js/collectionSystem");
const {
  wildernessFindById,
  wildernessActivation,
  survivalFindForExploration,
  recordWildernessFind
} = require("../js/wildernessKnowledge");

function state() {
  const value = createCharacter(null, "保护区卫士");
  normalizeCollectionState(value);
  value.world.reserve.eventChain = Object.assign({}, value.world.reserve.eventChain, { chapterLevel: 1, step: 0 });
  return value;
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

const base = state();
const footprint = collectionItemById("c1_footprint");
assert(!collectionDiscoveryActivation(footprint, base).active, "collection must remain locked before its story beat");
base.world.reserve.eventChain.step = 1;
base.world.reserve.ecology.water = 40;
const metricBlocked = collectionDiscoveryActivation(footprint, base);
assert(metricBlocked.storyReady && !metricBlocked.metricReady && /水源40/.test(metricBlocked.statusText), "collection must expose the exact reserve metric that blocks it");
base.world.reserve.ecology.water = 52;
assert(collectionDiscoveryActivation(footprint, base).active, "story and reserve values together should activate the next collection item");

const highRoll = clone(base);
const lowRoll = clone(base);
const highAnimal = highRoll.world.knownCharacters[0];
const lowAnimal = lowRoll.world.knownCharacters[0];
const highOffer = offerAnimalCollectionLead(highRoll, highAnimal, { caseId: "case_1" }, () => .99);
const lowOffer = offerAnimalCollectionLead(lowRoll, lowAnimal, { caseId: "case_1" }, () => 0);
assert(highOffer.discovery && lowOffer.discovery && highOffer.discovery.itemId === lowOffer.discovery.itemId, "activated collection identity must not depend on a random roll");
const located = advanceStoryDiscovery(highRoll, { actionId: highOffer.discovery.actionId, actionLabel: highOffer.discovery.actionLabel });
const enforcementBefore = highRoll.world.reserve.enforcement;
const archived = collectStoryDiscovery(highRoll, located.discovery.itemId);
assert(archived.ok && archived.reserveImpact && highRoll.world.reserve.enforcement === enforcementBefore + 1, "archiving evidence must feed a concrete value back into the reserve");
const secondBlocked = beginStoryDiscovery(highRoll, highAnimal, { caseId: "case_1", guaranteed: true }, () => 0);
assert(!secondBlocked.created && /2\/7/.test(secondBlocked.reason), "the next collection item must wait for the next story beat instead of skipping ahead");

const survivalState = state();
const resin = wildernessFindById("resin_tinder");
assert(!wildernessActivation(resin, survivalState.world.reserve).active, "survival material must remain locked before the story beat");
survivalState.world.reserve.eventChain.step = 1;
survivalState.world.reserve.safety = 51;
assert(!wildernessActivation(resin, survivalState.world.reserve).metricReady, "survival activation must read current reserve safety");
survivalState.world.reserve.safety = 52;
assert(wildernessActivation(resin, survivalState.world.reserve).active, "story and safety should activate the survival material");
const preview = { success: true, level: 1, qualityScore: 6, relationship: { average: 50 } };
const firstFind = survivalFindForExploration(preview, 6, "north", { reserve: survivalState.world.reserve });
const sameFind = survivalFindForExploration(preview, 1, "south", { reserve: clone(survivalState.world.reserve) });
assert(firstFind && sameFind && firstFind.id === sameFind.id && firstFind.activation.active, "activated survival identity must follow progression, not target or die randomness");
recordWildernessFind(survivalState.world.reserve, firstFind, 2, { chapter: 1 });
const nextFind = survivalFindForExploration(preview, 6, "north", { reserve: survivalState.world.reserve });
assert(nextFind && nextFind.id !== firstFind.id, "the deterministic survival queue should prefer the next undiscovered activated item");

const gameSource = fs.readFileSync(path.join(__dirname, "../js/game.js"), "utf8");
["剧情解锁 · 数值激活", "剧情门槛", "数值门槛", "点数只决定本次能否取得", "数值回写"].forEach((text) => {
  assert(gameSource.includes(text), `player-facing activation explanation missing: ${text}`);
});

console.log("story activation check ok (collection order, visible gates, deterministic survival, reserve feedback)");
