'use strict';
const assert = require('node:assert/strict');
const { createCharacter } = require('../js/storage');
const { reserveProgressionFor } = require('../js/simulator');
const { normalizeChapterRescue, collectRescueItem, rescueAnimal } = require('../js/chapterRescueSystem');

for (const reverse of [false, true]) {
  for (let stage = 1; stage <= 20; stage++) {
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
    reserve.ecology.herbivores.deer = 10000;
    reserve.eventChain = { chapterLevel: level, step: 7, length: 7, completed: true };
    reserve.storyDiscoveries = { [`case_${level}`]: { evidence: 9 } };
    const targets = normalizeChapterRescue(reserve, stage, { fresh: true }).targets.slice();
    if (reverse) targets.reverse();
    for (const target of targets) {
      const before = reserveProgressionFor(reserve);
      assert.equal(before.stage, stage, `chapter ${stage} advanced with a captive target`);
      if (stage === 20) assert(!before.chapterComplete, 'final chapter must not finish before its rescues');
      for (const item of target.requiredItems.slice().reverse()) {
        assert(collectRescueItem(reserve, target.targetId, item));
      }
      assert(rescueAnimal(reserve, target.targetId).ok);
      assert(!rescueAnimal(reserve, target.targetId).ok, 'duplicate completion must be rejected');
    }
    const after = reserveProgressionFor(reserve);
    assert.equal(after.stage, Math.min(20, stage + 1), `chapter ${stage} remained blocked after every prerequisite completed`);
    if (stage === 20) assert(after.chapterComplete);
  }
}
console.log('chapter gate order check ok: 20 chapters × forward/reverse rescue order; no premature promotion, no blocked completed gate, final chapter completion');
