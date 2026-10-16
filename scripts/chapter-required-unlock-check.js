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
  rescueAnimal,
  RESCUE_VERSION
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

for (let chapter = 1; chapter <= CHAPTERS.length; chapter += 1) {
  const info = CHAPTERS[chapter - 1];
  const definition = chapterDefinition(chapter);
  const required = definition.starter.concat(definition.targets);
  required.forEach((speciesId) => {
    assert(getSpeciesById(speciesId), `chapter ${chapter}: ${speciesId} is missing from SPECIES_DB`);
  });

  const opening = new Set(["deer", "antelope", "hare", "crow", "wolf", "zebra", "boar"]);
  const novel = (info.newSpecies || []).filter((id) => !opening.has(id));
  if (novel.length) {
    assert.equal(definition.targets.length, novel.length, `chapter ${chapter}: every new species must be a required unlock`);
    assert.deepEqual(definition.targets.slice().sort(), novel.slice().sort(), `chapter ${chapter}: required unlocks must match this chapter's new species`);
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

// Chapter 4/8 regression: both newly introduced species must be actionable, and
// a pending prior rescue must not consume the current chapter's unlock slots.
assert.deepEqual(chapterDefinition(4).targets.slice().sort(), ['leopard', 'lion']);
assert.deepEqual(chapterDefinition(8).targets.slice().sort(), ['crocodile', 'wildDog']);
const transitionReserve = createReserveState();
normalizeChapterRescue(transitionReserve, 3, { fresh: true });
transitionReserve.progression.stage = 4;
transitionReserve.progression.displayChapter = 4;
transitionReserve.progression.level = CHAPTERS[3].level;
const transitionState = normalizeChapterRescue(transitionReserve, 4);
const transitionTargets = transitionState.targets || [];
assert(transitionTargets.some((record) => record.speciesId === 'lion' && record.chapter === 4));
assert(transitionTargets.some((record) => record.speciesId === 'leopard' && record.chapter === 4));
assert(transitionTargets.filter((record) => record.carryover && record.chapter === 3).length >= 1);

// A save created before the coverage fix may already be normalized with only
// the old target. Reload normalization must add the missing species without
// resetting the existing target or its progress.
const staleFourRecord = {
  targetId: 'chapter:4:rescue:1',
  speciesId: 'leopard',
  status: 'captive',
  requiredItems: ['rescue_scent_cloth'],
  pointTarget: 12,
  pointProgress: {}
};
const staleFour = createReserveState();
Object.assign(staleFour.progression, { stage: 4, displayChapter: 4, level: CHAPTERS[3].level });
staleFour.chapterRescue = {
  version: RESCUE_VERSION,
  chapter: 4,
  targets: [staleFourRecord],
  animals: { [staleFourRecord.targetId]: staleFourRecord },
  completedTargets: {},
  enforceCompletion: true,
  legacyGateBypass: false
};
const migratedFour = normalizeChapterRescue(staleFour, 4);
assert(migratedFour.targets.some((record) => record.speciesId === 'leopard'));
assert(migratedFour.targets.some((record) => record.speciesId === 'lion'));

console.log(`chapter required unlock check ok: ${CHAPTERS.length} chapters, every novel species is actionable, chapter 4/8 coverage and species gates reachable`);
