const { createCharacter } = require("../js/storage");
const { simulateDay, CHAPTER_PROGRESSION_GATES } = require("../js/simulator");
const { reserveActionById } = require("../js/actions");
const { CHAPTERS, SPECIES_DB, getUnlockedSpecies } = require("../js/animalWorld");
const { CASES, ITEMS, ENDINGS, itemsForCase } = require("../js/collectionSystem");
const { GUARDIAN_PROMISES } = require("../js/guardianPromises");
const { facilityByCaseId } = require("../js/reserveFacilities");
const { Game } = require("../js/game");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(CHAPTERS.length === 20, `expected twenty chapters, found ${CHAPTERS.length}`);
const expectedSpeciesCounts = [7, 11, 15, 19, 21, 23, 25];
const seenSpecies = new Set();
CHAPTERS.forEach((chapter, index) => {
  const expected = index + 1;
  assert(chapter.chapter === expected, `chapter ${expected} index mismatch`);
  assert(chapter.level >= 1 && chapter.level <= 7, `chapter ${expected} level is out of range`);
  if (index > 0) assert(chapter.level >= CHAPTERS[index - 1].level, `chapter ${expected} level order regressed`);
  assert(chapter.title && chapter.subtitle && chapter.story && chapter.keyAnimalQuote, `chapter ${expected} narrative is incomplete`);
  assert(Array.isArray(chapter.newSpecies), `chapter ${expected} newSpecies must be an array`);
  chapter.newSpecies.forEach((id) => {
    assert(SPECIES_DB[id], `chapter ${expected} references unknown species ${id}`);
    assert(SPECIES_DB[id].representative && SPECIES_DB[id].representative.name, `${id} has no named representative`);
    assert(!seenSpecies.has(id), `${id} is introduced by more than one chapter`);
    seenSpecies.add(id);
  });
});
assert(seenSpecies.size === Object.keys(SPECIES_DB).length, "species database contains an unassigned chapter species");

const expectedUnlockedSpeciesCounts = [7, 11, 15, 19, 21, 23, 25];
expectedUnlockedSpeciesCounts.forEach((count, level) => {
  const chapterLevel = level + 1;
  assert(getUnlockedSpecies(chapterLevel).length === count, `Lv.${chapterLevel} species count mismatch`);
  const stages = [CHAPTER_PROGRESSION_GATES[chapterLevel * 2 - 1], CHAPTER_PROGRESSION_GATES[chapterLevel * 2]];
  assert(stages.every((gate) => gate.storyLevel === chapterLevel), `chapter ${chapterLevel} should own two operating stages`);
  assert(stages.every((gate) => gate.actions > 0 && gate.strategicChoices > 0), `chapter ${chapterLevel} operating gates are incomplete`);
});

assert(CASES.length === 6 && ITEMS.length === 45, `collection matrix mismatch: ${CASES.length} cases / ${ITEMS.length} items`);
CASES.forEach((caseDef) => {
  const items = itemsForCase(caseDef.id);
  if (caseDef.hidden) {
    assert(items.length === 5, "hidden archive must contain five memories");
    return;
  }
  assert(items.length === 8, `${caseDef.id} must contain eight collectibles`);
  assert(items.filter((item) => item.condition.finale).length === 1, `${caseDef.id} must contain exactly one finale collectible`);
  assert((ENDINGS[caseDef.id] || []).length === 3, `${caseDef.id} must offer three endings`);
  assert(facilityByCaseId(caseDef.id), `${caseDef.id} has no facility restoration outcome`);
});
assert(new Set(ITEMS.map((item) => item.id)).size === ITEMS.length, "collection item ids are not unique");

assert(GUARDIAN_PROMISES.length === 5, `expected five legacy guardian promises, found ${GUARDIAN_PROMISES.length}`);
GUARDIAN_PROMISES.forEach((promise, index) => {
  assert(promise.chapter === index + 1, `guardian promise chapter order mismatch at ${index + 1}`);
  assert(promise.choices.length === 3, `chapter ${promise.chapter} guardian promise must have three choices`);
  promise.choices.forEach((choice) => {
    assert(choice.primaryBenefit && choice.primaryCost && choice.longTerm, `${promise.id}/${choice.id} lacks benefit, cost or lasting consequence`);
    assert(choice.immediateEffects && Object.keys(choice.immediateEffects).length, `${promise.id}/${choice.id} lacks immediate effects`);
  });
});

const storyGame = Object.create(Game.prototype);
storyGame.state = createCharacter(null, "保护区卫士");
storyGame.chapterArt = {};
storyGame.chapterStorySeen = () => false;
CHAPTERS.forEach((chapter) => {
  const start = storyGame.buildChapterStory(chapter.chapter, "start");
  const end = storyGame.buildChapterStory(chapter.chapter, "end");
  assert(start.chapter.keyAnimal === chapter.keyAnimal && end.chapter.keyAnimal === chapter.keyAnimal, `chapter ${chapter.level} story lost its main animal`);
  assert(start.phase === "start" && end.phase === "end", `chapter ${chapter.level} story phase mismatch`);
});

const missionFixtures = [
  ["guard", "houndScout", "派猎犬侦察：确认边界脚印", 2],
  ["guard", "antiPoacher", "驱赶偷猎者：封锁可疑路线", 2],
  ["guard", "habitat", "修复水源和草场", 2],
  ["economy", "salvage", "出售仓库里的回收物", 1],
  ["economy", "buySupplies", "采购狗粮包", 1],
  ["animal", "exploreMaterials", "跟随动物探索自然遗留", 1]
];
missionFixtures.forEach(([kind, actionId, command, steps]) => {
  let state = createCharacter(null, "保护区卫士");
    state.world.reserve.fund = 3000;
  state.world.reserve.supplies.dogFood = 10;
  state.world.reserve.supplies.alarm = 10;
  state.world.reserve.supplies.tranquilizer = 10;
    state.world.reserve.inventory.researchSample = 2;
  const dailyObjectives = state.world.goals.daily.objectives;
  const objective = dailyObjectives.find((item) => item.kind === kind);
  assert(objective, `${kind} V3 objective is missing`);
  // Daily tasks are intentionally single-active: unlock the fixture's target
  // only after its earlier tasks have been completed.
  const targetIndex = dailyObjectives.findIndex((item) => item.kind === kind);
  dailyObjectives.slice(0, targetIndex).forEach((item) => {
    item.progress = item.target || 1;
    item.complete = true;
  });
  for (let step = 0; step < steps; step += 1) state = simulateDay(command, state);
  const completed = state.world.goals.daily.objectives.find((item) => item.kind === kind);
  assert(completed && completed.complete, `${kind}/${actionId} completed without advancing the V3 objective`);
  const next = state.world.goals.active.primary;
  assert(next && next.id && next.title && next.recommendedAction, `${kind}/${actionId} did not generate the next executable goal`);
  assert(reserveActionById(next.recommendedAction), `${kind}/${actionId} generated an unreachable action ${next.recommendedAction}`);
});

const stageMinutes = Object.values(CHAPTER_PROGRESSION_GATES).map((gate) => gate.expectedMinutes);
assert(stageMinutes.join(",") === "5,20,30,35,40,45,50,55,60,60,65,70,75,80,86,92,98,104,110,120", "twenty-stage time forecast should remain stable");
console.log("story/system consistency check ok (20 story chapters / 20 operating stages, 45 collectibles, 5 promises, 6 mission paths)");
