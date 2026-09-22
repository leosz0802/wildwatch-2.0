'use strict';

const assert = require('node:assert/strict');
const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');

function createFakeContext() {
  const gradient = { addColorStop() {} };
  let lastAlpha = 1;
  const calls = [];
  const ctx = new Proxy({
    get globalAlpha() { return lastAlpha; },
    set globalAlpha(value) {
      lastAlpha = Number(value);
      calls.push(lastAlpha);
    },
    measureText: (text) => ({ width: String(text || '').length * 7 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    canvas: { width: 390, height: 844 }
  }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (!target[prop]) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    }
  });
  ctx.alphaCalls = calls;
  return ctx;
}

function setupGame() {
  const game = Object.create(Game.prototype);
  game.state = createCharacter(null, '发现页淡入');
  game.anim = { t: 1200, lastTs: 1200, rafId: 0, paused: true, acc: 0, lastWallTs: Date.now() };
  game.screenChangedAt = -1000;
  game.screenChangedAtMs = 0;
  game.raf = null;
  game.ctx = createFakeContext();
  game.width = 390;
  game.height = 844;
  game.dpr = 1;
  game.scrollY = 0;
  game.hitAreas = [];
  game.toast = () => {};
  game.drawCurrentScreen = () => {
    game.drawnScreenAlpha = game.ctx.globalAlpha;
  };
  game.drawBottomNav = () => {
    game.drawnNavAlpha = game.ctx.globalAlpha;
  };
  game.drawStickyTableHeader = () => {};
  game.collectTaskCompletionFeedback = () => {};
  game.showNextTaskCompletionNotice = () => {};
  game.syncNativeTemplateAd = () => {};
  game.clampScroll = () => {};
  game.clear = () => {};
  game.drawChapterStoryModal = () => {};
  game.drawMapHarvestFlight = () => {};
  game.drawPatrolTaskModal = () => {};
  game.drawInfoDetailModal = () => {};
  game.drawSettlementModal = () => {};
  game.wechatFriends = null;
  game.cloudService = null;
  return game;
}

const firstPaint = setupGame();
firstPaint.screen = 'home';
firstPaint.info = { platform: 'ohos', windowWidth: 390, windowHeight: 844 };
firstPaint.canvasShadowsUnsafe = true;
firstPaint.setScreen = Game.prototype.setScreen;
firstPaint.sandboxTaskNavigationBlocked = () => false;
firstPaint.firstSessionFeatureLocked = () => false;
firstPaint.prepareLocalAssetsForScreen = () => true;
firstPaint.queueRemoteAssetsForScreen = () => {};
firstPaint.openPendingFirstPatrolTransfer = () => false;
firstPaint.skipsScreenFade = Game.prototype.skipsScreenFade;
firstPaint.resetCanvasCompositing = Game.prototype.resetCanvasCompositing;
firstPaint.parkIdleOpenDataOverlay = Game.prototype.parkIdleOpenDataOverlay;
firstPaint.lockUnsafeCanvasShadows = () => false;
firstPaint.markScreenChange();
assert.equal(firstPaint.screenFade(), 1, `HarmonyOS must not fade the whole page, got ${firstPaint.screenFade()}`);
firstPaint.screen = 'collection';
firstPaint.discoveryTab = 'visitors';
Game.prototype.render.call(firstPaint);
assert.equal(firstPaint.drawnScreenAlpha, 1, `collection content must stay fully opaque on HarmonyOS, got ${firstPaint.drawnScreenAlpha}`);
assert.equal(firstPaint.drawnNavAlpha, 1, 'bottom nav stays fully opaque');

const iosFade = setupGame();
iosFade.info = { platform: 'ios' };
iosFade.canvasShadowsUnsafe = false;
iosFade.skipsScreenFade = Game.prototype.skipsScreenFade;
iosFade.markScreenChange();
assert.ok(iosFade.screenFade() >= 0.72, `iOS first fade must stay readable, got ${iosFade.screenFade()}`);
assert.ok(iosFade.screenFade() < 1, 'iOS may still use a short fade');

const stalled = setupGame();
stalled.info = { platform: 'ios' };
stalled.canvasShadowsUnsafe = false;
stalled.skipsScreenFade = Game.prototype.skipsScreenFade;
stalled.markScreenChange();
const frozen = stalled.screenFade();
stalled.anim.t = stalled.anim.t;
assert.ok(stalled.screenFade() >= 0.72, 'stalled animation clock must not drop the page to 0');
assert.ok(Math.abs(stalled.screenFade() - frozen) < 0.3, 'without wall-clock progress fade stays on the readable first frame');
stalled.screenChangedAtMs = Date.now() - 320;
assert.equal(stalled.screenFade(), 1, 'wall clock must complete the fade even if rAF timestamps stay at 0');

console.log('channel screen fade check ok (collection first paint stays readable on stalled rAF)');
