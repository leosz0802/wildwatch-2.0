const assert = require('node:assert/strict');
const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');
const { nextRescueTask } = require('../js/chapterRescueSystem');

function makeGame() {
  const game = Object.create(Game.prototype);
  game.state = createCharacter(null, '任务锁恢复回归');
  game.screen = 'home';
  game.render = game.toast = () => {};
  game.reserveDynamicTargets = () => ({});
  game.openNextSandboxEvent = game.openQueuedMissionPush = () => false;
  game.setScreen = screen => { game.screen = screen; return true; };
  return game;
}
function startEcologyDaily(game) {
  game.state.world.reserve.progression.stage = 2;
  game.state.world.goals = require('../js/goalSystem').normalizeGoalState(game.state.world.goals, game.state);
  const daily = game.state.world.goals.daily;
  daily.objectives.filter(item => item.id !== 'daily_ecology').forEach(item => { item.complete = true; item.progress = item.target; });
  game.focusCollectionAnimal = animal => { game.focusedAnimal = animal; return true; };
  game.executeGoalAction = goal => {
    game.activeTaskLock = { id: goal.id || `daily:${daily.dateKey}:daily_ecology`, kind: 'daily', goal };
    return true;
  };
  assert(game.openDailyEvents());
  assert(game.executeDailyEvent('daily_ecology', daily.dateKey));
  assert.equal(game.activeTaskLock.id, `daily:${daily.dateKey}:daily_ecology`);
  return game.state.world.goals.daily.objectives.find(item => item.id === 'daily_ecology');
}

// Channel-only story tasks complete when the requested channel opens. They
// have no result card to close, so a stale lock must not survive the route.
for (const channel of ['viewSurvival', 'viewDiscovery']) {
  const game = makeGame();
  game.prepareLocalAssetsForScreen = () => {};
  game.state.world.goals.active.primary = {
    id: `channel:${channel}`,
    kind: 'story',
    title: channel === 'viewSurvival' ? '进入生存频道' : '进入发现频道',
    recommendedAction: channel,
    targetScreen: channel === 'viewSurvival' ? 'survival' : 'animalworld',
    executable: true,
    complete: false,
    progress: 0,
    target: 1
  };
  game.activeTaskLock = { id: `channel:${channel}`, kind: 'story', startedAt: Date.now() };
  assert(game.openGuidedChannel(channel));
  assert.equal(game.screen, channel === 'viewSurvival' ? 'survival' : 'animalworld');
  assert.equal(game.activeTaskLock, null, `${channel} should release its lock after entry`);
}

// Daily tasks must recruit visitors or repair water/grass; they must not
// force the Survival channel.
{
  const game = makeGame();
  game.state.world.reserve.progression.stage = 2;
  game.state.world.goals = require('../js/goalSystem').normalizeGoalState(game.state.world.goals, game.state);
  game.prepareLocalAssetsForScreen = () => {};
  const dateKey = game.state.world.goals.daily.dateKey;
  game.openVisitorRecruitment = () => { game.infoDetailModal = { kind: 'visitorRecruitment' }; return true; };
  assert(game.executeDailyEvent('daily_visitor', dateKey));
  assert.notEqual(game.screen, 'survival', 'visitor daily must not open Survival');
  assert.equal(game.infoDetailModal.kind, 'visitorRecruitment');
  game.state.world.goals.daily.objectives[0].complete = true;
  game.state.world.goals.daily.objectives[0].progress = 1;
  game.infoDetailModal = null;
  game.activeTaskLock = null;
  assert(game.executeDailyEvent('daily_ecology', dateKey));
  assert.notEqual(game.screen, 'survival', 'water/grass daily must not open Survival');
}

// Real goal dispatch creates the lock. X must work both before settlement and
// on the result page; the old test covered only the separate confirm button.
for (const phase of ['approach', 'result']) {
  const game = makeGame();
  const objective = startEcologyDaily(game);
  if (phase === 'result') { objective.complete = true; objective.progress = objective.target; }
  game.infoDetailModal = { kind: 'animalComfort', phase };
  const before = JSON.stringify(game.state.world.reserve);
  game.dismissInfoDetailModal();
  assert.equal(game.activeTaskLock, null, `X must release ${phase} ownership`);
  assert.equal(game.infoDetailModal, null);
  assert.equal(JSON.stringify(game.state.world.reserve), before, 'close must not settle or rescue again');
  assert(game.openDailyEvents());
  assert.equal(game.infoDetailModal.activeDailyId, phase === 'result' ? null : 'daily_ecology');
}

// Unfinished water/grass daily: reopening the list must not auto-run, and
// explicit continue must stay on habitat instead of Survival.
{
  const game = makeGame();
  const objective = startEcologyDaily(game);
  const firstLock = game.activeTaskLock;
  assert(game.openDailyEvents());
  assert.equal(game.activeTaskLock.id, firstLock.id);
  assert.equal(objective.complete, false);
  assert.equal(game.infoDetailModal.kind, 'dailyEvents', 'opening checklist must not auto-run the unfinished task');
  assert.notEqual(game.screen, 'survival');
  assert(game.executeDailyEvent('daily_ecology', game.infoDetailModal.checklist.dateKey));
  assert.notEqual(game.screen, 'survival', 'explicit continue must keep water/grass on habitat, not Survival');
}

// Reproduce the video: the third daily is done but its lock survived, and the
// player taps the actual current-goal card on the bare sandbox.
{
  const game = makeGame();
  const objective = startEcologyDaily(game);
  objective.complete = true; objective.progress = objective.target;
  game.sandboxGoalBarData = () => ({ chapter: 1, chapterTitle: '任务', title: '下一任务', progressText: '进行中', action: '继续', goal: { id: 'next', recommendedAction: 'visitorAdjust' } });
  game.sandboxLedMode = () => false;
  game.roundRect = game.text = () => {};
  game.truncateTextToWidth = (_ctx, text) => text;
  let hits = [];
  game.addHit = (_x, _y, _w, _h, tap) => hits.push(tap);
  let dispatched = 0;
  const execute = game.executeGoalAction.bind(game);
  game.executeGoalAction = goal => {
    if (goal.id !== 'next') return execute(goal);
    assert.equal(game.activeTaskLock, null);
    dispatched += 1;
    return true;
  };
  game.drawSandboxGoalBar({ measureText: text => ({ width: text.length * 7 }) }, { x: 0, y: 100, w: 375, h: 640 });
  assert(hits.length);
  hits[0]();
  assert.equal(dispatched, 1, 'stale third-task lock must not block the live goal card');
}

// The recovery route must not steal ownership from an actual modal/settlement.
{
  const game = makeGame();
  const reserve = game.state.world.reserve;
  const rescue = nextRescueTask(reserve, 1);
  game.activeTaskLock = { id: `rescue:${rescue.targetId}`, kind: 'chapterRescue', animalId: rescue.speciesId, targetId: rescue.targetId };
  const before = JSON.stringify(reserve.inventory);
  assert(game.openDailyEvents());
  assert.equal(game.infoDetailModal.kind, 'dailyEvents', 'opening daily list must not jump into a pending rescue');
  game.infoDetailModal = null;
  assert(game.resumeActiveTask());
  assert.equal(game.infoDetailModal.kind, 'materialExploration');
  assert.equal(game.infoDetailModal.explorationMode, 'archery');
  assert.equal(game.activeTaskLock.targetId, rescue.targetId);
  assert.equal(JSON.stringify(reserve.inventory), before, 'resuming must not consume rescue materials');
  game.dismissInfoDetailModal();
  assert.equal(game.activeTaskLock, null);
  assert(game.openDailyEvents(), 'postponed rescue must leave other daily tasks accessible');
  assert.equal(game.infoDetailModal.kind, 'dailyEvents');
  assert.notEqual(rescue.status, 'rescued', 'postponing must not bypass the chapter rescue gate');
}

// The recovery route must not steal ownership from an actual modal/settlement.
for (const surface of ['infoDetailModal', 'patrolTaskModal', 'settlementModal', 'chapterStoryModal']) {
  const game = makeGame();
  const lock = game.activeTaskLock = { id: 'active', kind: 'goal' };
  game[surface] = { kind: 'in-progress' };
  game.executeGoalAction({ id: 'other', recommendedAction: 'visitorAdjust' });
  assert.equal(game.activeTaskLock, lock);
  assert.equal(game[surface].kind, 'in-progress');
}

// Nested details return to their task without releasing its lock.
{
  const game = makeGame();
  const lock = game.activeTaskLock = { id: 'active', kind: 'goal' };
  const parent = { kind: 'animalComfort', phase: 'approach' };
  game.infoDetailModal = { kind: 'infoListItemDetail', returnInfoDetailModal: parent };
  game.dismissInfoDetailModal();
  assert.equal(game.infoDetailModal, parent);
  assert.equal(game.activeTaskLock, lock);
}

// Building a facility cannot deadlock collection: shortage routes to Survival
// and the construction lock must still allow material exploration.
{
  const game = makeGame();
  game.prepareLocalAssetsForScreen = () => {};
  game.activeTaskLock = {
    id: 'development:river_shallows:build',
    kind: 'long',
    goal: { recommendedAction: 'facilityBuild', nodeId: 'river_shallows', developmentTask: 'build' },
    startedAt: Date.now()
  };
  game.infoDetailModal = { kind: 'livingReserveChoiceConfirm', choice: { id: 'reed_refuge' } };
  game.routeReserveDevelopmentResources({ missing: ['芦苇纤维束×1', '松果湿度标×1'] });
  assert.equal(game.screen, 'survival', 'reed refuge shortage must send the player to Survival');
  assert.equal(game.infoDetailModal, null);
  assert.equal(game.survivalMaterialLevel, 1, 'shortage must open the missing material table, not the explore hero');
  assert.equal(game.survivalFocusMaterialId, 'reed_cord');
  assert.equal(Number(game.survivalExploreFocusUntil || 0), 0, 'shortage must not pulse the large Survival explore box');
  assert(game.activeTaskLock.allowMaterialGathering, 'shortage routing must mark gathering as part of the same build task');
  assert.equal(game.openMaterialExploration('reed_cord'), true, 'Survival exploration must not be blocked by the build lock');
  assert.equal(game.infoDetailModal.kind, 'materialExploration');
  assert.equal(game.activeTaskLock.goal.recommendedAction, 'facilityBuild', 'player must still be able to return to the facility after collecting');
}

console.log('task lock recovery check ok (X close, unfinished resume, completed stale lock, real goal-card hit, single-task ownership, nested return, facility material gathering)');
