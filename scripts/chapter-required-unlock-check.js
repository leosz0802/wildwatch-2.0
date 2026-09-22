'use strict';

const assert = require('node:assert/strict');
const {
  CHAPTERS,
  getUnlockedSpecies,
  getSpeciesById,
  reconcileSpeciesPopulations,
  speciesPopulationGroup
} = require('../js/animalWorld');
const {
  chapterDefinition,
  normalizeChapterRescue,
  addRescueItem,
  rescueAnimal
} = require('../js/chapterRescueSystem');
const { chapterTargets, chapterSpeciesCount } = require('../js/chapterTargets');
const { createReserveState } = require('../js/world');

function presentIds(ecology = {}) {
  const ids = [];
  ['herbivores', 'predators', 'birds'].forEach((group) => {
    Object.keys(ecology[group] || {}).forEach((id) => {
      if (Number(ecology[group][id]) > 0) ids.push(id);
    });
  });
  return ids.sort();
}

function populationOf(reserve, speciesId) {
  const group = speciesPopulationGroup(speciesId);
  return Math.max(0, Number(((reserve.ecology || {})[group] || {})[speciesId]) || 0);
}

const reserve = createReserveState();

for (let chapter = 1; chapter <= 20; chapter += 1) {
  const info = CHAPTERS[chapter - 1];
  const definition = chapterDefinition(chapter);
  const required = definition.starter.concat(definition.targets);
  required.forEach((speciesId) => {
    assert(getSpeciesById(speciesId), `chapter ${chapter}: ${speciesId} is missing from SPECIES_DB`);
  });

  if (chapter >= 10) {
    const opening = new Set(["deer", "antelope", "hare", "crow", "wolf", "zebra", "boar"]);
    const novel = (info.newSpecies || []).filter((id) => !opening.has(id));
    assert.equal(definition.targets.length, novel.length, `chapter ${chapter}: every new species must be a required unlock`);
    assert.deepEqual(definition.targets.slice().sort(), novel.slice().sort(), `chapter ${chapter}: required unlocks must match this chapter's new species`);
    if (novel.length >= 2) {
      assert.equal(definition.targets.length, 2, `chapter ${chapter}: two new species must both be required unlocks`);
    }
  }

  const unlocked = new Set(getUnlockedSpecies(info.level, chapter).map((species) => species.id));
  required.forEach((speciesId) => {
    assert(unlocked.has(speciesId), `chapter ${chapter}: ${speciesId} cannot unlock at level ${info.level}`);
  });

  Object.assign(reserve.progression, {
    stage: chapter,
    displayChapter: chapter,
    level: info.level
  });
  normalizeChapterRescue(reserve, chapter, { fresh: chapter === 1 });
  reconcileSpeciesPopulations(reserve, { removeLocked: true, initializeUnlocked: true });

  const target = chapterTargets(chapter);
  const pendingTargets = (normalizeChapterRescue(reserve, chapter).targets || []).filter((item) => item && item.status !== "rescued");
  const beforeRescue = chapterSpeciesCount(reserve);
  if (chapter >= 3 && pendingTargets.length) {
    assert(beforeRescue < target.species, `chapter ${chapter}: species ${beforeRescue} should wait for rescue to meet gate ${target.species}`);
  }

  pendingTargets.forEach((targetRecord) => {
    (targetRecord.requiredItems || []).forEach((itemId) => addRescueItem(reserve, itemId));
    assert.equal(rescueAnimal(reserve, targetRecord.targetId).ok, true, `chapter ${chapter}: ${targetRecord.speciesId} rescue must succeed`);
  });
  reconcileSpeciesPopulations(reserve, { removeLocked: true, initializeUnlocked: true });

  required.forEach((speciesId) => {
    assert(populationOf(reserve, speciesId) > 0, `chapter ${chapter}: ${speciesId} vanished after unlock/rescue reconcile`);
  });

  const speciesCount = chapterSpeciesCount(reserve);
  assert(speciesCount >= target.species, `chapter ${chapter}: species ${speciesCount} < gate ${target.species} after required unlocks`);
  if (chapter >= 3) {
    assert.equal(speciesCount, target.species, `chapter ${chapter}: after rescue species ${speciesCount} should just meet gate ${target.species}`);
  }
}

console.log('chapter required unlock check ok: 20 chapters, required animals stay present, species gates reachable');
