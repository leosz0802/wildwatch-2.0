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
function startAnimalDaily(game) {
  const daily = game.state.world.goals.daily;
  daily.objectives.slice(0, 2).forEach(item => { item.complete = true; item.progress = item.target; });
  game.focusCollectionAnimal = animal => { game.focusedAnimal = animal; return true; };
  assert(game.openDailyEvents());
  assert(game.executeDailyEvent('daily_animal', daily.dateKey));
  assert.equal(game.activeTaskLock.id, `daily:${daily.dateKey}:daily_animal`);
  return game.state.world.goals.daily.objectives.find(item => item.id === 'daily_animal');
}

// Real goal dispatch creates the lock. X must work both before settlement and
// on the result page; the old test covered only the separate confirm button.
for (const phase of ['approach', 'result']) {
  const game = makeGame();
  const objective = startAnimalDaily(game);
  if (phase === 'result') { objective.complete = true; objective.progress = objective.target; }
  game.infoDetailModal = { kind: 'animalComfort', phase };
  const before = JSON.stringify(game.state.world.reserve);
  game.dismissInfoDetailModal();
  assert.equal(game.activeTaskLock, null, `X must release ${phase} ownership`);
  assert.equal(game.infoDetailModal, null);
  assert.equal(JSON.stringify(game.state.world.reserve), before, 'close must not settle or rescue again');
  assert(game.openDailyEvents());
  assert.equal(game.infoDetailModal.activeDailyId, phase === 'result' ? null : 'daily_animal');
}

// A map-based task can have no modal while waiting for its animal click.
// Re-enter its route instead of either deadlocking or starting a second task.
{
  const game = makeGame();
  const objective = startAnimalDaily(game);
  const firstLock = game.activeTaskLock;
  assert(game.openDailyEvents());
  assert.equal(game.activeTaskLock.id, firstLock.id);
  assert.equal(objective.complete, false);
  assert(game.focusedAnimal);
  assert.equal(game.infoDetailModal.kind, 'dailyEvents', 'opening checklist must not auto-run the unfinished task');
  assert(game.executeDailyEvent('daily_animal', game.infoDetailModal.checklist.dateKey));
  assert(!game.infoDetailModal, 'explicit continue must preserve the animal map route');
}

// Reproduce the video: the third daily is done but its lock survived, and the
// player taps the actual current-goal card on the bare sandbox.
{
  const game = makeGame();
  const objective = startAnimalDaily(game);
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
  assert.equal(game.infoDetailModal.kind, 'chapterRescueTask');
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
console.log('task lock recovery check ok (X close, unfinished resume, completed stale lock, real goal-card hit, single-task ownership, nested return)');
