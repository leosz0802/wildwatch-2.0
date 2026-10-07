'use strict';

const assert = require('node:assert/strict');

const handlers = {};
global.wx = {
  getSystemInfoSync: () => ({ platform: 'ohos', windowWidth: 375, windowHeight: 667, pixelRatio: 2 }),
  createCanvas: () => ({
    width: 750,
    height: 1334,
    getContext: () => fakeContext()
  }),
  getStorageSync: () => null,
  setStorageSync() {},
  onTouchStart(handler) { handlers.start = handler; },
  onTouchMove(handler) { handlers.move = handler; },
  onTouchEnd(handler) { handlers.end = handler; },
  onTouchCancel(handler) { handlers.cancel = handler; },
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
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

const game = new Game();
game.stopLoop();
game.state = createCharacter(null, '游客详情触摸');
game.screen = 'home';
game.ctx = fakeContext();
game.width = 375;
game.height = 667;
game.render = () => {};
game.requestRender = () => {};
game.toast = () => {};

assert.equal(game.openCoreMetricDetail('visitors'), true);
assert.equal(game.infoDetailModal.kind, 'visitorMetricDetail');
game.hitAreas = [];
game.drawInfoDetailModal();

const closeHit = game.hitAreas.find((hit) => hit.hud && hit.w < 80 && hit.h < 80 && hit.y < 120);
assert(closeHit, '游客详情关闭叉必须是 HUD');
const footerHits = game.hitAreas.filter((hit) => hit.hud && hit.y > 520 && hit.w > 100 && hit.w < 200);
assert(footerHits.length >= 2, '关闭和去招募都必须是 HUD');

game.touchCoordinateSpace = '';
const closePoint = {
  clientX: closeHit.x + closeHit.w / 2,
  clientY: closeHit.y + closeHit.h / 2
};
handlers.start({ changedTouches: [closePoint] });
assert.equal(game.infoDetailModal, null, '逻辑坐标点关闭叉必须立刻关掉游客详情');

game.openCoreMetricDetail('visitors');
game.hitAreas = [];
game.drawInfoDetailModal();
const recruit = game.hitAreas.filter((hit) => hit.hud && hit.y > 520 && hit.w > 100 && hit.w < 200).sort((a, b) => a.x - b.x)[1];
assert(recruit, '去招募必须可点');
let opened = false;
game.openVisitorRecruitment = () => { opened = true; game.infoDetailModal = { kind: 'visitorRecruitment' }; };
handlers.start({
  changedTouches: [{ clientX: recruit.x + recruit.w / 2, clientY: recruit.y + recruit.h / 2 }]
});
assert.equal(opened, true, '逻辑坐标点去招募必须进入招募页');

for (const metricId of ['visitors', 'animals']) {
  let shared = 0;
  game.shareMetricReward = () => { shared += 1; };
  game.shareForestPostcard = () => { shared += 1; return true; };
  assert.equal(game.openCoreMetricDetail(metricId), true, `${metricId} detail must open`);
  game.hitAreas = [];
  game.drawInfoDetailModal();
  const view = game.infoDetailModal.renderedFundLedgerViewport;
  assert(view, `${metricId} list must expose a scroll viewport`);
  const shareHit = game.hitAreas.find((hit) => !hit.hud && typeof hit.onTap === 'function'
    && hit.x >= view.x && hit.y >= view.y && hit.y < view.y + view.h);
  handlers.start({ changedTouches: [{ clientX: view.x + 24, clientY: view.y + 36 }] });
  assert.equal(game.gesture && game.gesture.memoryTimeline, true, `${metricId} list press must start a scroll gesture`);
  assert.equal(shared, 0, `${metricId} list press must not share immediately`);
  handlers.move({ changedTouches: [{ clientX: view.x + 24, clientY: view.y - 40 }] });
  handlers.end({ touches: [], changedTouches: [{ clientX: view.x + 24, clientY: view.y - 40 }] });
  assert.equal(shared, 0, `${metricId} list swipe must not share`);
  if (shareHit) {
    handlers.start({
      changedTouches: [{ clientX: shareHit.x + shareHit.w / 2, clientY: shareHit.y + 12 }]
    });
    handlers.end({
      touches: [],
      changedTouches: [{ clientX: shareHit.x + shareHit.w / 2, clientY: shareHit.y + 12 }]
    });
    assert.equal(shared, 1, `${metricId} share row must run only after a tap without swipe`);
  }
}

console.log('visitor metric touch check ok: close and recruit stay HUD, list scrolls before share');
