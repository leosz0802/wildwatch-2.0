'use strict';

const assert = require('node:assert/strict');

const { Game, usesHarmonyPhysicalTouches, resolveRuntimeInfo } = require('../js/game');
const { createCharacter } = require('../js/storage');

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

function installWx(spec, handlers) {
  const systemInfo = {
    platform: spec.systemPlatform,
    system: spec.system,
    windowWidth: 375,
    windowHeight: 667,
    pixelRatio: 2
  };
  global.wx = {
    getSystemInfoSync: () => systemInfo,
    getDeviceInfo: spec.devicePlatform
      ? () => ({ platform: spec.devicePlatform, system: spec.deviceSystem || spec.system })
      : undefined,
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
}

function almost(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 0.6, `${label}: ${actual} != ${expected}`);
}

function plantFooterHud(game, fired) {
  game.hitAreas = [
    { x: 0, y: 0, w: 375, h: 667, hud: true, map: false, onTap: () => { game.infoDetailModal = null; } },
    { x: 30, y: 600, w: 315, h: 42, hud: true, map: false, onTap: () => { fired.count += 1; } }
  ];
}

function openArchery(game) {
  game.infoDetailModal = {
    kind: 'chapterSpecialTask',
    explorationMode: 'archery',
    phase: 'ready',
    def: { mode: 'archery' }
  };
}

const SPECS = [
  {
    id: 'ios',
    systemPlatform: 'ios',
    system: 'iOS 17.5',
    harmony: false,
    officialLogical: true
  },
  {
    id: 'android',
    systemPlatform: 'android',
    system: 'Android 14',
    harmony: false,
    officialLogical: true
  },
  {
    id: 'ohos',
    systemPlatform: 'ohos',
    system: 'HarmonyOS 4.2',
    harmony: true,
    officialLogical: false
  },
  {
    id: 'android-harmony-system',
    systemPlatform: 'android',
    system: 'HarmonyOS 4.2',
    harmony: true,
    officialLogical: false
  },
  {
    id: 'android-deviceinfo-ohos',
    systemPlatform: 'android',
    system: 'Android 12',
    devicePlatform: 'ohos',
    deviceSystem: 'HarmonyOS 4.2',
    harmony: true,
    officialLogical: false
  },
  {
    id: 'devtools-harmony',
    systemPlatform: 'devtools',
    system: 'HarmonyOS',
    harmony: true,
    officialLogical: false
  }
];

assert.equal(usesHarmonyPhysicalTouches({ platform: 'ohos' }), true);
assert.equal(usesHarmonyPhysicalTouches({ platform: 'android' }), false);
assert.equal(usesHarmonyPhysicalTouches({ platform: 'ios' }), false);
assert.equal(usesHarmonyPhysicalTouches({ platform: 'devtools', system: 'HarmonyOS' }), true);
assert.equal(usesHarmonyPhysicalTouches({ platform: 'android', system: 'HarmonyOS 4.2' }), true);
assert.equal(usesHarmonyPhysicalTouches({ platform: 'android', system: 'Android 14' }), false);

const merged = resolveRuntimeInfo({
  getSystemInfoSync: () => ({ platform: 'android', system: 'Android 12', windowWidth: 375 }),
  getDeviceInfo: () => ({ platform: 'ohos', system: 'HarmonyOS 4.2' })
});
assert.equal(merged.platform, 'ohos');
assert.equal(usesHarmonyPhysicalTouches(merged), true);

for (const spec of SPECS) {
  const handlers = {};
  installWx(spec, handlers);
  const game = new Game();
  game.stopLoop();
  game.state = createCharacter(null, `三端触摸-${spec.id}`);
  game.screen = 'home';
  game.width = 375;
  game.height = 667;
  game.ctx = fakeContext();
  game.render = game.requestRender = () => {};
  game.toast = () => {};

  assert.equal(
    game.usesHarmonyPhysicalTouches(),
    spec.harmony,
    `${spec.id} HarmonyOS detection`
  );

  const fired = { count: 0 };
  plantFooterHud(game, fired);

  // Official WeChat sample: clientX is viewport / logical CSS pixels.
  game.touchCoordinateSpace = '';
  const officialFooter = game.touchPoint({ clientX: 180, clientY: 620 });
  almost(officialFooter.x, 180, `${spec.id} official logical footer x`);
  almost(officialFooter.y, 620, `${spec.id} official logical footer y`);

  // Overflow backing-canvas pixels convert on every platform.
  game.touchCoordinateSpace = '';
  const overflowFooter = game.touchPoint({ clientX: 360, clientY: 1240 });
  almost(overflowFooter.x, 180, `${spec.id} overflow physical footer x`);
  almost(overflowFooter.y, 620, `${spec.id} overflow physical footer y`);

  // Dual-field official pair: x is logical, client is x * dpr.
  game.touchCoordinateSpace = '';
  const trusted = game.touchPoint({ x: 180, y: 330, clientX: 360, clientY: 660 });
  almost(trusted.x, 180, `${spec.id} trusted logical x`);
  almost(trusted.y, 330, `${spec.id} trusted logical y`);

  game.touchCoordinateSpace = '';
  const inside = game.touchPoint({ clientX: 360, clientY: 660 });
  if (spec.harmony) {
    almost(inside.x, 180, `${spec.id} in-range physical x`);
    almost(inside.y, 330, `${spec.id} in-range physical y`);
  } else {
    almost(inside.x, 360, `${spec.id} official client-only stays logical x`);
    almost(inside.y, 660, `${spec.id} official client-only stays logical y`);
  }

  openArchery(game);
  plantFooterHud(game, fired);
  fired.count = 0;
  game.touchCoordinateSpace = 'physical';
  handlers.start({ changedTouches: [{ clientX: 180, clientY: 330 }] });
  handlers.move({ changedTouches: [{ clientX: 220, clientY: 350 }] });
  handlers.end({ touches: [], changedTouches: [{ clientX: 220, clientY: 350 }] });
  assert(game.infoDetailModal, `${spec.id} archery drag must keep the modal open`);
  assert.equal(fired.count, 0, `${spec.id} archery drag must not fire`);

  handlers.start({ changedTouches: [{ clientX: 180, clientY: 620 }] });
  handlers.end({ touches: [], changedTouches: [{ clientX: 180, clientY: 620 }] });
  assert.equal(fired.count, 1, `${spec.id} logical footer fire must execute once`);

  fired.count = 0;
  openArchery(game);
  plantFooterHud(game, fired);
  handlers.start({ changedTouches: [{ clientX: 360, clientY: 1240 }] });
  handlers.end({ touches: [], changedTouches: [{ clientX: 360, clientY: 1240 }] });
  assert.equal(fired.count, 1, `${spec.id} physical overflow footer must execute once`);

  // A previous physical lock must not freeze the next logical close tap.
  game.infoDetailModal = { kind: 'visitorMetricDetail' };
  let closed = false;
  game.hitAreas = [
    { x: 320, y: 36, w: 36, h: 36, hud: true, map: false, onTap: () => { closed = true; game.infoDetailModal = null; } },
    { x: 30, y: 600, w: 140, h: 42, hud: true, map: false, onTap: () => {} },
    { x: 190, y: 600, w: 140, h: 42, hud: true, map: false, onTap: () => {} }
  ];
  game.touchCoordinateSpace = 'physical';
  handlers.start({ changedTouches: [{ clientX: 338, clientY: 54 }] });
  assert.equal(closed, true, `${spec.id} poisoned physical lock must reset so close stays tappable`);
  assert.equal(game.infoDetailModal, null, `${spec.id} visitor close must dismiss`);
}

// HarmonyOS physical-pixel map taps must not be re-scored as the logical
// position of the top task chip. This reproduces a tap on the map area below
// “解救羚羊 · 收集物品” that previously opened the chip instead.
const mapTouchHandlers = {};
installWx(SPECS.find((item) => item.id === "ohos"), mapTouchHandlers);
const mapTouchGame = new Game();
mapTouchGame.stopLoop();
mapTouchGame.state = createCharacter(null, "鸿蒙地图与任务入口");
mapTouchGame.screen = "home";
mapTouchGame.width = 375;
mapTouchGame.height = 667;
mapTouchGame.ctx = fakeContext();
let mapTapped = 0;
let taskChipTapped = 0;
mapTouchGame.hitAreas = [
  { x: 100, y: 270, w: 80, h: 60, map: true, hud: false, onTap: () => { mapTapped += 1; } },
  { x: 250, y: 580, w: 110, h: 40, map: false, hud: true, onTap: () => { taskChipTapped += 1; } }
];
mapTouchGame.touchCoordinateSpace = "";
const mapPhysicalTouch = { clientX: 140 * 2, clientY: 300 * 2 };
const mapPoint = mapTouchGame.touchPoint(mapPhysicalTouch);
assert.ok(Math.abs(mapPoint.x - 140) < 0.6 && Math.abs(mapPoint.y - 300) < 0.6,
  "HarmonyOS physical map tap must normalize to the map point");
const selectedMapHit = mapTouchGame.touchHitAreaCandidates(mapPhysicalTouch, mapPoint);
assert(selectedMapHit && selectedMapHit.hit && selectedMapHit.hit.map && !selectedMapHit.hit.hud,
  "HarmonyOS map tap must keep the map hit when the logical candidate lands on the task chip");
mapTouchGame.activateHitArea(selectedMapHit.hit);
assert.equal(mapTapped, 1, "HarmonyOS map tap must activate the map target");
assert.equal(taskChipTapped, 0, "HarmonyOS map tap must not activate the top task chip");

const visitorHandlers = {};
installWx(SPECS.find((item) => item.id === 'ohos'), visitorHandlers);
const visitorGame = new Game();
visitorGame.stopLoop();
visitorGame.state = createCharacter(null, '三端触摸-游客详情');
visitorGame.screen = 'home';
visitorGame.width = 375;
visitorGame.height = 667;
visitorGame.ctx = fakeContext();
visitorGame.render = visitorGame.requestRender = () => {};
visitorGame.toast = () => {};
assert.equal(visitorGame.openCoreMetricDetail('visitors'), true);
visitorGame.hitAreas = [];
visitorGame.drawInfoDetailModal();
const closeHit = visitorGame.hitAreas.find((hit) => !visitorGame.isFullScreenBackdropHit(hit) && hit.w < 80 && hit.h < 80 && hit.y < 120);
assert(closeHit, '游客详情关闭叉必须可点击');
const footerHits = visitorGame.hitAreas.filter((hit) => hit.hud && hit.y > 520 && hit.w > 100 && hit.w < 200);
assert(footerHits.length >= 2, '关闭和去招募都必须是 HUD');
visitorGame.touchCoordinateSpace = 'physical';
visitorHandlers.start({
  changedTouches: [{ clientX: closeHit.x + closeHit.w / 2, clientY: closeHit.y + closeHit.h / 2 }]
});
assert.equal(visitorGame.infoDetailModal, null, '鸿蒙游客详情逻辑关闭叉必须立刻关掉');

const recruitHandlers = {};
installWx(SPECS.find((item) => item.id === 'ohos'), recruitHandlers);
const recruitGame = new Game();
recruitGame.stopLoop();
recruitGame.state = createCharacter(null, '鸿蒙招募按钮');
recruitGame.screen = 'home';
recruitGame.width = 375;
recruitGame.height = 667;
recruitGame.ctx = fakeContext();
recruitGame.infoDetailModal = { kind: 'visitorRecruitment', phase: 'prompt' };
let published = 0;
recruitGame.hitAreas = [
  { x: 80, y: 270, w: 80, h: 70, map: true, hud: false, onTap() {} },
  { x: 0, y: 0, w: 375, h: 667, hud: true, onTap() {} },
  { x: 30, y: 590, w: 150, h: 48, hud: true, modalAction: true, onTap() {} },
  { x: 190, y: 580, w: 160, h: 70, hud: true, modalAction: true, onTap() { published += 1; } }
];
recruitGame.touchCoordinateSpace = '';
const recruitPoint = recruitGame.touchPoint({ clientX: 250, clientY: 610 });
almost(recruitPoint.x, 250, '鸿蒙弹层发布招募必须留在逻辑坐标');
almost(recruitPoint.y, 610, '鸿蒙弹层发布招募不得被地图缩小');
const recruitEdge = recruitGame.touchPoint({ clientX: 320, clientY: 610 });
almost(recruitEdge.x, 320, '鸿蒙弹层按钮右缘不得按右下角物理像素缩小');
almost(recruitEdge.y, 610, '鸿蒙弹层按钮右缘 y 必须留在按钮上');
recruitHandlers.start({ changedTouches: [{ clientX: 250, clientY: 610 }] });
recruitHandlers.end({ touches: [], changedTouches: [{ clientX: 250, clientY: 610 }] });
assert.equal(published, 1, '鸿蒙点发布招募必须触发，不能落到弹层下的动物');

console.log('platform touch matrix ok: ios/android/ohos/devtools, official clientX, physical overflow, lock reset, visitor HUD');
