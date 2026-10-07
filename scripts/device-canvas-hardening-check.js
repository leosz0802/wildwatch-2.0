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

console.log('device canvas hardening check ok (android/harmony shadows, map hold, enter guard, archery delay)');
