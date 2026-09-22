const assert = require("node:assert/strict");
const { createCharacter, normalizeReserve } = require("../js/storage");
const {
  CHAPTERS,
  SPECIES_DB,
  getUnlockedSpecies,
  reconcileSpeciesPopulations,
  speciesPopulationGroup
} = require("../js/animalWorld");
const { BALANCE_V2 } = require("../js/balanceConfig");
const { chapterTargets } = require("../js/chapterTargets");
const { normalizeChapterRescue } = require("../js/chapterRescueSystem");

const total = reserve => ["predators", "herbivores", "birds"]
  .reduce((sum, group) => sum + Object.values((reserve.ecology || {})[group] || {})
    .reduce((subtotal, value) => subtotal + Math.max(0, Number(value) || 0), 0), 0);

function typicalEffectiveCapacity(level, limiting = 52) {
  const base = BALANCE_V2.population.carryingCapacity[level] || BALANCE_V2.population.carryingCapacity[7];
  const factor = Math.max(0.42, Math.min(1.15, 0.62 + limiting * 0.0065));
  return Math.round(base * factor);
}

let previousTarget = 0;
for (let chapter = 1; chapter <= 20; chapter++) {
  const definition = CHAPTERS[chapter - 1];
  const target = chapterTargets(chapter).animals;
  const unlocked = getUnlockedSpecies(definition.level, chapter);
  const speciesMaximum = unlocked.reduce((sum, species) => sum + Math.max(0, Number(species.maxPop) || 0), 0);
  const ecologicalMaximum = Math.floor(BALANCE_V2.population.carryingCapacity[definition.level] * 1.15);
  assert(target > previousTarget, `chapter ${chapter}: cumulative animal target must strictly increase`);
  assert(target <= speciesMaximum, `chapter ${chapter}: target exceeds species maximum`);
  assert(target <= ecologicalMaximum, `chapter ${chapter}: target exceeds healthy habitat capacity`);
  if (chapter === 9) {
    const playableCap = typicalEffectiveCapacity(definition.level, 50);
    assert(target <= playableCap, `chapter ${chapter}: animal target ${target} exceeds typical water/grass capacity ${playableCap}`);
    assert(target - previousTarget <= 70, `chapter ${chapter}: animal jump ${target - previousTarget} is larger than a mink/fox rescue plus modest growth`);
  }
  if (chapter === 10) {
    const playableCap = typicalEffectiveCapacity(definition.level, 52);
    assert(target >= 780 && target <= 840, `chapter ${chapter}: animal target ${target} should sit in the 780–840 typical-capacity band`);
    assert(target <= playableCap, `chapter ${chapter}: animal target ${target} exceeds typical water/grass capacity ${playableCap}`);
  }
  if (chapter > 10) assert(target - previousTarget >= 15 && target - previousTarget <= 25,
    `chapter ${chapter}: late cumulative increment must stay tightly balanced`);
  previousTarget = target;
}

const state = createCharacter(null, "跨章种群继承");
const reserve = state.world.reserve;
Object.assign(reserve.progression, { stage: 1, displayChapter: 1, level: CHAPTERS[0].level });
normalizeChapterRescue(reserve, 1, { fresh: true });

for (let chapter = 1; chapter < 20; chapter++) {
  const currentRescue = normalizeChapterRescue(reserve, chapter);
  currentRescue.targets.forEach(record => {
    record.status = "rescued";
    record.rescuedAt = chapter * 1000;
    const species = SPECIES_DB[record.speciesId];
    const group = speciesPopulationGroup(record.speciesId);
    reserve.ecology[group][record.speciesId] = Math.max(1, Number(species.initialPop) || 1);
  });
  getUnlockedSpecies(CHAPTERS[chapter - 1].level, chapter).forEach(species => {
    const group = speciesPopulationGroup(species.id);
    if (Number(reserve.ecology[group][species.id]) > 0) {
      reserve.ecology[group][species.id] = Math.min(species.maxPop, reserve.ecology[group][species.id] + 1);
    }
  });

  const beforeTotal = total(reserve);
  const beforeSpecies = {};
  ["predators", "herbivores", "birds"].forEach(group => {
    Object.entries(reserve.ecology[group] || {}).forEach(([id, count]) => {
      if (Number(count) > 0) beforeSpecies[id] = count;
    });
  });

  const next = chapter + 1;
  Object.assign(reserve.progression, { stage: next, displayChapter: next, level: CHAPTERS[next - 1].level });
  reconcileSpeciesPopulations(reserve, { removeLocked: true, initializeUnlocked: true });
  normalizeChapterRescue(reserve, next);
  Object.entries(beforeSpecies).forEach(([id, count]) => {
    const group = speciesPopulationGroup(id);
    assert.equal(reserve.ecology[group][id], count, `chapter ${chapter}->${next}: ${id} population was reset`);
  });
  assert(total(reserve) >= beforeTotal, `chapter ${chapter}->${next}: total population decreased during promotion`);

  const loaded = normalizeReserve(JSON.parse(JSON.stringify(reserve)));
  Object.entries(beforeSpecies).forEach(([id, count]) => {
    const group = speciesPopulationGroup(id);
    assert.equal(loaded.ecology[group][id], count, `chapter ${next} reload reset inherited ${id}`);
  });
}

console.log("chapter population carryover ok: 20 strictly increasing targets, healthy capacity bounds, 19 promotions and save reloads");
