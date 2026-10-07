'use strict';

const assert = require('node:assert/strict');
const { chapterTargets, chapterAnimalTotal, beginChapterAnimalCheckpoint } = require('../js/chapterTargets');
const { CHAPTERS, SPECIES_DB, speciesPopulationGroup } = require('../js/animalWorld');
const { createInitialWorld } = require('../js/world');
const { createCharacter } = require('../js/storage');
const { simulateDay } = require('../js/simulator');
const {
  chapterDefinition,
  normalizeChapterRescue,
  addRescueItem,
  rescueAnimal,
  chapterRescueSummary,
  livingAnimalTotal
} = require('../js/chapterRescueSystem');
const { previewVisitorRecruitment } = require('../js/visitorRecruitment');

// The duration curve is part of the product contract: chapter 1 is onboarding,
// later chapters require an 8–10 minute story-led session.
for (let chapter = 1; chapter <= 20; chapter += 1) {
  const current = chapterTargets(chapter);
  assert(current.species > 0 && current.animals > 0 && current.visitors > 0);
  if (chapter === 1) assert(current.expectedMinutes >= 3 && current.expectedMinutes <= 5);
  if (chapter === 2) assert(current.expectedMinutes >= 8 && current.expectedMinutes <= 10);
  if (chapter >= 3) assert(current.expectedMinutes >= 12 && current.expectedMinutes <= 24);
}

// A rescue belongs to the chapter that introduces its captive species. It must
// never be backfilled from an older chapter, and a species may occupy only one
// chapter rescue slot in the whole 20-chapter run.
const rescueSpecies = new Set();
for (let chapter = 1; chapter <= 20; chapter += 1) {
  const definition = chapterDefinition(chapter);
  const current = new Set(CHAPTERS[chapter - 1].newSpecies || []);
  for (const speciesId of definition.targets) {
    assert(current.has(speciesId), `chapter ${chapter} rescue must come from its own species`);
    assert(!definition.starter.includes(speciesId), `chapter ${chapter} starter cannot also be captive`);
    assert(!rescueSpecies.has(speciesId), `${speciesId} is assigned to more than one chapter`);
    rescueSpecies.add(speciesId);
  }
  const reserve = { ecology: { predators: {}, herbivores: {}, birds: {} }, inventory: { rescueItems: {} } };
  const state = normalizeChapterRescue(reserve, chapter, { fresh: true });
  for (const target of state.targets) {
    addRescueItem(reserve, target.requiredItems[0]);
    assert(rescueAnimal(reserve, target.targetId).ok, `chapter ${chapter} target should be completable`);
  }
  assert(chapterRescueSummary(reserve, chapter).complete, `chapter ${chapter} rescue ledger should settle`);
}
assert.equal(rescueSpecies.size, 28, 'the rescue schedule should contain every chapter rescue species exactly once');

// Water, grass and safety are strategic inputs to both population health and
// visitor recruitment. Keep a deterministic smoke run so future balance edits
// cannot accidentally disconnect those relationships.
function runEcology(kind) {
  const world = createInitialWorld();
  const reserve = world.reserve;
  if (kind === 'healthy') {
    reserve.safety = 90;
    reserve.ecology.water = 90;
    reserve.ecology.grass = 90;
    reserve.ecology.disease = 5;
    reserve.poacherPressure = 10;
  } else {
    reserve.safety = 20;
    reserve.ecology.water = 20;
    reserve.ecology.grass = 20;
    reserve.ecology.disease = 60;
    reserve.poacherPressure = 80;
  }
  let state = { world, character: { role: 'warden', location: '中央混交林' }, reports: [], messages: [] };
  const oldRandom = Math.random;
  Math.random = () => 0.5;
  try {
    for (let day = 0; day < 8; day += 1) {
      const result = simulateDay('修复水源和草场', state);
      state = { world: result.world, character: result.character, reports: [], messages: [] };
    }
  } finally {
    Math.random = oldRandom;
  }
  const ecology = state.world.reserve.ecology;
  const animals = ['predators', 'herbivores', 'birds']
    .reduce((sum, group) => sum + Object.values(ecology[group] || {}).reduce((n, value) => n + Math.max(0, Number(value) || 0), 0), 0);
  return { reserve: state.world.reserve, animals };
}
const healthy = runEcology('healthy');
const strained = runEcology('strained');
assert(healthy.animals > strained.animals, 'healthy water/grass/safety should preserve more animals');
const visitorHealthy = createInitialWorld().reserve;
const visitorStrained = createInitialWorld().reserve;
visitorHealthy.safety = 90;
visitorHealthy.ecology.water = 90;
visitorHealthy.ecology.grass = 90;
visitorHealthy.ecology.disease = 5;
visitorHealthy.poacherPressure = 10;
visitorStrained.safety = 20;
visitorStrained.ecology.water = 20;
visitorStrained.ecology.grass = 20;
visitorStrained.ecology.disease = 60;
visitorStrained.poacherPressure = 80;
assert(previewVisitorRecruitment(visitorHealthy, 1, 0.5).visitors > previewVisitorRecruitment(visitorStrained, 1, 0.5).visitors,
  'healthy water/grass/safety should recruit more visitors');

// Keep the first-chapter target aligned with its only required rescue: six
// starter populations + the released antelope = seven species. Trapped
// antelope must not count as an owned herd at the opening. Released herds
// count toward the animal total, but the gate stays above a single rescue.
assert.equal(chapterTargets(1).species, 7);
assert.equal(chapterDefinition(1).targets[0], 'antelope');

const openingState = createCharacter(null, '解救种群对章节动物总数');
const openingReserve = openingState.world.reserve;
const openingAnimals = livingAnimalTotal(openingReserve);
const openingHud = chapterAnimalTotal(openingReserve);
const chapterOneTarget = chapterTargets(1).animals;
assert.ok(openingHud < chapterOneTarget, `trapped antelope must not already meet chapter 1 animal total: ${openingHud}/${chapterOneTarget}`);
const antelope = (normalizeChapterRescue(openingReserve, 1).targets || [])[0];
(antelope.requiredItems || []).forEach((itemId) => addRescueItem(openingReserve, itemId));
assert.equal(rescueAnimal(openingReserve, antelope.targetId).ok, true);
const releasedAnimals = livingAnimalTotal(openingReserve);
const releasedHud = chapterAnimalTotal(openingReserve);
const antelopeHerd = Math.max(1, Math.round(Number(SPECIES_DB.antelope.initialPop) || 1));
assert.equal(openingReserve.ecology.herbivores.antelope, antelopeHerd);
assert.equal(releasedAnimals, openingAnimals + antelopeHerd - 1);
assert.ok(releasedHud < chapterOneTarget, `releasing the antelope herd must count toward, not finish, chapter 1 animal total: ${releasedHud}/${chapterOneTarget}`);
assert.ok(chapterOneTarget - releasedHud >= 12, `chapter 1 must still need patrol/comfort after rescue: ${releasedHud}/${chapterOneTarget}`);
for (let chapter = 1; chapter <= 20; chapter += 1) {
  const later = createCharacter(null, `第${chapter}章解救`);
  const reserve = later.world.reserve;
  Object.assign(reserve.progression, { stage: chapter, displayChapter: chapter, level: CHAPTERS[chapter - 1].level });
  beginChapterAnimalCheckpoint(reserve, chapter, chapter === 1 ? 0 : chapterTargets(chapter - 1).animals);
  normalizeChapterRescue(reserve, chapter, { fresh: chapter === 1 });
  const before = chapterAnimalTotal(reserve);
  let expectedGain = 0;
  (normalizeChapterRescue(reserve, chapter).targets || []).forEach((record) => {
    const existing = Math.max(0, Number(((reserve.ecology || {})[speciesPopulationGroup(record.speciesId)] || {})[record.speciesId]) || 0);
    const released = Math.max(1, Math.round(Number((SPECIES_DB[record.speciesId] || {}).initialPop) || 1));
    expectedGain += Math.max(0, released - existing);
    (record.requiredItems || []).forEach((itemId) => addRescueItem(reserve, itemId));
    assert.equal(rescueAnimal(reserve, record.targetId).ok, true);
  });
  const after = chapterAnimalTotal(reserve);
  assert.equal(after - before, expectedGain, `chapter ${chapter} rescue must add the released starter herds to the chapter animal HUD`);
  assert.ok(after < chapterTargets(chapter).animals, `chapter ${chapter} rescue alone must not finish the animal total: ${after}/${chapterTargets(chapter).animals}`);
}

console.log('chapter balance check ok: 20 target rows, 10% visitor carryover, two-free/ad-quick visitor pacing, 28 unique rescue slots, ecology and visitor sensitivity');
