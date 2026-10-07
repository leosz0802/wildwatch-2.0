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

function crisisSettlement() {
  return {
    title: '现场发现·砾灰咬回的布条',
    summary: '突发事件仍在扩散。',
    grade: 'A',
    guardianScore: 72,
    scoreDelta: 0,
    speech: '幼崽今天还没喝到水。',
    speaker: '晨角',
    returnScreen: 'home',
    breakthrough: {
      kind: 'emergency_started',
      kicker: '突发事件',
      title: '现场发现·砾灰咬回的布条',
      body: '布条带着旧营地和陌生车厢混在一起的气味。'
    },
    causality: {
      reasons: [{ label: '病味扩散', action: 'houndScout' }]
    },
    stats: [
      { label: '安全指数', before: 72, after: 72, delta: 0 }
    ],
    fundBefore: 8455,
    fundAfter: 8455
  };
}

function compactHudHits(game) {
  const hits = game.hitAreas.filter((hit) => (
    hit.hud
    && !game.isFullScreenBackdropHit(hit)
    && hit.w > 80
    && hit.w < 220
    && hit.y > 360
    && hit.y < game.height - 70
  )).sort((a, b) => a.x - b.x || b.h - a.h);
  return hits.filter((hit, index) => hits.findIndex((item) => Math.abs(item.x - hit.x) < 8) === index);
}

function tap(hit, space) {
  const x = hit.x + hit.w / 2;
  const y = hit.y + hit.h / 2;
  const point = space === 'physical'
    ? { clientX: x * 2, clientY: y * 2 }
    : { clientX: x, clientY: y };
  handlers.start({ changedTouches: [point] });
  handlers.end({ touches: [], changedTouches: [point] });
}

const game = new Game();
game.stopLoop();
game.state = createCharacter(null, '结算突发事件触摸');
game.screen = 'home';
game.ctx = fakeContext();
game.width = 375;
game.height = 667;
game.render = function renderForTest() {
  this.hitAreas = [];
  this.drawBottomNav();
  this.drawSettlementModal();
};
game.requestRender = () => {};
game.toast = () => {};
game.maybeShowInterstitialForSettlement = () => {};
let routed = '';
game.openReserveViewAction = (actionId) => { routed = actionId; };

game.settlementModal = crisisSettlement();
game.render();

assert.equal(game.blockingOverlayOpen(), true, '突发事件结算必须挡住沙盘');
assert.equal(game.settlementCrisisAction(game.settlementModal).buttonLabel, '去猎犬侦察');

const backdrop = game.hitAreas.find((hit) => game.isFullScreenBackdropHit(hit));
assert(backdrop && backdrop.hud, '结算遮罩必须是全屏 HUD，避免点到沙盘');
assert.ok(game.hitAreas.some((hit) => game.isFullScreenBackdropHit(hit)), '结算必须有遮罩命中层');
assert.equal(game.hitAreas.some((hit) => game.isLockedBottomNavHit(hit)), false, '结算打开时底栏不能再抢关闭键');

const footer = compactHudHits(game);
assert.ok(footer.length >= 2, `关闭和去猎犬侦察都必须是 HUD，实际 ${footer.length}`);
const closeHit = footer[0];
const scoutHit = footer[1];

game.touchCoordinateSpace = 'physical';
handlers.start({
  changedTouches: [{ clientX: 24, clientY: (game.height - 18) * 2 }]
});
assert.equal(game.screen, 'home', '结算打开时不能切到其他页');

game.touchCoordinateSpace = '';
tap(closeHit, 'logical');
assert.equal(game.settlementModal, null, '逻辑坐标点关闭必须立刻关掉结算');

game.settlementModal = crisisSettlement();
game.render();
routed = '';
const scoutAgain = compactHudHits(game)[1];
game.touchCoordinateSpace = 'physical';
tap(scoutAgain, 'logical');
assert.equal(routed, 'houndScout', '逻辑坐标点去猎犬侦察必须进入侦察');
assert.equal(game.settlementModal, null, '去猎犬侦察后结算必须关闭');

game.settlementModal = crisisSettlement();
game.render();
const closePhysical = compactHudHits(game)[0];
tap(closePhysical, 'physical');
assert.equal(game.settlementModal, null, '物理像素点关闭也必须立刻关掉结算');

console.log('settlement crisis touch check ok: close and hound-scout stay HUD above the sandbox nav');
