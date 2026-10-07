'use strict';

const assert = require('node:assert/strict');
const { createCharacter } = require('../js/storage');
const { chapterFeaturedSpecies } = require('../js/animalWorld');
const {
  CHAPTER_THEME_TASKS,
  resolveGoals,
  normalizeGoalState,
  buildGoalView
} = require('../js/goalSystem');
const { shareRewardPreview, shareRewardBoardRow } = require('../js/shareSystem');

const titles = new Set();
for (let chapter = 1; chapter <= 20; chapter += 1) {
  const tasks = CHAPTER_THEME_TASKS[chapter] || [];
  if (chapter >= 19) {
    assert.equal(tasks.length, 0, `第${chapter}章没有额外主题链`);
    continue;
  }
  assert.equal(tasks.length, chapter >= 8 ? 1 : 3, `第${chapter}章主题任务数量不符合当前规则`);
  if (chapter >= 8) {
    tasks.forEach((task) => {
      const actions = task.validActions || [task.action];
      assert.ok(
        actions.some((action) => action === 'sharePostcard' || action === 'captureScreen' || action === 'harshNature'),
        `第${chapter}章当前任务只能保留分享或射箭：${task.title}`
      );
    });
  }
  const featured = chapterFeaturedSpecies(chapter);
  tasks.forEach((task) => {
    assert.ok(task.title, `第${chapter}章任务缺标题`);
    assert.ok(!titles.has(task.title), `主题任务标题重复：${task.title}`);
    titles.add(task.title);
  });
  if (chapter >= 6) {
    const snapshot = tasks.find((task) => task.taskVariant === 'screenshot' || task.action === 'sharePostcard');
    assert.ok(snapshot, `第${chapter}章必须有截图/分享任务`);
    assert.ok(
      snapshot.validActions.includes('sharePostcard') && snapshot.validActions.includes('captureScreen'),
      `第${chapter}章截图任务必须同时接受分享和截屏`
    );
    const speciesIds = featured.species.map((item) => item.id);
    const speciesPattern = featured.names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    assert.ok(
      new RegExp(speciesPattern).test(`${snapshot.title} ${snapshot.body}`),
      `第${chapter}章截图任务必须写到当章种群：${snapshot.title}`
    );
    assert.ok(
      speciesIds.includes(snapshot.shareSpeciesId),
      `第${chapter}章截图任务应绑定当章物种，实际 ${snapshot.shareSpeciesId}`
    );
  }

  const state = createCharacter(null, `第${chapter}章主题物种`);
  const reserve = state.world.reserve;
  reserve.progression.stage = chapter;
  reserve.progression.displayChapter = chapter;
  reserve.progression.chapterComplete = false;
  reserve.fund = 10000;
  reserve.supplies = { dogFood: 10, fieldKit: 10, alarm: 10, medicalKit: 10, tranquilizer: 10 };
  reserve.ecology = Object.assign({}, reserve.ecology || {}, { water: 70, grass: 70, disease: 8 });
  reserve.safety = 75;
  reserve.poacherPressure = 25;
  reserve.emergency = { active: null, cooldown: 0, history: [] };
  state.world.goals = resolveGoals(state, normalizeGoalState(state.world.goals, state), 'theme-species');
  const view = buildGoalView(state, state.world.goals);
  assert.equal(view.primary.title, tasks[0].title, `第${chapter}章当前目标应是本章第一步主题`);
  assert.ok(!String(view.primary.title || '').includes('追踪线：'), `第${chapter}章不得显示重复事件链标题`);

  const animalShare = shareRewardPreview(state, { rewardType: 'animals', sourceKind: 'animal' });
  const row = shareRewardBoardRow(animalShare);
  assert.ok(animalShare.speciesLabel, `第${chapter}章分享任务必须带种群名`);
  assert.ok(row.body.includes(animalShare.speciesLabel), `第${chapter}章分享说明必须提到${animalShare.speciesLabel}`);
}

console.log('chapter theme species check ok');
