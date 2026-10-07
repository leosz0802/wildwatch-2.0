'use strict';

const assert = require('node:assert/strict');
const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');

let nativeQuantityModal = null;

function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === 'measureText') return (value) => ({ width: String(value || '').length * 7 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
      if (prop === 'canvas') return { width: 375, height: 667 };
      if (!target[prop]) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) { target[prop] = value; return true; }
  });
}

global.wx = {
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 1 }; },
  createCanvas() { return { width: 375, height: 667, getContext() { return fakeContext(); } }; },
  createImage() { return { loaded: true, complete: true, set src(value) { this._src = value; if (this.onload) this.onload(); } }; },
  getStorageSync() { return null; },
  setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {},
  showModal(options) { nativeQuantityModal = options; }
};

const game = new Game();
game.stopLoop();
game.deferredRuntimeServicesReady = true;
game.ctx = fakeContext();
game.width = 375;
game.height = 667;
game.state = createCharacter(null, '分项采购点击回归');
game.screen = 'survival';
game.state.world.reserve.progression.stage = 10;
game.state.world.reserve.progression.displayChapter = 10;
// 章节不等于采购次数；显式标记已完成前两次，验证后期默认补到仓库上限。
game.state.world.reserve.progression.supplyReplenishCount = 2;
game.state.world.reserve.progression.supplyCapUnlocked = true;
game.state.world.reserve.fund = 3921;
game.state.world.reserve.supplies = Object.assign({}, game.state.world.reserve.supplies, { evidenceTrap: 0 });
game.toast = () => {};
game.render = () => {};

game.openSupplyQuantityPicker('evidenceTrap');
assert.equal(game.infoDetailModal.kind, 'supplyQuantity');
assert.equal(game.infoDetailModal.quantity, 12, 'after the first two purchases, the picker should preselect the full evidence-trap shortage');

function drawPicker() {
  game.hitAreas = [];
  game.drawInfoDetailModal();
  const controls = game.hitAreas.filter((hit) => hit.hud && hit.y > 150 && hit.y < 360);
  assert.equal(controls.length, 2, 'only minus and plus must register as HUD hits');
  return controls;
}

// The modal is fixed to the viewport.  Scrolling the page behind it must not
// move the visible quantity controls or their hit areas.
game.scrollY = 0;
const topControls = drawPicker().map((hit) => ({ x: hit.x, y: hit.y, w: hit.w, h: hit.h }));
game.scrollY = 420;
const scrolledControls = drawPicker().map((hit) => ({ x: hit.x, y: hit.y, w: hit.w, h: hit.h }));
assert.deepEqual(scrolledControls, topControls, 'fixed purchase controls must keep viewport hit coordinates while the page is scrolled');

const minus = game.hitAreaAt(topControls[0].x + 10, topControls[0].y + 10);
assert(minus && minus.hud, 'minus button must be tappable at its visible position');
game.handleTap(topControls[0].x + 10, topControls[0].y + 10);
assert.equal(game.infoDetailModal.quantity, 11);

drawPicker();
const plusHit = game.hitAreas.find((hit) => hit.hud && hit.x > 230 && hit.y > 150 && hit.y < 360);
assert(plusHit, 'plus button must be tappable at its visible position');
game.handleTap(plusHit.x + 10, plusHit.y + 10);
assert.equal(game.infoDetailModal.quantity, 12);
game.handleTap(plusHit.x + 10, plusHit.y + 10);
assert.equal(game.infoDetailModal.quantity, 12, 'quantity must stop at the warehouse cap');

// Quantity entry is deliberately unavailable.  A native editable modal used
// to create a second overlay on Android/HarmonyOS and could swallow the final
// purchase tap.  The visible − / + controls are the only adjustment path.
nativeQuantityModal = null;
assert.equal(game.promptSupplyPurchaseQuantity(), false, 'native quantity input must be disabled');
assert.equal(nativeQuantityModal, null, 'purchase quantity must not open a native input overlay');
assert.equal(game.infoDetailModal.quantity, 12, 'quantity remains controlled by the visible plus/minus buttons');

let action;
game.confirmPatrolTask = (option) => {
  action = [option.id, option.purchaseId, option.purchaseAmount];
  game.patrolTaskModal = null;
  return true;
};
const footerHits = game.hitAreas.filter((hit) => hit.y > 500);
assert.equal(footerHits.length, 2, 'cancel and confirm must both register in the modal footer');
assert(footerHits.every((hit) => hit.hud), 'modal footer controls must remain tappable during the ad touch guard');
const confirmHit = footerHits[1];
game.adTouchGuardUntil = Date.now() + 10000;
game.handleTap(confirmHit.x + 10, confirmHit.y + 10);
assert.deepEqual(action, ['buySupplies', 'evidenceTrap', 12], 'confirm must submit the selected item quantity exactly once');
assert.equal(game.infoDetailModal, null, 'confirm must close the quantity picker');
assert.equal(game.patrolTaskModal, null, 'single-item confirmation must not leave a second settlement modal');

console.log('supply quantity picker check ok (fixed-modal hit areas, bounds, single submit)');
