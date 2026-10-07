'use strict';

const assert = require('node:assert/strict');

// Reproduce the Harmony/Android lifecycle where the settlement closes, the
// transient task lock is gone, and the next tap enters material exploration
// without passing a target id. The durable archery ledger must restore the
// unfinished rescue task instead of showing a fresh 0-point exploration.
let stored = {};
global.requestAnimationFrame = undefined;
global.cancelAnimationFrame = undefined;
const context = new Proxy({}, {
  get(target, key) {
    if (key === 'measureText') return (value) => ({ width: String(value || '').length * 7 });
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
    return target[key] || (() => {});
  },
  set(target, key, value) { target[key] = value; return true; }
});

global.wx = {
  getSystemInfoSync: () => ({ platform: 'ohos', system: 'HarmonyOS', windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
  createCanvas: () => ({ width: 375, height: 667, getContext: () => context }),
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {},
  getStorageSync: (key) => stored[key] && JSON.parse(JSON.stringify(stored[key])),
  setStorageSync: (key, value) => { stored[key] = JSON.parse(JSON.stringify(value)); }
};

const { Game } = require('../js/game');
const { createCharacter, saveState } = require('../js/storage');
const { nextRescueTask } = require('../js/chapterRescueSystem');

function quiet(game) {
  game.stopLoop();
  game.render = game.requestRender = game.playSfx = game.playSettlementSfx = game.toast = () => {};
  game.setScreen = (screen) => { game.screen = screen; };
  game.screen = 'home';
  return game;
}

function openAndFire(game, rescue, itemId, aim) {
  assert.equal(game.openChapterRescueTask(rescue.targetId), true, '章节解救任务应能打开');
  const item = (game.infoDetailModal.items || []).find((entry) => String(entry.title || '').includes(itemId))
    || game.infoDetailModal.items[0];
  assert(item && typeof item.action === 'function', '解救任务应提供射箭入口');
  item.action();
  assert.equal(game.infoDetailModal.kind, 'materialExploration', '任务入口应打开射箭窗口');
  game.infoDetailModal.archeryAimValue = aim;
  const score = game.archeryScoreFor(game.infoDetailModal);
  game.infoDetailModal.action();
  if (game.waitingArcheryOrDiceConfirm()) game.confirmArcheryScore();
  assert(game.settlementModal, '射箭后应生成结算页');
  return score;
}

const originalTimeout = global.setTimeout;
global.setTimeout = (fn) => { fn(); return 0; };
try {
  stored = {};
  let game = quiet(new Game());
  game.state = createCharacter(null, '通用入口射箭重进');
  saveState(game.state);
  const rescue = nextRescueTask(game.state.world.reserve, 1);
  const itemId = rescue.requiredItems[0];

  const firstScore = openAndFire(game, rescue, itemId, 0.1);
  const firstRecord = game.rescueRecordFor(rescue.targetId);
  assert.equal(firstRecord.pointProgress[itemId], firstScore, '第一轮实际得分应写入章节账本');
  game.finishSettlement('home');
  assert.equal(game.activeTaskLock, null, '结算关闭后应允许从地图重新进入');
  saveState(game.state);

  // This is the reported failing route: no target id is supplied by the map
  // exploration button after HarmonyOS has torn down the task modal.
  const reopened = quiet(new Game());
  assert.equal(reopened.openMaterialExploration(), true, '无目标的通用探索入口应能打开');
  assert.equal(reopened.infoDetailModal.targetId, itemId, '通用入口必须恢复最近未完成解救物品');
  assert.equal(reopened.infoDetailModal.collectionProgress.current, firstScore, '重进必须显示已保存的累计分数');
  assert.equal(reopened.infoDetailModal.rescueScore.totalScore, firstScore, '射箭上下文必须读取累计账本');
  assert.equal(reopened.activeTaskLock.kind, 'chapterRescue', '恢复后必须重新建立解救任务锁');

  // A second round must append to the existing total, not start at zero.
  reopened.infoDetailModal.archeryAimValue = 0.5;
  const secondScore = reopened.archeryScoreFor(reopened.infoDetailModal);
  reopened.infoDetailModal.action();
  if (reopened.waitingArcheryOrDiceConfirm()) reopened.confirmArcheryScore();
  const expected = Math.min(12, firstScore + secondScore);
  const recordAfterSecond = reopened.rescueRecordFor(rescue.targetId);
  assert.equal(recordAfterSecond.pointProgress[itemId], expected, '第二轮得分必须累加到第一轮');
  assert.equal(reopened.state.world.reserve.lastRescueShot.totalScore, expected, '最近射箭记录必须保存累计总分');
  assert.deepEqual(
    reopened.state.world.reserve.archeryHistory.slice(-2).map((shot) => shot.score),
    [firstScore, secondScore],
    '两轮实际得分必须逐轮写入射箭历史'
  );
} finally {
  global.setTimeout = originalTimeout;
}

console.log('archery generic re-entry check ok: Harmony/Android no-target reopen restores and accumulates the durable rescue ledger');
