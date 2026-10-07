'use strict';

const assert = require('node:assert/strict');

let stored = {};
const handlers = {};
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
  getSystemInfoSync: () => ({ platform: 'android', brand: 'vivo', windowWidth: 375, windowHeight: 667, pixelRatio: 3 }),
  createCanvas: () => ({ width: 1125, height: 2001, getContext: () => context }),
  onTouchStart(handler) { handlers.start = handler; },
  onTouchMove(handler) { handlers.move = handler; },
  onTouchEnd(handler) { handlers.end = handler; },
  onTouchCancel() {},
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
  game.width = 375;
  game.height = 667;
  game.dpr = 3;
  return game;
}

function restart() { return quiet(new Game()); }

function landShotWithoutSettle(game, itemId, rescueTargetId, score) {
  game.activeTaskLock = { kind: 'chapterRescue', targetId: rescueTargetId };
  assert.equal(game.openMaterialExploration(itemId), true);
  game.infoDetailModal.archeryAimValue = 0.1;
  game.infoDetailModal.phase = 'resolved';
  game.infoDetailModal.resultScore = score;
  game.infoDetailModal.displayRoll = score;
  game.infoDetailModal.archerySettleToken = `vivo-${score}-${Date.now()}`;
  game.queuePendingArcheryShot({
    token: game.infoDetailModal.archerySettleToken,
    kind: 'materialExploration',
    targetId: itemId,
    rescueTargetId,
    rescueItemId: itemId,
    score
  });
  game.beginArcheryFollowupAbsorb(2000);
  const applied = game.applyPendingArcheryScoreToLedger();
  game.infoDetailModal.collectionProgress = Object.assign({}, game.infoDetailModal.collectionProgress, {
    current: applied.total
  });
  return applied;
}

stored = {};
let game = quiet(new Game());
game.state = createCharacter(null, 'vivo确认得分');
const rescue = nextRescueTask(game.state.world.reserve, 1);
const itemId = rescue.requiredItems[0];

const first = landShotWithoutSettle(game, itemId, rescue.targetId, 4);
assert.equal(first.total, 4, '落靶看见分数时必须先写入账本');
assert.equal(game.state.world.reserve.lastArcheryShot.totalScore, 4, '确认前射箭账本就必须有第一箭');
assert.equal(game.rescueArcheryLedgerTotal(game.state.world.reserve, game.rescueRecordFor(rescue.targetId), itemId), 4);

game.infoDetailModal.archeryLandedAt = Date.now() - 2000;
assert.equal(game.shouldAutoLeaveResolvedArchery(game.infoDetailModal), false, '确认得分不能自动离开');
assert.equal(game.flushPendingArcheryShot(Date.now(), true), false, '确认页还在时不能自动提交');
assert.equal(game.recoverStuckMaterialExploration(Date.now(), true), false, '确认页还在时不能自动结算');
assert.equal(!!game.settlementModal, false, '确认得分必须先停住，不能先弹出结算卡');

// 确认键即使处在连点吸收窗里，也必须能收尾，不能卡死在射箭页。
game.hitAreas = [];
game.ctx = context;
game.drawInfoDetailModal();
const confirm = game.hitAreas.slice().reverse().find((hit) => (
  hit.hud && !game.isFullScreenBackdropHit(hit) && game.isUsefulHudHit(hit) && game.isArcheryImmediateHudHit(hit)
));
assert(confirm, '结算态确认得分必须是可立即按下的 HUD');
handlers.start({ changedTouches: [{ clientX: confirm.x + confirm.w / 2, clientY: confirm.y + confirm.h / 2 }] });
assert.equal(game.state.world.reserve.lastArcheryShot.totalScore, 4, '确认不得把已入账分数清掉');

saveState(game.state);
game = restart();
assert.equal(game.openMaterialExploration(), true, '无目标重进必须恢复解救物品');
assert.equal(game.infoDetailModal.collectionProgress.current, 4, '退出再进必须显示上一轮累计分');
assert.equal(game.infoDetailModal.targetId, itemId);

const second = landShotWithoutSettle(game, itemId, rescue.targetId, 3);
assert.equal(second.total, 7, '第二箭必须叠在第一轮 4 分上');
game.dismissInfoDetailModal();
saveState(game.state);
const reopened = restart();
assert.equal(reopened.openMaterialExploration(), true);
assert.equal(reopened.infoDetailModal.collectionProgress.current, 7, '不点确认、直接退出也必须保留多轮累计');

console.log('archery vivo confirm check ok: visible score is persisted, confirm works during absorb, multi-round re-entry keeps the ledger');
