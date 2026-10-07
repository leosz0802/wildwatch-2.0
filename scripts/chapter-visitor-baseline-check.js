'use strict';

const assert = require('node:assert/strict');
const { createInitialWorld } = require('../js/world');
const { normalizeReserve } = require('../js/storage');
const {
  applyChapterVisitorDelta,
  beginChapterVisitorCheckpoint,
  chapterTargets,
  chapterVisitorCarryover,
  chapterVisitorTotal,
  ensureChapterVisitorCheckpoint
} = require('../js/chapterTargets');

const chapterTwoInherit = chapterVisitorCarryover(chapterTargets(1).visitors, 2);

function seedVisitors(reserve, total, recruited = total) {
  reserve.development.operations.totalVisitors = total;
  reserve.development.operations.visitorLedger = {
    totalVisitors: total,
    migratedVisitors: 0,
    recruitedVisitors: recruited,
    facilityVisitors: 0,
    taskVisitors: 0,
    lostVisitors: 0
  };
}

// A save that already points at chapter 2 but has the stage-1 zero baseline
// must not expose the lifetime chapter-1 recruitment as chapter-2 progress.
const legacyCurrent = createInitialWorld().reserve;
legacyCurrent.progression = Object.assign({}, legacyCurrent.progression, {
  stage: 2,
  displayChapter: 2,
  chapterStart: {
    stage: 2,
    totalVisitors: 0,
    inheritedVisitors: 0,
    visitorLedger: { totalVisitors: 0 }
  }
});
seedVisitors(legacyCurrent, 240);
legacyCurrent.chapterRescue = {
  version: 10,
  chapter: 2,
  _normalizedChapter: 2,
  targets: [],
  animals: {},
  completedTargets: {}
};
const repairedCurrent = ensureChapterVisitorCheckpoint(legacyCurrent);
assert.equal(repairedCurrent.totalVisitors, 240, 'legacy current chapter baseline must equal lifetime total');
assert.equal(repairedCurrent.inheritedVisitors, chapterTwoInherit, 'legacy current chapter must inherit 10% of the previous chapter target');
assert.equal(chapterVisitorTotal(legacyCurrent), chapterTwoInherit, 'legacy current chapter must start from the previous-target inherit, not zero');
const reloadedLegacy = normalizeReserve(JSON.parse(JSON.stringify(legacyCurrent)));
assert.equal(chapterVisitorTotal(reloadedLegacy), chapterTwoInherit, 'normalizing an old save must keep the previous-target inherit');

// The same rule applies when an old save advanced the visible stage before
// writing its checkpoint and still carries the stage-1 default baseline.
const legacyAdvanced = createInitialWorld().reserve;
legacyAdvanced.progression = Object.assign({}, legacyAdvanced.progression, {
  stage: 2,
  displayChapter: 2,
  chapterStart: { stage: 1, totalVisitors: 0, inheritedVisitors: 0 }
});
seedVisitors(legacyAdvanced, 180);
assert.equal(chapterVisitorTotal(legacyAdvanced), chapterTwoInherit, 'stage-mismatch legacy save must inherit 10% of the previous chapter target');
assert.equal(legacyAdvanced.progression.chapterStart.totalVisitors, 180);

// A previous target-based repair could have persisted a fake inherited value
// together with the lifetime ledger snapshot.  That snapshot is also legacy
// data and must be reset instead of becoming chapter-2 progress.
const legacyRepaired = createInitialWorld().reserve;
legacyRepaired.progression = Object.assign({}, legacyRepaired.progression, {
  stage: 2,
  displayChapter: 2,
  chapterStart: {
    stage: 2,
    totalVisitors: 0,
    inheritedVisitors: 10,
    visitorLedger: { totalVisitors: 240, recruitedVisitors: 240 }
  }
});
seedVisitors(legacyRepaired, 240);
assert.equal(chapterVisitorTotal(legacyRepaired), chapterTwoInherit, 'persisted target repair must collapse to the previous-target inherit');

// A real transition, with a known previous chapter total, still carries only
// 10% and then counts new recruitment in the new chapter.
const transitioned = createInitialWorld().reserve;
seedVisitors(transitioned, 100);
transitioned.progression.stage = 2;
transitioned.progression.displayChapter = 2;
beginChapterVisitorCheckpoint(transitioned, 2, 100);
const transitionInherit = Math.max(Math.round(100 * 0.1), chapterTwoInherit);
assert.equal(chapterVisitorTotal(transitioned), transitionInherit, 'valid chapter transition must carry 10% of the previous total, floored by the previous gate');
const recruited = applyChapterVisitorDelta(transitioned, 25, 'recruit');
assert.equal(recruited.delta, 25);
assert.equal(chapterVisitorTotal(transitioned), transitionInherit + 25, 'current chapter delta must add on top of the 10% carryover');

// 第15章老用户打开新版本：生涯游客不能整笔写进本章，但也不能显示 0。
const veteran = createInitialWorld().reserve;
veteran.progression = Object.assign({}, veteran.progression, {
  stage: 15,
  displayChapter: 15,
  chapterStart: { stage: 1, totalVisitors: 0, inheritedVisitors: 0 }
});
seedVisitors(veteran, 4800);
assert.equal(
  chapterVisitorTotal(veteran),
  chapterVisitorCarryover(chapterTargets(14).visitors, 15),
  'a late-chapter veteran save keeps the previous-gate inherit instead of the lifetime total'
);
assert.ok(chapterVisitorTotal(veteran) < 4800, 'lifetime visitors must not be copied into the chapter HUD');
const wiped = createInitialWorld().reserve;
wiped.progression = Object.assign({}, wiped.progression, {
  stage: 15,
  displayChapter: 15,
  chapterStart: { stage: 15, totalVisitors: 0, inheritedVisitors: 0 }
});
assert.equal(
  chapterVisitorTotal(wiped),
  Math.round(chapterTargets(14).visitors * 0.1),
  'a chapter-15 save with no lifetime visitors still inherits 10% of chapter 14'
);

console.log('chapter visitor baseline check ok');
