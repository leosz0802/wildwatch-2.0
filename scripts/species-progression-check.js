const { createInitialWorld } = require("../js/world");
const { simulateDay, reserveProgressionFor, CHAPTER_PROGRESSION_GATES } = require("../js/simulator");
const { Game } = require("../js/game");
const {
  CHAPTERS,
  SPECIES_DB,
  getUnlockedSpecies,
  speciesStoryChapter,
  reconcileSpeciesPopulations,
  speciesPopulation,
  speciesPopulationGroup
} = require("../js/animalWorld");
const {
  normalizeChapterRescue,
  addRescueItem,
  rescueAnimal,
  livingAnimalTotal
} = require("../js/chapterRescueSystem");
const { chapterTargets, beginChapterAnimalCheckpoint, chapterAnimalTotal, chapterSpeciesCount } = require("../js/chapterTargets");
const { recordIncrease } = require("../js/animalSourceLedger");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeState() {
  return {
    world: createInitialWorld(),
    character: { role: "warden", location: "中央混交林" },
    reports: [],
    messages: []
  };
}

function nextState(state, command) {
  const result = simulateDay(command, state);
  return {
    world: result.world,
    character: result.character,
    reports: (state.reports || []).concat(result.reports || []).slice(-12),
    messages: []
  };
}

const speciesIds = Object.keys(SPECIES_DB);
const chapterSpecies = CHAPTERS.flatMap((chapter) => chapter.newSpecies);
const chapterSpeciesSet = new Set(chapterSpecies);
assert(chapterSpeciesSet.size <= speciesIds.length,
  `chapter unlocks (${chapterSpeciesSet.size}) cannot exceed the current species roster (${speciesIds.length})`);
assert(chapterSpecies.every((id) => Object.prototype.hasOwnProperty.call(SPECIES_DB, id)),
  "chapter unlocks should reference only catalog species");
const implicitSpecies = speciesIds.filter((id) => !chapterSpeciesSet.has(id));
assert(implicitSpecies.every((id) => SPECIES_DB[id].unlockLevel === 1
  || speciesStoryChapter(id) <= CHAPTERS.length),
  `unassigned species must be intentional starter or late-story content: ${implicitSpecies.join(", ")}`);
const levelSevenExpected = speciesIds.filter((id) => {
  const species = SPECIES_DB[id];
  return Number(species.unlockLevel || 1) <= 7
    && Number(species.unlockChapter || 0) <= 7;
}).length;
assert(getUnlockedSpecies(7).length === levelSevenExpected,
  `level 7 should unlock ${levelSevenExpected} species before later chapter content`);
assert(getUnlockedSpecies(7, CHAPTERS.length).length === speciesIds.length,
  `the final chapter should unlock the full ${speciesIds.length}-species roster`);

let state = makeState();
let reserve = state.world.reserve;
assert(reserve.progression.level === 1, "new reserve should start at level 1");
assert(getUnlockedSpecies(1).length === 7, "level 1 should unlock seven starter species");
assert(new Set(state.world.knownCharacters.map((animal) => animal.species)).size === 7, "level 1 sandbox should show exactly seven species");
speciesIds.forEach((id) => {
  const sp = SPECIES_DB[id];
  const pop = speciesPopulation(reserve, id);
  if (sp.unlockLevel > 1 || (sp.unlockChapter && sp.unlockChapter > 1)) {
    assert(pop === 0, `${id} should not exist before unlock`);
  }
});
assert(speciesPopulation(reserve, "deer") > 0, "deer should have a starter population");

const oldRandom = Math.random;
let randomIndex = 0;
const randomValues = [0.10, 0.90, 0.24, 0.76, 0.38, 0.62];
Math.random = () => randomValues[randomIndex++ % randomValues.length];
try {
  const commands = ["派猎犬侦察", "驱赶偷猎者", "修复水源和草场"];
  const levels = [];
  for (let day = 1; day <= 40; day += 1) {
    const before = state.world.reserve;
    state = nextState(state, commands[day % commands.length]);
    reserve = state.world.reserve;
    levels.push(reserve.progression.level);
    assert(reserve.progression.progress === Math.min(
      reserve.progression.actionProgress,
      reserve.progression.choiceProgress,
      reserve.progression.majorChoiceProgress,
      reserve.progression.scoreProgress,
      reserve.progression.storyProgress == null ? 1 : reserve.progression.storyProgress,
      reserve.progression.milestoneProgress
    ), `combined progress is incorrect on day ${day}`);
    assert(reserve.progression.level >= before.progression.level, `level regressed on day ${day}`);
    assert(reserve.progression.level <= before.progression.level + 1, `level skipped on day ${day}`);
    const allowedSpecies = getUnlockedSpecies(reserve.progression.level, reserve.progression.stage).map((species) => species.name).sort();
    const sandboxSpecies = state.world.knownCharacters.map((animal) => animal.species).sort();
    assert(JSON.stringify(sandboxSpecies) === JSON.stringify(allowedSpecies), `sandbox species do not match level ${reserve.progression.level} unlocks on day ${day}`);
    speciesIds.forEach((id) => {
      const sp = SPECIES_DB[id];
      const pop = speciesPopulation(reserve, id);
      assert(pop >= 0 && pop <= sp.maxPop, `${id} population out of capacity: ${pop}/${sp.maxPop}`);
      if (sp.unlockLevel > reserve.progression.level) assert(pop === 0, `${id} appeared before level ${sp.unlockLevel}`);
      const expectedDelta = pop - speciesPopulation(before, id);
      assert(reserve.speciesChanges[id] === expectedDelta, `${id} delta should match the actual population change`);
    });
  }
  assert(levels.every((level) => level === 1), "repeated operations without strategy, story and milestones must not rush upgrades");
} finally {
  Math.random = oldRandom;
}

const chapterMinutes = Object.values(CHAPTER_PROGRESSION_GATES).map((gate) => gate.expectedMinutes);
assert(chapterMinutes.length === CHAPTERS.length,
  `each current chapter should have one operating time target (${CHAPTERS.length}), got ${chapterMinutes.length}`);
assert(chapterMinutes.every((minutes, index) => Number.isFinite(minutes) && minutes > 0
  && (index === 0 || minutes >= chapterMinutes[index - 1])),
  "chapter time targets should be positive and nondecreasing");
Object.values(CHAPTER_PROGRESSION_GATES).forEach((gate) => {
  const fixture = makeState().world.reserve;
  fixture.chapterRescue = Object.assign({}, fixture.chapterRescue || {}, { enforceCompletion: false });
  fixture.safety = 100;
  fixture.stability = 100;
  fixture.reputation = 100;
  fixture.poacherPressure = 0;
  fixture.ecology.water = 100;
  fixture.ecology.grass = 100;
  fixture.ecology.herbivores.deer = 120;
  fixture.ecology.herbivores.antelope = 150;
  fixture.ecology.herbivores.hare = 200;
  fixture.guardianRun.score = 100;
  Object.assign(fixture.progression, { level: gate.storyLevel, stage: gate.stage, displayChapter: gate.stage });
  beginChapterAnimalCheckpoint(fixture, gate.stage, gate.stage === 1 ? 0 : chapterTargets(gate.stage - 1).animals);
  normalizeChapterRescue(fixture, gate.stage, { fresh: true });
  reconcileSpeciesPopulations(fixture, { removeLocked: true, initializeUnlocked: true });
  (normalizeChapterRescue(fixture, gate.stage).targets || []).forEach((record) => {
    (record.requiredItems || []).forEach((itemId) => addRescueItem(fixture, itemId));
    rescueAnimal(fixture, record.targetId);
  });
  reconcileSpeciesPopulations(fixture, { removeLocked: true, initializeUnlocked: true });
  const liveTarget = chapterTargets(gate.stage);
  Object.keys(SPECIES_DB).forEach((id) => {
    if (chapterSpeciesCount(fixture) >= liveTarget.species) return;
    const group = speciesPopulationGroup(id);
    const bucket = fixture.ecology[group] || (fixture.ecology[group] = {});
    if (!(Number(bucket[id]) > 0)) bucket[id] = 1;
  });
  const animalGap = Math.max(0, liveTarget.animals - chapterAnimalTotal(fixture));
  if (animalGap) recordIncrease(fixture, "tasked", animalGap);
  if (gate.stage >= 10) {
    fixture.rareAnimal = Object.assign({}, fixture.rareAnimal || {}, { status: "resident", speciesId: "pangolin", health: 72 });
  }
  fixture.development = fixture.development || {};
  fixture.development.operations = Object.assign({}, fixture.development.operations || {}, {
    totalVisitors: liveTarget.visitors
  });
  fixture.development.operations.visitorLedger = Object.assign({}, (fixture.development.operations.visitorLedger || {}), {
    totalVisitors: liveTarget.visitors
  });
  fixture.progression = Object.assign({}, fixture.progression, {
    level: gate.storyLevel,
    stage: gate.stage,
    daysManaged: gate.actions,
    totalActions: gate.actions,
    totalMeaningfulActions: gate.actions,
    totalStrategicChoices: gate.strategicChoices,
    totalMajorStrategicChoices: gate.majorChoices,
    activeSeconds: Math.max(5, gate.expectedMinutes || 0) * 60,
    totalFundEarned: gate.fundEarned,
    totalMigratedIn: gate.migratedIn,
    totalRareRecovered: gate.rareRecovered,
    stageStart: { stage: gate.stage, level: gate.storyLevel, daysManaged: 0, totalActions: 0, totalMeaningfulActions: 0, totalStrategicChoices: 0, totalMajorStrategicChoices: 0, activeSeconds: 0, totalFundEarned: 0, totalMigratedIn: 0, totalRareRecovered: 0 },
    chapterStart: {
      stage: gate.stage,
      totalVisitors: liveTarget.visitors,
      inheritedVisitors: liveTarget.visitors,
      visitorLedger: { totalVisitors: liveTarget.visitors, migratedVisitors: 0, recruitedVisitors: 0, facilityVisitors: 0 }
    }
  });
  fixture.strategy.totalMeaningfulActions = gate.actions;
  fixture.strategy.totalChoices = gate.strategicChoices;
  fixture.strategy.totalMajorChoices = gate.majorChoices;
  fixture.eventChain = { chapterLevel: gate.storyLevel, step: gate.storyBeats, length: 7, completed: gate.storyBeats >= 5 };
  const completed = reserveProgressionFor(fixture);
  const nextGate = CHAPTER_PROGRESSION_GATES[gate.stage + 1];
  if (nextGate) {
    assert(completed.stage === nextGate.stage, `stage ${gate.stage} should advance after operations, strategy, story and milestones are met`);
    const expectedNextLevel = Math.min(7, Math.max(1, Math.ceil(nextGate.stage / 2)));
    assert(completed.level === expectedNextLevel, `stage ${gate.stage} should map to story level ${expectedNextLevel}`);
  } else {
    assert(completed.stage === CHAPTERS.length,
      `the final current chapter should remain at stage ${CHAPTERS.length}`);
  }
  const expectedTime = (completed.objectives || []).find((item) => item.id === "expectedTime");
  assert(completed.stage !== gate.stage || completed.chapterComplete || (expectedTime && expectedTime.optional), `stage ${gate.stage} time forecast must never become a hard gate`);
});

const damaged = JSON.parse(JSON.stringify(reserve));
damaged.safety = 10;
damaged.poacherPressure = 95;
damaged.ecology.water = 10;
damaged.ecology.grass = 10;
assert(reserveProgressionFor(damaged).level >= reserve.progression.level, "protection level should never relock unlocked species");

const seenGroups = {};
speciesIds.forEach((id) => {
  const group = speciesPopulationGroup(id);
  assert(["predators", "herbivores", "birds"].includes(group), `${id} has invalid population group`);
  seenGroups[id] = group;
});
assert(seenGroups.eagle === "birds", "eagle should be counted once in birds");
assert(SPECIES_DB.boar.ecoRole === "omnivore_engineer", "wild boar should be an omnivore/engineer");
assert(SPECIES_DB.owl.ecoRole === "mesopredator", "owl should be a predator");
assert(SPECIES_DB.elephant.tier === 2 && SPECIES_DB.hippo.tier === 2, "large herbivores should not be apex predators");

const game = Object.create(Game.prototype);
const levelBefore = makeState().world.reserve;
const levelAfter = JSON.parse(JSON.stringify(levelBefore));
levelAfter.progression = Object.assign({}, levelAfter.progression, { level: 2, title: "稳定保护站" });
const levelBreakthrough = game.detectReserveBreakthrough(levelBefore, levelAfter);
assert(levelBreakthrough && levelBreakthrough.kind === "level_up", "level up should trigger a breakthrough popup");
assert(/鹰/.test(levelBreakthrough.body) && /熊/.test(levelBreakthrough.body), "level popup should name newly unlocked species");

const firstAfter = JSON.parse(JSON.stringify(levelBefore));
firstAfter.guardianRun.completedDays = 1;
const firstBreakthrough = game.detectReserveBreakthrough(levelBefore, firstAfter);
assert(firstBreakthrough && firstBreakthrough.kind === "first_patrol", "first patrol should trigger a breakthrough popup");

console.log("species progression check ok");
