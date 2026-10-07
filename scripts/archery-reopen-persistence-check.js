'use strict';

const assert = require('node:assert/strict');

let stored = {};
global.requestAnimationFrame = undefined;
global.cancelAnimationFrame = undefined;
const context = new Proxy({}, {
  get(target, key) {
    if (key === 'measureText') return (text) => ({ width: String(text).length * 7 });
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
const { simulateDay } = require('../js/simulator');

function silence(game) {
  game.stopLoop();
  game.render = game.requestRender = game.playSfx = game.playSettlementSfx = game.toast = () => {};
  game.setScreen = (screen) => { game.screen = screen; };
  game.screen = 'home';
  return game;
}

function restart() { return silence(new Game()); }

function fire(game, targetId, rescueTargetId, aim) {
  game.activeTaskLock = { kind: 'chapterRescue', targetId: rescueTargetId };
  assert.equal(game.openMaterialExploration(targetId), true);
  game.infoDetailModal.archeryAimValue = aim;
  const score = game.archeryScoreFor(game.infoDetailModal);
  game.infoDetailModal.action();
  if (game.waitingArcheryOrDiceConfirm()) game.confirmArcheryScore();
  game.finishSettlement('home');
  return score;
}

const originalTimeout = global.setTimeout;
global.setTimeout = (fn) => { fn(); return 0; };
try {
  let game = silence(new Game());
  game.state = createCharacter(null, '射箭重进账本');
  const rescue = nextRescueTask(game.state.world.reserve, 1);
  const itemId = rescue.requiredItems[0];

  const firstScore = fire(game, itemId, rescue.targetId, 0.1);
  saveState(game.state);
  game = restart();
  const secondScore = fire(game, itemId, rescue.targetId, 0.5);
  const expected = firstScore + secondScore;
  assert.equal(game.rescueRecordFor(rescue.targetId).pointProgress[itemId], expected, '同一会话的累计分数应包含第二箭');
  assert.equal(game.state.world.reserve.lastRescueShot.totalScore, expected, '最近一次解救射箭应写入累计总分');

  // A normal reserve action clones the reserve. Archery fields must survive it,
  // otherwise the next reload can fall back to the first shot.
  const actionResult = simulateDay('修复水源', game.state);
  game.state.world = actionResult.world;
  saveState(game.state);

  // Simulate the stale-record shape reported on HarmonyOS: the latest arrow is
  // present in the archery ledger, while the chapter record still has shot 1.
  const savedRecord = game.state.world.reserve.chapterRescue.animals[rescue.targetId];
  savedRecord.pointProgress[itemId] = firstScore;
  saveState(game.state);
  const reopened = restart();
  const restoredRecord = reopened.rescueRecordFor(rescue.targetId);
  assert.equal(restoredRecord.pointProgress[itemId], expected, '读档必须用最新射箭账本修复章节记录');
  reopened.openChapterRescueTask(rescue.targetId);
  assert.match(reopened.infoDetailModal.items[0].title, new RegExp(`点数 ${expected}/12`), '重新进入解救任务应显示最新累计点数');
  reopened.infoDetailModal.items[0].action();
  assert.equal(reopened.infoDetailModal.collectionProgress.current, expected, '重新进入射箭页不能回退到第一箭');
  assert.deepEqual(reopened.state.world.reserve.archeryHistory.slice(-2).map((shot) => shot.score), [firstScore, secondScore]);
} finally {
  global.setTimeout = originalTimeout;
}

console.log('archery reopen persistence check ok: latest cumulative score survives settlement, reserve cloning, stale record recovery, and re-entry');
