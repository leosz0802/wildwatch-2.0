'use strict';

// Regression for the two reports from HarmonyOS/Android compatibility layers:
// 1) a purchase tap closes/accepts the dialog but the selected quantity is not
//    visible in the material cards;
// 2) an arrow score is visible during the current modal but is lost after
//    leaving and reopening the rescue task.

const assert = require('node:assert/strict');
const { Game } = require('../js/game');
const { createCharacter, saveState } = require('../js/storage');
const { nextRescueTask } = require('../js/chapterRescueSystem');

let stored = {};
const context = new Proxy({}, {
  get(target, key) {
    if (key === 'measureText') return value => ({ width: String(value || '').length * 7 });
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
    return target[key] || (() => {});
  },
  set(target, key, value) { target[key] = value; return true; }
});

global.requestAnimationFrame = undefined;
global.cancelAnimationFrame = undefined;
global.wx = {
  getSystemInfoSync: () => ({ platform: 'ohos', system: 'HarmonyOS', windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
  createCanvas: () => ({ width: 375, height: 667, getContext: () => context }),
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {},
  getStorageSync: key => stored[key] && JSON.parse(JSON.stringify(stored[key])),
  setStorageSync: (key, value) => { stored[key] = JSON.parse(JSON.stringify(value)); }
};

function quiet(game) {
  game.stopLoop();
  game.render = game.requestRender = game.playSfx = game.playSettlementSfx = game.toast = () => {};
  game.setScreen = (screen) => { game.screen = screen; };
  game.screen = 'role';
  return game;
}

// Purchase through the same quantity-picker -> confirmation -> execute path
// used by the device report. The immediate redraw is observable through the
// render counter; the reserve is the authoritative persisted result.
{
  const game = quiet(new Game());
  game.state = createCharacter(null, '采购数量鸿蒙回归');
  const reserve = game.state.world.reserve;
  reserve.fund = 5000;
  reserve.supplies.evidenceTrap = 0;
  let renders = 0;
  game.render = () => { renders += 1; };
  game.openSupplyQuantityPicker('evidenceTrap');
  game.infoDetailModal.quantity = 3;
  const fundBeforePurchase = game.state.world.reserve.fund;
  game.confirmSupplyQuantityPurchase();
  assert.equal(game.state.world.reserve.supplies.evidenceTrap, 3, '确认采购必须写入选择的数量');
  assert.equal(game.state.world.reserve.lastPurchase.amount, 3, 'lastPurchase 必须记录真实数量');
  assert(game.state.world.reserve.fund < fundBeforePurchase, '确认采购必须扣减保护基金');
  assert.equal(game.patrolTaskModal, null, '单项采购不得留下第二层结算');
  assert(renders > 0, '原地采购结算后必须立即重绘物资页');
}

// Result screen must show the cumulative score before the player confirms it,
// then keep the same score after a context restart.
{
  stored = {};
  const game = quiet(new Game());
  game.state = createCharacter(null, '射箭结果鸿蒙回归');
  const reserve = game.state.world.reserve;
  const rescue = nextRescueTask(reserve, 1);
  const item = rescue.requiredItems[0];
  game.activeTaskLock = { kind: 'chapterRescue', targetId: rescue.targetId };
  assert.equal(game.openMaterialExploration(item), true);

  const originalSetTimeout = global.setTimeout;
  const queued = [];
  global.setTimeout = fn => { queued.push(fn); return queued.length; };
  try {
    game.infoDetailModal.archeryAimValue = 0.5;
    game.infoDetailModal.action();
    // Run only the flight frames. The final delayed settle remains queued so
    // this assertion observes the result page exactly as a player sees it.
    let guard = 0;
    while (game.infoDetailModal && game.infoDetailModal.phase !== 'resolved' && queued.length && guard++ < 30) queued.shift()();
    assert.equal(game.infoDetailModal.phase, 'resolved');
    const score = game.infoDetailModal.resultScore;
    assert.equal(game.infoDetailModal.collectionProgress.current, score, '落靶结果页必须显示本次累计后的分数');
    global.setTimeout = originalSetTimeout;
    game.executeMaterialExploration(item, score);
    saveState(game.state);
    const restarted = quiet(new Game());
    restarted.activeTaskLock = { kind: 'chapterRescue', targetId: rescue.targetId };
    assert.equal(restarted.openMaterialExploration(item), true);
    assert.equal(restarted.infoDetailModal.collectionProgress.current, score, '退出重进必须恢复最近一次射箭累计分数');
    assert.equal(restarted.state.world.reserve.lastArcheryShot.score, score, '最近一次射箭结果必须写入持久账本');
  } finally {
    global.setTimeout = originalSetTimeout;
  }
}

delete global.wx;
console.log('purchase + archery persistence regression check ok');
