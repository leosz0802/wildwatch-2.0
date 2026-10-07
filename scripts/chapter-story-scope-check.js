'use strict';

const assert = require('node:assert/strict');
const { createCharacter } = require('../js/storage');
const { buildGoalView, resolveGoals } = require('../js/goalSystem');

function setup(stage, themeStep = 3) {
  const state = createCharacter(null, `章节剧情入口${stage}`);
  const reserve = state.world.reserve;
  reserve.fund = 10000;
  reserve.supplies = {
    dogFood: 10,
    alarm: 10,
    tranquilizer: 10,
    fieldKit: 10,
    medicalKit: 10
  };
  reserve.progression = Object.assign({}, reserve.progression, {
    stage,
    displayChapter: stage,
    level: stage <= 2 ? 1 : Math.ceil(stage / 2),
    objectives: [
      { id: 'chapterStory', label: '阶段剧情', current: 4, target: 5, unit: '段', complete: false },
      { id: 'actions', label: '有效经营操作', current: 20, target: 20, unit: '次', complete: true },
      { id: 'score', label: '本阶最高评分', current: 0, target: 999, unit: '', complete: false }
    ]
  });
  reserve.chapterTheme = {
    version: 1,
    chapter: stage,
    step: themeStep,
    completed: themeStep >= 3,
    completedTaskIds: []
  };
  reserve.eventChain = {
    chapterLevel: reserve.progression.level,
    step: 4,
    length: 7,
    completed: false,
    stageBound: false,
    next: {
      title: '追踪线：夜行投票',
      prompt: '守住安全，让迁徙方向成为新的证词。',
      recommendedAction: 'habitat',
      validActions: ['habitat']
    }
  };
  reserve.ecology.water = 65;
  reserve.ecology.grass = 65;
  reserve.safety = 72;
  reserve.poacherPressure = 20;
  state.world.goals = resolveGoals(state, state.world.goals, 'chapter-story-scope-check');
  return state;
}

function visibleTitles(state) {
  const view = buildGoalView(state, state.world.goals);
  return [view.primary].concat(view.alternatives || [])
    .filter(Boolean)
    .map((item) => item.title || '');
}

for (const chapter of [1, 2, 3, 4, 5]) {
  const titles = visibleTitles(setup(chapter));
  assert(
    titles.every((title) => !title.includes('追踪线：夜行投票')),
    `第${chapter}章不应把事件链标题作为用户任务：${titles.join(' / ')}`
  );
}

const laterChapterTitles = visibleTitles(setup(6, 0));
assert(
  laterChapterTitles.every((title) => !title.includes('追踪线：夜行投票')),
  `第6章也应显示本章主题，而不是重复事件链标题：${laterChapterTitles.join(' / ')}`
);
assert(
  laterChapterTitles.some((title) => /熊洞|秃鹫/.test(title)),
  `第6章主题任务必须绑定本章种群：${laterChapterTitles.join(' / ')}`
);

const pendingThemeTitles = visibleTitles(setup(2, 1));
assert(
  pendingThemeTitles.every((title) => !title.includes('追踪线：夜行投票')),
  `第2章主题链未完成时也不应混入事件链任务：${pendingThemeTitles.join(' / ')}`
);

console.log('chapter story scope check ok (generic event-chain goals hidden in chapters 1-5)');
