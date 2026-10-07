'use strict';

const assert = require('node:assert/strict');
const {
  CHAPTERS,
  SPECIES_DB,
  getUnlockedSpecies,
  reconcileSpeciesPopulations,
} = require('../js/animalWorld');
const {
  chapterDefinition,
  normalizeChapterRescue,
  addRescueItem,
  rescueAnimal
} = require('../js/chapterRescueSystem');
const {
  chapterTargets,
  chapterSpeciesCount,
  chapterAnimalTotal,
  beginChapterAnimalCheckpoint
} = require('../js/chapterTargets');
const { createCharacter } = require('../js/storage');

const OPENING_SPECIES = new Set(['deer', 'antelope', 'hare', 'crow', 'wolf', 'zebra', 'boar']);
const rescuedSpecies = new Set();
const rows = [];

for (let chapter = 1; chapter <= CHAPTERS.length; chapter += 1) {
  const chapterInfo = CHAPTERS[chapter - 1];
  const target = chapterTargets(chapter);
  const definition = chapterDefinition(chapter);
  const unlocked = getUnlockedSpecies(chapterInfo.level, chapter);
  const unlockedIds = new Set(unlocked.map((species) => species.id));
  const novel = (chapterInfo.newSpecies || []).filter((id) => !OPENING_SPECIES.has(id));
  const required = definition.starter.concat(definition.targets);

  assert.equal(target.species, unlocked.length,
    `chapter ${chapter}: species target ${target.species} must equal the available roster ${unlocked.length}`);
  assert.equal(new Set(required).size, required.length,
    `chapter ${chapter}: starter and rescue roster contains duplicates`);
  required.forEach((speciesId) => {
    assert(SPECIES_DB[speciesId], `chapter ${chapter}: ${speciesId} is missing from SPECIES_DB`);
    assert(unlockedIds.has(speciesId),
      `chapter ${chapter}: ${speciesId} is not unlockable at level ${chapterInfo.level}`);
  });
  if (novel.length) {
    assert.deepEqual(definition.targets.slice().sort(), novel.slice().sort(),
      `chapter ${chapter}: every newly introduced species needs a chapter rescue path`);
  }

  definition.targets.forEach((speciesId) => {
    assert(!rescuedSpecies.has(speciesId), `${speciesId} is assigned to multiple chapter rescue slots`);
    rescuedSpecies.add(speciesId);
    const species = SPECIES_DB[speciesId];
    assert(Number(species.initialPop) > 0, `chapter ${chapter}: ${speciesId} rescue has no initial population`);
    assert(Number(species.maxPop) >= Number(species.initialPop),
      `chapter ${chapter}: ${speciesId} max population is below its rescue population`);
  });

  const maxPopulation = unlocked.reduce((sum, species) => sum + Math.max(0, Number(species.maxPop) || 0), 0);
  assert(maxPopulation >= target.animals,
    `chapter ${chapter}: animal target ${target.animals} exceeds unlocked species capacity ${maxPopulation}`);

  const reserve = createCharacter(null, `chapter ${chapter} animal audit`).world.reserve;
  Object.assign(reserve.progression, {
    stage: chapter,
    displayChapter: chapter,
    level: chapterInfo.level
  });
  beginChapterAnimalCheckpoint(reserve, chapter, chapter === 1 ? 0 : chapterTargets(chapter - 1).animals);
  normalizeChapterRescue(reserve, chapter, { fresh: true });
  reconcileSpeciesPopulations(reserve, { removeLocked: true, initializeUnlocked: true });

  const beforeRescueAnimals = chapterAnimalTotal(reserve);
  const rescueRecords = normalizeChapterRescue(reserve, chapter).targets || [];
  rescueRecords.forEach((record) => {
    (record.requiredItems || []).forEach((itemId) => addRescueItem(reserve, itemId));
    assert.equal(rescueAnimal(reserve, record.targetId).ok, true,
      `chapter ${chapter}: ${record.speciesId} rescue cannot be completed`);
  });
  reconcileSpeciesPopulations(reserve, { removeLocked: true, initializeUnlocked: true });
  const afterRescueAnimals = chapterAnimalTotal(reserve);
  const speciesCount = chapterSpeciesCount(reserve);
  assert(speciesCount >= target.species,
    `chapter ${chapter}: species gate ${speciesCount}/${target.species} remains incomplete after all rescues`);
  assert(afterRescueAnimals < target.animals,
    `chapter ${chapter}: rescue data alone unexpectedly completes animal gate ${afterRescueAnimals}/${target.animals}`);

  rows.push({
    chapter,
    targetSpecies: target.species,
    unlockedSpecies: unlocked.length,
    rescueTargets: definition.targets.length,
    carryoverAnimals: beforeRescueAnimals,
    rescueAnimals: afterRescueAnimals - beforeRescueAnimals,
    animalTarget: target.animals,
    remainingAnimals: target.animals - afterRescueAnimals,
    maxPopulation
  });
}

assert.equal(rescuedSpecies.size, 28, 'all chapter rescue slots should cover 28 unique species');

console.log('all chapters animal population audit ok');
rows.forEach((row) => {
  console.log([
    `C${row.chapter}`,
    `species ${row.unlockedSpecies}/${row.targetSpecies}`,
    `rescues ${row.rescueTargets}`,
    `animals ${row.carryoverAnimals}+${row.rescueAnimals}/${row.animalTarget}`,
    `remaining ${row.remainingAnimals}`,
    `capacity ${row.maxPopulation}`
  ].join(' · '));
});
