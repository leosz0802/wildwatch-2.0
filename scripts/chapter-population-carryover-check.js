const assert = require("node:assert/strict");
const { createCharacter, normalizeReserve } = require("../js/storage");
const {
  CHAPTERS,
  SPECIES_DB,
  getUnlockedSpecies,
  reconcileSpeciesPopulations,
  speciesPopulationGroup
} = require("../js/animalWorld");
const { chapterTargets } = require("../js/chapterTargets");
const { normalizeChapterRescue } = require("../js/chapterRescueSystem");

const total = reserve => ["predators", "herbivores", "birds"]
  .reduce((sum, group) => sum + Object.values((reserve.ecology || {})[group] || {})
    .reduce((subtotal, value) => subtotal + Math.max(0, Number(value) || 0), 0), 0);

let previousTarget = 0;
for (let chapter = 1; chapter <= 20; chapter++) {
  const target = chapterTargets(chapter).animals;
  assert(target > 0, `chapter ${chapter}: this-chapter animal gate must stay positive`);
  if (chapter === 1) assert.equal(target, 58, "chapter 1 this-chapter animal gate is 58");
  if (chapter > 1) assert.ok(target > previousTarget, `chapter ${chapter}: this-chapter animal gate must rise`);
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

console.log("chapter population carryover ok: this-chapter animal gates, 19 promotions and save reloads");
