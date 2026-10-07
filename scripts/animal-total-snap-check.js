'use strict';

const assert = require('node:assert/strict');
const { createCharacter } = require('../js/storage');
const { Game, chapterCoreMetrics } = require('../js/game');
const { simulateDay } = require('../js/simulator');
const { reconcileSpeciesPopulations } = require('../js/animalWorld');
const { chapterTargets, chapterVisitorTotal, chapterAnimalTotal, beginChapterVisitorCheckpoint } = require('../js/chapterTargets');
const {
  livingAnimalTotal,
  chapterCaptiveSpeciesSet,
  normalizeChapterRescue,
  addRescueItem,
  rescueAnimal,
  createPoacherRescue,
  rescuePoacherAnimal
} = require('../js/chapterRescueSystem');

function withRandom(value, fn) {
  const previous = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = previous; }
}

function ecologySum(reserve) {
  return ['predators', 'herbivores', 'birds'].reduce((sum, group) => (
    sum + Object.values((reserve.ecology || {})[group] || {}).reduce((n, value) => n + Math.max(0, Number(value) || 0), 0)
  ), 0);
}

const state = createCharacter(null, '动物总数不再来回跳');
const reserve = state.world.reserve;
const opening = livingAnimalTotal(reserve);
assert.equal(opening, 81, `chapter 1 live total should be 80 wild + 1 trapped animal, got ${opening}`);
assert.equal(reserve.ecology.herbivores.antelope, 1, 'captive antelope must count as 1, not initialPop 45');
assert.deepEqual([...chapterCaptiveSpeciesSet(reserve)], ['antelope']);
assert.equal(chapterCoreMetrics(reserve, 1).species, 6, 'trapped species must not fill the chapter species goal');

const game = Object.create(Game.prototype);
game.state = state;
game.screen = 'home';
game.settlementModal = null;
const liveHud = game.reserveDynamicTargets(reserve).animalTotal;
const prosperity = game.reserveProsperitySummary(reserve).animalTotal;
const core = chapterCoreMetrics(reserve, 1).animals;
assert.equal(liveHud, opening, 'home animal HUD must show the live opening herd');
assert.equal(prosperity, opening);
assert.equal(core, 0, 'core animal metric ignores opening stock');
assert.equal(game.reserveSpeciesTotal(reserve), opening);

const ghost = JSON.parse(JSON.stringify(reserve));
ghost.ecology.herbivores.antelope = 45;
assert.equal(livingAnimalTotal(ghost), 81, 'ghost antelope 45 must still count as a single trapped animal');
assert.equal(ecologySum(ghost) - livingAnimalTotal(ghost), 44);

reconcileSpeciesPopulations(reserve, { removeLocked: true, initializeUnlocked: true });
reconcileSpeciesPopulations(reserve, { removeLocked: true, initializeUnlocked: true });
assert.equal(reserve.ecology.herbivores.antelope, 1, 'initializeUnlocked must not dump initialPop onto a captive');
assert.equal(livingAnimalTotal(reserve), opening);

const snap = game.reserveSnapshot(reserve);
assert.ok(snap.chapterRescue, 'settlement snapshot must keep chapterRescue so HUD formula stays the same');
game.settlementModal = { pendingDisplayBefore: snap };
const pendingHud = game.reserveDynamicTargets(reserve).animalTotal;
game.settlementModal = null;
assert.equal(pendingHud, liveHud, `settlement pending HUD ${pendingHud} must match live HUD ${liveHud}`);

reserve.development.operations.totalVisitors = 80;
reserve.development.operations.visitorLedger = Object.assign({}, reserve.development.operations.visitorLedger || {}, { totalVisitors: 80 });
beginChapterVisitorCheckpoint(reserve, 2, 100);
reserve.progression.stage = 2;
reserve.progression.displayChapter = 2;
reserve.development.operations.totalVisitors = 106;
reserve.development.operations.visitorLedger.totalVisitors = 106;
const liveVisitors = chapterVisitorTotal(reserve);
assert.equal(liveVisitors, 36, `chapter 2 HUD should show 10% inherited plus new visitors, got ${liveVisitors}`);
assert.equal(game.reserveDynamicTargets(reserve).visitors, liveVisitors, 'home HUD visitors must use the chapter total');
const visitorSnap = game.reserveSnapshot(reserve);
assert.equal(visitorSnap.chapterVisitorTotal, liveVisitors, 'settlement snapshot must store the chapter visitor total');
assert.ok(visitorSnap.development && visitorSnap.development.operations, 'settlement snapshot must keep the visitor ledger');
game.settlementModal = { pendingDisplayBefore: visitorSnap };
assert.equal(game.reserveDynamicTargets(reserve).visitors, liveVisitors, 'settlement pending HUD visitors must stay on the chapter total');
const orphanVisitorSnap = JSON.parse(JSON.stringify(visitorSnap));
delete orphanVisitorSnap.development;
delete orphanVisitorSnap.chapterVisitorTotal;
game.settlementModal = { pendingDisplayBefore: orphanVisitorSnap };
assert.equal(game.reserveDynamicTargets(reserve).visitors, liveVisitors, 'a snapshot missing the visitor ledger must not flash HUD visitors to 0');
game.settlementModal = null;

const orphanSnap = JSON.parse(JSON.stringify(snap));
delete orphanSnap.chapterRescue;
orphanSnap.ecology.herbivores.antelope = 45;
game.settlementModal = { pendingDisplayBefore: orphanSnap };
const orphanHud = game.reserveDynamicTargets(reserve).animalTotal;
game.settlementModal = null;
assert.equal(orphanHud, livingAnimalTotal(orphanSnap), 'an incomplete snapshot must use its own live herd, not the current reserve');

reserve.supplies = reserve.supplies || {};
reserve.supplies.dogFood = 8;
const afterIdle = withRandom(0.4, () => simulateDay('派猎犬侦察：检查水边路线', state)).world.reserve;
assert.ok(Math.abs(livingAnimalTotal(afterIdle) - opening) <= 3, `idle day must not snap by ~40 animals, delta ${livingAnimalTotal(afterIdle) - opening}`);
assert.equal(afterIdle.ecology.herbivores.antelope, 1);

const beforeRescue = livingAnimalTotal(afterIdle);
const target = (normalizeChapterRescue(afterIdle, 1).targets || [])[0];
(target.requiredItems || []).forEach((itemId) => addRescueItem(afterIdle, itemId));
assert.equal(rescueAnimal(afterIdle, target.targetId).ok, true);
assert.equal(afterIdle.ecology.herbivores.antelope, 45, 'rescuing the trapped antelope releases its starter herd, not the 1-count placeholder');
assert.equal(livingAnimalTotal(afterIdle), beforeRescue + 44, 'the live herd must gain the released animals minus the 1 already counted while trapped');
assert.ok(livingAnimalTotal(afterIdle) >= 120, 'rescuing antelope must add the starter herd into the live total');
assert.ok(chapterAnimalTotal(afterIdle) < chapterTargets(1).animals, 'a single rescue must not finish the chapter 1 animal total');
assert.equal(chapterCoreMetrics(afterIdle, 1).met.animals, false, 'chapter 1 animal gate stays open after the antelope release');
assert.equal(chapterCoreMetrics(afterIdle, 1).species, 7, 'rescuing antelope should complete the chapter 1 species goal');

const poachState = createCharacter(null, '盗猎困住扣减动物');
const poach = poachState.world.reserve;
normalizeChapterRescue(poach, 1, { fresh: true });
const poachHud = livingAnimalTotal(poach);
const deerBefore = Math.max(0, Number(poach.ecology.herbivores.deer) || 0);
const trapped = createPoacherRescue(poach, 'deer', 1, 2);
assert(trapped, 'a living deer must be eligible for a poaching trap');
assert.equal(Number(poach.ecology.herbivores.deer), deerBefore - 1, 'poaching must remove the trapped animal from the living herd');
assert.equal(livingAnimalTotal(poach), poachHud - 1, 'HUD animal total must fall while the poached animal is trapped');
assert.equal(createPoacherRescue(poach, 'deer', 1, 2), null, 'a second same-day poaching trap must not stack');
(trapped.requiredItems || []).forEach((itemId) => addRescueItem(poach, itemId));
const rescued = rescuePoacherAnimal(poach, trapped.targetId);
const rescueBonus = Math.max(1, Math.round(poachHud * 0.03));
assert.equal(rescued.ok, true);
assert.equal(rescued.bonus, rescueBonus, 'a successful poacher rescue rewards 3% of the current animal total');
assert.equal(Number(poach.ecology.herbivores.deer), deerBefore + rescueBonus, 'rescue returns the trapped animal and adds the 3% herd reward');
assert.equal(livingAnimalTotal(poach), poachHud + rescueBonus, 'HUD animal total includes the returned animal and the 3% reward');

console.log('animal total snap check ok');
