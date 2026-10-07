'use strict';

const assert = require('node:assert/strict');

const handlers = {};
function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({ globalAlpha: 1, canvas: { width: 375, height: 667 } }, {
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

global.wx = {
  getSystemInfoSync: () => ({ platform: 'android', brand: 'vivo', windowWidth: 375, windowHeight: 667, pixelRatio: 3 }),
  createCanvas: () => ({ width: 1125, height: 2001, getContext: () => fakeContext() }),
  getStorageSync: () => null,
  setStorageSync() {},
  onTouchStart(handler) { handlers.start = handler; },
  onTouchMove(handler) { handlers.move = handler; },
  onTouchEnd(handler) { handlers.end = handler; },
  onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');

const game = new Game();
game.stopLoop();
game.state = createCharacter(null, '物资滑动误开采购');
game.screen = 'role';
game.ctx = fakeContext();
game.width = 375;
game.height = 667;
game.dpr = 3;
game.scrollY = 0;
game.toast = () => {};
game.state.world.reserve.fund = 8000;
Object.assign(game.state.world.reserve.supplies, {
  dogFood: 0, alarm: 0, tranquilizer: 0, fieldKit: 0, medicalKit: 0, evidenceTrap: 0
});
game.requestRender = () => {};
game.render = function paintMaterials() {
  this.hitAreas = [];
  this.drawRole(this.ctx);
  this.drawBottomNav();
};
game.render();

const supplyHit = game.hitAreas.find((hit) => hit && !hit.hud && !hit.map && hit.h >= 120 && hit.w >= 90);
assert(supplyHit, '物资页补给卡必须注册为可滚动内容命中区，而不是按下即走的 HUD');
assert.equal(game.isPressImmediateHudHit(supplyHit), false, '补给卡按下不能立刻打开采购');

const cx = supplyHit.x + supplyHit.w / 2;
const cy = supplyHit.y + supplyHit.h / 2;
handlers.start({ changedTouches: [{ clientX: cx, clientY: cy }] });
assert.equal(game.infoDetailModal, null, '手指刚按下补给卡时不能弹出采购窗');

const fundBeforeSwipe = game.state.world.reserve.fund;
handlers.move({ changedTouches: [{ clientX: cx, clientY: cy - 48 }] });
handlers.end({ changedTouches: [{ clientX: cx, clientY: cy - 48 }] });
assert.equal(game.infoDetailModal, null, '滑动物资页不能打开采购窗');
assert.equal(game.state.world.reserve.fund, fundBeforeSwipe, '滑动物资页不能扣基金');
assert(game.scrollY > 0, '滑动物资页必须滚动列表');

game.scrollY = 0;
game.render();
const tapHit = game.hitAreas.find((hit) => hit && !hit.hud && !hit.map && hit.h >= 120 && hit.w >= 90);
const tx = tapHit.x + tapHit.w / 2;
const ty = tapHit.y + tapHit.h / 2;
const fundBeforeTap = game.state.world.reserve.fund;
const dogBeforeTap = game.state.world.reserve.supplies.dogFood || 0;
handlers.start({ changedTouches: [{ clientX: tx, clientY: ty }] });
assert.equal(game.infoDetailModal, null, '短按开始时仍不应打开采购窗');
assert.equal(game.state.world.reserve.fund, fundBeforeTap, '短按按下不能立刻扣基金');
handlers.end({ changedTouches: [{ clientX: tx, clientY: ty }] });
assert.equal(game.infoDetailModal, null, '短按补给卡不得再打开第二层数量窗');
assert.ok(game.state.world.reserve.fund < fundBeforeTap, '短按补给卡必须直接用基金补充');
assert.ok((game.state.world.reserve.supplies.dogFood || 0) > dogBeforeTap, '短按第一张补给卡必须写入狗粮');

console.log('materials scroll purchase check ok: swipe scrolls, tap buys with fund');
