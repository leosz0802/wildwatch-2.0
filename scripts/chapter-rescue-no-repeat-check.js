'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
let stored;
global.wx = {
  getStorageSync: () => stored && JSON.parse(JSON.stringify(stored)),
  setStorageSync: (_key, value) => { stored = JSON.parse(JSON.stringify(value)); }
};
const { createCharacter, saveState, loadState } = require('../js/storage');
const api = require('../js/chapterRescueSystem');
const { CHAPTERS, speciesPopulationGroup } = require('../js/animalWorld');
const clone = value => JSON.parse(JSON.stringify(value));
function complete(reserve, target) {
  for (const id of target.requiredItems) api.collectRescueItem(reserve, target.targetId, id);
  assert(api.rescueAnimal(reserve, target.targetId).ok);
  api.normalizeChapterRescue(reserve, target.chapter);
}
const state = createCharacter(null, '章节解救不重复');
let reserve = state.world.reserve;
const antelope = api.nextRescueTask(reserve, 1);
assert.equal(antelope.speciesId, 'antelope');
assert.equal(api.createPoacherRescue(reserve, 'antelope', 1, 5), null,
  'chapter target must not also be a poacher target before its chapter rescue');
complete(reserve, antelope);
// Promotion may rebuild the chapter rescue object; the completion ledger must
// survive that rebuild and prevent chapter 1 from asking for antelope again.
const promoted = clone(reserve);
promoted.world = undefined;
promoted.chapterRescue = Object.assign({}, reserve.chapterRescue, {
  chapter: 2, animals: {}, targets: [], _normalizedChapter: undefined
});
promoted.progression = Object.assign({}, reserve.progression, { stage: 2, displayChapter: 2 });
api.normalizeChapterRescue(promoted, 1, { fresh: false });
assert.equal(api.nextRescueTask(promoted, 1), null, 'promotion rebuild must retain the earlier antelope rescue');
assert.equal(api.findRecord(promoted.chapterRescue, 'chapter:1:rescue:1').status, 'rescued');
saveState(state);
reserve = loadState().world.reserve;
assert.equal(api.nextRescueTask(reserve, 1), null, 'restart must retain chapter completion');
assert.equal(api.createPoacherRescue(reserve, 'antelope', 1, 5), null,
  'rescued antelope must not reappear in chapter 1 through poaching');

// Exercise the actual random candidate selection, not only the factory guard.
const simulatorFile = path.resolve(__dirname, '../js/simulator.js');
const box = { module: { exports: {} }, require: createRequire(simulatorFile), console };
vm.runInNewContext(fs.readFileSync(simulatorFile, 'utf8') + '\nmodule.exports.trigger = maybeTriggerPoacherRescue;', box, { filename: simulatorFile });
const randomReserve = clone(reserve);
randomReserve.ecology.herbivores = { antelope: 3, deer: 3 };
randomReserve.ecology.predators = {}; randomReserve.ecology.birds = {};
Object.assign(randomReserve.progression, { stage: 1, displayChapter: 1, activeSeconds: 180, chapterStart: { activeSeconds: 0 } });
const created = box.module.exports.trigger(randomReserve, 5, () => 0);
assert.equal(created.speciesId, 'deer', 'random picker must skip chapter target and still offer other animals');

// Reproduce a duplicate written by the old build. Loading must remove that
// task/notice and restore its single deducted animal, without replaying rewards.
const legacy = clone(state);
const beforePopulation = legacy.world.reserve.ecology.herbivores.antelope;
const duplicate = { targetId: 'poacher:5:antelope:1', id: 'poacher:5:antelope:1', speciesId: 'antelope', speciesName: '羚羊', chapter: 1, recurring: true, status: 'captive', createdDay: 5, requiredItems: antelope.requiredItems, pointProgress: { [antelope.requiredItems[0]]: 4 } };
legacy.world.reserve.ecology.herbivores.antelope--;
legacy.world.reserve.poacherRescue = { active: [duplicate], history: [], pendingEvent: { targetId: duplicate.targetId } };
saveState(legacy);
const recovered = loadState();
const recoveredReserve = recovered.world.reserve;
assert.equal(api.nextPoacherRescue(recoveredReserve), null);
assert.equal(recoveredReserve.poacherRescue.pendingEvent, null);
assert.equal(recoveredReserve.ecology.herbivores.antelope, beforePopulation);
assert.equal(api.nextRescueTask(recoveredReserve, 1), null);
assert.deepEqual(recoveredReserve.inventory.rescueItems, legacy.world.reserve.inventory.rescueItems);
const once = clone(recoveredReserve);
api.poacherRescueState(recoveredReserve);
api.normalizeChapterRescue(recoveredReserve, 1);
assert.deepEqual(clone(recoveredReserve), once, 'normalization cannot restore population twice');
saveState(recovered);
assert.equal(loadState().world.reserve.ecology.herbivores.antelope, beforePopulation);

// An unfinished real chapter target remains required after removing an old
// duplicate. Partial points from separate tasks must not become chapter points.
stored = null;
const unfinished = createCharacter(null, '未完成章节');
unfinished.world.reserve.poacherRescue = { active: [clone(duplicate)], history: [], pendingEvent: { targetId: duplicate.targetId } };
saveState(unfinished);
const loadedUnfinished = loadState().world.reserve;
assert.equal(api.nextPoacherRescue(loadedUnfinished), null);
assert.equal(api.nextRescueTask(loadedUnfinished, 1).status, 'captive');
assert.equal(api.nextRescueTask(loadedUnfinished, 1).pointProgress?.[antelope.requiredItems[0]] || 0, 0);

// Reverse order in an old save: the player already freed the duplicate
// poacher antelope. That confirmed completion satisfies this chapter animal,
// without adding population, items, points or letters again.
const poacherFirst = clone(unfinished);
poacherFirst.world.reserve.ecology.herbivores.antelope = 1;
poacherFirst.world.reserve.poacherRescue = { active: [], history: [Object.assign({}, duplicate, { status: 'rescued', rescuedAt: 123456 })] };
saveState(poacherFirst);
const poacherFirstLoaded = loadState();
assert.equal(api.nextRescueTask(poacherFirstLoaded.world.reserve, 1), null);
assert.equal(poacherFirstLoaded.world.reserve.ecology.herbivores.antelope, 1);
assert.equal(api.rescueAnimal(poacherFirstLoaded.world.reserve, antelope.targetId).ok, false);
assert.deepEqual(poacherFirstLoaded.world.reserve.inventory.rescueItems, poacherFirst.world.reserve.inventory.rescueItems);
saveState(poacherFirstLoaded);
assert.equal(api.nextRescueTask(loadState().world.reserve, 1), null);
const unconfirmed = clone(poacherFirst);
unconfirmed.world.reserve.poacherRescue.history[0].rescuedAt = 0;
saveState(unconfirmed);
assert(api.nextRescueTask(loadState().world.reserve, 1), 'unconfirmed old status must not bypass chapter rescue');

let targets = 0;
for (let chapter = 1; chapter <= CHAPTERS.length; chapter++) {
  const r = { ecology: { herbivores: {}, predators: {}, birds: {} }, inventory: { rescueItems: {} } };
  const ids = api.normalizeChapterRescue(r, chapter).targets.map(target => target.targetId);
  for (const id of ids) {
    const target = api.findRecord(r.chapterRescue, id);
    assert.equal(api.createPoacherRescue(r, target.speciesId, chapter, 10), null);
    complete(r, target);
    assert.equal(api.createPoacherRescue(r, target.speciesId, chapter, 12), null);
    const loaded = clone(r); api.normalizeChapterRescue(loaded, chapter);
    assert.equal(api.findRecord(loaded.chapterRescue, id).status, 'rescued');
    assert.equal(api.rescueAnimal(loaded, id).ok, false);
    assert(loaded.ecology[speciesPopulationGroup(target.speciesId)][target.speciesId] > 0);
    targets++;
  }
}
assert(api.createPoacherRescue(reserve, 'antelope', 2, 15), 'later chapters may have an independent antelope poaching event');
console.log(`chapter rescue no-repeat check ok: ${targets} targets / ${CHAPTERS.length} chapters; actual random selection, old duplicate cleanup, restart, no duplicate population or rewards`);
