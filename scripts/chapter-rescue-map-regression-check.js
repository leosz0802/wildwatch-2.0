'use strict';

const assert = require('assert');
const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');
const { CHAPTERS } = require('../js/animalWorld');
const {
  addRescueItem,
  findRecord,
  normalizeChapterRescue
} = require('../js/chapterRescueSystem');

const gradient = { addColorStop() {} };
function context() {
  return new Proxy({ globalAlpha: 1 }, {
    get(target, key) {
      if (key === 'measureText') return value => ({ width: Array.from(String(value || '')).length * 7 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
      if (!(key in target)) target[key] = () => {};
      return target[key];
    },
    set(target, key, value) { target[key] = value; return true; }
  });
}

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
  createCanvas: () => ({ width: 375, height: 667, getContext: context }),
  createImage: () => ({
    loaded: true,
    width: 1536,
    height: 864,
    set src(value) { this._src = value; if (this.onload) this.onload(); },
    get src() { return this._src; }
  }),
  getStorageSync: () => null,
  setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

function makeGame(chapter) {
  const game = new Game();
  game.stopLoop();
  game.state = createCharacter(null, `解救地图回归-${chapter}`);
  game.state.ui.onboarding = { version: 2, completed: true, recruitmentDone: true, seen: {} };
  game.width = 375;
  game.height = 667;
  game.ctx = context();
  game.screen = 'home';
  game.scrollY = 0;
  Object.assign(game.state.world.reserve.progression, {
    stage: chapter,
    displayChapter: chapter,
    level: CHAPTERS[chapter - 1].level
  });
  normalizeChapterRescue(game.state.world.reserve, chapter, { fresh: true });
  return game;
}

const originalSetTimeout = global.setTimeout;
const deferred = [];
global.setTimeout = (callback) => { deferred.push(callback); return deferred.length; };
let checked = 0;
try {
  // Reproduce the reported blank-ground frame while the local JPEG is still
  // loading. Procedural river/terrain must render immediately instead of
  // returning after painting only a flat gradient.
  const fallbackGame = makeGame(3);
  fallbackGame.art.map = null;
  fallbackGame.mapArtLoad = { status: 'loading', attempt: 0 };
  let fallbackRiverDraws = 0;
  fallbackGame.drawSavannaRiver = () => { fallbackRiverDraws += 1; };
  fallbackGame.drawCartoonSavannaMap(context(), 0, 0, 375, 600, false, true);
  assert(fallbackRiverDraws > 0, 'map must render procedural terrain while the packaged illustration loads');

  for (let chapter = 1; chapter <= CHAPTERS.length; chapter += 1) {
    const game = makeGame(chapter);
    const reserve = game.state.world.reserve;
    const target = game.chapterRescueState().targets[0];
    if (!target) continue;
    target.requiredItems.forEach(itemId => addRescueItem(reserve, itemId));

    let mapDraws = 0;
    const originalBackdrop = game.drawSimpleReserveMapBackdrop;
    game.drawSimpleReserveMapBackdrop = function (...args) {
      mapDraws += 1;
      return originalBackdrop.apply(this, args);
    };
    game.setScreen = function (screen) { this.screen = screen; };
    game.requestRender = () => {};
    game.toast = () => {};
    game.playSfx = () => {};

    game.render();
    const before = mapDraws;
    assert(game.renderedRescueMapMarkers && game.renderedRescueMapMarkers.length > 0, `chapter ${chapter}: rescue marker missing`);
    const compactMarker = game.renderedRescueMapMarkers.find((marker) => marker.targetId === target.targetId);
    assert(compactMarker && compactMarker.compact, `chapter ${chapter}: unstarted rescue marker should use compact pin`);
    assert(compactMarker.w <= 86 && compactMarker.h <= 42, `chapter ${chapter}: compact rescue pin must not cover a large map area`);
    assert(game.openChapterRescueTask(target.targetId, { autoRun: true }), `chapter ${chapter}: rescue click failed`);
    assert.strictEqual(findRecord(reserve.chapterRescue, target.targetId).status, 'rescued', `chapter ${chapter}: target did not settle`);
    assert(game.mapConsequencePulse && game.mapConsequencePulse.rescueSpeciesId, `chapter ${chapter}: release pulse missing`);
    assert(mapDraws > before, `chapter ${chapter}: sandbox map was not redrawn after rescue`);
    assert.deepStrictEqual(game.renderedRescueMapMarkers, [], `chapter ${chapter}: rescued marker remained interactive`);

    game.mapConsequencePulse = null;
    game.render();
    assert(mapDraws > before + 1, `chapter ${chapter}: sandbox map disappeared after release pulse`);
    checked += 1;
  }

  // The reported boar path is covered explicitly (boar is chapter 2 in the
  // current chapter table; older UI labels called this the third rescue step).
  const boarGame = makeGame(2);
  const boarReserve = boarGame.state.world.reserve;
  const boar = findRecord(boarReserve.chapterRescue, 'boar');
  assert(boar, 'boar rescue record missing');
  boar.requiredItems.forEach(itemId => addRescueItem(boarReserve, itemId));
  boarGame.setScreen = function (screen) { this.screen = screen; };
  boarGame.requestRender = () => {};
  boarGame.toast = () => {};
  boarGame.playSfx = () => {};
  assert(boarGame.openChapterRescueTask('boar', { autoRun: true }), 'boar rescue click failed');
  assert.strictEqual(findRecord(boarReserve.chapterRescue, 'boar').status, 'rescued');

  // A captive marker with a missing rescue item must open the archery screen
  // directly, instead of stopping on the story card or completing early.
  const missingGame = makeGame(1);
  const missingReserve = missingGame.state.world.reserve;
  const missingTarget = missingGame.chapterRescueState().targets.find((record) => record.status !== 'rescued');
  assert(missingTarget, 'missing-item regression target is unavailable');
  missingGame.setScreen = function (screen) { this.screen = screen; };
  missingGame.requestRender = () => {};
  missingGame.toast = () => {};
  missingGame.playSfx = () => {};
  missingGame.render();
  const missingMarker = missingGame.renderedRescueMapMarkers.find((entry) => entry.targetId === missingTarget.targetId);
  assert(missingMarker, 'missing-item rescue marker is not rendered');
  // Exercise the same callback used by the marker's tap handler.  The
  // renderer can skip hit registration in a headless fast-map frame, so the
  // regression focuses on the callback's routing contract here.
  assert(missingGame.activateRescueMapMarker(missingTarget.targetId), 'missing-item marker callback must be handled');
  assert.equal(findRecord(missingReserve.chapterRescue, missingTarget.targetId).status, 'captive',
    'missing-item marker must not attempt a premature rescue');
  const missingItem = missingTarget.requiredItems[0];
  assert(missingGame.infoDetailModal && missingGame.infoDetailModal.kind === 'materialExploration',
    'missing rescue item must open the archery exploration modal');
  assert.equal(missingGame.infoDetailModal.explorationMode, 'archery',
    'rescue item exploration must use the standard archery mode');
  assert.equal(missingGame.infoDetailModal.targetId, missingItem,
    'archery exploration must target the missing rescue item');

  // Chapters 5 and 6 reuse an item that an earlier animal already finished.
  // The new animal must still open archery; the old score and leftover item
  // cannot release it.
  function reuseGame(previousChapter, previousSpecies, nextChapter, nextSpecies) {
    const game = makeGame(previousChapter);
    game.setScreen = function (screen) { this.screen = screen; };
    game.requestRender = () => {};
    game.toast = () => {};
    game.playSfx = () => {};
    const reserve = game.state.world.reserve;
    const previous = findRecord(reserve.chapterRescue, previousSpecies);
    assert(previous, `${previousSpecies} must be a chapter ${previousChapter} rescue`);
    const itemId = previous.requiredItems[0];
    previous.status = 'rescued';
    previous.rescuedAt = Date.now();
    previous.pointProgress = { [itemId]: 12 };
    reserve.inventory = Object.assign({}, reserve.inventory, {
      rescueItems: Object.assign({}, (reserve.inventory || {}).rescueItems, { [itemId]: 1 })
    });
    reserve.materialExplorationProgress = Object.assign({}, reserve.materialExplorationProgress, { [itemId]: 12 });
    reserve.archeryHistory = [{
      targetId: itemId,
      rescueTargetId: previous.targetId,
      rescueItemId: itemId,
      itemId,
      score: 6,
      totalScore: 12,
      chapter: previousChapter,
      recordedAt: Date.now()
    }];
    reserve.lastRescueShot = {
      rescueTargetId: previous.targetId,
      itemId,
      shotScore: 6,
      totalScore: 12,
      recordedAt: Date.now()
    };
    reserve.chapterRescue.completedTargets = Object.assign({}, reserve.chapterRescue.completedTargets, {
      [previous.targetId]: { rescuedAt: previous.rescuedAt, speciesId: previousSpecies, source: 'chapter-rescue' }
    });
    Object.assign(reserve.progression, {
      stage: nextChapter,
      displayChapter: nextChapter,
      level: CHAPTERS[nextChapter - 1].level
    });
    reserve.chapterRescue._normalizedChapter = undefined;
    normalizeChapterRescue(reserve, nextChapter);
    const next = findRecord(reserve.chapterRescue, nextSpecies);
    assert(next && next.status === 'captive', `${nextSpecies} must still be captive in chapter ${nextChapter}`);
    assert.notEqual(next.requiredItems[0], itemId, `${nextSpecies} must use its own rescue item`);
    next.pointProgress = { [itemId]: 12 };
    assert(game.activateRescueMapMarker(next.targetId), `${nextSpecies} tap must open rescue`);
    assert.equal(findRecord(reserve.chapterRescue, next.targetId).status, 'captive',
      `chapter ${nextChapter} ${nextSpecies} must not be rescued by the previous animal's score`);
    assert.equal(game.infoDetailModal && game.infoDetailModal.kind, 'materialExploration');
    assert.equal(game.infoDetailModal.explorationMode, 'archery',
      `chapter ${nextChapter} ${nextSpecies} must open archery`);
    assert.equal(game.infoDetailModal.targetId, next.requiredItems[0],
      `chapter ${nextChapter} ${nextSpecies} archery must target its own item`);
  }
  reuseGame(4, 'lion', 5, 'giraffe');
  reuseGame(1, 'antelope', 6, 'bear');

  // A malformed legacy portrait must degrade to a small result card instead
  // of aborting the frame after clearRect.
  const pulse = boarGame.mapConsequencePulse;
  boarGame.drawRescueReleasePulse = () => { throw new Error('legacy portrait'); };
  boarGame.render();
  assert(/legacy portrait/.test(boarGame.lastRescueMapRenderError || ''), 'rescue render error was not recorded');
  assert(pulse && pulse.renderedRelease && pulse.renderedRelease.fallback, 'rescue render did not use fallback');
} finally {
  global.setTimeout = originalSetTimeout;
}

console.log(`chapter rescue map regression ok: ${checked} target chapters, boar path, marker cleanup, map redraw, malformed legacy fallback`);
