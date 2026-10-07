'use strict';

const assert = require('node:assert/strict');

let stored = {};
const handlers = {};
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
global.wx = {
  getSystemInfoSync: () => ({ platform: 'android', brand: 'vivo', windowWidth: 375, windowHeight: 667, pixelRatio: 3 }),
  createCanvas: () => ({ width: 1125, height: 2001, getContext: () => context }),
  onTouchStart(handler) { handlers.start = handler; },
  onTouchMove() {},
  onTouchEnd(handler) { handlers.end = handler; },
  onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {},
  getStorageSync: (key) => stored[key] && JSON.parse(JSON.stringify(stored[key])),
  setStorageSync: (key, value) => { stored[key] = JSON.parse(JSON.stringify(value)); }
};

const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');
const { nextRescueTask } = require('../js/chapterRescueSystem');

function makeGame() {
  const game = new Game();
  game.stopLoop();
  game.playSfx = game.playSettlementSfx = game.toast = () => {};
  game.maybeShowInterstitialForSettlement = function skipAd(modal, returnScreen, options) {
    this.continueAfterSettlement(modal, returnScreen, options || {});
  };
  game.width = 375;
  game.height = 667;
  game.dpr = 3;
  game.ctx = context;
  return game;
}

function tap(x, y) {
  handlers.start({ changedTouches: [{ clientX: x, clientY: y }] });
  handlers.end({ touches: [], changedTouches: [{ clientX: x, clientY: y }] });
}

function paint(game) {
  game.hitAreas = [];
  game.drawBottomNav();
  if (game.infoDetailModal) game.drawInfoDetailModal();
  if (game.settlementModal) game.drawSettlementModal();
}

function settlementCloseHit(game) {
  return game.hitAreas.find((hit) => (
    hit.hud
    && !game.isFullScreenBackdropHit(hit)
    && hit.x < game.width / 2
    && hit.y > 300
    && hit.w >= 80
  ));
}

stored = {};
const game = makeGame();
game.state = createCharacter(null, '射箭结算解锁');
const rescue = nextRescueTask(game.state.world.reserve, 1);
const itemId = rescue.requiredItems[0];

game.activeTaskLock = { kind: 'chapterRescue', targetId: rescue.targetId };
assert.equal(game.openMaterialExploration(itemId), true);
game.infoDetailModal.phase = 'resolved';
game.infoDetailModal.resultScore = 4;
game.infoDetailModal.displayRoll = 4;
game.infoDetailModal.archerySettleToken = 'android-unlock-1';
game.queuePendingArcheryShot({
  token: 'android-unlock-1',
  kind: 'materialExploration',
  targetId: itemId,
  rescueTargetId: rescue.targetId,
  rescueItemId: itemId,
  score: 4
});
game.applyPendingArcheryScoreToLedger();

assert.equal(game.waitingArcheryOrDiceConfirm(), true, '射箭后必须先停在确认得分');
assert.equal(game.confirmArcheryScore(), true, '确认得分后必须生成结算');
assert(game.settlementModal, '射箭后必须留下结算卡');
assert.equal(game.infoDetailModal, null, '结算亮出时不能再压着射箭页');
assert.equal(game.settlementPresentationActive(), true, '射箭结算必须立刻可关，不能再等 180ms');
assert.equal(game.shouldAbsorbArcheryFollowup(), false, '结算在场时不能吸收关闭点击');
assert.equal(game.settlementTapGuardUntil, 0, '射箭结算不能再开吸收窗锁后续页面');

game.beginArcheryFollowupAbsorb(8000);
game.beginSettlementTapGuard(8000);
game.screen = 'home';
paint(game);
const close = settlementCloseHit(game);
assert(close, '结算关闭必须是可点 HUD');
assert.equal(game.isPressImmediateHudHit(close), true, '结算关闭必须按下就走');
tap(close.x + close.w / 2, close.y + close.h / 2);
assert.equal(game.settlementModal, null, 'Android 结算关闭必须一次按下就走');
assert.equal(game.shouldAbsorbArcheryFollowup(), false, '关掉结算后不能继续吞点击');
assert.equal(game.settlementOccupiesFlow(), false, '关掉结算后不能再占用流程');

game.beginArcheryFollowupAbsorb(8000);
game.beginSettlementTapGuard(8000);
assert.equal(game.openChapterRescueTask(rescue.targetId), true, '结算后解救任务卡必须还能打开');
assert.equal(game.shouldAbsorbArcheryFollowup(), false, '解救任务卡不能被结算残留锁死');
paint(game);
const later = game.hitAreas.slice().reverse().find((hit) => (
  hit.hud && !game.isFullScreenBackdropHit(hit) && hit.x < game.width / 2 && hit.y > game.height * 0.45
));
assert(later, '稍后处理必须可点');
tap(later.x + later.w / 2, later.y + later.h / 2);
assert.equal(game.infoDetailModal, null, '关掉解救卡后不能卡在任务层');

assert.equal(game.settlementOccupiesFlow(), false);
assert.equal(game.openMaterialExploration(itemId), true, '结算后必须还能再进射箭');
assert.equal(game.infoDetailModal && game.infoDetailModal.kind, 'materialExploration');
game.infoDetailModal = null;

game.screen = 'role';
game.hitAreas = [];
game.drawBottomNav();
const homeNav = game.hitAreas.find((hit) => hit.hud && hit.x < game.width / 4 && hit.y > game.height - 80);
assert(homeNav, '物资页底栏沙盘必须可点');
assert.equal(game.sandboxTaskNavigationBlocked('home'), false, '结算残留不能挡住回沙盘');

console.log('archery settlement unlock check ok: settlement closes immediately and later screens stay tappable');
