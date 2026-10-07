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

function mash(x, y, times, space) {
  for (let i = 0; i < times; i += 1) tap(x, y, space);
}

const game = new Game();
game.stopLoop();
game.state = createCharacter(null, '射箭连点');
game.screen = 'home';
game.ctx = fakeContext();
game.width = 375;
game.height = 667;
game.render = function paintArchery() {
  this.hitAreas = [];
  this.drawBottomNav();
  this.drawInfoDetailModal();
};
game.requestRender = () => {};
game.toast = () => {};

let fired = 0;
function openArchery() {
  fired = 0;
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
}

openArchery();
assert.equal(game.isArcheryInputModal(game.infoDetailModal), true);
const backdrop = game.hitAreas.find((hit) => game.isFullScreenBackdropHit(hit));
assert(backdrop, '射箭必须有全屏遮罩');

mash(188, 340, 6, 'logical');
assert(game.infoDetailModal, '靶面连点不能退出射箭');
assert.equal(fired, 0, '靶面连点不能发射');

mash(180, 330, 6, 'physical');
assert(game.infoDetailModal, '物理像素靶面连点不能退出射箭');
assert.equal(fired, 0, '物理像素靶面连点不能发射');

const wideDismiss = game.hitAreas.find((hit) => (
  hit.hud
  && !game.isFullScreenBackdropHit(hit)
  && !game.isArcheryCloseXHit(hit)
  && !game.isArcheryFireHit(hit)
  && hit.w >= 80
  && hit.y > 480
));
assert(wideDismiss, '测试需要稍后处理对照');
mash(wideDismiss.x + wideDismiss.w / 2, wideDismiss.y + wideDismiss.h / 2, 5, 'logical');
assert(game.infoDetailModal, '连续点稍后处理不能马上退出射箭');
assert.equal(fired, 0, '稍后处理连点不能发射');

const fire = game.hitAreas.find((hit) => game.isArcheryFireHit(hit));
assert(fire, '发射按钮必须可点');
tap(fire.x + fire.w / 2, fire.y + fire.h / 2, 'logical');
assert.equal(fired, 1, '发射必须仍可点');
assert(game.infoDetailModal, '发射后在结算前应留在射箭页');

openArchery();
const closeX = game.hitAreas.find((hit) => game.isArcheryCloseXHit(hit));
assert(closeX, '右上角关闭必须可点');
tap(closeX.x + closeX.w / 2, closeX.y + closeX.h / 2, 'logical');
assert.equal(game.infoDetailModal, null, '点 × 仍应能离开射箭');

console.log('archery mash dismiss check ok: play-area and later-handle mashes stay, fire and close-x still work');
