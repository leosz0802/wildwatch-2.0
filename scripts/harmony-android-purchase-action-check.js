'use strict';

const assert = require('node:assert/strict');

const runtimeHandlers = {};
const canvasHandlers = {};
const gradient = { addColorStop() {} };
function fakeContext() {
  return new Proxy({ canvas: { width: 750, height: 1334 }, globalAlpha: 1 }, {
    get(target, property) {
      if (property === 'measureText') return (value) => ({ width: String(value || '').length * 7 });
      if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient;
      if (!target[property]) target[property] = () => {};
      return target[property];
    },
    set(target, property, value) { target[property] = value; return true; }
  });
}

global.wx = {
  // Non-pure Harmony commonly reports android from getSystemInfoSync while
  // the device layer is HarmonyOS. The game must keep the same input path.
  getSystemInfoSync: () => ({ platform: 'android', system: 'HarmonyOS 4.2.0.121', windowWidth: 375, windowHeight: 667, pixelRatio: 2 }),
  getDeviceInfo: () => ({ platform: 'android', system: 'HarmonyOS 4.2.0.121', brand: 'Huawei' }),
  createCanvas: () => ({
    width: 750,
    height: 1334,
    getContext: () => fakeContext(),
    addEventListener(type, handler) { canvasHandlers[type] = handler; }
  }),
  getStorageSync: () => null,
  setStorageSync() {},
  onTouchStart(handler) { runtimeHandlers.start = handler; },
  onTouchMove(handler) { runtimeHandlers.move = handler; },
  onTouchEnd(handler) { runtimeHandlers.end = handler; },
  onTouchCancel(handler) { runtimeHandlers.cancel = handler; },
  onKeyboardConfirm() {},
  onAppHide() {},
  onAppShow() {},
  showToast() {}
};

const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');

const game = new Game();
game.stopLoop();
game.render = game.requestRender = () => {};
game.toast = () => {};
game.state = createCharacter(null, '鸿蒙采购动作');
game.screen = 'role';
game.width = 375;
game.height = 667;
game.dpr = 2;
game.canvas.width = 750;
game.canvas.height = 1334;
game.state.world.reserve.fund = 20000;
game.state.world.reserve.supplies = Object.assign({}, game.state.world.reserve.supplies, {
  fieldKit: 0,
  dogFood: 0,
  alarm: 0,
  tranquilizer: 0,
  medicalKit: 0,
  evidenceTrap: 0
});

function tapPointerOnly(x, y, fields = {}) {
  game.lastPointerStartAt = 0;
  game.lastPointerEndAt = 0;
  assert.equal(typeof canvasHandlers.pointerdown, 'function', 'Canvas must bind pointerdown fallback');
  assert.equal(typeof canvasHandlers.pointerup, 'function', 'Canvas must bind pointerup fallback');
  canvasHandlers.pointerdown({});
  canvasHandlers.pointerup({
    changedTouches: [Object.assign({ clientX: x, clientY: y }, fields)]
  });
}

// Each pointer-only gesture must renegotiate its coordinate space. A stale
// physical choice from the previous tap otherwise shifts the next Android /
// HarmonyOS button by dpr and makes the visible confirm button inert.
game.touchCoordinateSpace = 'physical';
game.lastPointerStartAt = 0;
canvasHandlers.pointerdown({});
assert.equal(game.touchCoordinateSpace, '', 'pointerdown must clear the previous coordinate-space lock');

function confirmHit() {
  return game.hitAreas.slice().reverse().find((hit) => hit && hit.hud && !game.isFullScreenBackdropHit(hit));
}

// Mixed report: client coordinates are logical, x/y are backing-canvas pixels.
// This is the coordinate shape that previously divided the logical point twice.
game.infoDetailModal = {
  kind: 'supplyQuantity',
  kicker: '分项采购',
  title: '采购野外工具包',
  icon: 'habitat',
  supplyId: 'fieldKit',
  quantity: 1
};
game.hitAreas = [];
game.drawInfoDetailModal();
let hit = confirmHit();
assert(hit, 'quantity picker confirm button must be registered');
const singleFundBefore = game.state.world.reserve.fund;
tapPointerOnly(hit.x + hit.w / 2, hit.y + hit.h / 2, {
  x: (hit.x + hit.w / 2) * 2,
  y: (hit.y + hit.h / 2) * 2
});
assert.equal(game.infoDetailModal, null, 'pointer fallback must close quantity picker');
assert.equal(game.state.world.reserve.supplies.fieldKit, 1, 'pointer-only purchase must add exactly one selected supply');
assert(game.state.world.reserve.fund < singleFundBefore, 'pointer-only purchase must consume protection fund');
assert.equal(game.patrolTaskModal, null, 'pointer-only purchase must release task modal');

// A normal wx touchstart may already execute a HUD action when touchend is
// lost. A later pointerup must only clear the guard and never buy twice.
game.infoDetailModal = {
  kind: 'supplyQuantity',
  kicker: '分项采购',
  title: '采购狗粮',
  icon: 'dogFood',
  supplyId: 'dogFood',
  quantity: 1
};
game.hitAreas = [];
game.drawInfoDetailModal();
hit = confirmHit();
const beforeDog = game.state.world.reserve.supplies.dogFood;
game.lastPointerStartAt = 0;
game.lastPointerEndAt = 0;
runtimeHandlers.start({ changedTouches: [{ clientX: hit.x + hit.w / 2, clientY: hit.y + hit.h / 2 }] });
assert.equal(game.infoDetailModal, null, 'wx touchstart must execute HUD quantity confirmation');
assert(game.state.world.reserve.supplies.dogFood > beforeDog, 'wx touchstart must settle single-item purchase once');
assert.equal(game.patrolTaskModal, null, 'wx touchstart task confirmation must release modal');
const afterDog = game.state.world.reserve.supplies.dogFood;
// Canvas fallback event for the same physical contact must not replay it.
game.lastPointerStartAt = 0;
game.lastPointerEndAt = 0;
canvasHandlers.pointerup({ changedTouches: [{ clientX: hit.x + hit.w / 2, clientY: hit.y + hit.h / 2 }] });
assert.equal(game.state.world.reserve.supplies.dogFood, afterDog, 'lost touchend fallback must not double-settle purchase');

// Pointer cancellation must clear the gesture and not leave a modal permanently locked.
game.gesture = { startX: 10, startY: 10, moved: false };
canvasHandlers.pointercancel({});
assert.equal(game.gesture, null, 'pointercancel must release the touch gesture');

console.log('harmony/android purchase action check ok: mixed coordinates, pointer-only confirmations, no duplicate purchase, cancel recovery');
