'use strict';
const assert = require('node:assert/strict');
const { createCharacter } = require('../js/storage');
const { Game, chapterCoreMetrics } = require('../js/game');
const { chapterTargets } = require('../js/chapterTargets');

function totalAnimals(reserve) {
  return ['predators', 'herbivores', 'birds'].reduce((sum, group) => (
    sum + Object.values((reserve.ecology || {})[group] || {}).reduce((sub, value) => sub + Math.max(0, Number(value) || 0), 0)
  ), 0);
}

function boostAnimals(reserve, target) {
  const herd = reserve.ecology.herbivores;
  const id = Object.keys(herd).find((key) => Number(herd[key]) > 0) || 'deer';
  herd[id] = (Number(herd[id]) || 0) + Math.max(0, target - totalAnimals(reserve));
}

function presentSpecies(reserve) {
  let count = 0;
  ['predators', 'herbivores', 'birds'].forEach((group) => {
    Object.keys((reserve.ecology || {})[group] || {}).forEach((id) => {
      if (Number(reserve.ecology[group][id]) > 0) count += 1;
    });
  });
  return count;
}

function boostSpecies(reserve, target) {
  const ecology = reserve.ecology;
  ['predators', 'herbivores', 'birds'].forEach((group) => {
    Object.keys(ecology[group] || {}).forEach((id) => {
      if (presentSpecies(reserve) >= target) return;
      if (Number(ecology[group][id]) <= 0) ecology[group][id] = 1;
    });
  });
}

const state = createCharacter(null, '核心目标锁定');
const reserve = state.world.reserve;
const chapter = 1;
const target = chapterTargets(chapter);
reserve.progression.stage = chapter;
reserve.progression.displayChapter = chapter;
reserve.progression.coreBest = { stage: chapter, species: 0, animals: 0, visitors: 0 };

boostAnimals(reserve, target.animals + 4);
let core = chapterCoreMetrics(reserve, chapter);
assert.equal(core.met.animals, true, 'crossing the animal target must latch that unlock');
assert.ok(core.animals >= target.animals);

const peakAnimals = core.best.animals;
boostAnimals(reserve, Math.max(0, target.animals - 12));
Object.keys(reserve.ecology.herbivores).forEach((id) => {
  reserve.ecology.herbivores[id] = Math.max(1, Math.round((Number(reserve.ecology.herbivores[id]) || 0) * 0.4));
});
core = chapterCoreMetrics(reserve, chapter);
assert.ok(core.animals < target.animals, 'live animal total must be allowed to fall after the latch');
assert.equal(core.met.animals, true, 'later animal loss must not undo a completed animal unlock');
assert.equal(core.best.animals, peakAnimals);

const game = Object.create(Game.prototype);
game.state = state;
const dipped = game.buildChapterProgressDetail();
assert.equal(dipped.core.complete, false, "dipped animal total must return chapter progress to a live shortage");
assert.equal(dipped.metricDetails.animals.coreMetric.current, core.animals);
assert.ok(dipped.metricDetails.animals.items.some((item) => item.tag === "具体任务"), "animal shortage detail must provide a concrete recovery task");

boostSpecies(reserve, target.species);
const rescue = reserve.chapterRescue || {};
Object.values(rescue.animals || {}).forEach((record) => {
  if (record && record.speciesId === "antelope") record.status = "rescued";
});
(rescue.targets || []).forEach((record) => {
  if (record && record.speciesId === "antelope") record.status = "rescued";
});
if ((Number((reserve.ecology.herbivores || {}).antelope) || 0) <= 0) reserve.ecology.herbivores.antelope = 1;
reserve.development = reserve.development || {};
reserve.development.operations = Object.assign({}, reserve.development.operations, { totalVisitors: target.visitors });
core = chapterCoreMetrics(reserve, chapter);
assert.equal(core.met.species, true);
assert.equal(core.met.visitors, true);
assert.equal(core.complete, false, "latched peaks must not allow promotion while live animals are below target");
assert.ok(core.percentages.animals < 100, "live animal percentage can stay below 100 after a dip");

const blocked = game.reserveProgression(reserve);
assert.equal(blocked.stage, chapter, "live animal shortage must block the next chapter");
boostAnimals(reserve, target.animals);
core = chapterCoreMetrics(reserve, chapter);
assert.equal(core.complete, true, "all live core goals must complete after animal recovery");

console.log("chapter core latch check ok");
