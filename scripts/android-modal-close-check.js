'use strict';

const assert = require('node:assert/strict');

const handlers = {};
let openDataContextCalls = 0;
function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({ canvas: { width: 1125, height: 2001 }, globalAlpha: 1 }, {
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
  getSystemInfoSync: () => ({ platform: 'android', system: 'Android 14', windowWidth: 375, windowHeight: 667, pixelRatio: 3 }),
  getOpenDataContext: () => { openDataContextCalls += 1; return { canvas: { width: 1, height: 1 }, postMessage() {} }; },
  createCanvas: () => ({ width: 1125, height: 2001, getContext: () => fakeContext() }),
  getStorageSync: () => null,
  setStorageSync() {},
  onTouchStart(handler) { handlers.start = handler; },
  onTouchMove() {},
  onTouchEnd(handler) { handlers.end = handler; },
  onTouchCancel() {},
  onKeyboardConfirm() {},
  onAppHide() {},
  onAppShow() {},
  showToast() {}
};

const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');

const game = new Game();
game.stopLoop();
assert.equal(openDataContextCalls > 0, true, 'Android startup should initialize the queued open-data bridge for real friend rankings');
game.state = createCharacter(null, 'Android X close regression');
game.screen = 'home';
game.width = 375;
game.height = 667;
game.ctx = fakeContext();
game.render = () => {};
game.requestRender = () => {};
game.infoDetailModal = {
  kind: 'realNatureSettlement',
  kicker: '真实事件·任务详情',
  title: '哥伦比亚 BioSouth 生态项目',
  icon: 'paw',
  lines: ['验证 Android 原生像素触摸坐标。'],
  actionLabel: '处理任务',
  action() {}
};
game.hitAreas = [];
game.drawInfoDetailModal();
const close = game.hitAreas.find((hit) => !game.isFullScreenBackdropHit(hit) && hit.y < 180 && hit.w <= 72 && hit.h <= 72);
assert(close, 'modal close hit missing');
assert(game.hitAreas.some((hit) => hit.modalAction), 'modal footer buttons must retain modalAction hit priority');
const x = (close.x + close.w / 2) * 3;
const y = (close.y + close.h / 2) * 3;
handlers.start({ changedTouches: [{ clientX: x, clientY: y }] });
handlers.end({ touches: [], changedTouches: [{ clientX: x, clientY: y }] });
assert.equal(game.infoDetailModal, null, 'Android native-pixel X tap must dismiss the modal');
console.log('android modal close check ok');
