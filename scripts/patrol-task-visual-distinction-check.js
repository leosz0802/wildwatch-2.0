'use strict';

const assert = require('node:assert/strict');

function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === 'measureText') return (value) => ({ width: String(value || '').length * 7 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
      if (!target[prop]) target[prop] = () => {};
      return target[prop];
    }
  });
}

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
  createCanvas: () => ({ width: 375, height: 667, getContext: () => fakeContext() }),
  createImage: () => ({ loaded: true, set src(value) { this._src = value; if (this.onload) this.onload(); } }),
  getStorageSync: () => null,
  setStorageSync() {},
  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
  onTouchCancel() {},
  onKeyboardConfirm() {},
  onAppHide() {},
  onAppShow() {},
  showToast() {}
};

const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');

function makeGame() {
  const game = new Game();
  game.stopLoop();
  game.state = createCharacter(null, '巡护任务视觉区分回归');
  game.state.world.reserve.fund = 10000;
  game.state.world.reserve.supplies = {
    dogFood: 10,
    fieldKit: 10,
    alarm: 10,
    medicalKit: 10,
    tranquilizer: 10
  };
  game.ctx = fakeContext();
  game.width = 375;
  game.height = 667;
  game.dpr = 1;
  game.render = () => {};
  game.requestRender = () => {};
  game.screen = 'home';
  return game;
}

const game = makeGame();
assert.equal(game.openPatrolOperationScreen('houndScout', { taskVariant: 'footprints' }), true);
assert.equal(game.patrolTaskModal.id, 'houndScout');
assert.equal(game.patrolTaskModal.taskVariant, 'footprints');
const footprintLabels = [];
game.text = (_ctx, text) => footprintLabels.push(String(text));
game.hitAreas = [];
game.drawPatrolTaskModal();
assert(footprintLabels.includes('观察脚印'));
assert(!footprintLabels.includes('猎犬侦查'));
assert.equal(game.renderedPatrolTask.style, 'footprint-observation-v1');
assert.equal(game.renderedPatrolTask.sceneTheme, 'mud-bank-tracks');
assert.equal(game.renderedPatrolTask.header.titleBounds.w > 0, true);
assert.match(game.renderedPatrolTask.nextText, /记录脚印/);
assert.equal(game.renderedPatrolTask.metricLayouts[0][0], 'tracks');

const chapterGoalRoute = makeGame();
chapterGoalRoute.infoDetailModal = { kind: 'story' };
assert.equal(chapterGoalRoute.executeGoalAction({
  recommendedAction: 'houndScout',
  taskVariant: 'footprints',
  kind: 'stage'
}), true);
assert.equal(chapterGoalRoute.patrolTaskModal.taskVariant, 'footprints');

const anti = makeGame();
const antiOption = anti.reserveActionOptions().find((option) => option.id === 'antiPoacher');
anti.patrolTaskModal = Object.assign({}, antiOption, { taskVariant: 'anti-poacher' });
const antiLabels = [];
anti.text = (_ctx, text) => antiLabels.push(String(text));
anti.hitAreas = [];
anti.drawPatrolTaskModal();
assert(antiLabels.includes('边界驱赶'));
assert(!antiLabels.includes('猎犬侦查'));
assert.equal(anti.renderedPatrolTask.style, 'anti-poacher-v3');
assert.equal(anti.renderedPatrolTask.sceneTheme, 'risk-boundary');
assert.equal(anti.renderedPatrolTask.header.titleBounds.w > 0, true);
assert.match(anti.renderedPatrolTask.nextText, /结算/);
assert.equal(anti.renderedPatrolTask.metricLayouts[0][0], 'poacher');

const antiRoute = makeGame();
assert.equal(antiRoute.openPatrolOperationScreen('antiPoacher', { taskVariant: 'anti-poacher' }), true);
assert.equal(antiRoute.patrolTaskModal.taskVariant, 'anti-poacher');
assert.equal(antiRoute.settlementModal, null);

const antiChapterGoalRoute = makeGame();
antiChapterGoalRoute.infoDetailModal = { kind: 'story' };
assert.equal(antiChapterGoalRoute.executeGoalAction({
  recommendedAction: 'antiPoacher',
  taskVariant: 'anti-poacher',
  kind: 'stage'
}), true);
assert.equal(antiChapterGoalRoute.patrolTaskModal.taskVariant, 'anti-poacher');

const ordinary = makeGame();
ordinary.patrolTaskModal = ordinary.reserveActionOptions().find((option) => option.id === 'houndScout');
ordinary.hitAreas = [];
ordinary.drawPatrolTaskModal();
assert.equal(ordinary.renderedPatrolTask.id, 'houndScout');
assert.notEqual(ordinary.renderedPatrolTask.style, 'footprint-observation-v1');
assert.notEqual(ordinary.renderedPatrolTask.sceneTheme, 'mud-bank-tracks');

console.log('patrol task visual distinction check ok: footprints, anti-poacher, and ordinary hound routes use separate task cards');
