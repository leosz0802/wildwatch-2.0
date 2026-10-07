'use strict';

const assert = require('node:assert/strict');

// Simulate the non-pure Harmony lifecycle: the modal and task lock disappear
// after the arrow lands, while the durable pending shot keeps only its rescue
// item. Settlement must still recover the owner and write the cumulative
// score; a second entry must render that score instead of 0.
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
  getSystemInfoSync: () => ({ platform: 'ohos', system: 'HarmonyOS 4.2', windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
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

const originalTimeout = global.setTimeout;
global.setTimeout = (fn) => { fn(); return 0; };
try {
  stored = {};
  const game = quiet(new Game());
  game.state = createCharacter(null, '鸿蒙结算恢复');
  const rescue = nextRescueTask(game.state.world.reserve, 1);
  const itemId = rescue.requiredItems[0];

  // The UI had already created the archery page. Drop the transient objects as
  // Harmony does, then commit the persisted shot with only rescueItemId.
  game.activeTaskLock = { kind: 'chapterRescue', targetId: rescue.targetId };
  assert.equal(game.openMaterialExploration(itemId), true);
  game.queuePendingArcheryShot({
    token: 'harmony_missing_target_1',
    kind: 'materialExploration',
    targetId: itemId,
    rescueTargetId: '',
    rescueItemId: itemId,
    score: 3
  });
  game.infoDetailModal = null;
  game.activeTaskLock = null;
  assert.equal(game.commitPendingArcheryShot(), true, '丢失弹窗后必须回到确认得分');
  assert.equal(game.waitingArcheryOrDiceConfirm(), true, '丢失弹窗后仍要停在确认得分');
  assert.equal(game.confirmArcheryScore(), true, '确认得分必须完成射箭结算');

  const record = game.rescueRecordFor(rescue.targetId);
  assert.equal(record.pointProgress[itemId], 3, '无 rescueTargetId 时应按唯一物品归属写入累计分');
  assert.equal(game.state.world.reserve.lastArcheryShot.rescueItemId, itemId, '射箭账本应保留解救物品');
  saveState(game.state);

  const reopened = quiet(new Game());
  assert.equal(reopened.openChapterRescueTask(rescue.targetId), true, '读档后解救任务应可重新打开');
  assert.match(String(reopened.infoDetailModal.items[0].title), /点数 3\/12/, '任务卡必须显示已保存累计分');
  const entry = reopened.infoDetailModal.items[0];
  entry.action();
  assert.equal(reopened.infoDetailModal.collectionProgress.current, 3, '重新进入射箭页不得显示 0');
  assert.equal(reopened.infoDetailModal.rescueScore.totalScore, 3, '射箭页上下文必须读取累计分');
} finally {
  global.setTimeout = originalTimeout;
}

console.log('Harmony archery settlement recovery ok: modal loss, item-only pending shot and re-entry retain cumulative score');
