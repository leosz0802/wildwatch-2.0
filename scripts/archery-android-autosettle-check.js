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

function landVisibleShot(game, itemId, rescueTargetId, score, token) {
  game.activeTaskLock = { kind: 'chapterRescue', targetId: rescueTargetId };
  assert.equal(game.openMaterialExploration(itemId), true);
  game.infoDetailModal.phase = 'resolved';
  game.infoDetailModal.resultScore = score;
  game.infoDetailModal.displayRoll = score;
  game.infoDetailModal.archerySettleToken = token;
  game.queuePendingArcheryShot({
    token,
    kind: 'materialExploration',
    targetId: itemId,
    rescueTargetId,
    rescueItemId: itemId,
    score
  });
  const applied = game.applyPendingArcheryScoreToLedger();
  game.infoDetailModal.collectionProgress = Object.assign({}, game.infoDetailModal.collectionProgress, {
    current: applied.total
  });
  return applied;
}

stored = {};
const game = quiet(new Game());
game.state = createCharacter(null, '安卓多轮自动结算');
const rescue = nextRescueTask(game.state.world.reserve, 1);
const itemId = rescue.requiredItems[0];

const first = landVisibleShot(game, itemId, rescue.targetId, 4, 'android-round-1');
assert.equal(first.total, 4, '第一箭落靶必须先写入累计账本');

// Harmony/Android 常在落靶后拆掉射箭页。必须回到确认得分，按下确认后再日结算。
game.infoDetailModal = null;
assert.equal(game.commitPendingArcheryShot(), true, '弹窗被拆后必须先回到确认得分');
assert.equal(game.waitingArcheryOrDiceConfirm(), true, '拆页后仍要停在确认得分');
assert.equal(!!game.settlementModal, false, '拆页后不能直接闪出结算卡');
assert.equal(game.confirmArcheryScore(), true, '确认得分必须有效');
assert(game.settlementModal, '按下确认后第一箭才弹出结算卡');
assert.equal(game.rescueRecordFor(rescue.targetId).pointProgress[itemId], 4, '第一箭日结算必须写入点数');
game.finishSettlement('home');
saveState(game.state);

const second = landVisibleShot(game, itemId, rescue.targetId, 6, 'android-round-2');
assert.equal(second.total, 10, '第二箭必须叠在第一轮 4 分上，不能当成新的一轮 6 分');
assert.equal(game.state.world.reserve.lastArcheryShot.token, 'android-round-2', 'pending 必须换成第二箭');
game.infoDetailModal = null;
assert.equal(game.commitPendingArcheryShot(), true, '第二箭拆页后也必须回到确认得分');
assert.equal(game.waitingArcheryOrDiceConfirm(), true, '第二箭拆页后仍要停在确认得分');
assert.equal(game.confirmArcheryScore(), true, '第二箭确认得分必须有效');
assert(game.settlementModal, '按下确认后第二箭才弹出结算卡');
assert.equal(game.rescueRecordFor(rescue.targetId).pointProgress[itemId], 10, '两轮累计必须是 10');
assert.deepEqual(
  (game.state.world.reserve.archeryHistory || []).slice(-2).map((shot) => shot.score),
  [4, 6],
  '射箭历史必须保留每一轮，而不是只留最后一箭'
);
game.finishSettlement('home');

assert.equal(game.openChapterRescueTask(rescue.targetId), true, '结算后必须能打开解救任务卡');
assert.match(String(game.infoDetailModal.items[0].title), /点数 10\/12/, '任务卡必须显示两轮累计 10/12');

game.beginArcheryFollowupAbsorb(8000);
game.beginSettlementTapGuard(8000);
assert.equal(game.shouldAbsorbArcheryFollowup(), false, '解救任务卡不能被射箭吸收窗锁死');

game.ctx = context;
game.hitAreas = [];
game.drawInfoDetailModal();
const later = game.hitAreas.slice().reverse().find((hit) => (
  hit.hud && !game.isFullScreenBackdropHit(hit) && hit.x < game.width / 2 && hit.y > game.height * 0.45
));
assert(later, '稍后处理必须是可点 HUD');
handlers.start({ changedTouches: [{ clientX: later.x + later.w / 2, clientY: later.y + later.h / 2 }] });
assert.equal(game.infoDetailModal, null, '吸收窗内点稍后处理必须能关掉解救卡');

console.log('archery android autosettle check ok: torn page restores confirm, 4+6=10, rescue card stays tappable');
