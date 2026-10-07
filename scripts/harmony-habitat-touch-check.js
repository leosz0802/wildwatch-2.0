'use strict';

const assert = require('node:assert/strict');

function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({ globalAlpha: 1, canvas: { width: 750, height: 1334 } }, {
    get(target, property) {
      if (property === 'measureText') return (value) => ({ width: String(value || '').length * 7 });
      if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient;
      if (!target[property]) target[property] = () => {};
      return target[property];
    }
  });
}

const handlers = {};
global.wx = {
  getSystemInfoSync: () => ({ platform: 'ohos', windowWidth: 375, windowHeight: 667, pixelRatio: 2 }),
  createCanvas: () => ({ width: 750, height: 1334, getContext: () => fakeContext() }),
  createImage: () => ({ loaded: true, width: 96, height: 96, set src(value) { this._src = value; if (this.onload) this.onload(); } }),
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

const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');

function makeGame(type) {
  const game = new Game();
  game.stopLoop();
  game.render = () => {};
  game.state = createCharacter(null, `鸿蒙${type}任务点击`);
  game.screen = 'home';
  game.scrollY = 248;
  game.state.world.reserve.fund = 10000;
  game.state.world.reserve.supplies = { dogFood: 10, alarm: 10, fieldKit: 10, tranquilizer: 10, medicalKit: 10, evidenceTrap: 2 };
  game.state.world.reserve.ecology.water = type === 'water' ? 35 : 70;
  game.state.world.reserve.ecology.grass = type === 'grass' ? 35 : 70;
  return game;
}

for (const type of ['grass', 'water']) {
  const game = makeGame(type);
  const before = Number(game.state.world.reserve.ecology[type]);
  assert.equal(game.openMetricImprovementTask(type), true, `${type}: task should open`);
  game.hitAreas = [];
  game.drawPatrolTaskModal();
  const rendered = game.renderedPatrolTask;
  assert(rendered && rendered.buttonY != null, `${type}: missing repair button geometry`);
  const width = game.width - 36;
  const buttonX = 18 + 30 + (width - 48) / 2 + (width - 48) / 4;
  const buttonY = rendered.buttonY + 21;

  // HarmonyOS regression: the device reports backing-canvas pixels while the
  // game registers hits in logical points. Feed physical 2× coordinates.
  handlers.start({ touches: [{ clientX: buttonX * 2, clientY: buttonY * 2 }] });
  handlers.end({ touches: [], changedTouches: [{ clientX: buttonX * 2, clientY: buttonY * 2 }] });

  assert(game.settlementModal, `${type}: physical-pixel tap did not execute repair`);
  assert(game.state.world.reserve.ecology[type] > before, `${type}: repair did not increase selected metric`);
  assert.equal(game.patrolTaskModal, null, `${type}: repair modal remained open after execution`);
}

console.log('harmony habitat touch check ok: physical-pixel taps execute grass and water repair tasks');
