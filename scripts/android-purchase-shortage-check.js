'use strict';

const assert = require('node:assert/strict');

let stored = {};
const handlers = {};
const context = new Proxy({ canvas: { width: 1125, height: 2001 }, globalAlpha: 1 }, {
  get(target, key) {
    if (key === 'measureText') return (text) => ({ width: String(text || '').length * 7 });
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (!target[key]) target[key] = () => {};
    return target[key];
  },
  set(target, key, value) { target[key] = value; return true; }
});

global.requestAnimationFrame = undefined;
global.cancelAnimationFrame = undefined;
global.wx = {
  getSystemInfoSync: () => ({ platform: 'android', brand: 'vivo', windowWidth: 375, windowHeight: 667, pixelRatio: 3 }),
  getDeviceInfo: () => ({ platform: 'android', brand: 'vivo', system: 'Android 14' }),
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

function quiet(game) {
  game.stopLoop();
  game.playSfx = game.playSettlementSfx = game.toast = () => {};
  game.screen = 'home';
  game.width = 375;
  game.height = 667;
  game.dpr = 3;
  game.canvas.width = 1125;
  game.canvas.height = 2001;
  game.ctx = context;
  return game;
}

function leftover(title) {
  return { silent: false, grade: 'A', presentationScreen: 'home', title: title || '过期结算' };
}

function tapConfirm(game) {
  const hit = game.hitAreas.slice().reverse().find((item) => (
    item && item.hud && !game.isFullScreenBackdropHit(item) && typeof item.onTap === 'function'
  ));
  assert.ok(hit, '执行结算必须画在最上层且可点');
  handlers.start({
    changedTouches: [{
      clientX: hit.x + hit.w / 2,
      clientY: hit.y + hit.h / 2,
      x: (hit.x + hit.w / 2) * 3,
      y: (hit.y + hit.h / 2) * 3
    }]
  });
}

stored = {};
const game = quiet(new Game());
game.state = createCharacter(null, '安卓采购短缺');
game.state.world.reserve.fund = 1303;
Object.assign(game.state.world.reserve.supplies, {
  dogFood: 0, alarm: 0, tranquilizer: 0, fieldKit: 0, medicalKit: 0, evidenceTrap: 0
});

// 采购短缺从沙盘点进来时，上一场巡护结算还在。
game.settlementModal = leftover('巡护结算');
game.interstitialAds = { showing: true };
assert.equal(game.openMaterialsForMissing({ id: 'habitat', missing: ['野外工具包'] }), undefined);
assert.equal(game.screen, 'role', '残留结算不能挡住采购短缺进入物资页');
assert.equal(!!game.settlementModal, false, '进物资页时必须清掉沙盘残留结算');
assert.equal(game.interstitialAds.showing, false, '进物资页时必须清掉卡住的插屏');

game.interstitialAds.showing = true;
game.settlementModal = leftover('再次盖住');
game.settlementModal.presentationScreen = 'role';
game.useMaterialAction('buySupplies', 'all');
assert.equal(game.patrolTaskModal && game.patrolTaskModal.purchaseId, 'all');
game.hitAreas = [];
game.render();
assert.equal(game.interstitialAds.showing, false, '采购确认必须清掉插屏，否则执行结算不会注册');
assert.equal(!!game.settlementModal, false, '采购确认不能被残留结算盖住');

const fundBefore = game.state.world.reserve.fund;
const kitBefore = game.state.world.reserve.supplies.fieldKit || 0;
tapConfirm(game);
assert.ok(game.state.world.reserve.fund < fundBefore, `执行结算必须扣基金，实际 ${game.state.world.reserve.fund}`);
assert.ok((game.state.world.reserve.supplies.fieldKit || 0) > kitBefore, '执行结算必须写入补给');
assert.equal(game.patrolTaskModal, null, '第一次采购完成后确认窗必须收起');
assert.equal(!!game.settlementModal, false, '就地采购不得留下卡住下一单的结算卡');

// 第一次失败后继续采购：插屏和残留结算再次出现，也不能锁死。
game.interstitialAds.showing = true;
game.settlementModal = leftover('第二单盖住');
game.settlementModal.presentationScreen = 'role';
const fundMid = game.state.world.reserve.fund;
game.useMaterialAction('buySupplies', 'fieldKit', 1);
assert.equal(game.patrolTaskModal && game.patrolTaskModal.purchaseId, 'fieldKit');
game.hitAreas = [];
game.render();
tapConfirm(game);
assert.ok(game.state.world.reserve.fund < fundMid, '第二单执行结算仍必须扣基金');
assert.ok((game.state.world.reserve.supplies.fieldKit || 0) >= kitBefore + 1, '第二单执行结算仍必须写入库存');
assert.equal(game.patrolTaskModal, null);
assert.equal(game.interstitialAds.showing, false);

console.log('android purchase shortage check ok: leftover+interstitial cannot block 执行结算, later purchases stay writable');
