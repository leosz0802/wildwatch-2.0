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
    'chapter-theme-check'
  );
  return buildGoalView(state, state.world.goals);
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

function setup(chapter) {
  const state = createCharacter(null, `主题任务第${chapter}章`);
  const reserve = state.world.reserve;
  reserve.progression.stage = chapter;
  reserve.progression.displayChapter = chapter;
  reserve.fund = 10000;
  reserve.supplies = {
    dogFood: 10,
    fieldKit: 10,
    alarm: 10,
    medicalKit: 10,
    tranquilizer: 10
  };
  refresh(state);
  return state;
}

assert.deepEqual(
  CHAPTER_THEME_TASKS[1].map((task) => task.title),
  ['观察脚印', '建立第一条巡护线', '完成首次保护']
);
assert.deepEqual(
  CHAPTER_THEME_TASKS[2].map((task) => task.title),
  ['看一眼榜单', '修复水源', '控制游客压力', '保留动物通道']
);
assert.deepEqual(
  CHAPTER_THEME_TASKS[1].map((task) => task.action),
  ['houndScout', 'facilityUse', 'antiPoacher'],
  '第1章三步必须对应观察、巡护站、保护行动，不能全部落到猎犬侦查'
);
assert.deepEqual(
  CHAPTER_THEME_TASKS[2].map((task) => task.action),
  ['viewLeaderboard', 'habitat', 'visitorReception', 'facilityUse'],
  '第2章主题链必须覆盖榜单、水源、游客和动物通道'
);

let chapterOne = setup(1);
assert.equal(refresh(chapterOne).primary.title, '观察脚印');
assert.equal(chapterOne.world.goals.active.primary.buttonLabel, '观察脚印');
chapterOne = act(chapterOne, 'houndScout');
assert.equal(refresh(chapterOne).primary.title, '建立第一条巡护线');
assert.equal(chapterOne.world.goals.active.primary.buttonLabel, '打开巡护站');
assert.equal(chapterOne.world.goals.active.primary.recommendedAction, 'facilityUse');
chapterOne = act(chapterOne, 'facilityUse');
assert.equal(refresh(chapterOne).primary.title, '完成首次保护');
assert.equal(chapterOne.world.goals.active.primary.recommendedAction, 'antiPoacher');
chapterOne = act(chapterOne, 'antiPoacher', (state) => {
  state.world.reserve.lastHabitatMetricFocus = 'water';
});
assert.equal(chapterOne.world.reserve.chapterTheme.step, 3);
assert.equal(chapterOne.world.reserve.chapterTheme.completed, true);
assert.ok(!refresh(chapterOne).primary.themeTask, '完成第1章主题链后不得继续显示主题卡');
for (const sandboxAction of ['viewVisitors', 'facilityBuild', 'houndScout', 'antiPoacher']) {
  chapterOne = act(chapterOne, sandboxAction);
  const visible = [refresh(chapterOne).primary].concat(chapterOne.world.goals.active.alternatives || []).filter(Boolean);
  assert.ok(
    visible.every((item) => !['theme:1:observe-footprints', 'theme:1:first-patrol-line', 'theme:1:first-protection'].includes(item.id)),
    `第1章完成主题链后，沙盘动作 ${sandboxAction} 不得重新生成已完成主题任务`
  );
}

let chapterTwo = setup(2);
assert.equal(refresh(chapterTwo).primary.title, '看一眼榜单');
chapterTwo = act(chapterTwo, 'viewLeaderboard');
assert.equal(refresh(chapterTwo).primary.title, '修复水源');
assert.equal(chapterTwo.world.goals.active.primary.buttonLabel, '修复水源');
chapterTwo = act(chapterTwo, 'habitat', (state) => {
  state.world.reserve.ecology.water = 60;
  state.world.reserve.lastHabitatMetricFocus = 'water';
});
assert.equal(refresh(chapterTwo).primary.title, '控制游客压力');
chapterTwo = act(chapterTwo, 'visitorReception');
assert.equal(refresh(chapterTwo).primary.title, '保留动物通道');
assert.equal(chapterTwo.world.goals.active.primary.recommendedAction, 'facilityUse');
assert.equal(chapterTwo.world.goals.active.primary.facilityId, 'hydrology_station');
chapterTwo = act(chapterTwo, 'facilityUse');
chapterTwo = act(chapterTwo, 'facilityUse');
assert.equal(chapterTwo.world.reserve.chapterTheme.step, CHAPTER_THEME_TASKS[2].length);
assert.equal(chapterTwo.world.reserve.chapterTheme.completed, true);

// Theme progress never changes the numerical promotion gate.
const gateBefore = clone(chapterTwo.world.reserve.progression);
assert.equal(gateBefore.stage, 2);
assert.equal(gateBefore.chapterComplete, false);

let chapterEleven = setup(11);
assert.equal(refresh(chapterEleven).primary.title, '截下守望里的野牛');
chapterEleven = act(chapterEleven, 'habitat', (state) => {
  state.world.reserve.ecology.grass = 80;
  state.world.reserve.lastHabitatMetricFocus = 'grass';
});
assert.equal(refresh(chapterEleven).primary.title, '截下守望里的野牛', '修复草场不得再推进已删除的跑道任务');
assert.equal(refresh(chapterEleven).primary.recommendedAction, 'sharePostcard');
chapterEleven = act(chapterEleven, 'sharePostcard');
assert.notEqual(refresh(chapterEleven).primary && refresh(chapterEleven).primary.title, '截下守望里的野牛');
assert.notEqual(refresh(chapterEleven).primary && refresh(chapterEleven).primary.title, '织上暗夜联防', '第11章界面操作任务已经删除');
assert.equal(chapterEleven.world.reserve.chapterTheme.completed, true);
assert.ok(
  (chapterEleven.world.reserve.chapterTheme.completedTaskIds || []).includes('endless-bison-snapshot'),
  '野牛守望任务必须记入已完成'
);

const { simulateDay } = require('../js/simulator');

function settle(state, command) {
  const result = simulateDay(command, state);
  state.world = result.world;
  return state;
}

let chapterSix = setup(6);
assert.equal(refresh(chapterSix).primary.title, '确认熊洞边界');
chapterSix = settle(chapterSix, '派猎犬确认熊洞边界');
assert.equal(chapterSix.world.reserve.chapterTheme.step, 1, '确认熊洞边界结算后必须进入下一主题');
assert.ok(
  (chapterSix.world.reserve.chapterTheme.completedTaskIds || []).includes('bear-loop-scout'),
  '熊洞边界必须记入本章已完成'
);
assert.equal(refresh(chapterSix).primary.title, '截下秃鹫盘旋');
chapterSix = settle(chapterSix, '驱赶偷猎者');
assert.equal(chapterSix.world.reserve.chapterTheme.step, 1, '后续巡护不得把已完成的熊洞任务重置');
assert.equal(refresh(chapterSix).primary.title, '截下秃鹫盘旋', '确认熊洞边界在本章只能出现一次');
chapterSix = act(chapterSix, 'sharePostcard');
assert.equal(refresh(chapterSix).primary.title, '稳住草甸回路');
chapterSix = settle(chapterSix, '派猎犬再确认一次边界');
assert.equal(refresh(chapterSix).primary.title, '稳住草甸回路', '截下秃鹫盘旋在本章只能出现一次');
assert.ok(
  (chapterSix.world.reserve.chapterTheme.completedTaskIds || []).includes('vulture-snapshot'),
  '秃鹫盘旋必须留在已完成记录里'
);

let chapterNine = setup(9);
chapterNine.world.reserve.ecology.water = 78;
chapterNine.world.reserve.ecology.grass = 74;
chapterNine.world.reserve.supplies.fieldKit = 2;
const chapterNineView = refresh(chapterNine);
assert.ok(
  [chapterNineView.primary].concat(chapterNineView.alternatives || []).some((item) => item && item.id === 'theme:9:mink-trace-riverbank')
    || CHAPTER_THEME_TASKS[9].some((task) => task.id === 'mink-trace-riverbank'),
  '第9章必须保留水貂水线主题任务'
);
assert.ok(
  !(CHAPTER_THEME_TASKS[9] || []).some((task) => /浅滩迁徙/.test(task.title || '')),
  '连上浅滩迁徙已经从第9章删除'
);
assert.ok(CHAPTER_THEME_TASKS[9].some((task) => task.id === 'mink-night-snapshot'), '第9章必须保留水貂夜行记录任务');
assert.ok(CHAPTER_THEME_TASKS[9].every((task) => task.action), '第9章主题任务必须保持可执行动作');

console.log('chapter theme task check ok (chapters 1, 2, 6, 9 and 11 once each)');
