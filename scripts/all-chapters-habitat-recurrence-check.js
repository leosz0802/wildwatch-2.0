'use strict';

const assert = require('node:assert/strict');
const { createCharacter } = require('../js/storage');
const { CHAPTERS } = require('../js/animalWorld');
const {
  CHAPTER_THEME_TASKS,
  applyGoalProgress,
  normalizeGoalState,
  resolveGoals
} = require('../js/goalSystem');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function setup(chapter, metric) {
  const state = createCharacter(null, `全章节生态任务回归第${chapter}章`);
  const reserve = state.world.reserve;
  Object.assign(reserve.progression, {
    stage: chapter,
    displayChapter: chapter,
    totalActions: 0,
    activeSeconds: 600,
    chapterComplete: false
  });
  reserve.fund = 10000;
  reserve.supplies = {
    dogFood: 10,
    fieldKit: 10,
    alarm: 10,
    medicalKit: 10,
    tranquilizer: 10,
    evidenceTrap: 10
  };
  reserve.ecology = Object.assign({}, reserve.ecology || {}, {
    water: metric === 'water' ? 20 : 70,
    grass: metric === 'grass' ? 20 : 70,
    disease: 0
  });
  reserve.safety = 80;
  reserve.poacherPressure = 0;
  reserve.emergency = { active: null, cooldown: 0, history: [], lastOutcome: null };
  // Finish any chapter-theme chain without marking its habitat task as
  // retired. This isolates the generic ecology-risk route in every chapter.
  reserve.chapterTheme = {
    chapter,
    step: 3,
    completed: true,
    completedTaskIds: []
  };
  state.ui = { onboarding: { version: 2, completed: true, seen: {} } };
  refresh(state);
  return state;
}

function refresh(state) {
  state.world.goals = resolveGoals(
    state,
    normalizeGoalState(state.world.goals, state),
    'all-chapters-habitat-recurrence'
  );
  return state.world.goals;
}

function visibleGoals(goals) {
  return [goals.active.primary].concat(goals.active.alternatives || []).filter(Boolean);
}

for (let chapter = 1; chapter <= CHAPTERS.length; chapter += 1) {
  for (const metric of ['water', 'grass']) {
    let state = setup(chapter, metric);
    const first = refresh(state);
    const riskId = `ecology-risk:${metric}`;
    const theme = (CHAPTER_THEME_TASKS[chapter] || [])[0];
    const primaryId = first.active.primary && first.active.primary.id;
    const themeId = theme ? `theme:${chapter}:${theme.id}` : "";
    assert.ok(primaryId === riskId || primaryId === themeId,
      `第${chapter}章 ${metric} 初始入口必须是生态风险或本章主题，实际 ${primaryId}`);

    // Settle exactly the task that was recommended. Keep the metric low so
    // the test catches a recommendation that reappears after the result.
    const before = clone(state);
    const after = clone(state);
    after.world.reserve.progression.totalActions = 1;
    state = applyGoalProgress(before, after, { action: 'habitat' }).state;

    for (let refreshCount = 0; refreshCount < 3; refreshCount += 1) {
      const current = refresh(state);
      const visible = visibleGoals(current);
      assert(
        visible.every((goal) => goal.id !== riskId && goal.id !== `metric:animals:habitat:${metric}`),
        `第${chapter}章 ${metric} 在第${refreshCount + 1}次刷新后仍出现重复栖息地入口: ${visible.map((goal) => goal.id).join(', ')}`
      );
      assert(
        visible.every((goal) => !(goal.recommendedAction === 'habitat' && goal.metricFocus === metric)),
        `第${chapter}章 ${metric} 在第${refreshCount + 1}次刷新后仍出现同语义修复任务`
      );
    }

    // A legacy alias record must retire the canonical ecology-risk candidate
    // as well. This covers data written by older builds before the IDs were
    // unified.
    const legacy = setup(chapter, metric);
    legacy.world.goals.history = [{
      chapter,
      type: 'instant',
      id: `metric:animals:habitat:${metric}`,
      title: metric === 'water' ? '修复饮水点' : '恢复草场'
    }];
    const legacyGoals = refresh(legacy);
    assert(
      visibleGoals(legacyGoals).every((goal) => goal.id !== riskId),
      `第${chapter}章 ${metric} 的旧别名记录没有退休 canonical ecology-risk 入口`
    );
  }
}

console.log('all chapters habitat recurrence check ok: chapters 1-11, water/grass aliases retire after one system settlement');
