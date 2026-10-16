'use strict';
const assert = require('node:assert/strict');
const { createCharacter } = require('../js/storage');
const { reserveProgressionFor } = require('../js/simulator');
const { normalizeChapterRescue, collectRescueItem, rescueAnimal } = require('../js/chapterRescueSystem');
const { reconcileSpeciesPopulations } = require('../js/animalWorld');
const { chapterTargets, chapterAdvanceReady, beginChapterAnimalCheckpoint, chapterAnimalTotal } = require('../js/chapterTargets');
const { recordIncrease } = require('../js/animalSourceLedger');
const { CHAPTERS } = require('../js/animalWorld');

for (const reverse of [false, true]) {
  for (let stage = 1; stage <= CHAPTERS.length; stage++) {
    const reserve = createCharacter(null, '章节晋级顺序回归').world.reserve;
    const level = Math.min(7, Math.ceil(stage / 2));
    // Isolate the promotion gate with satisfied story/numeric prerequisites.
    // Never bypass rescue or timing, including the first chapter.
    reserve.progression = {
      stage, displayChapter: stage, level, totalActions: 1000, totalMeaningfulActions: 1000,
      totalStrategicChoices: 100, totalMajorStrategicChoices: 100, activeSeconds: 10000,
      totalFundEarned: 1e6, totalMigratedIn: 10000, totalRareRecovered: 1000,
      stageBestScore: 100, stageStart: { stage, level }
    };
    Object.assign(reserve.ecology, { water: 100, grass: 100, disease: 0 });
    reconcileSpeciesPopulations(reserve, { initializeUnlocked: true, removeLocked: false });
    ['herbivores', 'predators', 'birds'].forEach((group) => {
      Object.keys(reserve.ecology[group] || {}).forEach((speciesId) => {
        reserve.ecology[group][speciesId] = 10000;
      });
    });
    if (stage >= 10) {
      reserve.rareAnimal.status = "resident";
      reserve.rareAnimal.health = 72;
      reserve.ecology.herbivores.pangolin = 10000;
    }
    reserve.development.operations.totalVisitors = 10000;
    reserve.development.operations.visitorLedger = { totalVisitors: 10000 };
    beginChapterAnimalCheckpoint(reserve, stage, stage === 1 ? 0 : chapterTargets(stage - 1).animals);
    const animalNeed = Math.max(0, chapterTargets(stage).animals - chapterAnimalTotal(reserve));
    if (animalNeed) recordIncrease(reserve, 'tasked', animalNeed);
    const visitorBaseline = stage === 1 ? 0 : Math.max(0, 10000 - chapterTargets(stage).visitors);
    reserve.progression.chapterStart = {
      stage,
      totalVisitors: visitorBaseline,
      inheritedVisitors: 0,
      visitorLedger: { totalVisitors: visitorBaseline, migratedVisitors: 0, recruitedVisitors: 0, facilityVisitors: 0 }
    };
    reserve.progression.stageStart = Object.assign({}, reserve.progression.stageStart || {}, reserve.progression.chapterStart);
    reserve.eventChain = { chapterLevel: level, step: 7, length: 7, completed: true };
    reserve.storyDiscoveries = { [`case_${level}`]: { evidence: 9 } };
    const targets = normalizeChapterRescue(reserve, stage, { fresh: true }).targets.slice();
    if (reverse) targets.reverse();
    const beforeRescue = reserveProgressionFor(reserve);
    const coresReady = chapterAdvanceReady(reserve, stage);
    if (!coresReady) {
      assert.equal(beforeRescue.stage, stage, `chapter ${stage} must stay until species, animals and visitors are met`);
    }
    for (const target of targets) {
      for (const item of target.requiredItems.slice().reverse()) {
        assert(collectRescueItem(reserve, target.targetId, item));
      }
      assert(rescueAnimal(reserve, target.targetId).ok);
      assert(!rescueAnimal(reserve, target.targetId).ok, 'duplicate completion must be rejected');
    }
    const after = reserveProgressionFor(reserve);
    assert.equal(after.stage, Math.min(CHAPTERS.length, stage + 1), `chapter ${stage} must promote once the three core metrics (and rare auction) are met`);
    if (stage === CHAPTERS.length) assert(after.chapterComplete);
  }
}
console.log(`chapter gate order check ok: ${CHAPTERS.length} chapters × forward/reverse rescue order; no premature promotion, no blocked completed gate, final chapter completion`);
