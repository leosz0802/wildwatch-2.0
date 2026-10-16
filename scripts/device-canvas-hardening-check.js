'use strict';

const assert = require('node:assert/strict');
const { Game, usesFragileCanvas, canvasPlatformId } = require('../js/game');
const { createCharacter } = require('../js/storage');

function fakeContext() {
  const gradient = { addColorStop() {} };
  const draws = [];
  const fills = [];
  const target = {
    draws,
    fills,
    shadowBlur: 12,
    shadowColor: '#000',
    globalAlpha: 1,
    canvas: { width: 390, height: 844 }
  };
  return new Proxy(target, {
    get(obj, prop) {
      if (prop === 'measureText') return (text) => ({ width: String(text || '').length * 7 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
      if (prop === 'drawImage') return (...args) => { draws.push(args); };
      if (prop === 'fillRect') return (x, y, w, h) => { fills.push({ x, y, w, h }); };
      if (prop in obj) return obj[prop];
      if (!obj[prop]) obj[prop] = () => {};
      return obj[prop];
    },
    set(obj, prop, value) {
      obj[prop] = value;
      return true;
    }
  });
}

assert.equal(canvasPlatformId({ platform: 'android' }), 'android');
assert.equal(usesFragileCanvas({ platform: 'ios' }), false, 'iOS canvas shadows stay enabled');
assert.equal(usesFragileCanvas({ platform: 'android' }), true, 'Android must be treated as a fragile canvas');
assert.equal(usesFragileCanvas({ platform: 'ohos' }), true, 'HarmonyOS must be treated as a fragile canvas');
assert.equal(usesFragileCanvas({ platform: 'devtools' }), true, 'WeChat devtools must follow the Android/Harmony path');
assert.equal(usesFragileCanvas({}), true, 'missing platform must not assume iOS');

const harmonyFade = Object.create(Game.prototype);
harmonyFade.info = { platform: 'ohos' };
harmonyFade.canvasShadowsUnsafe = true;
harmonyFade.screenChangedAtMs = Date.now();
assert.equal(harmonyFade.skipsScreenFade(), true, 'HarmonyOS must skip the whole-page fade');
assert.equal(harmonyFade.screenFade(), 1, 'HarmonyOS page switches must stay fully opaque');

const androidGame = Object.create(Game.prototype);
androidGame.info = { platform: 'android', windowWidth: 390, windowHeight: 844, pixelRatio: 3.25 };
androidGame.canvasShadowsUnsafe = usesFragileCanvas(androidGame.info);
androidGame.ctx = fakeContext();
assert.equal(androidGame.allowsCanvasShadows(), false, 'OnePlus / Android must not use shadowBlur');
assert.equal(androidGame.lockUnsafeCanvasShadows(androidGame.ctx), true, 'Android context must lock shadowBlur off');
androidGame.ctx.shadowBlur = 46;
assert.equal(androidGame.ctx.shadowBlur, 0, 'later shadowBlur writes must not leak onto the framebuffer');

const iosGame = Object.create(Game.prototype);
iosGame.info = { platform: 'ios' };
iosGame.canvasShadowsUnsafe = usesFragileCanvas(iosGame.info);
iosGame.ctx = fakeContext();
assert.equal(iosGame.allowsCanvasShadows(), true, 'iOS may keep decorative shadows');
assert.equal(iosGame.lockUnsafeCanvasShadows(iosGame.ctx), false, 'iOS must not lock shadows off');
const lateIos = Object.create(Game.prototype);
lateIos.info = { platform: 'ios' };
lateIos.canvasShadowsUnsafe = false;
lateIos.state = { world: { reserve: { progression: { displayChapter: 12 } } } };
lateIos.ctx = fakeContext();
assert.equal(lateIos.allowsCanvasShadows(), false, 'chapter 12 iOS must drop shadowBlur before the memory warning');
assert.equal(lateIos.lockUnsafeCanvasShadows(lateIos.ctx), true, 'chapter 12 iOS locks shadowBlur off');
lateIos.ctx.shadowBlur = 46;
assert.equal(lateIos.ctx.shadowBlur, 0, 'chapter 12 shadowBlur writes must not allocate another buffer');

const texture = Object.create(Game.prototype);
texture.art = { premiumUi: { loaded: true, failed: false, width: 0, height: 0 } };
texture.premiumUiAtlas = { frames: { parchment: { x: 0, y: 0, w: 64, h: 64 } } };
texture.canvasShadowsUnsafe = true;
const textureCtx = fakeContext();
assert.equal(texture.drawPremiumTexture(textureCtx, 'parchment', 0, 0, 80, 40, 8), false, 'half-decoded premium atlas must not paint');
texture.art.premiumUi.width = 512;
texture.art.premiumUi.height = 256;
assert.equal(texture.drawPremiumTexture(textureCtx, 'parchment', 0, 0, 80, 40, 8), true, 'ready premium atlas may paint');
assert.ok(textureCtx.draws.length > 0, 'ready atlas uses drawImage');

const mapGame = Object.create(Game.prototype);
mapGame.art = { map: null };
mapGame.mapArtLoad = { status: 'loading', attempt: 0 };
mapGame.holdPrologueMapUntilIllustrated = false;
mapGame.mapImageSource = () => null;
let holdDraws = 0;
let riverDraws = 0;
let yellowFills = 0;
mapGame.drawPrologueMapHold = () => { holdDraws += 1; };
mapGame.drawSavannaRiver = () => { riverDraws += 1; };
mapGame.drawSavannaSkyRim = () => {};
mapGame.drawSavannaSandBand = () => { yellowFills += 1; };
mapGame.drawSimpleWaterHole = () => {};
mapGame.drawSimpleMapTrail = () => {};
mapGame.roundRect = () => {};
mapGame.drawCartoonSavannaMap(fakeContext(), {
  worldX: 0, worldY: 0, worldW: 375, worldH: 600, worldSize: 375, scale: 1, x: 0, y: 0, w: 375, h: 600
}, false, true);
assert.ok(holdDraws > 0, 'missing illustration must keep the grassy hold, not a yellow sand flash');
assert.ok(riverDraws > 0, 'later loads may still draw procedural river on the grassy hold');

const firstEnter = Object.create(Game.prototype);
firstEnter.art = { map: null };
firstEnter.mapArtLoad = { status: 'loading', attempt: 0 };
firstEnter.holdPrologueMapUntilIllustrated = true;
firstEnter.mapImageSource = () => null;
holdDraws = 0;
riverDraws = 0;
firstEnter.drawPrologueMapHold = () => { holdDraws += 1; };
firstEnter.drawSavannaRiver = () => { riverDraws += 1; };
firstEnter.roundRect = () => {};
firstEnter.drawCartoonSavannaMap(fakeContext(), {
  worldX: 0, worldY: 0, worldW: 375, worldH: 600, worldSize: 375, scale: 1
}, false, true);
assert.ok(holdDraws > 0 && riverDraws === 0, 'first enter must not flash the grassless fallback');

const guard = Object.create(Game.prototype);
guard.justEnteredPlayableGame = true;
guard.justEnteredPlayableGameUntil = Date.now() - 10;
guard.screen = 'home';
guard.suppressNextTouchEndTap = true;
assert.equal(guard.consumeEnterGuard(), false, 'stale enter guard must expire so later taps work');
assert.equal(guard.justEnteredPlayableGame, false);

const liveGuard = Object.create(Game.prototype);
liveGuard.justEnteredPlayableGame = true;
liveGuard.justEnteredPlayableGameUntil = Date.now() + 400;
liveGuard.screen = 'choose';
assert.equal(liveGuard.consumeEnterGuard(), true, 'the leftover enter tap on the prologue may still be swallowed');

const archery = Object.create(Game.prototype);
archery.state = createCharacter(null, '射箭卡顿');
archery.infoDetailModal = { kind: 'materialExploration', phase: 'ready', explorationMode: 'archery' };
archery.lockArcheryAim = () => {};
archery.archeryScoreFor = () => 3;
archery.beginArcheryFlight = () => {};
archery.playSfx = () => {};
archery.playArcheryImpact = () => {};
archery.render = () => {};
archery.executeMaterialExploration = () => { archery.settled = true; };
Game.prototype.rollMaterialExplorationDice.call(archery, 'lamp');
assert.equal(archery.settled, undefined, 'short hold must stop at the manual confirmation page');
assert.equal(Game.prototype.waitingArcheryOrDiceConfirm.call(archery), true, 'archery must wait for 确认得分');
assert.equal(Game.prototype.confirmArcheryScore.call(archery), true, 'manual confirmation must settle the arrow');
assert.equal(archery.settled, true, 'archery must settle after 确认得分');

function sandboxPhone(info, width, height, menu) {
  const phone = Object.create(Game.prototype);
  phone.info = info;
  phone.width = width;
  phone.height = height;
  phone.screen = 'home';
  phone.mapZoom = 0;
  phone.mapCamera = { cx: 0.52, cy: 0.48 };
  phone.menuButtonRect = menu;
  return phone;
}

const shortAndroid = sandboxPhone({
  platform: 'android',
  windowWidth: 360,
  windowHeight: 480,
  screenWidth: 360,
  screenHeight: 480,
  statusBarHeight: 24,
  safeArea: { top: 24, bottom: 480 }
}, 360, 480, { left: 280, right: 348, top: 26, bottom: 56, width: 68, height: 30 });
const shortMapY = shortAndroid.compactStageTop() + 32;
const shortMapH = shortAndroid.homeSandboxMapHeight(shortMapY);
assert.equal(shortMapY + shortMapH, shortAndroid.height - shortAndroid.navHeight(), '16:9 Android map must end on the tab bar');
assert.ok(shortMapH < 420, 'a short Android window must not keep a 420px slab under the tab bar');

const gestureAndroid = sandboxPhone({
  platform: 'android',
  windowWidth: 393,
  windowHeight: 873,
  screenWidth: 393,
  screenHeight: 873,
  statusBarHeight: 32,
  safeArea: { top: 32, bottom: 837 }
}, 393, 873, { left: 300, right: 380, top: 36, bottom: 68, width: 80, height: 32 });
assert.equal(gestureAndroid.systemBottomInset(), 36, 'Android gesture bar still inside the canvas must lift the page');
assert.equal(gestureAndroid.navHeight(), 98);
const gestureMapY = gestureAndroid.compactStageTop() + 32;
assert.equal(gestureMapY + gestureAndroid.homeSandboxMapHeight(gestureMapY), gestureAndroid.height - gestureAndroid.navHeight());

const excludedNav = sandboxPhone({
  platform: 'android',
  windowWidth: 393,
  windowHeight: 837,
  screenWidth: 393,
  screenHeight: 873,
  safeArea: { top: 32, bottom: 837 }
}, 393, 837, null);
assert.equal(excludedNav.systemBottomInset(), 0, 'a window that already excludes the system bar must not pad twice');

const denseAndroid = sandboxPhone({
  platform: 'android',
  windowWidth: 360,
  windowHeight: 800,
  screenWidth: 1080,
  screenHeight: 2400,
  pixelRatio: 3,
  safeArea: { top: 90, bottom: 2256 }
}, 360, 800, null);
assert.equal(denseAndroid.systemBottomInset(), 48, 'physical-pixel Android safe area must convert into logical pixels');

const iosHomeIndicator = sandboxPhone({
  platform: 'ios',
  model: 'iPhone 14',
  windowWidth: 390,
  windowHeight: 844,
  screenWidth: 390,
  screenHeight: 844,
  safeArea: { top: 47, bottom: 810 }
}, 390, 844, null);
assert.equal(iosHomeIndicator.systemBottomInset(), 0, 'iPhone home indicator stays inside the existing tab bar');
assert.equal(iosHomeIndicator.navHeight(), 62);

const wideAndroid = sandboxPhone({
  platform: 'android',
  windowWidth: 717,
  windowHeight: 652,
  screenWidth: 717,
  screenHeight: 652,
  safeArea: { top: 0, bottom: 652 }
}, 717, 652, null);
const wideCamera = wideAndroid.mapCameraInfo(3, 80, 711, 500);
assert.ok(Math.abs(wideCamera.worldH - 500 * 1.24) < 1, 'a wide Android fold must size the meadow from the visible height');
const tallCamera = wideAndroid.mapCameraInfo(3, 80, 360, 700);
assert.ok(Math.abs(tallCamera.worldH - 700 * 1.24) < 1, 'a tall Android phone must keep the same meadow proportion');

const iosTap = Object.create(Game.prototype);
iosTap.info = { platform: 'ios', model: 'iPhone 12', windowWidth: 390, windowHeight: 844, pixelRatio: 3 };
iosTap.width = 390;
iosTap.height = 844;
iosTap.canvas = { width: 780, height: 1688 };
iosTap.dpr = 2;
iosTap.screen = 'home';
iosTap.state = { character: { name: '苹果按钮' } };
iosTap.infoDetailModal = { kind: 'facilityConstruction' };
iosTap.touchCoordinateSpace = '';
iosTap.hitAreas = [
  { x: 0, y: 0, w: 390, h: 844, hud: true, onTap() {} },
  { x: 36, y: 700, w: 150, h: 44, hud: true, modalAction: true, onTap() {} },
  { x: 210, y: 700, w: 150, h: 44, hud: true, modalAction: true, onTap() {} }
];
const canvasPoint = iosTap.touchPoint({ clientX: 285 * 2, clientY: 722 * 2 });
assert.ok(Math.abs(canvasPoint.x - 285) < 1 && Math.abs(canvasPoint.y - 722) < 1, 'iPhone canvas pixels must hit 整理线索, not the blank card');
assert.equal(iosTap.hitAreaAt(canvasPoint.x, canvasPoint.y), iosTap.hitAreas[2]);
iosTap.touchCoordinateSpace = '';
const devicePoint = iosTap.touchPoint({ clientX: 111 * 3, clientY: 722 * 3 });
assert.ok(Math.abs(devicePoint.x - 111) < 1 && Math.abs(devicePoint.y - 722) < 1, 'iPhone device pixels must still hit 关闭');
assert.equal(iosTap.hitAreaAt(devicePoint.x, devicePoint.y), iosTap.hitAreas[1]);
iosTap.touchCoordinateSpace = '';
const logicalPoint = iosTap.touchPoint({ clientX: 285, clientY: 722 });
assert.ok(Math.abs(logicalPoint.x - 285) < 1 && Math.abs(logicalPoint.y - 722) < 1, 'a logical iPhone tap must stay on the button');

console.log('device canvas hardening check ok (android/harmony shadows, map hold, enter guard, archery delay)');
