'use strict';

const assert = require('node:assert/strict');
const { createCharacter } = require('../js/storage');
const { normalizeGoalState, resolveGoals } = require('../js/goalSystem');
const { supplyPurchaseCatalog, supplyFillLine } = require('../js/actions');

function refresh(state) {
  state.world.goals = resolveGoals(
    state,
    normalizeGoalState(state.world.goals, state),
    'all-chapters-supply-goal-check'
  );
  return state.world.goals;
}

function setup(chapter, options = {}) {
  const state = createCharacter(null, `全章节补给任务检查第${chapter}章`);
  const reserve = state.world.reserve;
  reserve.progression.stage = chapter;
  reserve.progression.displayChapter = chapter;
  reserve.progression.totalActions = 0;
  reserve.progression.activeSeconds = 600;
  reserve.fund = options.fund == null ? 10000 : options.fund;
  reserve.ecology = Object.assign({}, reserve.ecology || {}, {
    water: 70,
    grass: 70,
    disease: 0
  });
  reserve.safety = 80;
  reserve.poacherPressure = 0;
  reserve.supplies = {};
  for (const purchase of supplyPurchaseCatalog(reserve)) {
    reserve.supplies[purchase.id] = supplyFillLine(purchase, reserve);
  }
  if (options.shortage) {
    reserve.supplies[options.shortage] = Math.max(0, Number(options.amount) || 0);
  }
  if (options.themeStep != null) {
    reserve.chapterTheme = { chapter, step: Math.max(0, Number(options.themeStep) || 0) };
  }
  if (options.ledgerStep) {
    reserve.eventChain = {
      branch: 'ledger',
      step: Math.max(0, Number(options.ledgerStep) - 1),
      completed: false,
      stageBound: false,
      next: {}
    };
  }
  state.ui = { onboarding: { version: 2, completed: true, seen: {} } };
  return state;
}

function visible(goals) {
  return [goals.active.primary].concat(goals.active.alternatives || []).filter(Boolean);
}

// A healthy stock should never create a supply replenishment card in any
// chapter, including the chapters without an explicit theme chain.
for (let chapter = 1; chapter <= 20; chapter += 1) {
  const goals = refresh(setup(chapter));
  assert(
    visible(goals).every((goal) => goal.recommendedAction !== 'buySupplies' && goal.title !== '补充物资'),
    `第${chapter}章物资达到安全线时不应展示补给任务`
  );
  assert(
    (goals.daily.objectives || []).every((objective) => objective.recommendedAction !== 'buySupplies'),
    `第${chapter}章今日目标不应在安全库存时推荐采购`
  );
}

// The chapter-3 theme task remains available when a real patrol supply is low.
{
  const goals = refresh(setup(3, { shortage: 'dogFood', amount: 0, themeStep: 1 }));
  assert.equal(goals.active.primary.id, 'theme:3:replenish-supplies');
  assert.equal(goals.active.primary.recommendedAction, 'buySupplies');
}

// With all patrol supplies healthy, chapter 3 automatically advances past the
// conditional replenish step instead of showing a misleading salvage fallback.
{
  const state = setup(3, { themeStep: 1 });
  const goals = refresh(state);
  assert.notEqual(goals.active.primary.id, 'theme:3:replenish-supplies');
  assert.equal(state.world.reserve.chapterTheme.step, 2);
  assert.ok(state.world.reserve.chapterTheme.completedTaskIds.includes('replenish-supplies'));
}

// Medical kits are not part of the chapter-3 replenishment gate unless the
// current ecology makes the next intervention a disease-care action.
{
  const state = setup(3, { themeStep: 1, shortage: 'medicalKit', amount: 0 });
  const goals = refresh(state);
  assert.notEqual(goals.active.primary.id, 'theme:3:replenish-supplies');
  const economyObjective = goals.daily.objectives.find((objective) => objective.id === 'daily_economy');
  assert(!economyObjective || economyObjective.recommendedAction !== 'buySupplies');
  assert.equal(state.world.reserve.chapterTheme.step, 2);
}

{
  const state = setup(3, { themeStep: 1, shortage: 'medicalKit', amount: 0 });
  state.world.reserve.ecology.disease = 32;
  const goals = refresh(state);
  assert.equal(goals.active.primary.id, 'theme:3:replenish-supplies');
  assert.equal(goals.active.primary.recommendedAction, 'buySupplies');
}

// Ledger-story guidance in later chapters may list buySupplies as a fallback,
// but it must not become visible while the safety line is already met.
for (let chapter = 6; chapter <= 20; chapter += 1) {
  for (let step = 1; step <= 7; step += 1) {
    const goals = refresh(setup(chapter, { ledgerStep: step }));
    assert(
      visible(goals).every((goal) => goal.recommendedAction !== 'buySupplies'),
      `第${chapter}章补给线第${step}步不应在库存健康时推荐采购`
    );
  }
}

console.log('all chapters supply goal check ok: healthy stock suppresses redundant replenishment across chapters 1-20');
