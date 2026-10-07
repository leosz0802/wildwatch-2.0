'use strict';

const assert = require('node:assert/strict');

let stored;
global.wx = {
  getSystemInfoSync: () => ({ platform: 'ohos', windowWidth: 375, windowHeight: 667, pixelRatio: 2 }),
  createCanvas: () => ({ width: 750, height: 1334, getContext: () => null }),
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {},
  getStorageSync: () => stored && JSON.parse(JSON.stringify(stored)),
  setStorageSync: (_key, state) => { stored = JSON.parse(JSON.stringify(state)); }
};

const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');
const { nextRescueTask } = require('../js/chapterRescueSystem');
const { UNLOCK_DELAY_MS, chapterSpecialDef } = require('../js/chapterSpecialSystem');

function makeGame(name) {
  const game = new Game();
  game.stopLoop();
  game.state = createCharacter(null, name);
  game.screen = 'home';
  game.render = game.requestRender = game.playSfx = game.playSettlementSfx = game.toast = () => {};
  game.setScreen = (screen) => { game.screen = screen; };
  return game;
}

function fireRescueShot(game, aim = 0.5) {
  const rescue = nextRescueTask(game.state.world.reserve, 1);
  const item = rescue.requiredItems[0];
  game.activeTaskLock = { kind: 'chapterRescue', targetId: rescue.targetId };
  assert.equal(game.openMaterialExploration(item), true);
  game.infoDetailModal.archeryAimValue = aim;
  const expected = game.archeryScoreFor(game.infoDetailModal);
  const originalTimeout = global.setTimeout;
  global.setTimeout = () => 0;
  try {
    game.infoDetailModal.action();
  } finally {
    global.setTimeout = originalTimeout;
  }
  return { rescue, item, expected };
}

{
  const game = makeGame('射箭单次入账');
  const { rescue, item, expected } = fireRescueShot(game);
  assert.equal(game.rescueRecordFor(rescue.targetId).pointProgress[item] || 0, 0, '动画未结束前不能入账');
  assert(game.pendingArcheryShot(), '发射后必须留下持久待结算箭');
  game.infoDetailModal = null;
  assert.equal(game.flushPendingArcheryShot(Date.now(), true), true, '弹窗被鸿蒙拆掉后必须回到确认得分');
  assert.equal(game.waitingArcheryOrDiceConfirm(), true, '拆页后仍要停在确认得分');
  assert.equal(game.confirmArcheryScore(), true, '确认得分必须写入解救账本');
  assert.equal(game.rescueRecordFor(rescue.targetId).pointProgress[item], expected, '单次得分必须写入解救账本');
  assert.equal(game.state.world.reserve.lastArcheryShot.score, expected, 'lastArcheryShot 必须记录本次得分');
  assert.equal(game.flushPendingArcheryShot(Date.now(), true), false, '同一支箭不能重复入账');
  assert.equal(game.rescueRecordFor(rescue.targetId).pointProgress[item], expected, '重复结算不得再加分');
}

{
  const game = makeGame('射箭累计与完成');
  const rescue = nextRescueTask(game.state.world.reserve, 1);
  const item = rescue.requiredItems[0];
  game.activeTaskLock = { kind: 'chapterRescue', targetId: rescue.targetId };
  let total = 0;
  const originalTimeout = global.setTimeout;
  global.setTimeout = (fn) => { fn(); return 0; };
  try {
    for (let shot = 1; shot <= 3; shot += 1) {
      game.openMaterialExploration(item);
      game.infoDetailModal.archeryAimValue = shot === 1 ? 0.5 : shot === 2 ? 0.1 : 0.9;
      const expected = game.archeryScoreFor(game.infoDetailModal);
      game.infoDetailModal.action();
      if (game.waitingArcheryOrDiceConfirm()) game.confirmArcheryScore();
      total = Math.min(12, total + expected);
      assert.equal(game.rescueRecordFor(rescue.targetId).pointProgress[item], total, `第${shot}箭累计必须是 ${total}`);
      if (game.settlementModal) game.finishSettlement('home');
    }
  } finally {
    global.setTimeout = originalTimeout;
  }
  const history = game.state.world.reserve.archeryHistory || [];
  assert.ok(history.length >= 3, '三次射箭都必须进入 archeryHistory');
}

{
  const game = makeGame('射箭连点去重');
  const { rescue, item, expected } = fireRescueShot(game, 0.5);
  const modal = game.infoDetailModal;
  modal.action();
  modal.action();
  game.recoverStuckDiceOrArchery(Date.now(), true);
  if (game.waitingArcheryOrDiceConfirm()) game.confirmArcheryScore();
  game.recoverStuckDiceOrArchery(Date.now(), true);
  assert.equal(game.rescueRecordFor(rescue.targetId).pointProgress[item], expected, '连点发射只能入账一次');
}

{
  const game = makeGame('特别任务弹窗丢失仍入账');
  const reserve = game.state.world.reserve;
  reserve.progression = Object.assign({}, reserve.progression, { stage: 2, displayChapter: 2 });
  reserve.chapterSpecial = {
    version: 1, chapter: 2, enteredAt: Date.now() - UNLOCK_DELAY_MS, unlocked: true, completed: false
  };
  const def = chapterSpecialDef(2);
  game.infoDetailModal = {
    kind: 'chapterSpecialTask',
    phase: 'ready',
    explorationMode: 'archery',
    def,
    displayRoll: 0,
    actionLabel: '射箭判定'
  };
  game.lockArcheryAim = () => 0.5;
  game.archeryScoreFor = () => 5;
  let landed = null;
  game.animateInlineDiceRoll = (modal, roll, tokenKey, onDone) => { landed = onDone; };
  const waterBefore = reserve.ecology.water;
  assert.equal(game.resolveChapterSpecialTask(), true);
  assert.equal(reserve.chapterSpecial.completed, false, '动画结束前特别任务不能完成');
  assert.equal(reserve.ecology.water, waterBefore, '落靶前不能改数值');
  game.infoDetailModal = null;
  assert.equal(game.flushPendingArcheryShot(Date.now(), true), true, '特别任务弹窗丢失后必须回到确认得分');
  assert.equal(game.waitingArcheryOrDiceConfirm(), true, '特别任务拆页后仍要停在确认得分');
  assert.equal(game.confirmResolvedArcheryOrDice(), true, '特别任务确认得分必须写入');
  assert.equal(game.state.world.reserve.chapterSpecial.completed, true, '特别任务必须完成并入账');
  assert.notEqual(game.state.world.reserve.ecology.water, waterBefore, '特别任务数值必须落地');
  if (typeof landed === 'function') landed();
  assert.equal(game.flushPendingArcheryShot(Date.now(), true), false, '特别任务不能重复结算');
}

console.log('archery ledger commit check ok: single score, cumulative, no double count, modal-loss recovery');
