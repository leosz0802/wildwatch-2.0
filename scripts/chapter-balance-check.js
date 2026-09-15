'use strict';

const assert = require('node:assert/strict');
const { chapterTargets } = require('../js/chapterTargets');
const { CHAPTERS } = require('../js/animalWorld');
const { createInitialWorld } = require('../js/world');
const { simulateDay } = require('../js/simulator');
const {
  chapterDefinition,
  normalizeChapterRescue,
  addRescueItem,
  rescueAnimal,
  chapterRescueSummary
} = require('../js/chapterRescueSystem');
const { previewVisitorRecruitment } = require('../js/visitorRecruitment');

// The duration curve is part of the product contract: six onboarding chapters
// stay in the 3–5 minute band, and the 30% curve begins at chapter 7.
for (let chapter = 1; chapter <= 20; chapter += 1) {
  const current = chapterTargets(chapter);
  assert(current.species > 0 && current.animals > 0 && current.visitors > 0);
  if (chapter <= 6) assert(current.expectedMinutes >= 3 && current.expectedMinutes <= 5);
  if (chapter >= 7) {
    const previous = chapterTargets(chapter - 1);
    assert(Math.abs(current.expectedMinutes / previous.expectedMinutes - 1.3) < 0.001);
  }
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
assert.equal(rescueSpecies.size, 14, 'the rescue schedule should contain only the 14 newly introduced captive species');

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

// Keep the first-chapter target aligned with its only required rescue: five
// starter populations + the released antelope = six species.
assert.equal(chapterTargets(1).species, 6);
assert.equal(chapterDefinition(1).targets[0], 'antelope');

console.log('chapter balance check ok: 20 target rows, six-chapter onboarding, 30% late pacing, 14 unique rescue slots, ecology and visitor sensitivity');
