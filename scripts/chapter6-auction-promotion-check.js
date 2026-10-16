"use strict";

const assert = require("node:assert/strict");
const { createCharacter } = require("../js/storage");
const { CHAPTERS, reconcileSpeciesPopulations, SPECIES_DB, speciesPopulationGroup } = require("../js/animalWorld");
const {
  chapterTargets,
  beginChapterAnimalCheckpoint,
  chapterAnimalTotal,
  beginChapterVisitorCheckpoint,
  chapterVisitorTotal,
  applyChapterVisitorDelta
} = require("../js/chapterTargets");
const { recordIncrease, animalSourceSummary } = require("../js/animalSourceLedger");
const rare = require("../js/rareAnimalSystem");

function fakeCanvasContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, key) {
      if (key === "measureText") return value => ({ width: String(value || "").length * 7 });
      if (key === "createLinearGradient" || key === "createRadialGradient") return () => gradient;
      if (key === "canvas") return { width: 375, height: 667 };
      if (!target[key]) target[key] = () => {};
      return target[key];
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    }
  });
}

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
  createCanvas: () => ({ width: 375, height: 667, getContext: fakeCanvasContext }),
  getStorageSync: () => null,
  setStorageSync: () => {},
  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
  onTouchCancel() {},
  onKeyboardConfirm() {},
  onAppHide() {},
  onAppShow() {},
  showToast() {}
};

const { Game } = require("../js/game");

function primeChapterSix() {
  const state = createCharacter(null, "第6章拍卖晋级回归");
  const reserve = state.world.reserve;
  const target = chapterTargets(6);
  reserve.progression = Object.assign({}, reserve.progression, {
    stage: 6,
    displayChapter: 6,
    level: 3,
    totalActions: 1000,
    totalMeaningfulActions: 1000,
    totalStrategicChoices: 100,
    totalMajorStrategicChoices: 100,
    activeSeconds: 10000
  });
  Object.assign(reserve.ecology, { water: 100, grass: 100, disease: 0 });
  reconcileSpeciesPopulations(reserve, { initializeUnlocked: true, removeLocked: false });
  ["herbivores", "predators", "birds"].forEach(group => {
    Object.keys(reserve.ecology[group] || {}).forEach(id => {
      reserve.ecology[group][id] = 100;
    });
  });

  beginChapterAnimalCheckpoint(reserve, 6, chapterTargets(5).animals);
  // Leave exactly one animal of the chapter gate for the rare auction.
  const animalBeforeAuction = chapterAnimalTotal(reserve);
  recordIncrease(reserve, "tasked", Math.max(0, target.animals - 1 - animalBeforeAuction));

  beginChapterVisitorCheckpoint(reserve, 6, chapterTargets(5).visitors);
  const visitorBefore = chapterVisitorTotal(reserve);
  applyChapterVisitorDelta(reserve, target.visitors - visitorBefore, "recruit");
  reserve.fund = 600;
  return state;
}

function makeGame(state) {
  const game = new Game();
  if (game.stopLoop) game.stopLoop();
  game.state = state;
  game.screen = "home";
  game.render = () => {};
  game.toast = () => {};
  game.playSfx = () => {};
  game.queueChapterAdvance = () => true;
  game.persistPendingChapterPromotion = () => {};
  game.collectTaskCompletionFeedback = () => {};
  return game;
}

// A submitted chapter-6 auction is not settled by an ordinary refresh.
const waitingState = primeChapterSix();
const waitingReserve = waitingState.world.reserve;
assert.equal(rare.submitRareAuctionBid(waitingReserve, { baseBid: 100, arrowScore: 4 }).ok, true);
assert.equal(waitingReserve.rareAnimal.auction.status, "submitted");
assert.equal(chapterAnimalTotal(waitingReserve), chapterTargets(6).animals - 1);

// The final promotion check closes the auction first, then sees the cub in
// the same chapter ledger and arms the chapter transition.
const game = makeGame(waitingState);
assert.equal(game.commitReserveProgression(waitingReserve, undefined, 6).stage, 6);
assert.ok(game.pendingChapterPromotion, "chapter 6 should queue a promotion instead of waiting forever");
assert.equal(game.pendingChapterPromotion.to, 7);
assert.equal(waitingReserve.rareAnimal.auction.status, "settled");
assert.equal(waitingReserve.rareAnimal.status, "resident");
assert.equal(waitingReserve.ecology.herbivores.pangolin, 1);
assert.equal(animalSourceSummary(waitingReserve).rareAuction, 1);

// Applying the queued transition must be idempotent and leave the HUD on
// chapter 7; a second promotion check must not duplicate the cub.
assert.equal(game.applyPendingChapterPromotion(), true);
assert.equal(waitingReserve.progression.stage, 7);
assert.equal(animalSourceSummary(waitingReserve).rareAuction, 0, "next chapter ledger starts clean");
assert.equal(waitingReserve.ecology.herbivores.pangolin, 1);

// If the three live metrics are already complete, the promotion card may be
// queued before the auction is displayed. Re-entering that flow must settle
// the submitted bid while applying the queued promotion, instead of leaving
// the player on a non-progressing chapter-6 card.
const queuedState = primeChapterSix();
const queuedReserve = queuedState.world.reserve;
recordIncrease(queuedReserve, "tasked", 1);
queuedReserve.ecology.birds.chapterSixVisitor = 1;
assert.equal(rare.submitRareAuctionBid(queuedReserve, { baseBid: 100, arrowScore: 4 }).ok, true);
const queuedGame = makeGame(queuedState);
queuedGame.commitReserveProgression(queuedReserve, undefined, 6);
assert.ok(queuedGame.pendingChapterPromotion);
assert.equal(queuedReserve.rareAnimal.auction.status, "submitted");
queuedGame.tryPresentPendingChapterAdvance();
assert.equal(queuedReserve.progression.stage, 7);
assert.equal(queuedReserve.rareAnimal.auction.status, "settled");
assert.equal(queuedReserve.rareAnimal.status, "resident");

// A partially migrated save with a settled winner but no population row is
// repaired before the gate is read, without adding a duplicate entry.
const repairedState = primeChapterSix();
const repairedReserve = repairedState.world.reserve;
repairedReserve.rareAnimal.auction = Object.assign({}, repairedReserve.rareAnimal.auction, {
  chapter: 6,
  status: "settled",
  winner: true,
  rank: 1,
  settledAt: 1
});
repairedReserve.rareAnimal.status = "unowned";
repairedReserve.ecology.herbivores.pangolin = 0;
const repaired = rare.settleRareAuctionForProgression(repairedReserve);
assert.equal(repaired.changed, true);
assert.equal(repairedReserve.rareAnimal.status, "resident");
assert.equal(repairedReserve.ecology.herbivores.pangolin, 1);
assert.equal(animalSourceSummary(repairedReserve).rareAuction, 1);

const landedState = primeChapterSix();
const landedReserve = landedState.world.reserve;
landedReserve.rareAnimal.auction = Object.assign({}, landedReserve.rareAnimal.auction, {
  chapter: 6,
  status: "settled",
  winner: true,
  rank: 1,
  settledAt: 1
});
landedReserve.rareAnimal.status = "resident";
landedReserve.rareAnimal.health = 72;
landedReserve.ecology.herbivores.pangolin = 1;
const landed = rare.settleRareAuctionForProgression(landedReserve);
assert.equal(landed.changed, true);
assert.equal(landedReserve.ecology.herbivores.pangolin, 1);
assert.equal(animalSourceSummary(landedReserve).rareAuction, 1, "落地幼崽也必须补齐本章拍卖流水");

// A legacy save can already show chapter 7–20 while the chapter-6 auction is
// still submitted. Every later chapter must reconcile it without writing the
// rare-animal inflow into the later chapter's ledger.
for (let stage = 7; stage <= CHAPTERS.length; stage += 1) {
  const state = createCharacter(null, `后续章节拍卖回归${stage}`);
  const reserve = state.world.reserve;
  const target = chapterTargets(stage);
  reserve.progression = Object.assign({}, reserve.progression, {
    stage: 6,
    displayChapter: 6,
    level: 3
  });
  reserve.fund = 600;
  assert.equal(rare.submitRareAuctionBid(reserve, { baseBid: 100, arrowScore: 4 }).ok, true);

  reserve.progression.stage = stage;
  reserve.progression.displayChapter = stage;
  reserve.progression.level = Math.min(7, Math.ceil(stage / 2));
  Object.assign(reserve.ecology, { water: 100, grass: 100, disease: 0 });
  reconcileSpeciesPopulations(reserve, { initializeUnlocked: true, removeLocked: false });
  Object.keys(SPECIES_DB).forEach(id => {
    const group = speciesPopulationGroup(id);
    reserve.ecology[group] = reserve.ecology[group] || {};
    reserve.ecology[group][id] = 100;
  });
  beginChapterAnimalCheckpoint(reserve, stage, chapterTargets(stage - 1).animals);
  recordIncrease(reserve, "tasked", Math.max(0, target.animals - chapterAnimalTotal(reserve)));
  beginChapterVisitorCheckpoint(reserve, stage, chapterTargets(stage - 1).visitors);
  const visitorBeforeStage = chapterVisitorTotal(reserve);
  applyChapterVisitorDelta(reserve, target.visitors - visitorBeforeStage, "recruit");

  const laterGame = makeGame(state);
  const progression = laterGame.reserveProgression(reserve);
  assert.equal(reserve.rareAnimal.auction.status, "settled", `chapter ${stage} must not retain a submitted chapter-6 auction`);
  assert.equal(reserve.rareAnimal.status, "resident", `chapter ${stage} must land the cub before its gate is evaluated`);
  assert.equal(reserve.animalSourceLedger.chapters[6].rareAuction, 1, `chapter ${stage} must keep the auction inflow in chapter 6`);
  assert.equal((reserve.animalSourceLedger.chapters[stage] || {}).rareAuction || 0, 0, `chapter ${stage} must not duplicate the auction inflow`);
  assert.ok(progression.chapterComplete || progression.stage >= stage, `chapter ${stage} must remain promotable after reconciliation`);
}

const lateSettledState = primeChapterSix();
const lateSettledReserve = lateSettledState.world.reserve;
lateSettledReserve.progression.stage = 15;
lateSettledReserve.progression.displayChapter = 15;
lateSettledReserve.rareAnimal.auction = Object.assign({}, lateSettledReserve.rareAnimal.auction, {
  chapter: 6,
  status: "settled",
  winner: true,
  rank: 1,
  settledAt: 1
});
lateSettledReserve.rareAnimal.status = "resident";
lateSettledReserve.rareAnimal.health = 72;
lateSettledReserve.ecology.herbivores.pangolin = 1;
rare.settleRareAuctionForProgression(lateSettledReserve);
assert.equal(lateSettledReserve.animalSourceLedger.chapters[6].rareAuction, 1);
assert.equal((lateSettledReserve.animalSourceLedger.chapters[15] || {}).rareAuction || 0, 0);

console.log("chapter 6 auction promotion check passed");
