'use strict';

const assert = require('node:assert/strict');

const handlers = {};
global.wx = {
  getSystemInfoSync: () => ({ platform: 'ohos', system: 'HarmonyOS 4.2', windowWidth: 375, windowHeight: 667, pixelRatio: 2 }),
  createCanvas: () => ({ width: 750, height: 1334, getContext: () => fakeContext() }),
  getStorageSync: () => null,
  setStorageSync() {},
  onTouchStart(handler) { handlers.start = handler; },
  onTouchMove(handler) { handlers.move = handler; },
  onTouchEnd(handler) { handlers.end = handler; },
  onTouchCancel(handler) { handlers.cancel = handler; },
  onKeyboardConfirm() {},
  onAppHide() {},
  onAppShow() {},
  showToast() {}
};

function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({ globalAlpha: 1, canvas: { width: 750, height: 1334 } }, {
    get(target, property) {
      if (property === 'measureText') return (value) => ({ width: String(value || '').length * 7 });
      if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient;
      if (!target[property]) target[property] = () => {};
      return target[property];
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    }
  });
}

const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');

function tap(x, y, space) {
  const point = space === 'physical'
    ? { clientX: x * 2, clientY: y * 2 }
    : { clientX: x, clientY: y };
  handlers.start({ changedTouches: [point] });
  handlers.end({ touches: [], changedTouches: [point] });
}

function footerButtons(game) {
  const hits = game.hitAreas.filter((hit) => (
    hit.hud
    && !game.isFullScreenBackdropHit(hit)
    && hit.w > 80
    && hit.w < 240
    && hit.y > 360
    && hit.y < game.height - 70
  )).sort((a, b) => a.x - b.x || b.h - a.h);
  return hits.filter((hit, index) => hits.findIndex((item) => Math.abs(item.x - hit.x) < 8) === index);
}

function makeGame() {
  const game = new Game();
  game.stopLoop();
  game.state = createCharacter(null, '鸿蒙弹层底栏');
  game.screen = 'home';
  game.ctx = fakeContext();
  game.width = 375;
  game.height = 667;
  game.requestRender = () => {};
  game.toast = () => {};
  game.maybeShowInterstitialForSettlement = () => {};
  game.queueMissionPush = () => {};
  const reserve = game.state.world.reserve;
  reserve.fund = 20000;
  reserve.supplies = Object.assign({
    dogFood: 10, alarm: 10, fieldKit: 10, tranquilizer: 10, medicalKit: 10, evidenceTrap: 2
  }, reserve.supplies || {});
  return game;
}

const game = makeGame();
game.render = function paintOverlays() {
  this.hitAreas = [];
  this.drawBottomNav();
  if (this.patrolTaskModal) this.drawPatrolTaskModal();
  if (this.infoDetailModal) this.drawInfoDetailModal();
  if (this.settlementModal) this.drawSettlementModal();
};

game.settlementModal = {
  title: '巡护完成',
  summary: '目标已达成。',
  grade: 'S',
  guardianScore: 90,
  scoreDelta: 12,
  speech: '今晚幼崽敢靠近水边。',
  speaker: '沉牙狼',
  returnScreen: 'home',
  goalDone: true,
  stats: [{ label: '安全指数', before: 62, after: 80, delta: 18 }],
  fundBefore: 900,
  fundAfter: 940
};
game.archeryFollowupAbsorbUntil = undefined;
game.settlementTapGuardUntil = Date.now() + 4000;
game.pendingArcheryShot = () => ({ token: 'leftover', score: 4 });
game.render();

assert.equal(game.shouldAbsorbArcheryFollowup(), false, '结算在场时不能吸收关闭点击');
assert.equal(game.overlayLocksBottomNav(), true, '结算必须锁住底栏');
assert.equal(game.hitAreas.some((hit) => game.isLockedBottomNavHit(hit)), false, '结算打开时底栏不能再登记命中');

const settlementFooter = footerButtons(game);
assert.ok(settlementFooter.length >= 2, `结算关闭/查看新任务必须可点，实际 ${settlementFooter.length}`);
const closeHit = settlementFooter[0];
const nextHit = settlementFooter[1];
assert.ok(closeHit.y + closeHit.h >= game.height - 4, '关闭键必须接到屏幕底，才能吃住鸿蒙落到沙盘圆弧的点');
assert.ok(nextHit.y + nextHit.h >= game.height - 4, '查看新任务必须接到屏幕底，才能吃住鸿蒙落到生存圆弧的点');

game.drawBottomNav();
assert.equal(game.hitAreaAt(48, game.height - 18), game.hitAreaAt(closeHit.x + 20, closeHit.y + 8) || game.hitAreaAt(48, game.height - 18), '沙盘圆弧位置必须落到关闭，而不是切页');

tap(closeHit.x + 24, game.height - 16, 'logical');
assert.equal(game.settlementModal, null, '点到关闭正下方圆弧必须关掉结算');
assert.equal(game.screen, 'home', '关闭结算不能被底栏带走');
assert.equal(game.shouldAbsorbArcheryFollowup(), false, '关掉结算后不能继续吞掉点击');

game.settlementModal = {
  title: '巡护完成',
  summary: '目标已达成。',
  grade: 'S',
  guardianScore: 90,
  scoreDelta: 12,
  speech: '今晚幼崽敢靠近水边。',
  speaker: '沉牙狼',
  returnScreen: 'home',
  goalDone: true,
  stats: [{ label: '安全指数', before: 62, after: 80, delta: 18 }],
  fundBefore: 900,
  fundAfter: 940
};
game.render();
tap(nextHit.x + 24, game.height - 16, 'physical');
assert.equal(game.settlementModal, null, '物理像素点查看新任务正下方圆弧必须关掉结算');

const fundBeforePurchase = game.state.world.reserve.fund;
const alarmBeforePurchase = game.state.world.reserve.supplies.alarm;
game.infoDetailModal = {
  kind: 'supplyQuantity',
  kicker: '分项采购',
  title: '采购警报器',
  icon: 'alarm',
  supplyId: 'alarm',
  quantity: 2,
  footer: '使用 − / + 调整采购数量。'
};
game.render();
const supplyFooter = footerButtons(game);
assert.ok(supplyFooter.length >= 2, '分项采购取消/确认必须可点');
const buyHit = supplyFooter[1];
assert.ok(buyHit.y + buyHit.h >= game.height - 4, '确认采购必须接到屏幕底');
tap(buyHit.x + 20, game.height - 16, 'physical');
assert.equal(game.state.world.reserve.lastPurchase.amount, 2, '采购账本必须记录选择的数量');
assert(game.state.world.reserve.supplies.alarm >= alarmBeforePurchase + 2, '鸿蒙落到确认采购下方圆弧必须直接买到选择数量');
assert(game.state.world.reserve.fund < fundBeforePurchase, '单项采购确认必须直接扣减基金');
assert.equal(game.infoDetailModal, null, '采购成功后弹层必须关');
assert.equal(game.patrolTaskModal, null, '单项采购确认后不应再出现第二层结算');

let fired = 0;
game.infoDetailModal = {
  kind: 'chapterSpecialTask',
  explorationMode: 'archery',
  phase: 'ready',
  def: { mode: 'archery' },
  kicker: '特别任务',
  title: '现场射箭',
  actionLabel: '发射',
  action() { fired += 1; }
};
game.render();
const fire = game.hitAreas.find((hit) => game.isArcheryFireHit(hit));
assert(fire, '发射按钮必须可点');
assert.ok(fire.y + fire.h >= game.height - 4, '发射必须接到屏幕底');
tap(fire.x + fire.w / 2, game.height - 16, 'physical');
assert.equal(fired, 1, '鸿蒙落到发射下方圆弧必须开火，不能被底栏切走');
assert(game.infoDetailModal, '发射后在结算前应留在射箭页');

const dismiss = game.hitAreas.find((hit) => (
  hit.hud
  && !game.isFullScreenBackdropHit(hit)
  && !game.isArcheryCloseXHit(hit)
  && !game.isArcheryFireHit(hit)
  && hit.w >= 80
  && hit.x < game.width / 2
  && hit.y > 360
));
assert(dismiss, '稍后处理对照必须在');
assert.ok(dismiss.h <= 56, `稍后处理不能扩到底栏，避免连点发射误离场 h=${dismiss.h} y=${dismiss.y}`);

const stock = makeGame();
stock.screen = 'role';
stock.settlementModal = {
  title: '采购完成',
  summary: '库存已更新。',
  returnScreen: 'home',
  presentationScreen: 'home',
  revealAt: Date.now() + 8000,
  speech: '先看库存。',
  speaker: '沉牙狼'
};
stock.render = function paintStock() {
  this.hitAreas = [];
  this.drawBottomNav();
};
stock.render();
assert.equal(stock.settlementOccupiesFlow(), true, '物资页可能挂着一张还没在沙盘亮出的结算');
assert.equal(stock.settlementBlocksCurrentScreen(), false, '这张结算不能挡住物资页');
assert.equal(stock.overlayLocksBottomNav(), false, '物资页没有弹层时不能锁底栏');
assert.equal(stock.sandboxTaskNavigationBlocked('home'), false, '采购后必须还能回沙盘看结算');
const stockNav = stock.hitAreas.filter((hit) => hit.hud && hit.y >= stock.height - 70);
assert.equal(stockNav.length, 5, `补充物资后五个页签必须可点，实际 ${stockNav.length}`);
tap(stock.width / 8, stock.height - 20, 'logical');
assert.equal(stock.screen, 'home', '点沙盘必须能离开物资页');

const waiting = makeGame();
waiting.screen = 'home';
waiting.settlementModal = {
  title: '采购完成',
  returnScreen: 'home',
  presentationScreen: 'home',
  revealAt: Date.now() + 8000,
  speech: '先看库存。'
};
waiting.render = function paintWaiting() {
  this.hitAreas = [];
  this.drawBottomNav();
};
waiting.render();
assert.equal(waiting.settlementAwaitingPresentation(), true, '沙盘上未到点的结算只是待展示');
assert.equal(waiting.overlayLocksBottomNav(), false, '结算还没亮出时不能锁沙盘底栏');
assert.equal(waiting.hitAreas.filter((hit) => hit.hud && hit.y >= waiting.height - 70).length, 5, '待展示结算必须留着五个页签');
assert.equal(waiting.sandboxTaskNavigationBlocked('home'), false, '待展示结算必须还能点沙盘');

console.log('harmony overlay footer check ok: settlement, supply and archery footers catch nav-band taps');
