'use strict';
const assert = require('node:assert/strict');
const { createCharacter } = require('../js/storage');
const { resolveGoals, normalizeGoalState, TASK_CATEGORIES } = require('../js/goalSystem');

const allowed = new Set(Object.values(TASK_CATEGORIES));
const cards = (goals) => [goals.active && goals.active.primary]
  .concat((goals.active && goals.active.alternatives) || [])
  .filter(Boolean);

function resolved(state, trigger) {
  const goals = resolveGoals(state, normalizeGoalState(state.world.goals, state), trigger);
  cards(goals).forEach((card) => {
    assert.ok(allowed.has(card.taskCategory), `${card.id} has invalid task category ${card.taskCategory}`);
    assert.notEqual(card.kind, 'fallback', 'generic observation fallback must not return');
    assert.notEqual(card.kind, 'long', 'facility operation filler must not return');
    assert.notEqual(card.kind, 'daily', 'routine daily objectives must stay out of the main task cards');
  });
  return goals;
}

const healthy = createCharacter(null, '七类任务白名单');
let goals = resolved(healthy, 'healthy');
assert.ok(cards(goals).some((card) => card.recommendedAction === 'rescueAnimal' || /增加动物总数/.test(card.title || '')), 'animals below the chapter gate must create an animal-count task');
assert.ok(cards(goals).every((card) => card.kind !== 'fallback'), 'healthy reserve must not add observation filler');

const metric = createCharacter(null, '指标触发');
metric.world.reserve.ecology.water = 5;
goals = resolved(metric, 'metric');
assert.ok(cards(goals).some((card) => card.taskCategory === TASK_CATEGORIES.metric), 'critical water must create a metric task');

const crisis = createCharacter(null, '自然事件触发');
crisis.world.reserve.emergency = {
  active: { id: 'flood_case', type: 'flash_flood', title: '突发山洪', recommendedAction: 'habitat', daysRemaining: 1 }
};
goals = resolved(crisis, 'natural-event');
assert.equal(goals.active.primary.taskCategory, TASK_CATEGORIES.naturalEvent);

const animal = createCharacter(null, '动物任务触发');
animal.world.reserve.poacherRescue = {
  active: [{
    targetId: 'poacher:test:deer',
    id: 'poacher:test:deer',
    speciesId: 'deer',
    speciesName: '鹿',
    status: 'captive',
    taskVisible: true,
    requiredItems: []
  }],
  history: []
};
goals = resolved(animal, 'animal');
assert.ok(cards(goals).some((card) => card.taskCategory === TASK_CATEGORIES.animal), 'animal rescue must be categorized as animal');

console.log('task category whitelist check ok');
