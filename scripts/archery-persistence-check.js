'use strict';

const assert = require('node:assert/strict');

let stored = {};
// Disable Node's optional RAF so the test can hold a restored pending shot
// before the game loop gets a chance to consume it.
global.requestAnimationFrame = undefined;
global.cancelAnimationFrame = undefined;
const context = new Proxy({}, {
  get(target, key) {
    if (key === 'measureText') return text => ({ width: String(text).length * 7 });
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
    return target[key] || (() => {});
  },
  set(target, key, value) { target[key] = value; return true; }
});

global.wx = {
  getSystemInfoSync: () => ({ platform: 'ohos', windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
  createCanvas: () => ({ width: 375, height: 667, getContext: () => context }),
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {},
  getStorageSync: key => stored[key] && JSON.parse(JSON.stringify(stored[key])),
  setStorageSync: (key, value) => { stored[key] = JSON.parse(JSON.stringify(value)); }
};

const { Game } = require('../js/game');
const { createCharacter, saveState } = require('../js/storage');
const { nextRescueTask } = require('../js/chapterRescueSystem');

function silence(game) {
  game.stopLoop();
  game.render = game.requestRender = game.playSfx = game.playSettlementSfx = game.toast = () => {};
  game.setScreen = screen => { game.screen = screen; };
  game.screen = 'home';
  return game;
}

function freshGame() {
  stored = {};
  const game = silence(new Game());
  game.state = createCharacter(null, '鸿蒙射箭读档');
  return game;
}

function restartedGame() {
  return silence(new Game());
}

const game = freshGame();
const reserve = game.state.world.reserve;
const rescue = nextRescueTask(reserve, 1);
const item = rescue.requiredItems[0];
game.activeTaskLock = { kind: 'chapterRescue', targetId: rescue.targetId };
assert.equal(game.openMaterialExploration(item), true);
game.infoDetailModal.archeryAimValue = 0.1;
const score = game.archeryScoreFor(game.infoDetailModal);
game.queuePendingArcheryShot({
  token: 'ohos-restart-shot',
  kind: 'materialExploration',
  targetId: item,
  rescueTargetId: rescue.targetId,
  score
});

// 鸿蒙触控层可能在落靶后先销毁弹窗；此时只保存待结算箭，模拟强退/重建上下文。
game.infoDetailModal = null;
saveState(game.state);

const restarted = restartedGame();
restarted.activeTaskLock = { kind: 'chapterRescue', targetId: rescue.targetId };
assert.equal(restarted.pendingArcheryShot().score, score, '重建上下文必须先恢复待结算箭');
assert.equal(restarted.openMaterialExploration(item), true, '重新进入物资射箭页应可打开');
assert.equal(restarted.waitingArcheryOrDiceConfirm(), true, '读档后必须停在确认得分，不能自动闪进结算');
assert.equal(restarted.confirmArcheryScore(), true, '确认得分必须有效');
if (restarted.settlementModal) restarted.finishSettlement('home');
assert.equal(restarted.openMaterialExploration(item), true, '确认后再进入必须打开射箭页');
assert.equal(restarted.infoDetailModal.collectionProgress.current, score, '第二次进入必须显示上一箭实际得分');
assert.equal(restarted.state.world.reserve.pendingArcheryShot, null, '确认后待结算箭只能提交一次');
assert.equal(restarted.state.world.reserve.lastArcheryShot.score, score, '最近射箭结果必须写入持久账本');
assert.equal(restarted.rescueRecordFor(rescue.targetId).pointProgress[item], score, '解救账本必须恢复上一箭累计点数');

// 再次读档/再次打开不能重复增加同一支箭。
saveState(restarted.state);
const reopened = restartedGame();
assert.equal(reopened.state.world.reserve.lastArcheryShot.score, score);
assert.equal(reopened.rescueRecordFor(rescue.targetId).pointProgress[item], score);

console.log('archery persistence check ok: Harmony restart restores pending shot, score, and rescue ledger without double count');
