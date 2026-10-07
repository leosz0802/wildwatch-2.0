'use strict';

const assert = require('node:assert/strict');
const { createCharacter } = require('../js/storage');
const { applyGoalProgress, normalizeGoalState, resolveGoals } = require('../js/goalSystem');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function baseState(step, metric) {
  const state = createCharacter(null, '第二章栖息地一次性回归');
  const reserve = state.world.reserve;
  reserve.progression.stage = 2;
  reserve.progression.displayChapter = 2;
  reserve.progression.totalActions = 0;
  reserve.progression.activeSeconds = 600;
  reserve.fund = 10000;
  reserve.supplies = {
    dogFood: 10,
    fieldKit: 10,
    alarm: 10,
    medicalKit: 10,
    tranquilizer: 10
  };
  reserve.ecology = Object.assign({}, reserve.ecology || {}, {
    water: metric === 'water' ? 20 : 70,
    grass: metric === 'grass' ? 20 : 70
  });
  reserve.chapterTheme = {
    chapter: 2,
    step,
    completedTaskIds: step > 0 ? ['restore-water'] : []
  };
  state.ui = { onboarding: { version: 2, completed: true, seen: {} } };
  state.world.goals = resolveGoals(state, normalizeGoalState(state.world.goals, state), 'chapter2-habitat-once');
  return state;
}

function refresh(state) {
  state.world.goals = resolveGoals(
    state,
    normalizeGoalState(state.world.goals, state),
    'chapter2-habitat-once'
  );
  return state.world.goals.active.primary || null;
}

function settleHabitat(state, actionCount) {
  const before = clone(state);
  const after = clone(state);
  after.world.reserve.progression.totalActions = actionCount;
  const result = applyGoalProgress(before, after, { action: 'habitat' });
  return result.state;
}

// Water is the chapter-2 theme task. A critical metric drop may select the
// fallback ecology-risk candidate first, but completing it must retire both
// the fallback and the theme alias for the rest of this chapter.
{
  let state = baseState(0, 'water');
  assert.equal(refresh(state).id, 'ecology-risk:water');
  state = settleHabitat(state, 1);
  for (let index = 0; index < 3; index += 1) {
    const current = refresh(state);
    assert.notEqual(current && current.id, 'ecology-risk:water', 'water recovery must not repeat after settlement');
  }
}

// Grass has no chapter-2 theme step, so its own fallback completion history is
// the durable retirement record. Repeated refreshes must leave the goal out,
// while the action remains available from the player action menu.
{
  let state = baseState(1, 'grass');
  assert.equal(refresh(state).id, 'ecology-risk:grass');
  state = settleHabitat(state, 1);
  for (let index = 0; index < 3; index += 1) {
    const current = refresh(state);
    assert.notEqual(current && current.id, 'ecology-risk:grass', 'grass recovery must not repeat after settlement');
  }
  assert.equal(state.world.reserve.supplies.fieldKit, 10, 'goal refresh must not consume the player action resource');
}

console.log('chapter 2 habitat once check ok: water and grass recovery candidates retire after one settlement');
