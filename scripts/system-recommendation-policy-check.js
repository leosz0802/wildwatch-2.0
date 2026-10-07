'use strict';

const assert = require('node:assert/strict');
const { createCharacter } = require('../js/storage');
const { normalizeGoalState, resolveGoals, systemGoalCanRepeat } = require('../js/goalSystem');
const { supplyPurchaseCatalog, supplyFillLine } = require('../js/actions');

function stateFor(chapter, step = 0) {
  const state = createCharacter(null, `系统推荐规则第${chapter}章`);
  const reserve = state.world.reserve;
  reserve.progression.stage = chapter;
  reserve.progression.displayChapter = chapter;
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
  reserve.ecology = Object.assign({}, reserve.ecology || {}, { water: 70, grass: 70 });
  reserve.chapterTheme = { chapter, step };
  state.ui = { onboarding: { version: 2, completed: true, seen: {} } };
  state.world.goals = normalizeGoalState(state.world.goals, state);
  return state;
}

function refresh(state) {
  state.world.goals = resolveGoals(
    state,
    normalizeGoalState(state.world.goals, state),
    'system-recommendation-policy-check'
  );
  return state.world.goals.active.primary || null;
}

{
  const state = stateFor(1, 0);
  const first = refresh(state);
  assert.equal(first.id, 'theme:1:observe-footprints');
  state.ui.chapterSystemAutoGuides = {
    'theme:1:observe-footprints': Date.now(),
    'chapter:1:goal:theme:1:observe-footprints': Date.now(),
    'chapter:1:action:houndScout': Date.now()
  };
  const afterSeen = refresh(state);
  assert.notEqual(afterSeen && afterSeen.id, 'theme:1:observe-footprints');
  state.world.reserve.ecology.water = 20;
  const afterMetricDrop = refresh(state);
  assert.notEqual(afterMetricDrop && afterMetricDrop.id, 'theme:1:observe-footprints');
}

{
  const state = stateFor(2, 0);
  state.world.reserve.supplies.fieldKit = 0;
  state.ui.chapterSystemAutoGuides = {
    'theme:2:restore-water': Date.now(),
    'chapter:2:goal:theme:2:restore-water': Date.now(),
    'chapter:2:action:habitat': Date.now(),
    'chapter:2:action:buySupplies': Date.now()
  };
  const shortage = refresh(state);
  assert.equal(shortage && shortage.recommendedAction, 'buySupplies', '补充物资属于允许重复的恢复路线');
}

{
  const state = stateFor(7, 0);
  const reserve = state.world.reserve;
  reserve.progression.totalActions = 20;
  reserve.supplies = {};
  supplyPurchaseCatalog(reserve).forEach((purchase) => {
    reserve.supplies[purchase.id] = supplyFillLine(purchase, reserve);
  });
  state.ui.chapterSystemAutoGuides = {
    'chapter:7:action:buySupplies': Date.now()
  };
  const current = refresh(state);
  assert.notEqual(current && current.recommendedAction, 'buySupplies',
    '第7章物资达到安全线时不得显示补给任务');
  assert.equal(systemGoalCanRepeat(state, {
    id: 'recovery:supplies',
    kind: 'recovery',
    recommendedAction: 'buySupplies'
  }), false, '物资充足时补给恢复任务不得反复出现');
}

{
  const state = stateFor(1, 0);
  state.world.reserve.chapterRescue = {
    version: 2,
    chapter: 1,
    targets: [{
      targetId: 'chapter:1:rescue:1',
      speciesId: 'antelope',
      speciesName: '羚羊',
      status: 'trapped',
      requiredItems: []
    }]
  };
  state.ui.chapterSystemAutoGuides = {
    'chapter:1:action:rescueAnimal': Date.now()
  };
  assert.equal(systemGoalCanRepeat(state, {
    id: 'pass:animals:rescue:chapter:1:rescue:1',
    kind: 'stage',
    recommendedAction: 'rescueAnimal',
    rescueAligned: true
  }), true, '解救被困动物属于允许重复的系统入口');
}

{
  const state = stateFor(2, 0);
  state.ui.chapterSystemAutoGuides = {
    'theme:2:restore-water': Date.now(),
    'chapter:2:goal:theme:2:restore-water': Date.now(),
    'chapter:2:action:habitat': Date.now()
  };
  state.world.goals.active = Object.assign({}, state.world.goals.active, {
    manualSelectedId: 'theme:2:restore-water'
  });
  const manual = refresh(state);
  assert.equal(manual && manual.id, 'theme:2:restore-water', '玩家主动选择的任务不受系统一次性推荐限制');
}

console.log('system recommendation policy check ok: one-shot chapter system goals, repeatable rescue/fund/supply recovery, manual override');
