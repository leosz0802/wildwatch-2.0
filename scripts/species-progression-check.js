const { createInitialWorld } = require("../js/world");
const { simulateDay, reserveProgressionFor, CHAPTER_PROGRESSION_GATES } = require("../js/simulator");
const { Game } = require("../js/game");
const {
  CHAPTERS,
  SPECIES_DB,
  getUnlockedSpecies,
  speciesPopulation,
  speciesPopulationGroup
} = require("../js/animalWorld");

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
assert(speciesIds.length === 21, `expected 21 species, got ${speciesIds.length}`);
assert(new Set(chapterSpecies).size === speciesIds.length, "chapter unlocks should cover every species exactly once");

let state = makeState();
let reserve = state.world.reserve;
assert(reserve.progression.level === 1, "new reserve should start at level 1");
assert(getUnlockedSpecies(1).length === 7, "level 1 should unlock seven starter species");
assert(new Set(state.world.knownCharacters.map((animal) => animal.species)).size === 7, "level 1 sandbox should show exactly seven species");
speciesIds.forEach((id) => {
  const sp = SPECIES_DB[id];
  const pop = speciesPopulation(reserve, id);
  if (sp.unlockLevel === 1) assert(pop > 0, `${id} should have a starter population`);
  else assert(pop === 0, `${id} should not exist before unlock`);
});

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
    const allowedSpecies = getUnlockedSpecies(reserve.progression.level).map((species) => species.name).sort();
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
assert(chapterMinutes.join(",") === "10,20,30,35,40,45,50,55,60,60", "operating stages should follow the agreed 10-to-60-minute staircase");
Object.values(CHAPTER_PROGRESSION_GATES).forEach((gate) => {
  const fixture = makeState().world.reserve;
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
  fixture.progression = Object.assign({}, fixture.progression, {
    level: gate.storyLevel,
    stage: gate.stage,
    daysManaged: gate.actions,
    totalActions: gate.actions,
    totalMeaningfulActions: gate.actions,
    totalStrategicChoices: gate.strategicChoices,
    totalMajorStrategicChoices: gate.majorChoices,
    activeSeconds: 0,
    totalFundEarned: gate.fundEarned,
    totalMigratedIn: gate.migratedIn,
    totalRareRecovered: gate.rareRecovered,
    stageStart: { stage: gate.stage, level: gate.storyLevel, daysManaged: 0, totalActions: 0, totalMeaningfulActions: 0, totalStrategicChoices: 0, totalMajorStrategicChoices: 0, activeSeconds: 0, totalFundEarned: 0, totalMigratedIn: 0, totalRareRecovered: 0 }
  });
  fixture.strategy.totalMeaningfulActions = gate.actions;
  fixture.strategy.totalChoices = gate.strategicChoices;
  fixture.strategy.totalMajorChoices = gate.majorChoices;
  fixture.eventChain = { chapterLevel: gate.storyLevel, step: gate.storyBeats, length: 7, completed: gate.storyBeats >= 7 };
  const completed = reserveProgressionFor(fixture);
  if (gate.stage < 10) {
    assert(completed.stage === gate.stage + 1, `stage ${gate.stage} should advance after operations, strategy, story and milestones are met`);
    assert(completed.level === Math.ceil((gate.stage + 1) / 2), `stage ${gate.stage} should map to the correct story level`);
  } else {
    assert(completed.stage === 10 && completed.chapterComplete, "stage 10 should mark final completion after all gates are met");
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
