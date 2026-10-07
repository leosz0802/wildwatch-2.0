'use strict';

const assert = require('node:assert/strict');
const { createCharacter } = require('../js/storage');
const {
  CHAPTER_THEME_TASKS,
  applyGoalProgress,
  buildGoalView,
  normalizeGoalState,
  resolveGoals
} = require('../js/goalSystem');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function refresh(state) {
  state.world.goals = resolveGoals(
    state,
    normalizeGoalState(state.world.goals, state),
    'mid-chapter-theme-check'
  );
  return buildGoalView(state, state.world.goals);
}

function setup(chapter) {
  const state = createCharacter(null, `第${chapter}章主题链`);
  const reserve = state.world.reserve;
  reserve.progression.stage = chapter;
  reserve.progression.displayChapter = chapter;
  reserve.progression.level = Math.ceil(chapter / 2);
  reserve.fund = 10000;
  reserve.supplies = {
    dogFood: 10,
    fieldKit: 10,
    alarm: 10,
    tranquilizer: 10,
    medicalKit: 10
  };
  // Keep the chapter-3 replenishment step as a real shortage case. Healthy
  // stock is covered by the cross-chapter regression, where that conditional
  // task must auto-skip instead of showing a misleading fallback action.
  if (chapter === 3) reserve.supplies.dogFood = 0;
  reserve.ecology.water = 70;
  reserve.ecology.grass = 70;
  reserve.safety = 75;
  reserve.poacherPressure = 25;
  refresh(state);
  return state;
}

function act(state, action, mutate) {
  const after = clone(state);
  if (mutate) mutate(after);
  after.world.reserve.progression.totalActions = Math.max(
    0,
    Number(after.world.reserve.progression.totalActions || 0) + 1
  );
  return applyGoalProgress(state, after, { action }).state;
}

const expected = {
  3: {
    titles: ['使用巡护站', '补充物资', '处理第一次疾病风险'],
    actions: ['facilityUse', 'buySupplies', 'intervention']
  },
  4: {
    titles: ['修复草场', '降低盗猎压力', '平衡游客和动物'],
    actions: ['habitat', 'antiPoacher', 'visitorReception']
  },
  5: {
    titles: ['猎犬侦查', '保护捕食者', '减少过度干预'],
    actions: ['houndScout', 'animalCare', 'observeReserve']
  }
};

for (const chapter of [3, 4, 5]) {
  assert.deepEqual(
    CHAPTER_THEME_TASKS[chapter].map((task) => task.title),
    expected[chapter].titles,
    `第${chapter}章主题任务文案不一致`
  );
  assert.deepEqual(
    CHAPTER_THEME_TASKS[chapter].map((task) => task.action),
    expected[chapter].actions,
    `第${chapter}章主题任务动作不一致`
  );

  let state = setup(chapter);
  for (let index = 0; index < expected[chapter].titles.length; index += 1) {
    const view = refresh(state);
    assert.equal(
      view.primary.title,
      expected[chapter].titles[index],
      `第${chapter}章第${index + 1}步没有成为当前目标`
    );
    assert.equal(
      view.primary.recommendedAction,
      expected[chapter].actions[index],
      `第${chapter}章第${index + 1}步入口动作不一致`
    );
    state = act(state, expected[chapter].actions[index]);
  }

  assert.equal(state.world.reserve.chapterTheme.step, 3, `第${chapter}章主题链没有完成`);
  assert.equal(state.world.reserve.chapterTheme.completed, true, `第${chapter}章主题链完成标记错误`);

  for (const unrelatedAction of ['houndScout', 'viewVisitors', 'facilityUse', 'habitat', 'antiPoacher']) {
    state = act(state, unrelatedAction);
    const view = refresh(state);
    const visible = [view.primary].concat(view.alternatives || []).filter(Boolean);
    assert(
      visible.every((item) => !item.themeTask || item.themeChapter !== chapter),
      `第${chapter}章主题任务在完成后被重复生成：${visible.map((item) => item.title).join(' / ')}`
    );
  }
}

console.log('mid chapter theme check ok (chapters 3-5, one-shot task chains)');
