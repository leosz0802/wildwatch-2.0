const { createCharacter } = require("../js/storage");
const { Game } = require("../js/game");
const {
  normalizeLifeMemory,
  advanceLifeMemory,
  bindStrategicIndividual,
  strategicAnimalOutcomePreview,
  applyStrategicAnimalConsequence
} = require("../js/emotionSystem");
const {
  normalizeStrategyState,
  strategicDilemmaById,
  applyStrategicChoice
} = require("../js/strategySystem");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function prepare(world, dilemmaId, day = 12) {
  world.day = day;
  world.lifeMemory = normalizeLifeMemory(world);
  const dilemma = strategicDilemmaById(dilemmaId);
  const pending = { id: dilemmaId, tier: "major", day, actionIndex: day, chapter: Math.max(1, world.reserve.progression.level || 1), occurrence: 1 };
  const binding = bindStrategicIndividual(world, dilemma, pending);
  world.lifeMemory = binding.state;
  world.reserve.strategy = normalizeStrategyState(Object.assign({}, world.reserve.strategy, { pendingDilemma: binding.pending }));
  return { dilemma, friend: binding.individual, pending: binding.pending };
}

function resolve(world, dilemmaId, choiceId, dice = null) {
  const result = applyStrategicChoice(world.reserve, dilemmaId, choiceId, dice);
  assert(result && !result.requiresDice, `${dilemmaId}.${choiceId} should settle`);
  const animal = applyStrategicAnimalConsequence(world, result);
  assert(animal && animal.history.permanent, `${dilemmaId}.${choiceId} should leave a permanent named-animal consequence`);
  return { result, animal };
}

// Every major decision binds a visible named friend and saves that identity before settlement.
let world = createCharacter(null, "保护区卫士").world;
let setup = prepare(world, "water_access");
assert(setup.friend && setup.pending.namedIndividual.id === setup.friend.id, "major event should bind one named friend");
assert(/永久|健康|信任/.test(strategicAnimalOutcomePreview(world, setup.dilemma, setup.dilemma.choices[0], setup.pending.namedIndividual)), "choice preview should disclose the named permanent consequence");
const persistedPending = normalizeStrategyState(clone(world.reserve.strategy)).pendingDilemma;
assert(persistedPending.namedIndividual.id === setup.friend.id, "bound friend should survive save restoration");

// Safe choice changes health/trust, enters both the strategy record and permanent archive, and is stable after normalization.
const safeBefore = clone(setup.friend);
let settled = resolve(world, "water_access", "hide_springs");
assert(settled.result.record.namedIndividual.id === safeBefore.id, "strategy history should record the participating friend");
assert(settled.animal.individual.bond > safeBefore.bond, "safe protection should improve the friend's trust");
assert(settled.animal.individual.permanentFlags.length === 1, "permanent trait should be stored on the individual");
assert(world.lifeMemory.permanentConsequences.some((item) => item.individualId === safeBefore.id), "permanent consequence archive is missing");
assert(world.lifeMemory.memories.some((item) => item.type === "strategic_permanent" && item.individualId === safeBefore.id), "permanent memory entry is missing");
const speciesCharacter = world.knownCharacters.find((item) => item.species === settled.animal.individual.species);
assert(speciesCharacter && speciesCharacter.memory.some((line) => line.includes(settled.animal.individual.name)), "later animal dialogue should remember the named strategic choice");
const settledBond = settled.animal.individual.bond;
world.lifeMemory = normalizeLifeMemory(world);
assert(world.lifeMemory.individuals.find((item) => item.id === safeBefore.id).bond === settledBond, "trust must not double-apply after save normalization");

// A high-risk failure causes injury and a permanent health-cap scar that normal recovery cannot erase.
let riskWorld = createCharacter(null, "保护区卫士").world;
setup = prepare(riskWorld, "rare_route", 20);
const riskyBefore = clone(setup.friend);
settled = resolve(riskWorld, "rare_route", "publish_route", { roll: 1, routeModifier: 0, resourceModifier: 0 });
assert(!settled.result.dice.success, "roll 1 should reach the failure branch");
assert(settled.animal.individual.healthCap === riskyBefore.healthCap - 12, "risky failure should permanently reduce health cap by 12");
assert(settled.animal.individual.status === "departed", "publishing the route on failure should make the named friend leave");
assert(settled.animal.individual.returnBlockedUntilDay === riskWorld.day + 12, "departure should have a real return lockout");
const scarCap = settled.animal.individual.healthCap;
for (let index = 0; index < 6; index += 1) {
  const before = clone(riskWorld);
  riskWorld.day += 1;
  riskWorld.reserve.safety = 90;
  riskWorld.reserve.stability = 90;
  riskWorld.reserve.ecology.water = 90;
  riskWorld.reserve.ecology.grass = 90;
  riskWorld.reserve.ecology.disease = 0;
  riskWorld.reserve.migration = { trend: "in", delta: 2, reason: "安全恢复" };
  const step = advanceLifeMemory(before, riskWorld, { actionId: "habitat" });
  riskWorld.lifeMemory = step.state;
}
let scarred = riskWorld.lifeMemory.individuals.find((item) => item.id === riskyBefore.id);
assert(scarred.status === "departed", "friend must not return before the permanent consequence lockout ends");
assert(scarred.healthCap === scarCap, "ordinary recovery must not erase a strategic health-cap scar");

// A low-health friend can die in a lethal major decision and remains in the archive after many days.
let lethalWorld = createCharacter(null, "保护区卫士").world;
setup = prepare(lethalWorld, "disease_response", 30);
let fragile = lethalWorld.lifeMemory.individuals.find((item) => item.id === setup.friend.id);
fragile.health = 30;
lethalWorld.reserve.strategy.pendingDilemma.namedIndividual.health = 30;
settled = resolve(lethalWorld, "disease_response", "field_clinics", { roll: 1, routeModifier: 0, resourceModifier: 0 });
assert(settled.animal.individual.status === "dead" && settled.animal.individual.health === 0, "lethal failure should be able to kill a vulnerable named friend");
for (let index = 0; index < 100; index += 1) {
  const before = clone(lethalWorld);
  lethalWorld.day += 1;
  const step = advanceLifeMemory(before, lethalWorld, { actionId: "houndScout" });
  lethalWorld.lifeMemory = step.state;
}
assert(lethalWorld.lifeMemory.individuals.some((item) => item.id === setup.friend.id && item.status === "dead"), "dead named friend should remain in the 100-day archive");
assert(lethalWorld.lifeMemory.memories.some((item) => item.individualId === setup.friend.id && item.type === "strategic_permanent"), "death must not delete the strategic memory");
const deadFriendId = setup.friend.id;
const legacyDilemma = strategicDilemmaById("disease_corridor");
const legacyBinding = bindStrategicIndividual(lethalWorld, legacyDilemma, { id: legacyDilemma.id, tier: "major", day: lethalWorld.day, actionIndex: lethalWorld.day, chapter: 3, occurrence: 1 });
assert(legacyBinding.individual.id === deadFriendId && legacyBinding.individual.status === "dead", "follow-up chain should keep a dead friend's name instead of silently replacing it");
assert(/已离世|名字/.test(strategicAnimalOutcomePreview(lethalWorld, legacyDilemma, legacyDilemma.choices[0], legacyBinding.pending.namedIndividual)), "dead friend's follow-up preview should explain the irreversible legacy");
lethalWorld.lifeMemory = legacyBinding.state;
lethalWorld.reserve.strategy.pendingDilemma = legacyBinding.pending;
const legacyResult = resolve(lethalWorld, "disease_corridor", "corridor_zones");
assert(legacyResult.animal.individual.status === "dead" && legacyResult.animal.individual.health === 0, "a later choice must never resurrect a dead friend");
assert(/名字|离世/.test(legacyResult.animal.memory.body), "follow-up settlement should carry the friend's legacy in its narrative");

// A chained major event reuses the same friend, so the second choice continues a relationship instead of selecting a random animal.
let chainWorld = createCharacter(null, "保护区卫士").world;
setup = prepare(chainWorld, "water_access", 14);
const chainFriendId = setup.friend.id;
resolve(chainWorld, "water_access", "hide_springs");
chainWorld.day = 28;
const followup = strategicDilemmaById("water_governance");
const chainBinding = bindStrategicIndividual(chainWorld, followup, { id: followup.id, tier: "major", day: 28, actionIndex: 28, chapter: 2, occurrence: 1 });
assert(chainBinding.individual.id === chainFriendId, "follow-up event chain should keep the same named friend");
chainWorld.lifeMemory = chainBinding.state;
chainWorld.reserve.strategy.pendingDilemma = chainBinding.pending;
resolve(chainWorld, "water_governance", "water_committee");
const chainFriend = chainWorld.lifeMemory.individuals.find((item) => item.id === chainFriendId);
assert(chainFriend.strategicHistory.length === 2, "same friend should accumulate both linked permanent choices");

// Player-facing major-event UI foregrounds the friend and the exact permanent settlement.
const game = new Game();
game.stopLoop();
game.render = () => {};
game.state = createCharacter(null, "保护区卫士");
game.state.world.reserve.strategy = normalizeStrategyState({ pendingDilemma: { id: "water_access", tier: "major", day: 8, actionIndex: 8, chapter: 1, occurrence: 1 } });
game.infoDetailModal = null;
assert(game.openPendingStrategicDilemma(), "major event popup should open");
assert(game.infoDetailModal.namedIndividual && game.infoDetailModal.choiceCards.every((card) => /安全感/.test(card.animalText) && /野性/.test(card.animalText)), "all major choice cards should show both named-animal relationship axes");
const uiFriendId = game.infoDetailModal.namedIndividual.id;
game.selectStrategicDilemmaChoice("water_access", "hide_springs");
game.confirmStrategicChoice("water_access", "hide_springs");
assert(game.infoDetailModal.items.some((item) => item.tag === "永久后果" && /安全感.*→.*野性.*→/.test(item.title)), "settlement popup should show exact security/wildness changes first");
const uiFriend = game.state.world.lifeMemory.individuals.find((item) => item.id === uiFriendId);
game.openNamedIndividual(uiFriend);
assert(game.infoDetailModal.items.some((item) => item.tag === "永久后果"), "named-friend detail should expose the permanent consequence later");
const memoryDetail = game.buildLifeMemoryDetail();
assert(memoryDetail.items.some((item) => item.tag === "永久后果"), "reserve memory should surface major strategic consequences");

console.log("strategic animal consequence check ok (binding, chain, scars, departure, death, persistence, UI)");
