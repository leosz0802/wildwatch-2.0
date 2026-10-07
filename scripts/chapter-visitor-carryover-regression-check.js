'use strict';

const assert = require('node:assert/strict');
const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');
const {
  chapterTargets,
  chapterVisitorCarryover,
  chapterVisitorTotal,
  chapterVisitorBreakdown,
  applyChapterVisitorDelta,
  beginChapterAnimalCheckpoint,
  chapterAnimalTotal
} = require('../js/chapterTargets');
const { recordIncrease } = require('../js/animalSourceLedger');
const { SPECIES_DB, speciesPopulationGroup } = require('../js/animalWorld');

const game = new Game();
if (typeof game.stopLoop === 'function') game.stopLoop();
game.render = () => {};

const state = createCharacter(null, '跨章节游客继承回归');
const reserve = state.world.reserve;
game.state = state;
reserve.progression = Object.assign({}, reserve.progression, { stage: 1, displayChapter: 1 });
reserve.chapterRescue = { enforceCompletion: false, legacyGateBypass: true };
reserve.ecology.water = 80;
reserve.ecology.grass = 80;
reserve.ecology.disease = 8;
reserve.safety = 80;
reserve.poacherPressure = 10;
Object.keys(reserve.ecology).forEach((group) => {
  if (!['predators', 'herbivores', 'birds'].includes(group)) return;
  Object.keys(reserve.ecology[group] || {}).forEach((speciesId) => {
    reserve.ecology[group][speciesId] = Math.max(50, Number(reserve.ecology[group][speciesId]) || 0);
  });
});

beginChapterAnimalCheckpoint(reserve, 1, 0);
recordIncrease(reserve, 'tasked', Math.max(0, chapterTargets(1).animals - chapterAnimalTotal(reserve)));

// Simulate a chapter-1 end total of 1,040 visitors, then enter chapter 2.
const operations = reserve.development.operations;
operations.totalVisitors = 1040;
operations.visitorLedger = {
  totalVisitors: 1040,
  migratedVisitors: 0,
  recruitedVisitors: 1040,
  facilityVisitors: 0,
  taskVisitors: 0,
  shareVisitors: 0,
  lostVisitors: 0
};

assert.equal(game.armPendingChapterPromotion(reserve, 1), true, 'chapter 1 should queue promotion');
assert.equal(game.applyPendingChapterPromotion(), true, 'queued promotion should enter chapter 2');
assert.equal(reserve.progression.stage, 2, 'reserve should be on chapter 2 after promotion');

const inherited = chapterVisitorBreakdown(reserve);
assert.equal(inherited.inherited, 104, 'chapter 2 must carry exactly 10% of the chapter-1 end total');
assert.equal(inherited.total, 104, 'carryover must count toward the chapter-2 visitor total');
assert.equal(inherited.untracked, 0, 'carryover must not appear as an unclassified visitor source');

// A current-chapter loss must reduce the live total while leaving the
// inherited source visible and still fully accounting for the result.
const loss = applyChapterVisitorDelta(reserve, -10, 'visit', { skipToday: true });
assert.equal(loss.after, 94, 'ten lost visitors should reduce the chapter total from 104 to 94');
const afterLoss = chapterVisitorBreakdown(reserve);
assert.equal(afterLoss.inherited, 104, 'loss must not erase the inherited source');
assert.equal(afterLoss.lost, 10, 'loss must be recorded in the chapter breakdown');
assert.equal(afterLoss.untracked, 0, 'inherited and lost visitors must close the breakdown');

const detail = game.buildChapterProgressDetail();
const visitorBody = ((detail.metricDetails.visitors.items || []).find((item) => item.title === "当前游客构成") || detail.metricDetails.visitors.items[0] || {}).body;
assert.match(visitorBody, /继承 104 人/, 'visitor detail must show the inherited carryover');
assert.match(visitorBody, /流失 10 人/, 'visitor detail must show the current chapter loss');
assert.doesNotMatch(visitorBody, /待分类/, 'visitor detail must not show an unclassified carryover');

// A save created by the previous transition order can already be in chapter
// 2 with the 10% physically present in the lifetime total but missing from
// inheritedVisitors.  The compatibility path should repair its display
// classification without changing the live chapter total.
const legacy = createCharacter(null, '旧跨章节存档').world.reserve;
legacy.progression = Object.assign({}, legacy.progression, {
  stage: 2,
  displayChapter: 2,
  chapterStart: {
    stage: 2,
    totalVisitors: 1040,
    inheritedVisitors: 0,
    baselineLocked: true,
    visitorLedger: {
      totalVisitors: 1040,
      recruitedVisitors: 1040,
      migratedVisitors: 0,
      facilityVisitors: 0,
      taskVisitors: 0,
      shareVisitors: 0,
      lostVisitors: 0
    }
  }
});
legacy.development.operations.totalVisitors = 1134;
legacy.development.operations.visitorLedger = {
  totalVisitors: 1134,
  recruitedVisitors: 1040,
  migratedVisitors: 0,
  facilityVisitors: 0,
  taskVisitors: 0,
  shareVisitors: 0,
  lostVisitors: 10
};
const repaired = chapterVisitorBreakdown(legacy);
assert.equal(chapterVisitorTotal(legacy), 94, 'compatibility repair must not change the live chapter total');
assert.equal(repaired.inherited, 104, 'legacy transition must recover the 10% carryover category');
assert.equal(repaired.lost, 10, 'legacy transition must retain the recorded loss');
assert.equal(repaired.untracked, 0, 'legacy transition carryover must no longer be unclassified');

// The same transition path is used by every chapter.  Walk all 19 boundaries
// with enough ecology and visitors to promote, and verify each next chapter
// receives exactly 10% of the previous chapter's ending total.
const allChaptersGame = new Game();
if (typeof allChaptersGame.stopLoop === 'function') allChaptersGame.stopLoop();
allChaptersGame.render = () => {};
const allChaptersState = createCharacter(null, '全章节游客继承回归');
const allChaptersReserve = allChaptersState.world.reserve;
allChaptersGame.state = allChaptersState;
allChaptersReserve.chapterRescue = { enforceCompletion: false, legacyGateBypass: true };
allChaptersReserve.ecology.water = 90;
allChaptersReserve.ecology.grass = 90;
allChaptersReserve.ecology.disease = 4;
allChaptersReserve.safety = 90;
allChaptersReserve.poacherPressure = 5;
// The visitor carryover fixture satisfies the chapter-10 rare resident gate;
// the gate itself is covered by rare-animal-mvp-check.js.
allChaptersReserve.rareAnimal.status = "resident";
allChaptersReserve.rareAnimal.health = 72;
Object.keys(SPECIES_DB).forEach((speciesId) => {
  const group = speciesPopulationGroup(speciesId);
  allChaptersReserve.ecology[group][speciesId] = 100;
});
allChaptersReserve.progression = Object.assign({}, allChaptersReserve.progression, {
  stage: 1,
  displayChapter: 1
});
allChaptersReserve.development.operations.totalVisitors = 1000;
allChaptersReserve.development.operations.visitorLedger = {
  totalVisitors: 1000,
  migratedVisitors: 0,
  recruitedVisitors: 1000,
  facilityVisitors: 0,
  taskVisitors: 0,
  shareVisitors: 0,
  lostVisitors: 0
};

for (let from = 1; from < 20; from += 1) {
  const target = chapterTargets(from).visitors;
  const before = chapterVisitorTotal(allChaptersReserve);
  if (before < target) applyChapterVisitorDelta(allChaptersReserve, target - before, 'recruit', { skipToday: true });
  const animalNeed = Math.max(0, chapterTargets(from).animals - chapterAnimalTotal(allChaptersReserve));
  if (animalNeed) recordIncrease(allChaptersReserve, 'tasked', animalNeed);
  const endingTotal = chapterVisitorTotal(allChaptersReserve);
  assert.equal(allChaptersGame.armPendingChapterPromotion(allChaptersReserve, from), true, `chapter ${from} should queue promotion`);
  assert.equal(allChaptersGame.applyPendingChapterPromotion(), true, `chapter ${from} should enter chapter ${from + 1}`);
  const expected = chapterVisitorCarryover(endingTotal, from + 1);
  const next = chapterVisitorBreakdown(allChaptersReserve);
  assert.equal(allChaptersReserve.progression.stage, from + 1, `promotion should land on chapter ${from + 1}`);
  assert.equal(next.inherited, expected, `chapter ${from + 1} should inherit 10% of chapter ${from}`);
  assert.equal(next.total, expected, `chapter ${from + 1} HUD should include inherited visitors`);
  assert.equal(next.untracked, 0, `chapter ${from + 1} visitor breakdown should close`);
}

console.log('chapter visitor carryover regression check ok');
