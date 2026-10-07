'use strict';

const assert = require('node:assert/strict');
const { createCharacter } = require('../js/storage');
const { CHAPTERS } = require('../js/animalWorld');
const { reserveProgressionFor } = require('../js/simulator');
const {
  chapterDefinition,
  normalizeChapterRescue,
  addRescueItem,
  rescueAnimal
} = require('../js/chapterRescueSystem');
const {
  chapterTargets,
  chapterSpeciesCount,
  chapterCoreLiveComplete,
  chapterAdvanceReady,
  beginChapterAnimalCheckpoint,
  chapterAnimalTotal
} = require('../js/chapterTargets');
const { recordIncrease } = require('../js/animalSourceLedger');

function primed(stage) {
  const reserve = createCharacter(null, `第${stage}章解救门槛`).world.reserve;
  const info = CHAPTERS[stage - 1];
  Object.assign(reserve.progression, {
    stage,
    displayChapter: stage,
    level: info.level,
    totalActions: 1000,
    totalMeaningfulActions: 1000,
    totalStrategicChoices: 100,
    totalMajorStrategicChoices: 100,
    activeSeconds: 10000
  });
  reserve.rareAnimal.status = 'resident';
  reserve.rareAnimal.health = 72;
  reserve.development.operations.totalVisitors = 10000;
  reserve.development.operations.visitorLedger = { totalVisitors: 10000 };
  const visitorBaseline = Math.max(0, 10000 - chapterTargets(stage).visitors);
  reserve.progression.chapterStart = {
    stage,
    totalVisitors: visitorBaseline,
    inheritedVisitors: 0,
    visitorLedger: { totalVisitors: visitorBaseline }
  };
  reserve.development.operations.chapterVisitors = {
    stage,
    inherited: chapterTargets(stage).visitors,
    legacySeed: 0,
    start: { totalVisitors: visitorBaseline },
    startLifetime: visitorBaseline
  };
  beginChapterAnimalCheckpoint(reserve, stage, chapterTargets(stage - 1).animals);
  const animalNeed = Math.max(0, chapterTargets(stage).animals - chapterAnimalTotal(reserve));
  if (animalNeed) recordIncrease(reserve, 'tasked', animalNeed);
  normalizeChapterRescue(reserve, stage, { fresh: true });
  return reserve;
}

assert.deepEqual(chapterDefinition(15).targets, ['otter']);
assert.equal(chapterTargets(15).species, 26);
assert.deepEqual(chapterDefinition(16).targets, ['pelican']);
assert.equal(chapterTargets(16).species, 27);

for (const stage of [15, 16]) {
  const reserve = primed(stage);
  const pending = (normalizeChapterRescue(reserve, stage).targets || [])
    .filter((record) => record && record.status !== 'rescued');
  assert.equal(pending.length, 1, `chapter ${stage} must require a rescue`);
  assert.ok(chapterSpeciesCount(reserve, stage) < chapterTargets(stage).species,
    `chapter ${stage} species gate must wait for rescue`);
  assert.equal(chapterCoreLiveComplete(reserve, stage), false,
    `chapter ${stage} must not auto-complete before rescue`);
  assert.equal(chapterAdvanceReady(reserve, stage), false);
  assert.equal(reserveProgressionFor(reserve).stage, stage,
    `chapter ${stage} must stay until the new animal is rescued`);

  pending.forEach((record) => {
    (record.requiredItems || []).forEach((itemId) => addRescueItem(reserve, itemId));
    assert.equal(rescueAnimal(reserve, record.targetId).ok, true);
  });
  assert.equal(chapterCoreLiveComplete(reserve, stage), true,
    `chapter ${stage} can promote after rescue`);
  assert.equal(reserveProgressionFor(reserve).stage, stage + 1,
    `chapter ${stage} promotes only after rescue`);
}

{
  const reserve = primed(15);
  reserve.chapterRescue = {
    version: 9,
    chapter: 15,
    _normalizedChapter: 15,
    targets: [],
    animals: {},
    starter: ['wolf'],
    captive: []
  };
  assert.equal(chapterAdvanceReady(reserve, 15), false,
    'legacy chapter-15 saves with empty rescue must rebuild the otter task');
  const rebuilt = normalizeChapterRescue(reserve, 15);
  assert.ok((rebuilt.targets || []).some((record) => record.speciesId === 'otter' && record.status !== 'rescued'));
}

console.log('chapter 15-16 rescue gate check ok');
