'use strict';
const assert = require('node:assert/strict');
const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');
const { normalizeGoalState, resolveGoals, applyGoalProgress } = require('../js/goalSystem');
const { criticalPatrolRisk, PATROL_ACTIONS } = require('../js/patrolTriggerPolicy');
const { buildReserveView } = require('../js/reserveView');

const clone = value => JSON.parse(JSON.stringify(value));
function fixture(stage = 1, history = []) {
  const state = createCharacter(null, '巡护入口回归');
  const reserve = state.world.reserve;
  Object.assign(reserve, {
    fund: 12000, safety: 80, poacherPressure: 20,
    ecology: Object.assign({}, reserve.ecology, { water: 75, grass: 75, disease: 8 }),
    actionHistory: history.map(action => ({ action })),
    emergency: { active: null }, eventChain: { step: 7, length: 7, completed: true }
  });
  Object.assign(reserve.progression, { stage, objectives: [
    { id: 'chapterStory', current: 7, target: 7, complete: true },
    { id: 'score', label: '生态', current: 65, target: 85, complete: false }
  ] });
  reserve.supplies = { dogFood: 12, alarm: 6, fieldKit: 5, medicalKit: 5, tranquilizer: 8 };
  state.world.collection.discovery.active = null;
  state.world.goals = normalizeGoalState(state.world.goals, state);
  return state;
}
function gameFor(state) {
  const game = Object.create(Game.prototype);
  game.state = state; game.screen = 'home'; game.activeTaskLock = null;
  game.render = game.toast = () => {};
  game.setScreen = screen => { game.screen = screen; };
  return game;
}

let stableCases = 0;
for (let stage = 1; stage <= 20; stage++) {
  for (const history of [[], ...PATROL_ACTIONS.map(action => [action, action])]) {
    for (const metric of ['score', 'population', 'migratedIn']) {
      const state = fixture(stage, history);
      state.world.reserve.progression.objectives[1].id = metric;
      const goals = resolveGoals(state, state.world.goals);
      const guard = goals.daily.objectives.find(item => item.kind === 'guard');
      assert.equal(guard.recommendedAction, 'exploreMaterials', `chapter ${stage}: ${history} manufactured a patrol`);
      assert(!/巡护|驱赶|干预/.test(guard.description), 'daily text must match exploration');
      const candidates = [goals.active.primary, ...goals.active.alternatives].filter(Boolean);
      assert(candidates.every(item => !PATROL_ACTIONS.includes(item.recommendedAction)), `chapter ${stage}: ${metric} generated a patrol`);
      assert.equal(gameFor(state).recommendedPatrolAction(state.world.reserve), '');
      stableCases++;
    }
  }
}

for (const [field, threshold, direction, action] of [
  ['water', 35, 'low', 'habitat'], ['grass', 35, 'low', 'habitat'],
  ['disease', 45, 'high', 'intervention'], ['poacherPressure', 65, 'high', 'antiPoacher'],
  ['safety', 30, 'low', 'houndScout']
]) {
  for (let stage = 1; stage <= 20; stage++) {
    const state = fixture(stage); const reserve = state.world.reserve;
    const object = ['water', 'grass', 'disease'].includes(field) ? reserve.ecology : reserve;
    object[field] = threshold + (direction === 'low' ? .1 : -.1);
    assert.equal(criticalPatrolRisk(reserve), null, `${field}: warning is not a critical task`);
    object[field] = threshold;
    assert.equal(criticalPatrolRisk(reserve).action, action);
    assert.equal(resolveGoals(state, state.world.goals).daily.objectives[0].recommendedAction, action);
    assert.equal(gameFor(state).recommendedPatrolAction(reserve), action);
    object[field] = direction === 'low' ? 75 : 8;
    assert.equal(resolveGoals(state, state.world.goals).daily.objectives[0].recommendedAction, 'exploreMaterials', 'resolved risk must not repeat');
  }
}
assert.equal(criticalPatrolRisk({ ecology: { water: null, grass: 'bad', disease: NaN } }), null);

for (const action of PATROL_ACTIONS) {
  const state = fixture(); const reserve = state.world.reserve;
  reserve.emergency.active = { id: `test:${action}`, recommendedAction: action, daysRemaining: 2 };
  assert.equal(gameFor(state).recommendedPatrolAction(reserve), action, 'real event must remain available');
  reserve.emergency.active = null;
  state.world.goals.active.primary = { recommendedAction: action, storyAligned: true };
  assert.equal(gameFor(state).recommendedPatrolAction(reserve), action, 'explicit story must remain available');
  state.world.goals.active.primary = { recommendedAction: action, kind: 'daily' };
  assert.equal(gameFor(state).recommendedPatrolAction(reserve), '', 'stale daily recommendation must not manufacture patrol');
  const game = gameFor(state);
  const before = JSON.stringify(reserve);
  assert(game.openPatrolOperationScreen(action), 'explicit player choice must remain available');
  assert.equal(game.patrolTaskModal.id, action);
  game.activeTaskLock = { id: `manual:${action}` };
  game.closePatrolOperationScreen();
  assert.equal(game.activeTaskLock, null, 'closing patrol must release lock');
  assert.equal(JSON.stringify(reserve), before, 'closing must not consume resources or settle');
  assert(game.openPatrolOperationScreen(action), 'player can reopen cancelled patrol');
}

const idle = gameFor(fixture());
assert.equal(idle.openPatrolOperationScreen(), false, 'generic entry must not pick the first patrol');
assert.equal(idle.openPatrolOperationScreen('retired-action'), false, 'invalid action must not become a hound patrol');
assert(!idle.patrolTaskModal);

// Routine changes and successful recovery must not turn their result markers
// into another patrol. Preserve the resource feedback and readable details.
for (const recovery of [false, true]) {
  const state = fixture(); const reserve = state.world.reserve;
  reserve.social = {}; reserve.migration = { delta: 0 };
  const before = clone(reserve);
  reserve.safety += recovery ? 6 : -4;
  reserve.ecology.water += recovery ? 4 : -4;
  reserve.ecology.grass += recovery ? 4 : -4;
  const view = buildReserveView(before, reserve, { day: 10, action: 'houndScout' });
  const markers = view.mapMarkers.filter(marker => /^rv_.*(?:safety|water|grass|ecology)/.test(marker.id));
  assert(markers.length, 'resource feedback should remain visible');
  const game = gameFor(state);
  for (const marker of markers) {
    assert.equal(marker.readOnly, true, 'ordinary resource notice must not offer a patrol');
    const detail = game.buildWatchClueDetail({ source: 'marker', marker, view });
    assert(detail.readOnly && !detail.action && !detail.choices, 'read-only notice must have no execution button');
  }
  const cached = { id: 'rv_9_recovery_safety_0', type: 'recovery', recommendAction: 'houndScout' };
  assert(game.isPassivePatrolMarker(cached), 'old cached recovery notice must not restore patrol');
}

for (const oldAction of PATROL_ACTIONS) {
  const game = gameFor(fixture());
  const daily = game.state.world.goals.daily;
  daily.objectives[0].recommendedAction = oldAction;
  daily.schemaVersion = 2;
  daily.required = 4;
  daily.objectives.push({ id: 'daily_visitor', kind: 'visitor', target: 1, progress: 0 });
  game.activeTaskLock = { id: `daily:${daily.dateKey}:daily_guard`, kind: 'daily', goal: { recommendedAction: oldAction } };
  let opened = 0;
  game.openMaterialExploration = () => { opened++; game.infoDetailModal = { kind: 'materialExploration' }; return true; };
  const beforeActions = game.state.world.reserve.progression.totalActions;
  assert(game.openDailyEvents());
  assert.equal(game.infoDetailModal.kind, 'dailyEvents', 'daily entry must display checklist, not resume patrol');
  assert.equal(game.infoDetailModal.checklist.total, 3, 'old four-item saves must migrate on the entry click');
  assert.equal(opened, 0);
  assert(game.executeDailyEvent('daily_guard', daily.dateKey));
  assert.equal(opened, 1, 'explicit daily action must open exploration');
  assert.equal(game.patrolTaskModal, undefined);
  assert.equal(game.executeDailyEvent('daily_guard', daily.dateKey), false, 'stale double tap must not reopen a task');
  assert.equal(opened, 1);
  assert.equal(game.state.world.reserve.progression.totalActions, beforeActions, 'opening is not completion');
}

for (let stage = 1; stage <= 20; stage++) {
  let state = fixture(stage);
  for (const action of ['exploreMaterials', 'exploreMaterials', 'buySupplies', 'animalCare']) {
    // Simulate reload between every completion; no patrol is needed to clear the daily list.
    state = clone(state);
    state.world.goals = normalizeGoalState(state.world.goals, state);
    state = applyGoalProgress(clone(state), state, { action }).state;
  }
  assert.equal(state.world.goals.daily.objectives.length, 3);
  assert(state.world.goals.daily.objectives.every(item => item.complete), `chapter ${stage}: daily stuck without patrol`);
  assert(state.world.goals.daily.fullClaimed);
  const balance = state.world.reserve.fund;
  for (let reopen = 0; reopen < 5; reopen++) state.world.goals = normalizeGoalState(clone(state.world.goals), state);
  assert.equal(state.world.reserve.fund, balance, 'reopen must not duplicate rewards');
}

console.log(`patrol trigger policy check ok (${stableCases} stable chapter/history/milestone cases; 100 threshold cases; four explicit patrols; legacy daily resume; 20 daily completions without patrol)`);
