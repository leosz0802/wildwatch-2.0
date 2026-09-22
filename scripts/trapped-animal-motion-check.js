'use strict';

function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === 'measureText') return (value) => ({ width: String(value || '').length * 7 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
      if (prop === 'canvas') return { width: 375, height: 667 };
      if (!target[prop]) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) { target[prop] = value; return true; }
  });
}

global.wx = {
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 1 }; },
  createCanvas() { return { width: 375, height: 667, getContext: fakeContext }; },
  createImage() { return { loaded: true, set src(value) { this._src = value; if (this.onload) this.onload(); }, get src() { return this._src; } }; },
  getStorageSync() { return null; }, setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');
const { normalizeChapterRescue } = require('../js/chapterRescueSystem');
const { CHAPTERS } = require('../js/animalWorld');

// Exercise the real home-map render for every chapter.  A previous fix only
// covered chapter 1 because it inspected the current target record; later
// chapters use different species ids and can reintroduce the captive sprite
// into the free-roaming motion layer after a clean rebuild.
const checked = [];
CHAPTERS.forEach((definition) => {
  const game = new Game();
  game.stopLoop();
  game.state = createCharacter(null, `被困动物移动回归测试-${definition.chapter}`);
  game.screen = 'home';
  game.width = 375;
  game.height = 667;
  game.ctx = fakeContext();
  game.render = () => {};
  // Make the deferred atlas available in the test so chapters 5–20 exercise
  // their actual sandbox roster instead of being hidden by asset gating.
  game.remoteAssetCompleted = new Set(['animalMapSprites']);
  Object.assign(game.state.world.reserve.progression, {
    stage: definition.chapter,
    displayChapter: definition.chapter,
    level: definition.level
  });
  game.sandboxAnimalRosterCache = null;
  const rescue = normalizeChapterRescue(game.state.world.reserve, definition.chapter, { fresh: true });
  const pending = (rescue.targets || []).filter((entry) => entry.status !== 'rescued');
  const motionCalls = [];
  const originalMotion = game.movingAnimalPosition.bind(game);
  game.movingAnimalPosition = (animal, ...args) => {
    motionCalls.push(animal);
    return originalMotion(animal, ...args);
  };
  game.drawHome(game.ctx);

  const playable = game.sandboxPlayableWorld();
  const markerBeforePan = (game.renderedRescueMapMarkers || []).map((marker) => ({
    targetId: marker.targetId,
    x: marker.x,
    y: marker.y,
    w: marker.w,
    worldX: marker.worldX,
    worldY: marker.worldY
  }));
  if (pending.length) {
    markerBeforePan.forEach((before) => {
      if (!Number.isFinite(before.worldX) || !Number.isFinite(before.worldY)
        || before.worldX < playable.minX || before.worldX > playable.maxX
        || before.worldY < playable.minY || before.worldY > playable.maxY) {
        throw new Error(`chapter ${definition.chapter} captive must plant on the sandbox tile: ${before.targetId}`);
      }
    });
    game.panMapBy(80, 50);
    // Re-enter the same full screen render path used after a real gesture.
    // Checking only drawChapterRescueMarkers can miss a stale sprite left by
    // the fast map-render branch.
    game.drawHome(game.ctx);
    markerBeforePan.forEach((before) => {
      const after = (game.renderedRescueMapMarkers || []).find((marker) => marker.targetId === before.targetId);
      if (!after) {
        throw new Error(`chapter ${definition.chapter} captive marker disappeared after map drag: ${before.targetId}`);
      }
      if (Math.abs(after.worldX - before.worldX) > 0.0001 || Math.abs(after.worldY - before.worldY) > 0.0001) {
        throw new Error(`chapter ${definition.chapter} captive left its planted sandbox tile on drag: ${before.targetId}`);
      }
      const expected = game.mapPoint(before.worldX, before.worldY, game.mapCameraFrame);
      if (Math.abs((after.x + after.w / 2) - expected.x) > 1 || Math.abs((after.y + 36) - expected.y) > 1) {
        throw new Error(`chapter ${definition.chapter} captive screen point must follow its planted tile: ${before.targetId}`);
      }
      if (Math.abs(after.x - before.x) < 1 && Math.abs(after.y - before.y) < 1) {
        throw new Error(`chapter ${definition.chapter} captive was screen-pinned instead of planted: ${before.targetId}`);
      }
    });
    const zoomBefore = game.mapZoom;
    game.mapZoom = 1.85;
    game.drawHome(game.ctx);
    markerBeforePan.forEach((before) => {
      const after = (game.renderedRescueMapMarkers || []).find((marker) => marker.targetId === before.targetId);
      if (!after) {
        throw new Error(`chapter ${definition.chapter} captive marker disappeared after map zoom: ${before.targetId}`);
      }
      if (Math.abs(after.worldX - before.worldX) > 0.0001 || Math.abs(after.worldY - before.worldY) > 0.0001) {
        throw new Error(`chapter ${definition.chapter} captive left its planted sandbox tile on zoom: ${before.targetId}`);
      }
      const expected = game.mapPoint(before.worldX, before.worldY, game.mapCameraFrame);
      if (Math.abs((after.x + after.w / 2) - expected.x) > 1 || Math.abs((after.y + 36) - expected.y) > 1) {
        throw new Error(`chapter ${definition.chapter} captive zoom point must follow its planted tile: ${before.targetId}`);
      }
    });
    game.mapZoom = zoomBefore;
  }

  pending.forEach((captive) => {
    const leaked = motionCalls.some((animal) => animal && (
      animal.species === captive.speciesName
      || animal.speciesId === captive.speciesId
    ));
    if (leaked) throw new Error(`chapter ${definition.chapter} captive animal leaked into free-roaming motion layer: ${captive.speciesId}`);
    const marker = (game.renderedRescueMapMarkers || []).find((item) => item.speciesId === captive.speciesId);
    if (!marker) {
      throw new Error(`chapter ${definition.chapter} captive animal must remain represented by one rescue marker: ${captive.speciesId}`);
    }
    if (marker.worldX < playable.minX || marker.worldX > playable.maxX
      || marker.worldY < playable.minY || marker.worldY > playable.maxY) {
      throw new Error(`chapter ${definition.chapter} rescue marker left the sandbox playable area: ${captive.speciesId}`);
    }
  });
  checked.push({ chapter: definition.chapter, pending: pending.length, motionCalls: motionCalls.length });
});

const releaseGame = new Game();
releaseGame.stopLoop();
releaseGame.state = createCharacter(null, "解救动画与回归");
releaseGame.screen = "home";
releaseGame.width = 375;
releaseGame.height = 667;
releaseGame.ctx = fakeContext();
releaseGame.render = () => {};
releaseGame.remoteAssetCompleted = new Set(["animalMapSprites"]);
releaseGame.sandboxAnimalRosterCache = null;
const { addRescueItem, rescueItemCount, findRecord } = require("../js/chapterRescueSystem");
const chapterOne = normalizeChapterRescue(releaseGame.state.world.reserve, 1, { fresh: true });
const firstTarget = (chapterOne.targets || []).find((entry) => entry.status !== "rescued");
if (!firstTarget) throw new Error("chapter 1 must expose a pending rescue target");
releaseGame.drawHome(releaseGame.ctx);
const markerBefore = (releaseGame.renderedRescueMapMarkers || []).find((marker) => marker.speciesId === firstTarget.speciesId);
if (!markerBefore) throw new Error("pending rescue animal must appear on the home map");
(firstTarget.requiredItems || []).forEach((itemId) => addRescueItem(releaseGame.state.world.reserve, itemId));
if (!rescueItemCount(releaseGame.state.world.reserve, firstTarget.requiredItems[0])) {
  throw new Error("rescue items must be credited before completion");
}
releaseGame.activeTaskLock = {
  id: `rescue:1:${firstTarget.targetId}`,
  kind: "chapterRescue",
  animalId: firstTarget.speciesId,
  targetId: firstTarget.targetId,
  startedAt: Date.now()
};
if (!releaseGame.completeChapterRescue(firstTarget.targetId)) {
  throw new Error("ready rescue must complete from the map marker");
}
const pulse = releaseGame.mapConsequencePulse;
if (!pulse || pulse.rescueSpeciesId !== firstTarget.speciesId) {
  throw new Error("rescue completion must start the release animation");
}
if (!Number.isFinite(pulse.x) || !Number.isFinite(pulse.y)) {
  throw new Error("release animation must use the planted sandbox tile");
}
if (Math.abs(pulse.x - markerBefore.worldX) > 0.0001 || Math.abs(pulse.y - markerBefore.worldY) > 0.0001) {
  throw new Error("release animation must start on the same sandbox tile as the captive marker");
}
const realNow = Date.now;
Date.now = () => pulse.startedAt + 200;
releaseGame.drawHome(releaseGame.ctx);
const cutting = pulse.renderedRelease;
if (!cutting || cutting.phase !== "cutting") throw new Error("release animation must start by cutting the rope");
const animalXBeforePan = cutting.animalX;
const plantedScreenBefore = releaseGame.mapPoint(pulse.x, pulse.y, releaseGame.mapCameraFrame);
releaseGame.panMapBy(90, 70);
releaseGame.drawHome(releaseGame.ctx);
const afterPan = pulse.renderedRelease;
const plantedScreenAfter = releaseGame.mapPoint(pulse.x, pulse.y, releaseGame.mapCameraFrame);
if (!afterPan || Math.abs((afterPan.animalX - animalXBeforePan) - (plantedScreenAfter.x - plantedScreenBefore.x)) > 1) {
  throw new Error("release animation must stay on the planted sandbox tile while the map pans");
}
Date.now = () => pulse.expiresAt + 1;
releaseGame.mapConsequencePulse = pulse;
releaseGame.drawHome(releaseGame.ctx);
Date.now = realNow;
const afterRescueMotion = [];
const originalMotion = releaseGame.movingAnimalPosition.bind(releaseGame);
releaseGame.movingAnimalPosition = (animal, ...args) => {
  afterRescueMotion.push(animal);
  return originalMotion(animal, ...args);
};
releaseGame.drawHome(releaseGame.ctx);
if (!afterRescueMotion.some((animal) => animal && (
  animal.species === firstTarget.speciesName || animal.speciesId === firstTarget.speciesId
))) {
  throw new Error("rescued animal must re-enter the free-roaming map layer");
}
if (findRecord(releaseGame.state.world.reserve.chapterRescue, firstTarget.targetId).status !== "rescued") {
  throw new Error("rescue record must stay rescued after the animation");
}

console.log(`trapped animal motion check ok: ${checked.length} chapters keep captive aliases out of motion and planted on their sandbox tile; rescue release stays on that tile and returns the animal`);
