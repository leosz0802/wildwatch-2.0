'use strict';

const assert = require('node:assert/strict');

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

function restart() {
  return quiet(new Game());
}

function openAndFire(game, rescue, itemId, aim) {
  assert.equal(game.openChapterRescueTask(rescue.targetId), true, '重新进入章节解救任务必须成功');
  const item = (game.infoDetailModal.items || []).find((entry) => String(entry.title || '').includes(itemId))
    || game.infoDetailModal.items[0];
  assert(item && typeof item.action === 'function', '章节任务必须提供当前物品的继续收集入口');
  const expectedBefore = Math.max(0, Number(game.rescueRecordFor(rescue.targetId).pointProgress[itemId]) || 0);
  assert.match(String(item.title), new RegExp(`点数 ${expectedBefore}/12`), '重新进入任务卡必须显示最新累计分数');
  item.action();
  assert.equal(game.infoDetailModal.kind, 'materialExploration', '继续收集必须打开射箭窗口');
  game.infoDetailModal.archeryAimValue = aim;
  const score = game.archeryScoreFor(game.infoDetailModal);
  game.infoDetailModal.action();
  if (game.waitingArcheryOrDiceConfirm()) game.confirmArcheryScore();
  const record = game.rescueRecordFor(rescue.targetId);
  const expectedAfter = Math.min(12, expectedBefore + score);
  assert.equal(record.pointProgress[itemId], expectedAfter, '本轮得分必须累加到章节解救账本');
  assert(game.settlementModal, '射箭结算后必须生成可关闭的结算页');
  game.finishSettlement('home');
  assert.equal(game.settlementModal, null, '关闭结算页后不得留下旧结算层');
  saveState(game.state);
  return { score, total: expectedAfter };
}

const originalTimeout = global.setTimeout;
global.setTimeout = (fn) => { fn(); return 0; };
try {
  stored = {};
  let game = quiet(new Game());
  game.state = createCharacter(null, '多轮射箭重新进入');
  saveState(game.state);
  const rescue = nextRescueTask(game.state.world.reserve, 1);
  const itemId = rescue.requiredItems[0];
  const aims = [0.1, 0.5, 0.9]; // 2 + 6 + 2 = 10，确保仍可继续下一轮
  let total = 0;

  aims.forEach((aim, index) => {
    game = restart();
    const round = openAndFire(game, rescue, itemId, aim);
    total += round.score;
    assert.equal(round.total, Math.min(12, total), `第${index + 1}轮累计分数必须闭合`);

    // 重新创建 Game，模拟关闭窗口后再次进入或系统恢复；不能只依赖内存中的弹窗。
    game = restart();
    const persisted = game.rescueRecordFor(rescue.targetId);
    assert.equal(persisted.pointProgress[itemId], Math.min(12, total), `第${index + 1}轮读档后累计分数不能回退`);
    assert.equal(game.openChapterRescueTask(rescue.targetId), true, `第${index + 1}轮读档后任务必须可重开`);
    const card = (game.infoDetailModal.items || []).find((entry) => String(entry.title || '').includes(itemId))
      || game.infoDetailModal.items[0];
    assert.match(String(card.title), new RegExp(`点数 ${Math.min(12, total)}/12`), `第${index + 1}轮任务卡必须显示累计分数`);
    game.dismissInfoDetailModal();
  });

  const final = restart();
  const finalRecord = final.rescueRecordFor(rescue.targetId);
  assert.equal(finalRecord.pointProgress[itemId], 10, '三轮射箭最终累计必须为10点');
  assert.deepEqual(
    final.state.world.reserve.archeryHistory.slice(-3).map((shot) => shot.score),
    [2, 6, 2],
    '三轮实际得分必须逐轮保存在射箭历史'
  );
  assert.equal(final.state.world.reserve.lastRescueShot.totalScore, 10, '最近解救射箭记录必须保存累计总分');
} finally {
  global.setTimeout = originalTimeout;
}

console.log('archery multi-round re-entry check ok: every shot survives close, reopen, restart, and cumulative ledger reconciliation');
