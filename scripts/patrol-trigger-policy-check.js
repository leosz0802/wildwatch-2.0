'use strict';
const assert = require('node:assert/strict');
const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');
const { normalizeGoalState, resolveGoals, applyGoalProgress } = require('../js/goalSystem');
const { criticalPatrolRisk, PATROL_ACTIONS } = require('../js/patrolTriggerPolicy');
const { buildReserveView } = require('../js/reserveView');
const { CHAPTERS } = require('../js/animalWorld');

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
for (let stage = 1; stage <= CHAPTERS.length; stage++) {
  for (const history of [[], ...PATROL_ACTIONS.map(action => [action, action])]) {
    for (const metric of ['score', 'population', 'migratedIn']) {
      const state = fixture(stage, history);
      state.world.reserve.progression.objectives[1].id = metric;
      const goals = resolveGoals(state, state.world.goals);
      state.world.goals = goals;
      assert.equal(goals.daily.objectives.length, 0, `chapter ${stage}: daily tasks stay removed`);
      const candidates = [goals.active.primary, ...goals.active.alternatives].filter(Boolean);
      assert(candidates.every(item => item.themeTask || !PATROL_ACTIONS.includes(item.recommendedAction) || /^metric:animals:/.test(item.id || '')), `chapter ${stage}: ${metric} generated a patrol outside the chapter theme`);
      const recommended = gameFor(state).recommendedPatrolAction(state.world.reserve);
      const themeActions = candidates.filter(item => item.themeTask).map(item => item.recommendedAction);
      assert(themeActions.includes(recommended) || recommended === '', `chapter ${stage}: patrol entry must match a visible chapter theme or be empty`);
      stableCases++;
    }
  }
}

for (const [field, threshold, direction, action] of [
  ['water', 35, 'low', 'habitat'], ['grass', 35, 'low', 'habitat'],
  ['disease', 45, 'high', 'intervention'], ['poacherPressure', 65, 'high', 'antiPoacher'],
  ['safety', 30, 'low', 'houndScout']
]) {
  for (let stage = 1; stage <= CHAPTERS.length; stage++) {
    const state = fixture(stage); const reserve = state.world.reserve;
    const object = ['water', 'grass', 'disease'].includes(field) ? reserve.ecology : reserve;
    object[field] = threshold + (direction === 'low' ? .1 : -.1);
    assert.equal(criticalPatrolRisk(reserve), null, `${field}: warning is not a critical task`);
    object[field] = threshold;
    assert.equal(criticalPatrolRisk(reserve).action, action);
    const daily = resolveGoals(state, state.world.goals).daily.objectives;
    assert.equal(daily.length, 0, 'critical risk must not recreate daily tasks');
    assert.equal(gameFor(state).recommendedPatrolAction(reserve), action);
    object[field] = direction === 'low' ? 75 : 8;
    const resolved = resolveGoals(state, state.world.goals).daily.objectives;
    assert.equal(resolved.length, 0, 'resolved risk must not recreate daily tasks');
  }
}
assert.equal(criticalPatrolRisk({ ecology: { water: null, grass: 'bad', disease: NaN } }), null);
for (let stage = 1; stage <= CHAPTERS.length; stage++) {
  const game = gameFor(fixture(stage));
  const reserve = game.state.world.reserve;
  reserve.dailyReturnEvent = { dateKey: new Date().toISOString().slice(0, 10), status: 'pending', actionId: 'houndScout' };
  assert.equal(game.ensureDailyReturnEvent(), null, 'return login must retire legacy routine scout reminders');
  reserve.ecology.water = 52;
  assert.equal(game.ensureDailyReturnEvent(), null, 'ordinary resource fluctuation must not create a patrol');
  reserve.ecology.water = 30;
  const event = game.ensureDailyReturnEvent();
  assert.equal(event.actionId, 'habitat');
  assert.equal(event.riskId, 'water');
  assert.equal(game.ensureDailyReturnEvent(), event, 'same risk must not create duplicate return tasks');
  assert(game.normalizeReserveViewPresentation().mapMarkers.some(marker => marker.type === 'dailyReturnEvent'), 'critical return event should be visible');
  reserve.ecology.water = 75;
  assert(!game.normalizeReserveViewPresentation().mapMarkers.some(marker => marker.type === 'dailyReturnEvent'), 'resolved risk must disappear from map without requiring a restart');
  assert.equal(game.ensureDailyReturnEvent(), null, 'resolved return risk must disappear');
}

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
  if (action === 'antiPoacher') {
    assert.equal(game.patrolTaskModal, null, '驱赶偷猎必须跳过中间页');
    assert.ok(game.settlementOccupiesFlow(), '驱赶偷猎必须直接结算');
    continue;
  }
  assert.equal(game.patrolTaskModal.id, action);
  game.activeTaskLock = { id: `manual:${action}` };
  game.closePatrolOperationScreen();
  assert.equal(game.activeTaskLock, null, 'closing patrol must release lock');
  assert.equal(JSON.stringify(reserve), before, 'closing must not consume resources or settle');
  assert(game.openPatrolOperationScreen(action), 'player can reopen cancelled patrol');
}

const idle = gameFor(fixture());
assert.equal(idle.openPatrolOperationScreen(), true, 'player-initiated generic entry may open the current chapter patrol');
assert(idle.patrolTaskModal, 'generic player entry should expose the current chapter patrol card');
idle.cancelPatrolTaskModal();
assert.equal(idle.openPatrolOperationScreen('retired-action'), false, 'invalid action must not become a hound patrol');
assert(!idle.patrolTaskModal);

// Routine changes and successful recovery must not turn their result markers
// into another patrol. Preserve the resource feedback and readable details.
for (const recovery of [false, true]) {
  const state = fixture(2); const reserve = state.world.reserve;
  reserve.social = {}; reserve.migration = { delta: 0 };
  reserve.ecology.water = 52;
  reserve.ecology.grass = 50;
  const before = clone(reserve);
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
  const game = gameFor(fixture(2));
  const daily = game.state.world.goals.daily;
  daily.objectives = [
    { id: 'daily_guard', kind: 'guard', recommendedAction: oldAction, target: 1, progress: 0, complete: false },
    { id: 'daily_visitor', kind: 'visitor', target: 1, progress: 0, complete: false }
  ];
  daily.schemaVersion = 2;
  daily.required = 4;
  daily.coreClaimed = false;
  daily.fullClaimed = false;
  game.activeTaskLock = { id: `daily:${daily.dateKey}:daily_guard`, kind: 'daily', goal: { recommendedAction: oldAction } };
  let opened = 0;
  let routedToSurvival = 0;
  game.openMaterialExploration = () => { opened++; game.infoDetailModal = { kind: 'materialExploration' }; return true; };
  game.setScreen = screen => { game.screen = screen; if (screen === 'survival') routedToSurvival++; };
  const beforeActions = game.state.world.reserve.progression.totalActions;
  const beforeFund = game.state.world.reserve.fund;
  assert.equal(game.openDailyEvents(), false, 'old daily saves must not reopen the checklist');
  assert.notEqual(game.infoDetailModal && game.infoDetailModal.kind, 'dailyEvents');
  assert.equal(opened, 0);
  assert.equal(routedToSurvival, 0, 'retired daily tasks must not force Survival');
  assert.equal(game.executeDailyEvent('daily_guard', daily.dateKey), false);
  assert.equal(game.state.world.reserve.progression.totalActions, beforeActions, 'opening is not completion');
  assert.equal(game.state.world.reserve.fund, beforeFund, 'old daily rows must not pay out');
}

for (let stage = 1; stage <= CHAPTERS.length; stage++) {
  let state = fixture(stage);
  state.world.goals = normalizeGoalState(state.world.goals, state);
  state = applyGoalProgress(clone(state), state, { action: 'viewVisitors' }).state;
  state = applyGoalProgress(clone(state), state, { action: 'habitat' }).state;
  assert.equal(state.world.goals.daily.objectives.length, 0, `chapter ${stage}: daily tasks stay removed`);
  assert(state.world.goals.daily.fullClaimed);
  const balance = state.world.reserve.fund;
  for (let reopen = 0; reopen < 5; reopen++) state.world.goals = normalizeGoalState(clone(state.world.goals), state);
  assert.equal(state.world.reserve.fund, balance, 'reopen must not duplicate rewards');
}

console.log(`patrol trigger policy check ok (${stableCases} stable chapter/history/milestone cases; 100 threshold cases; four explicit patrols; legacy daily resume; 20 daily completions without patrol)`);
