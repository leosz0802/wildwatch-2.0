'use strict';

const assert = require('node:assert/strict');
const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');
const { normalizeChapterRescue, findRecord } = require('../js/chapterRescueSystem');

const storage = new Map();
global.wx = {
  getStorageSync: key => storage.has(key) ? JSON.parse(JSON.stringify(storage.get(key))) : null,
  setStorageSync: (key, value) => storage.set(key, JSON.parse(JSON.stringify(value)))
};

function makeGame() {
  const game = Object.create(Game.prototype);
  game.state = createCharacter(null, '解救与每日入口回归');
  const reserve = game.state.world.reserve;
  Object.assign(reserve.progression, { stage: 2, displayChapter: 2 });
  normalizeChapterRescue(reserve, 2, { fresh: true });
  game.state.ui.opportunityTurn = 'daily'; // legacy save value; rescue must still win.
  game.width = 375;
  game.height = 667;
  game.screen = 'home';
  game.scrollY = 0;
  game.hitAreas = [];
  game.mapViewport = { x: 0, y: 0, w: 375, h: 667 };
  game.animT = () => 0;
  game.roundRect = () => {};
  game.drawSmallGlyph = () => {};
  game.text = () => {};
  game.truncateTextToWidth = (_ctx, value) => String(value);
  game.ctx = { measureText: () => ({ width: 1 }) };
  game.renderedSandboxInfoDock = { y: 0, h: 100 };
  game.openChapterRescueTask = id => { game.opened = `rescue:${id}`; return true; };
  game.openDailyEvents = () => { game.opened = 'daily'; return true; };
  game.shouldAbsorbArcheryFollowup = () => false;
  game.tryEnterPlayableGame = () => false;
  game.eventBalloonHitAt = () => null;
  game.isInsideMapViewport = () => false;
  game.activateHitArea = item => { if (item && item.onTap) item.onTap(); };
  game.modalHitFloorIndex = () => 0;
  game.isLockedBottomNavHit = () => false;
  return game;
}

const camera = { x: 0, y: 0, w: 375, h: 667 };
const plan = { hidden: [] };
const game = makeGame();

// A stale daily-entry flag must not hide a pending captive. The main label and
// metadata must point to rescue, while a separate daily side entry remains.
game.drawSandboxOpportunityAggregate(game.ctx, camera, plan);
const aggregate = game.renderedMapOpportunityAggregate;
assert.equal(aggregate.opportunityMode, 'rescue');
assert.equal(aggregate.mode, 'rescue');
assert.match(aggregate.label, /^解救野猪/);
assert.equal(aggregate.dailyShortcut, true, 'pending daily task must retain a separate side entry');
assert.equal(aggregate.w, 210);
assert.equal(game.hitAreas.length, 2, 'rescue and daily must have separate hit regions');

// A system push arriving on the same home frame must defer instead of opening
// the daily card over the visible captive.
game.onboardingProgress = () => ({ active: false });
game.popupFlowQuiet = () => false;
game.settlementOccupiesFlow = () => false;
game.currentGoalView = () => ({ primary: { kind: 'daily', id: 'daily_visitor' } });
game.missionPushKey = () => 'rescue-daily-regression';
game.openGoalCenter = () => { game.opened = 'goal'; return true; };
game.opened = null;
assert.equal(game.maybeOpenMissionPush('home'), false, 'visible rescue must defer automatic daily popup');
assert.equal(game.opened, null);

// The main half opens rescue even when the old save says daily.
game.opened = null;
game.handleTap(aggregate.x + 20, aggregate.y + 15);
assert.equal(game.opened, 'rescue:chapter:2:rescue:1');

// The small side affordance opens the daily checklist without changing the
// rescue priority for the next map frame.
game.opened = null;
game.handleTap(aggregate.x + aggregate.w - 8, aggregate.y + 15);
assert.equal(game.opened, 'daily');
game.hitAreas = [];
game.drawSandboxOpportunityAggregate(game.ctx, camera, plan);
assert.equal(game.renderedMapOpportunityAggregate.opportunityMode, 'rescue');

// A captive marker overlapping a HUD aggregate must win hit testing. This is
// the reported intermittent failure after camera movement/first-frame layout.
game.hitAreas = [];
let winner = null;
game.addRescueMapRectHit(90, 90, 100, 80, () => { winner = 'rescue'; });
game.addHit(60, 60, 180, 120, () => { winner = 'daily'; }, 'tap', 'hud');
const hit = game.hitAreaAt(120, 120);
assert(hit && hit.rescue, 'rescue marker must outrank an overlapping HUD task button');
game.activateHitArea(hit);
assert.equal(winner, 'rescue');

// Once the captive is settled, the same pending daily checklist becomes the
// primary task entry and remains clickable.
const target = game.state.world.reserve.chapterRescue.targets[0];
target.status = 'rescued';
target.rescuedAt = Date.now();
game.state.ui.opportunityTurn = 'daily';
game.hitAreas = [];
game.currentDailyMatchesGoal = () => false;
game.drawSandboxOpportunityAggregate(game.ctx, camera, plan);
const daily = game.renderedMapOpportunityAggregate;
assert.equal(daily.opportunityMode, 'daily');
assert.equal(daily.mode, 'dailyEvents');
assert.match(daily.label, /^每日事件/);
game.opened = null;
game.handleTap(daily.x + 12, daily.y + 15);
assert.equal(game.opened, 'daily');

delete global.wx;
console.log('rescue/daily entry regression ok: rescue priority, separate daily access, overlap hit order, post-rescue daily routing');
