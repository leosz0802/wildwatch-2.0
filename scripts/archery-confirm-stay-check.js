'use strict';

const assert = require('node:assert/strict');

let stored = {};
const handlers = {};
const context = new Proxy({}, {
  get(target, key) {
    if (key === 'measureText') return (text) => ({ width: String(text).length * 7 });
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
  onTouchMove(handler) { handlers.move = handler; },
  onTouchEnd(handler) { handlers.end = handler; },
  onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {},
  getStorageSync: (key) => stored[key] && JSON.parse(JSON.stringify(stored[key])),
  setStorageSync: (key, value) => { stored[key] = JSON.parse(JSON.stringify(value)); }
};

const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');
const { nextRescueTask } = require('../js/chapterRescueSystem');

function quiet(game) {
  game.stopLoop();
  game.render = game.requestRender = game.playSfx = game.playSettlementSfx = game.toast = () => {};
  game.setScreen = (screen) => { game.screen = screen; };
  game.screen = 'home';
  game.width = 375;
  game.height = 667;
  game.dpr = 3;
  game.ctx = context;
  return game;
}

function landResolved(game, itemId, rescueTargetId, score, token, mode) {
  game.activeTaskLock = { kind: 'chapterRescue', targetId: rescueTargetId };
  assert.equal(game.openMaterialExploration(itemId), true);
  game.infoDetailModal.explorationMode = mode;
  game.infoDetailModal.phase = 'resolved';
  game.infoDetailModal.resultScore = score;
  game.infoDetailModal.displayRoll = score;
  game.infoDetailModal.archerySettleToken = token;
  game.infoDetailModal.archeryLandedAt = Date.now() - 2000;
  game.queuePendingArcheryShot({
    token,
    kind: 'materialExploration',
    targetId: itemId,
    rescueTargetId,
    rescueItemId: itemId,
    score
  });
  return game.applyPendingArcheryScoreToLedger();
}

stored = {};
const game = quiet(new Game());
game.state = createCharacter(null, '确认得分停留');
const rescue = nextRescueTask(game.state.world.reserve, 1);
const itemId = rescue.requiredItems[0];

const first = landResolved(game, itemId, rescue.targetId, 4, 'stay-archery-1', 'archery');
assert.equal(first.total, 4, '落靶必须先入账');
assert.equal(game.waitingArcheryOrDiceConfirm(), true, '射箭必须停在确认得分');
assert.equal(game.shouldAutoLeaveResolvedArchery(), false);
assert.equal(game.flushPendingArcheryShot(Date.now(), true), false, '确认页还在时定时器不能提交');
assert.equal(game.recoverStuckDiceOrArchery(Date.now(), true), false);
assert.equal(game.recoverStuckMaterialExploration(Date.now(), true), false);
assert.equal(!!game.settlementModal, false, '不能先闪出结算卡');

game.hitAreas = [];
game.drawInfoDetailModal();
const confirmHits = game.hitAreas.filter((hit) => (
  hit.hud && !game.isFullScreenBackdropHit(hit) && typeof hit.onTap === 'function' && game.isUsefulHudHit(hit)
));
assert.ok(confirmHits.length >= 1, '确认得分按钮必须可点');
const labels = [];
const originalText = game.text.bind(game);
game.text = function (ctx, value, ...rest) {
  labels.push(String(value || ''));
  return originalText(ctx, value, ...rest);
};
game.hitAreas = [];
game.drawInfoDetailModal();
game.text = originalText;
assert.equal(labels.filter((value) => value === '确认得分').length, 1, '确认页只能有一个确认得分');

assert.equal(game.confirmArcheryScore(), true, '确认得分必须真正收尾');
assert.ok(game.settlementModal, '按下确认后才应出现结算卡');
assert.ok(!game.infoDetailModal || game.infoDetailModal.kind !== 'materialExploration', '确认后射箭页应收起');

game.finishSettlement(game.settlementModal.returnScreen || 'home');
assert.equal(!!game.settlementModal, false);

const dice = landResolved(game, itemId, rescue.targetId, 5, 'stay-dice-1', 'animalDice');
assert.equal(dice.total, 9, '掷骰落点也必须入账');
assert.equal(game.waitingArcheryOrDiceConfirm(), true, '掷骰必须停在确认得分');
assert.equal(game.flushPendingArcheryShot(Date.now(), true), false);
assert.equal(!!game.settlementModal, false);
assert.equal(game.confirmResolvedArcheryOrDice(), true, '掷骰确认得分必须有效');
assert.ok(game.settlementModal, '掷骰确认后才应出现结算卡');

game.finishSettlement(game.settlementModal.returnScreen || 'home');
const torn = quiet(new Game());
torn.state = game.state;
const third = landResolved(torn, itemId, rescue.targetId, 3, 'stay-android-tear', 'archery');
assert.equal(third.total, 12);
torn.infoDetailModal = null;
assert.equal(torn.restoreResolvedArcheryOrDiceConfirm(), true, '确认页被拆掉后必须回到确认得分');
assert.equal(torn.waitingArcheryOrDiceConfirm(), true, 'Android 拆页后仍要停在确认得分');
assert.equal(!!torn.settlementModal, false, '拆页后不能直接闪出结算卡');
assert.equal(torn.confirmArcheryScore(), true, '拆页后确认得分必须有效');
assert.ok(torn.settlementModal, '按下确认后才应出现结算卡');

const inline = quiet(new Game());
inline.state = createCharacter(null, '掷骰确认动作');
let committed = 0;
inline.infoDetailModal = {
  kind: 'collectionDice',
  phase: 'resolved',
  displayRoll: 4,
  pendingConfirmAction() {
    committed += 1;
    inline.infoDetailModal.phase = 'result';
  }
};
assert.equal(inline.waitingArcheryOrDiceConfirm(), true);
assert.equal(inline.confirmResolvedArcheryOrDice(), true);
assert.equal(committed, 1, '掷骰确认必须执行收尾动作');
assert.equal(inline.waitingArcheryOrDiceConfirm(), false);

// Chapter/task-triggered scoring shares the same confirmation contract. A
// stale settlement from the previous arrow must be removed before the task
// confirm button is hit, and the task must remain in the resolved phase until
// that explicit button is pressed.
const task = quiet(new Game());
task.state = createCharacter(null, '任务确认统一');
let taskCommitted = 0;
task.infoDetailModal = {
  kind: 'chapterSpecialTask',
  explorationMode: 'archery',
  def: { mode: 'archery' },
  phase: 'resolved',
  displayRoll: 5,
  resultScore: 5,
  pendingConfirmAction() {
    taskCommitted += 1;
    task.infoDetailModal.phase = 'result';
    task.infoDetailModal.actionLabel = '知道了';
  }
};
task.settlementModal = { title: '上一箭残留', presentationScreen: 'home' };
assert.equal(task.waitingArcheryOrDiceConfirm(), true, '任务触发的射箭必须进入统一确认态');
assert.equal(task.ensureArcheryConfirmationExclusive(), true, '确认态必须清掉上一箭结算');
assert.equal(task.settlementModal, null, '上一箭结算不能盖住任务确认页');
assert.equal(task.confirmResolvedArcheryOrDice(), true, '任务确认按钮必须执行收尾');
assert.equal(taskCommitted, 1, '任务确认只能执行一次收尾动作');
assert.equal(task.infoDetailModal.phase, 'result');
assert.equal(task.infoDetailModal.actionLabel, '知道了', '确认后应显示完成按钮而不是再次显示确认得分');

const { normalizeChapterRescue } = require('../js/chapterRescueSystem');
const { CHAPTERS } = require('../js/animalWorld');
const chapterFive = quiet(new Game());
chapterFive.state = createCharacter(null, '第5章确认得分');
Object.assign(chapterFive.state.world.reserve.progression, {
  stage: 5,
  displayChapter: 5,
  level: CHAPTERS[4].level
});
normalizeChapterRescue(chapterFive.state.world.reserve, 5, { fresh: true });
const ch5Rescue = nextRescueTask(chapterFive.state.world.reserve, 5);
const ch5Item = ch5Rescue.requiredItems[0];
const ch5 = landResolved(chapterFive, ch5Item, ch5Rescue.targetId, 5, 'ch5-leaf-1', 'archery');
assert.equal(ch5.total, 5, '第5章落靶必须先入账');
assert.equal(chapterFive.waitingArcheryOrDiceConfirm(), true, '第5章必须停在确认得分');
delete chapterFive.infoDetailModal.archeryAimValue;
chapterFive.infoDetailModal.archeryAimStartedAt = Date.now() - 800;
const aimNow = chapterFive.archeryAimValueFor(chapterFive.infoDetailModal);
const aimLater = chapterFive.archeryAimValueFor(chapterFive.infoDetailModal, Date.now() + 900);
assert.equal(aimNow, aimLater, '第5章确认页箭位不能继续摆动');
chapterFive.archerySettleBusy = true;
chapterFive.archeryExecuteRunning = true;
chapterFive.infoDetailModal._archeryConfirming = true;
chapterFive.hitAreas = [];
chapterFive.drawInfoDetailModal();
const ch5Confirm = chapterFive.hitAreas.slice().reverse().find((hit) => hit.archeryConfirm);
assert.ok(ch5Confirm, '第5章确认得分必须登记为可点');
assert.equal(chapterFive.hitAreaAt(chapterFive.width / 2, chapterFive.height / 2), ch5Confirm, '点卡片中间也必须确认得分');
assert.equal(chapterFive.confirmArcheryScore(), true, '第5章确认得分不能被残留锁卡死');
assert.ok(!chapterFive.waitingArcheryOrDiceConfirm(), '第5章确认后不能再停在确认得分');
assert.ok(chapterFive.settlementModal, '第5章按下确认后必须出现结算卡');

console.log('archery confirm stay check ok: confirm page stays, button settles, torn-down page restores confirm');
