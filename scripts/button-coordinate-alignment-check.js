'use strict';

const assert = require('node:assert/strict');
const { Game } = require('../js/game');

const menuGame = Object.create(Game.prototype);
menuGame.info = { windowWidth: 360, windowHeight: 780, pixelRatio: 2, platform: 'ohos' };
menuGame.dpr = 2;
menuGame.runtime = {
  getMenuButtonBoundingClientRect() {
    return { left: 600, right: 720, top: 20, bottom: 80, width: 120, height: 60 };
  }
};
const menuRect = Game.prototype.resolveMenuButtonRect.call(menuGame);
assert.equal(menuRect.left, 300, 'physical menu rect must normalize to logical x');
assert.equal(menuRect.right, 360, 'physical menu rect must normalize to logical right edge');
assert.equal(menuRect.width, 60, 'physical menu rect width must normalize');

const game = Object.create(Game.prototype);
game.info = { windowWidth: 375, windowHeight: 667, pixelRatio: 2, platform: 'ohos' };
game.width = 375;
game.height = 667;
game.canvas = { width: 750, height: 1334 };
game.touchCoordinateSpace = '';
game.blockingOverlayOpen = () => false;
game.lifeMemoryTimelineTouchPoint = () => null;
// Two projections hit HUD, but the physical projection hits the precise
// button while the logical projection hits only a broad catch-all.
game.hitAreas = [
  { x: 160, y: 315, w: 40, h: 30, hud: true, map: false },
  { x: 300, y: 640, w: 75, h: 27, hud: true, map: false }
];
const physical = Game.prototype.touchPoint.call(game, { clientX: 360, clientY: 660 });
assert.equal(game.touchCoordinateSpace, 'physical');
assert.equal(physical.x, 180, 'precise physical HUD x should win');
assert.equal(physical.y, 330, 'precise physical HUD y should win');
// The adapter can change the fields between start/move/end; the gesture keeps
// the chosen space so its hit position cannot jump to a neighbouring button.
const stable = Game.prototype.touchPoint.call(game, { clientX: 180, clientY: 330 });
assert.equal(stable.x, 90, 'physical coordinate space must stay locked across gesture');
assert.equal(stable.y, 165, 'physical coordinate space must stay locked across gesture');

// Harmony/Android releases can land a few logical pixels beside a compact
// button. The visual layout stays unchanged, but the touch-only cushion must
// keep the control reachable without expanding map scenery hit areas.
const compact = game.hitAreas[0];
assert.equal(Game.prototype.hitAreaAt.call(game, compact.x - 7, compact.y + compact.h / 2), compact,
  'Harmony compact HUD button should accept a near-edge touch');
const mapHit = { x: 90, y: 180, w: 120, h: 48, hud: false, map: true, onTap() {} };
game.hitAreas = [mapHit];
assert.equal(Game.prototype.hitAreaAt.call(game, mapHit.x - 1, mapHit.y + mapHit.h / 2), null,
  'map scenery hit areas must not receive the control cushion');

console.log('button coordinate alignment check ok: menu rect, precise HUD projection, gesture space lock');
