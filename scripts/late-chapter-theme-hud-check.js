"use strict";

const assert = require("node:assert/strict");
const { createCharacter } = require("../js/storage");
const { getCurrentChapter } = require("../js/animalWorld");
const { Game } = require("../js/game");
const {
  CHAPTER_THEME_TASKS,
  applyGoalProgress,
  buildGoalView,
  normalizeGoalState,
  resolveGoals
} = require("../js/goalSystem");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function refresh(state) {
  state.world.goals = resolveGoals(
    state,
    normalizeGoalState(state.world.goals, state),
    "late-chapter-theme-hud"
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
  const state = createCharacter(null, `后期主题第${chapter}章`);
  const reserve = state.world.reserve;
  reserve.progression.stage = chapter;
  reserve.progression.displayChapter = chapter;
  reserve.progression.chapterComplete = false;
  reserve.fund = 20000;
  reserve.safety = 90;
  reserve.poacherPressure = 20;
  reserve.supplies = {
    dogFood: 12,
    fieldKit: 12,
    alarm: 12,
    medicalKit: 12,
    tranquilizer: 12
  };
  reserve.ecology = Object.assign({}, reserve.ecology || {}, { water: 72, grass: 70, disease: 8 });
  reserve.emergency = { active: null, cooldown: 0, history: [], realNatureChapter: chapter, realNatureChapterCount: 2 };
  refresh(state);
  return state;
}

function barFor(state) {
  const game = Object.create(Game.prototype);
  game.state = state;
  game.screen = "home";
  game.painting = false;
  game.frameMemoStore = null;
  game.goalBarSeenSystemRepeat = () => false;
  game.sandboxPrimaryGuidance = () => null;
  game.chapterCoreFallbackGoal = () => null;
  game.recoveredGoodsDetailTask = () => null;
  return game.sandboxGoalBarData();
}

const finaleChapter = 11;
const finaleTasks = CHAPTER_THEME_TASKS[finaleChapter];
const finaleState = setup(finaleChapter);
const finaleView = refresh(finaleState);
const finaleTitle = getCurrentChapter(finaleState.world.reserve).title;
assert.equal(finaleView.stage.chapter, finaleChapter, "第11章目标舞台不得钳在第10章");
assert.equal(finaleView.primary.themeChapter, finaleChapter, "第11章主题必须带本章编号");
assert.equal(finaleView.primary.title, finaleTasks[0].title, "第11章当前目标应是终章分享");
assert.ok(!String(finaleView.primary.title || "").includes("水草线"), "第11章不得显示第10章水草线");
const finaleBar = barFor(finaleState);
assert.equal(finaleBar.chapter, finaleChapter, "第11章目标条不得写成第10章");
assert.equal(finaleBar.chapterTitle, finaleTitle, "第11章目标条标题必须是无限守望");
assert.equal(finaleBar.title, finaleTasks[0].title, "第11章目标条必须显示终章主题");

let chapterEleven = setup(11);
assert.equal(refresh(chapterEleven).primary.title, "截下守望里的野牛");
chapterEleven = act(chapterEleven, "habitat", (state) => {
  state.world.reserve.ecology.water = 80;
  state.world.reserve.lastHabitatMetricFocus = "water";
});
assert.equal(refresh(chapterEleven).primary.title, "截下守望里的野牛", "水源修复不得推进或替换终章分享任务");
assert.equal(chapterEleven.world.reserve.chapterTheme.step, 0);
chapterEleven = act(chapterEleven, "sharePostcard");
assert.notEqual(refresh(chapterEleven).primary && refresh(chapterEleven).primary.title, "截下守望里的野牛", "分享完成后不得复活");
assert.equal(chapterEleven.world.reserve.chapterTheme.completed, true);

let finaleBusy = setup(11);
const drought = {
  id: "real_nature_drought_extra",
  type: "real_nature_climate-11",
  title: "南部非洲长期干旱重创内陆生态系统",
  daysRemaining: 3,
  recommendedAction: "habitat"
};
finaleBusy.world.reserve.emergency = {
  active: drought,
  cooldown: 0,
  realNatureChapter: 11,
  realNatureChapterCount: 2,
  history: [{
    id: "required_done",
    kind: "resolved",
    type: "real_nature_ocean-01",
    title: "本章已处理真实事件"
  }]
};
const lateView = refresh(finaleBusy);
assert.equal(lateView.primary.title, "截下守望里的野牛", "额外干旱不得抢走第11章未完成分享任务");
assert.equal(lateView.primary.themeTask, true);
assert.ok(
  !lateView.primary.kind || lateView.primary.kind !== "crisis",
  "额外真实事件不得继续当主目标"
);
const lateBar = barFor(finaleBusy);
assert.equal(lateBar.chapter, 11, "第11章目标条必须写第11章");
assert.equal(lateBar.chapterTitle, "无限守望");
assert.equal(lateBar.title, "截下守望里的野牛");

{
  const game = Object.create(Game.prototype);
  game.state = finaleBusy;
  game.screen = "home";
  game.infoDetailModal = null;
  game.chapterStoryModal = null;
  game.patrolTaskModal = null;
  game.activeTaskLock = null;
  game.popupFlowQuiet = () => false;
  game.onboardingProgress = () => ({ active: false });
  game.settlementOccupiesFlow = () => false;
  game.chapterSystemAutoGuideSeen = () => true;
  game.systemGoalCanRepeat = () => false;
  game.isTodaysDailyGoal = () => false;
  game.todaysDailyAlreadyPresented = () => true;
  game.missionPushKey = () => "ch11-extra-drought";
  game.chapterTaskCadence = () => ({ actionGap: 4, intervalMs: 55000, cooldownMs: 60000, routineSlots: 4, mapGuided: true });
  game.missionExperienceSeconds = () => 400;
  game.remainingDailyObjective = () => null;
  game.sandboxLedMode = () => false;
  game.currentDailyMatchesGoal = () => false;
  game.markDailyPresentationSeen = () => {};
  game.openGoalCenter = () => {
    throw new Error("extra drought must not reopen the dim goal card");
  };
  game.currentGoalView = () => lateView;
  assert.equal(game.maybeOpenMissionPush("home"), false, "额外干旱不得反复弹出当前目标遮罩");
}

console.log("late chapter theme hud check ok");
