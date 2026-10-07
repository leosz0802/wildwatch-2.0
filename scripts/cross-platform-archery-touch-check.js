'use strict';

const assert = require('node:assert/strict');

const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');

function installWx(platform, handlers, pixelRatio = 2) {
  global.wx = {
    getSystemInfoSync: () => ({ platform, windowWidth: 375, windowHeight: 667, pixelRatio }),
    createCanvas: () => ({
      width: 375 * pixelRatio,
      height: 667 * pixelRatio,
      getContext: () => null
    }),
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
}

function makeGame(platform) {
  const handlers = {};
  installWx(platform, handlers);
  const game = new Game();
  game.stopLoop();
  game.state = createCharacter(null, `跨平台射箭-${platform}`);
  game.screen = 'home';
  game.render = game.requestRender = () => {};
  game.mapViewport = { x: 0, y: 0, w: 375, h: 500 };
  return { game, handlers };
}

function touch(x, y, space = 'logical') {
  if (space === 'physical') return { clientX: x * 2, clientY: y * 2 };
  return { clientX: x, clientY: y };
}

function openArchery(game, fired) {
  game.infoDetailModal = {
    kind: 'chapterSpecialTask',
    explorationMode: 'archery',
    phase: 'ready',
    def: { mode: 'archery' }
  };
  game.hitAreas = [
    // This is the modal background. It must never close an archery page.
    { x: 0, y: 0, w: 375, h: 667, hud: false, map: false, onTap: () => { game.infoDetailModal = null; } },
    // Only the explicit footer HUD button may fire.
    { x: 30, y: 600, w: 315, h: 42, hud: true, map: false, onTap: () => { fired.count += 1; } }
  ];
}

function runLogicalTouchCase(platform) {
  const { game, handlers } = makeGame(platform);
  const fired = { count: 0 };
  openArchery(game, fired);

  const trusted = game.touchPoint({ x: 180, y: 330, clientX: 360, clientY: 660 });
  assert.ok(Math.abs(trusted.x - 180) < 0.6, `${platform} trusted logical x must stay`);
  assert.ok(Math.abs(trusted.y - 330) < 0.6, `${platform} trusted logical y must stay`);
  const clientOnly = game.touchPoint({ clientX: 180, clientY: 330 });
  assert.ok(Math.abs(clientOnly.x - 180) < 0.6, `${platform} logical client-only x must stay`);
  assert.ok(Math.abs(clientOnly.y - 330) < 0.6, `${platform} logical client-only y must stay`);

  // iOS and standard Android expose logical points through touches/changedTouches.
  handlers.start({ touches: [touch(180, 330)] });
  handlers.move({ touches: [touch(220, 350)] });
  handlers.end({ touches: [], changedTouches: [touch(220, 350)] });
  assert(game.infoDetailModal, `${platform} archery drag must keep the modal open`);
  assert.equal(fired.count, 0, `${platform} archery drag must not fire`);

  handlers.start({ touches: [touch(180, 620)] });
  handlers.end({ touches: [], changedTouches: [touch(180, 620)] });
  assert.equal(fired.count, 1, `${platform} footer fire tap must execute once`);

  // A normal map button retains the ordinary tap path outside archery input.
  game.infoDetailModal = null;
  let mapTapped = 0;
  game.hitAreas = [{ x: 90, y: 180, w: 120, h: 48, hud: false, map: true, onTap: () => { mapTapped += 1; } }];
  handlers.start({ touches: [touch(150, 200)] });
  handlers.end({ touches: [], changedTouches: [touch(150, 200)] });
  assert.equal(mapTapped, 1, `${platform} ordinary map tap must remain functional`);
}

function runPhysicalPixelCase(platform) {
  const { game, handlers } = makeGame(platform);
  const fired = { count: 0 };
  openArchery(game, fired);

  if (platform === 'ohos') {
    const mapped = game.touchPoint({ clientX: 360, clientY: 660 });
    assert.ok(Math.abs(mapped.x - 180) < 0.6, 'ohos in-range physical x must convert');
    assert.ok(Math.abs(mapped.y - 330) < 0.6, 'ohos in-range physical y must convert');
  } else {
    const logical = game.touchPoint({ x: 180, y: 330, clientX: 360, clientY: 660 });
    assert.ok(Math.abs(logical.x - 180) < 0.6, `${platform} trusted logical x must stay`);
    assert.ok(Math.abs(logical.y - 330) < 0.6, `${platform} trusted logical y must stay`);
  }

  // Some Android/HarmonyOS WebViews report backing-canvas pixels and only
  // changedTouches. The same gesture must stay in the modal after normalization.
  handlers.start({ changedTouches: [touch(180, 330, 'physical')] });
  handlers.move({ changedTouches: [touch(220, 350, 'physical')] });
  handlers.end({ touches: [], changedTouches: [touch(220, 350, 'physical')] });
  assert(game.infoDetailModal, `${platform} physical archery drag must keep the modal open`);
  assert.equal(fired.count, 0, `${platform} physical archery drag must not fire`);

  handlers.start({ changedTouches: [touch(180, 620, 'physical')] });
  handlers.end({ touches: [], changedTouches: [touch(180, 620, 'physical')] });
  assert.equal(fired.count, 1, `${platform} physical footer fire tap must execute once`);
}

['ios', 'android'].forEach((platform) => runLogicalTouchCase(platform));
runPhysicalPixelCase('android');
runPhysicalPixelCase('ohos');

// A paused timer must still finish the shot exactly once on every platform.
['ios', 'android', 'ohos'].forEach((platform) => {
  const { game } = makeGame(platform);
  let recovered = 0;
  game.infoDetailModal = {
    kind: 'chapterSpecialTask',
    explorationMode: 'archery',
    phase: 'rolling',
    def: { mode: 'archery' },
    archeryFlightStartedAt: Date.now() - 3000,
    archeryFlightDone: () => { recovered += 1; }
  };
  assert.equal(game.recoverStuckDiceOrArchery(Date.now()), true, `${platform} stalled archery must recover`);
  assert.equal(recovered, 1, `${platform} stalled archery must finish once`);
});

console.log('cross-platform archery touch check ok: ios/android logical input, android/ohos physical input, ordinary map tap, and flight recovery');
