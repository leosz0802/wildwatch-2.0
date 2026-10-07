'use strict';

const assert = require('node:assert/strict');

const runtimeHandlers = {};
const canvasHandlers = {};
const ctx = new Proxy({ canvas: { width: 1125, height: 2001 }, globalAlpha: 1 }, {
  get(target, key) {
    if (key === 'measureText') return (value) => ({ width: String(value || '').length * 7 });
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (!target[key]) target[key] = () => {};
    return target[key];
  },
  set(target, key, value) { target[key] = value; return true; }
});

global.wx = {
  getSystemInfoSync: () => ({
    platform: 'android',
    system: 'Android 14',
    brand: 'vivo',
    windowWidth: 375,
    windowHeight: 667,
    pixelRatio: 3
  }),
  createCanvas: () => ({
    width: 1125,
    height: 2001,
    getContext: () => ctx,
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
game.state = createCharacter(null, '安卓单击回归');
game.screen = 'home';
game.width = 375;
game.height = 667;
game.dpr = 3;
game.render = game.requestRender = game.playSfx = game.toast = () => {};

let fired = 0;
game.infoDetailModal = {
  kind: 'materialExploration',
  explorationMode: 'archery',
  phase: 'ready',
  action: () => { fired += 1; game.infoDetailModal.phase = 'rolling'; }
};
game.hitAreas = [
  { x: 0, y: 0, w: 375, h: 667, map: false, hud: true, onTap() {} },
  { x: 195, y: 600, w: 150, h: 42, map: false, hud: true, modalAction: true, onTap: () => game.infoDetailModal.action() }
];

// A previous lost touchend/physical coordinate lock must not consume the new
// press. The visible button must react on its first tap.
game.suppressNextTouchEndTap = true;
game.touchCoordinateSpace = 'physical';
runtimeHandlers.start({ changedTouches: [{ clientX: 270, clientY: 621 }] });
assert.equal(fired, 1, 'first Android tap must activate the visible button');
runtimeHandlers.end({ touches: [], changedTouches: [{ clientX: 270, clientY: 621 }] });
assert.equal(fired, 1, 'touchend must not execute the same action again');

// The Canvas fallback event for the same physical contact must also be inert.
canvasHandlers.pointerdown({ changedTouches: [{ clientX: 270, clientY: 621 }] });
canvasHandlers.pointerup({ changedTouches: [{ clientX: 270, clientY: 621 }] });
assert.equal(fired, 1, 'pointer fallback must not replay a touch action');

console.log('android single tap regression check ok: stale guards reset, first tap fires, touch/pointer duplicate executes once');
