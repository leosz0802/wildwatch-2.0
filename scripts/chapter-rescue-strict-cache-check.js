'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');

// Match WeChat's strict execution even if the source later loses its directive.
const file = path.resolve(__dirname, '../js/chapterRescueSystem.js');
const box = { module: { exports: {} }, require: createRequire(file) };
vm.runInNewContext('"use strict";\n' + fs.readFileSync(file, 'utf8'), box, { filename: file });
const api = box.module.exports;
const { CHAPTERS, speciesPopulationGroup } = require('../js/animalWorld');
let checked = 0;
for (let chapter = 1; chapter <= CHAPTERS.length; chapter++) {
  const reserve = { inventory: { rescueItems: {} }, ecology: { herbivores: {}, predators: {}, birds: {} } };
  let state = api.normalizeChapterRescue(reserve, chapter, { fresh: true });
  assert.strictEqual(api.normalizeChapterRescue(reserve, chapter), state, 'unchanged normalization should reuse cache');
  for (const targetId of Array.from(state.targets, target => target.targetId)) {
    state = api.normalizeChapterRescue(reserve, chapter);
    // Reproduce the exact non-configurable descriptor, including old runtime objects.
    assert.strictEqual(Object.getOwnPropertyDescriptor(state, '_normalizedChapter').configurable, false);
    const target = api.findRecord(state, targetId);
    const inventory = JSON.stringify(reserve.inventory);
    assert.strictEqual(api.canRescueAnimal(reserve, targetId), false);
    const blocked = api.rescueAnimal(reserve, targetId);
    assert.strictEqual(blocked.ok, false);
    assert(blocked.missing.length > 0);
    assert.strictEqual(JSON.stringify(reserve.inventory), inventory, 'missing items cannot consume inventory');
    assert.strictEqual(target.status, 'captive');
    state = api.normalizeChapterRescue(reserve, chapter);
    api.recordRescueExploration(reserve, targetId, target.requiredItems[0], false);
    assert.strictEqual(state._normalizedChapter, undefined, 'exploration must invalidate cache');
    assert.strictEqual(api.findRecord(state, targetId).itemFailures[target.requiredItems[0]], 1);
    state = api.normalizeChapterRescue(reserve, chapter);
    api.recordRescueExploration(reserve, targetId, target.requiredItems[0], true);
    for (const itemId of Array.from(target.requiredItems).slice(1)) {
      state = api.normalizeChapterRescue(reserve, chapter);
      assert(api.collectRescueItem(reserve, targetId, itemId));
      assert.strictEqual(state._normalizedChapter, undefined);
    }
    state = api.normalizeChapterRescue(reserve, chapter);
    assert(api.canRescueAnimal(reserve, targetId));
    const result = api.rescueAnimal(reserve, targetId);
    assert(result.ok);
    assert.strictEqual(state._normalizedChapter, undefined, 'completion must invalidate cache');
    const group = speciesPopulationGroup(result.record.speciesId);
    const population = reserve.ecology[group][result.record.speciesId];
    assert(population > 0);
    const completedAt = result.record.rescuedAt;
    const newState = api.normalizeChapterRescue(reserve, chapter);
    assert.notStrictEqual(newState, state, 'invalidated cache must actually rebuild');
    assert.strictEqual(api.findRecord(newState, targetId).status, 'rescued');
    const saved = JSON.stringify(reserve);
    assert(!saved.includes('_normalizedChapter'), 'runtime cache must not enter save');
    assert.strictEqual(api.rescueAnimal(reserve, targetId).ok, false);
    assert.strictEqual(JSON.stringify(reserve), saved, 'duplicate completion must not change save');
    const restarted = JSON.parse(saved);
    api.normalizeChapterRescue(restarted, chapter);
    assert.strictEqual(api.findRecord(restarted.chapterRescue, targetId).rescuedAt, completedAt);
    assert.strictEqual(restarted.ecology[group][result.record.speciesId], population);
    for (const id of target.requiredItems) assert.strictEqual(api.rescueItemCount(restarted, id), 0);
    checked++;
  }
}

// Exercise the real boar UI action -> sandbox marker -> completion path.
let stored;
const gradient = { addColorStop() {} };
const context = () => new Proxy({}, {
  get(obj, key) {
    if (key === 'measureText') return text => ({ width: String(text).length * 7 });
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
    return obj[key] || (() => {});
  }, set(obj, key, value) { obj[key] = value; return true; }
});
global.wx = {
  getStorageSync: () => stored && JSON.parse(JSON.stringify(stored)),
  setStorageSync: (_key, value) => { stored = JSON.parse(JSON.stringify(value)); },
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
  createCanvas: () => ({ width: 375, height: 667, getContext: context }),
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onAppShow() {}, onAppHide() {}, onKeyboardConfirm() {}, showToast() {}
};
const { Game } = require('../js/game');
const { createCharacter, loadState } = require('../js/storage');
const liveApi = require('../js/chapterRescueSystem');
const game = new Game();
game.state = createCharacter(null, '野猪解救回归');
const reserve = game.state.world.reserve;
Object.assign(reserve.progression, { stage: 2, displayChapter: 2, level: 1 });
liveApi.normalizeChapterRescue(reserve, 2, { fresh: true });
const boar = liveApi.findRecord(reserve.chapterRescue, 'boar');
for (const id of boar.requiredItems) liveApi.addRescueItem(reserve, id);
game.render = function () { this.testRenderCount = (this.testRenderCount || 0) + 1; };
game.requestRender = function () {};
game.setScreen = function (screen) { this.screen = screen; };
game.toast = function () {};
game.activeTaskLock = null;
game.openChapterRescueTask('boar');
assert(game.infoDetailModal.rescueReady);
game.infoDetailModal.action();
assert.strictEqual(game.screen, 'home');
assert.strictEqual(liveApi.findRecord(reserve.chapterRescue, 'boar').status, 'captive', 'navigation cannot complete rescue');
let markerAction;
game.addMapRectHit = function (_x, _y, _w, _h, onTap) { markerAction = onTap; };
game.drawChapterRescueMarkers(context(), { x: 0, y: 0, w: 375, h: 600, worldX: 0, worldY: 0, worldW: 375, worldH: 600, scale: 1 });
assert(markerAction, 'boar marker must be clickable');
assert.strictEqual(markerAction(), true);
assert.strictEqual(liveApi.findRecord(reserve.chapterRescue, 'boar').status, 'rescued');
assert(game.mapConsequencePulse, 'successful marker click must start map feedback');
assert.strictEqual(game.activeTaskLock, null);
const letters = game.state.world.lifeMemory.animalLetters.filter(letter => letter.sourceKind === 'chapterRescue' && letter.species === '野猪');
assert.strictEqual(letters.length, 1);
assert.strictEqual(game.completeChapterRescue('boar'), false);
assert.strictEqual(game.state.world.lifeMemory.animalLetters.filter(letter => letter.id === letters[0].id).length, 1);
const restarted = loadState();
assert.strictEqual(liveApi.findRecord(restarted.world.reserve.chapterRescue, 'boar').status, 'rescued');
for (const id of boar.requiredItems) assert.strictEqual(liveApi.rescueItemCount(restarted.world.reserve, id), 0);
console.log(`chapter rescue strict cache check ok: ${checked} targets across 20 chapters; missing items, collection, cache rebuild, duplicate completion, restart; boar map click, animation trigger and one letter`);

// Rendering the animation must never settle rewards a second time.
const savedReserve = JSON.stringify(reserve);
const releasePulse = game.mapConsequencePulse;
assert.strictEqual(releasePulse.rescueSpeciesId, 'boar');
assert.strictEqual(releasePulse.expiresAt - releasePulse.startedAt, 2200);
const realNow = Date.now;
const originalAvatar = game.drawSpeciesAvatar;
let drawnAnimals = 0;
game.drawSpeciesAvatar = function (_ctx, speciesId) { assert.strictEqual(speciesId, 'boar'); drawnAnimals++; };
try {
  for (const width of [320, 375, 430]) {
    const camera = { x: 0, y: 0, w: width, h: 600, worldX: 0, worldY: 0, worldW: width, worldH: 600, scale: 1 };
    game.mapViewport = { x: 0, y: 0, contentY: 0, w: width, h: 600 };
    let plantedX = 0;
    for (const [elapsed, phase] of [[0, 'cutting'], [600, 'rope-fading'], [1300, 'released'], [2100, 'released']]) {
      Date.now = () => releasePulse.startedAt + elapsed;
      game.drawMapConsequencePulse(context(), camera);
      const rendered = releasePulse.renderedRelease;
      assert.strictEqual(rendered.phase, phase);
      assert(rendered.labelX >= 0 && rendered.labelX + rendered.labelW <= width);
      assert(rendered.labelY >= 0 && rendered.labelY + 26 <= 600);
      if (elapsed >= 1300) assert.strictEqual(rendered.ropeAlpha, 0, 'cut rope must disappear');
      if (!plantedX) plantedX = rendered.animalX;
    }
    camera.worldX -= 80;
    Date.now = () => releasePulse.startedAt + 200;
    game.drawMapConsequencePulse(context(), camera);
    assert(Math.abs(releasePulse.renderedRelease.animalX - (plantedX - 80)) < 1, 'release animation must stay on the planted sandbox tile');
  }
  Date.now = () => releasePulse.expiresAt;
  game.drawMapConsequencePulse(context(), { x: 0, y: 0, w: 375, h: 600 });
  assert.strictEqual(game.mapConsequencePulse, null, 'animation must clean itself up');
} finally {
  Date.now = realNow;
  game.drawSpeciesAvatar = originalAvatar;
}
assert.strictEqual(drawnAnimals, 15);
assert.strictEqual(JSON.stringify(reserve), savedReserve, 'animation is visual-only');
console.log('rescue release animation check ok: cutting -> rope fades -> animal leaves; 320/375/430, expiry cleanup, no repeated settlement');
