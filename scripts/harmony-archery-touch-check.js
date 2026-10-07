'use strict';

const assert = require('node:assert/strict');

const handlers = {};
global.wx = {
  getSystemInfoSync: () => ({ platform: 'ohos', windowWidth: 375, windowHeight: 667, pixelRatio: 2 }),
  createCanvas: () => ({ width: 750, height: 1334, getContext: () => null }),
  getStorageSync: () => null,
  setStorageSync() {},
  onTouchStart(handler) { handlers.start = handler; },
  onTouchMove(handler) { handlers.move = handler; },
  onTouchEnd(handler) { handlers.end = handler; },
  onTouchCancel(handler) { handlers.cancel = handler; },
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const { Game, usesHarmonyPhysicalTouches } = require('../js/game');
const { createCharacter } = require('../js/storage');

const game = new Game();
game.stopLoop();
game.state = createCharacter(null, '鸿蒙射箭触摸');
game.screen = 'home';
game.render = game.requestRender = () => {};

assert.equal(usesHarmonyPhysicalTouches({ platform: 'ohos' }), true);
assert.equal(game.usesHarmonyPhysicalTouches(), true);

function almost(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 0.6, `${label}: ${actual} != ${expected}`);
}

// The old overflow heuristic missed this HarmonyOS case: both physical axes
// sit inside the logical window, so buttons appeared shifted.
const insideLogical = game.touchPoint({ clientX: 360, clientY: 660 });
almost(insideLogical.x, 180, 'ohos client-only (360,660) x');
almost(insideLogical.y, 330, 'ohos client-only (360,660) y');

const sameFields = game.touchPoint({ x: 360, y: 660, clientX: 360, clientY: 660 });
almost(sameFields.x, 180, 'ohos x===clientX physical x');
almost(sameFields.y, 330, 'ohos x===clientX physical y');

const footerPhysical = game.touchPoint({ clientX: 360, clientY: 1240 });
almost(footerPhysical.x, 180, 'ohos footer x');
almost(footerPhysical.y, 620, 'ohos footer y');

// Logical footer taps must stay logical. Always dividing by dpr makes
// 关闭/去招募 miss and freezes metric pages on some HarmonyOS builds.
game.hitAreas = [
  { x: 30, y: 600, w: 315, h: 42, hud: true, map: false, onTap() {} }
];
game.touchCoordinateSpace = '';
const logicalFooter = game.touchPoint({ clientX: 180, clientY: 620 });
almost(logicalFooter.x, 180, 'ohos logical footer x must not be halved');
almost(logicalFooter.y, 620, 'ohos logical footer y must not be halved');

const archeryKinds = [
  { kind: 'chapterSpecialTask', explorationMode: 'archery', def: { mode: 'archery' } },
  { kind: 'materialExploration', explorationMode: 'archery' },
  { kind: 'neighborEventDice' },
  { kind: 'visitorIncidentDice' },
  { kind: 'harshNatureDice' },
  { kind: 'rareAuctionDice' }
];

for (const spec of archeryKinds) {
  const fired = { count: 0 };
  game.touchCoordinateSpace = '';
  game.infoDetailModal = Object.assign({ phase: 'ready' }, spec);
  assert.equal(game.isArcheryInputModal(game.infoDetailModal), true, `${spec.kind} must be archery input`);
  game.hitAreas = [
    // Legacy / 物资探索 used to mark the fullscreen dim as HUD. Dragging the
    // target must not activate it even when the flag is still set.
    { x: 0, y: 0, w: 375, h: 667, hud: true, map: false, onTap: () => { game.infoDetailModal = null; } },
    { x: 30, y: 600, w: 315, h: 42, hud: true, map: false, onTap: () => { fired.count += 1; } }
  ];
  assert.equal(game.isFullScreenBackdropHit(game.hitAreas[0]), true, `${spec.kind} backdrop is fullscreen`);

  handlers.start({ changedTouches: [{ clientX: 360, clientY: 660 }] });
  handlers.move({ changedTouches: [{ clientX: 440, clientY: 700 }] });
  handlers.end({ touches: [], changedTouches: [{ clientX: 440, clientY: 700 }] });
  assert(game.infoDetailModal, `${spec.kind}: physical target drag must keep the modal open`);
  assert.equal(fired.count, 0, `${spec.kind}: target drag must not fire`);

  handlers.start({ changedTouches: [{ clientX: 360, clientY: 1240 }] });
  handlers.end({ touches: [], changedTouches: [{ clientX: 360, clientY: 1240 }] });
  assert.equal(fired.count, 1, `${spec.kind}: footer fire tap should execute once`);
}

for (const spec of [{ kind: 'collectionDice' }, { kind: 'strategicDice' }]) {
  game.infoDetailModal = Object.assign({ phase: 'ready' }, spec);
  assert.equal(game.isArcheryInputModal(game.infoDetailModal), false, `${spec.kind} must stay dice input`);
  assert.equal(game.isScoreInputModal(game.infoDetailModal), true, `${spec.kind} must share score confirmation`);
}

// After a shot resolves, the footer becomes a single “确认得分”. It must
// still execute on touchend, while a target tap or drag stays inert. This is
// the regression seen on Vivo/Android and non-pure HarmonyOS devices: the
// result showed correctly but the next entry started again at 0 because the
// confirmation touch was swallowed.
{
  let confirmed = 0;
  game.touchCoordinateSpace = '';
  game.infoDetailModal = {
    kind: 'materialExploration', explorationMode: 'archery', phase: 'resolved',
    targetId: 'fieldKit', resultScore: 3, displayRoll: 3,
    action: () => { confirmed += 1; }
  };
  game.hitAreas = [
    { x: 0, y: 0, w: 375, h: 667, hud: true, map: false, onTap() {} },
    { x: 30, y: 600, w: 150, h: 42, hud: true, map: false, onTap: () => { confirmed += 1; } },
    { x: 195, y: 600, w: 150, h: 42, hud: true, map: false, onTap() {} }
  ];
  handlers.start({ changedTouches: [{ clientX: 90, clientY: 620 }] });
  handlers.end({ touches: [], changedTouches: [{ clientX: 90, clientY: 620 }] });
  assert.equal(confirmed, 1, 'resolved archery confirmation must execute on touchend');
  assert(game.infoDetailModal, 'test confirmation callback must not be replaced by backdrop handling');
  // Android/Harmony can deliver pointerup and wx touchend for the same press.
  // Both must be absorbed by the same short-lived guard.
  game.markImmediateTapGuard({ x: 90, y: 620 });
  assert.equal(game.consumeImmediateTapGuard({ x: 90, y: 620 }), true, 'first duplicate release must be absorbed');
  assert.equal(game.consumeImmediateTapGuard({ x: 90, y: 620 }), true, 'second duplicate release must be absorbed');
  game.immediateTapGuardUntil = Date.now() - 1;
  assert.equal(game.consumeImmediateTapGuard({ x: 90, y: 620 }), false, 'guard must expire for a later tap');
  // Some Android/HarmonyOS builds deliver only touchend/changedTouches after
  // the canvas overlay is rebuilt. The resolved confirmation must still work
  // without a preceding gesture.
  game.immediateTapGuardUntil = Date.now() - 1;
  game.immediateTapGuardPoint = null;
  game.gesture = null;
  game.touchCoordinateSpace = '';
  handlers.end({ touches: [], changedTouches: [{ clientX: 90, clientY: 620 }] });
  assert.equal(confirmed, 2, 'resolved confirmation must also work without touchstart');
}

// If a platform pauses timers while the arrow is in flight, the next tick can
// invoke the stored completion callback instead of leaving a stuck arrow.
let recovered = 0;
game.infoDetailModal = {
  kind: 'chapterSpecialTask', explorationMode: 'archery', phase: 'rolling',
  def: { mode: 'archery' }, archeryFlightStartedAt: Date.now() - 3000,
  archeryFlightDone: () => { recovered += 1; }
};
assert.equal(game.recoverStuckDiceOrArchery(Date.now()), true);
assert.equal(recovered, 1, 'stalled archery flight must recover and finish once');

handlers.cancel({});
assert.equal(game.gesture, null, 'touchcancel must drop the archery gesture');

console.log('harmony archery touch check ok: in-range physical coords convert, HUD backdrop drag stays, all archery kinds footer-only, stalled flight recovers');
