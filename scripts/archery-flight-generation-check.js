'use strict';

const assert = require('node:assert/strict');

let stored = {};
const context = new Proxy({}, {
  get(target, key) {
    if (key === 'measureText') return (value) => ({ width: String(value || '').length * 7 });
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
    return target[key] || (() => {});
  },
  set(target, key, value) { target[key] = value; return true; }
});

global.requestAnimationFrame = undefined;
global.cancelAnimationFrame = undefined;
global.setTimeout = () => 1;
global.clearTimeout = () => {};
global.wx = {
  getSystemInfoSync: () => ({ platform: 'android', brand: 'vivo', windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
  createCanvas: () => ({ width: 375, height: 667, getContext: () => context }),
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {},
  getStorageSync: (key) => stored[key] && JSON.parse(JSON.stringify(stored[key])),
  setStorageSync: (key, value) => { stored[key] = JSON.parse(JSON.stringify(value)); }
};

const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');

function quiet(game) {
  game.stopLoop();
  game.render = game.requestRender = game.playSfx = game.playSettlementSfx = game.toast = () => {};
  game.setScreen = (screen) => { game.screen = screen; };
  game.screen = 'home';
  game.width = 375;
  game.height = 667;
  game.dpr = 1;
  game.ctx = context;
  return game;
}

stored = {};
const game = quiet(new Game());
game.state = createCharacter(null, '飞行代次回归');
assert.equal(game.openMaterialExploration('quietWaterMarker'), true, '必须能打开射箭窗口');
const modal = game.infoDetailModal;
modal.explorationMode = 'archery';
modal.archeryAimValue = 0.5;

const oldCallbacks = [];
modal.action();

assert.equal(game.infoDetailModal, modal, '落靶后射箭页不能被动画回调拆掉');
assert.equal(game.waitingArcheryOrDiceConfirm(modal), true, '落靶后必须停在确认得分');
assert.equal(modal.diceMotion, null, '确认页出现后弓箭和滑动条必须停止');
assert.equal(game.archeryFlightTimers.size, 0, '确认页不能残留延迟飞行动画');
const landedScore = modal.resultScore;
const historyBefore = (game.state.world.reserve.archeryHistory || []).length;

assert.equal(game.confirmArcheryScore(), true, '确认得分必须完成结算');
assert(game.settlementModal, '确认后必须出现结算页');
const settlement = game.settlementModal;
oldCallbacks.forEach((callback) => callback());

assert.equal(game.settlementModal, settlement, '旧动画回调不能覆盖当前结算页');
assert.equal(game.infoDetailModal, null, '旧动画回调不能复活射箭弹窗');
assert.equal((game.state.world.reserve.archeryHistory || []).length, historyBefore, '旧动画回调不能重复写入射箭历史');
assert.equal(landedScore >= 1 && landedScore <= 6, true, '落靶分数必须是有效点数');

console.log('archery flight generation check ok: launch settles once, aim stops, stale callbacks cannot resurrect or duplicate settlement');
