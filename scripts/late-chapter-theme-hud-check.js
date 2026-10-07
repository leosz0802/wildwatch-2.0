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

for (const chapter of [15, 16, 17]) {
  const tasks = CHAPTER_THEME_TASKS[chapter];
  const state = setup(chapter);
  const view = refresh(state);
  const chapterTitle = getCurrentChapter(state.world.reserve).title;
  assert.equal(view.stage.chapter, chapter, `第${chapter}章目标舞台不得钳在第10章`);
  assert.equal(view.primary.themeChapter, chapter, `第${chapter}章主题必须带本章编号`);
  assert.equal(view.primary.title, tasks[0].title, `第${chapter}章当前目标应是本章第一步`);
  assert.ok(!String(view.primary.title || "").includes("水草线"), `第${chapter}章不得显示第10章水草线`);
  const bar = barFor(state);
  assert.equal(bar.chapter, chapter, `第${chapter}章目标条不得写成第10章`);
  assert.equal(bar.chapterTitle, chapterTitle, `第${chapter}章目标条标题必须是${chapterTitle}`);
  assert.equal(bar.title, tasks[0].title, `第${chapter}章目标条必须显示本章主题`);
}

let chapterSixteen = setup(16);
assert.equal(refresh(chapterSixteen).primary.title, "截下鹈鹕白帆");
chapterSixteen.world.reserve.progression.visitors = 5000;
chapterSixteen.world.reserve.animals = { otter: 80, pelican: 40 };
assert.equal(refresh(chapterSixteen).primary.title, "截下鹈鹕白帆", "核心指标已完成时仍要显示本章分享任务");
chapterSixteen = act(chapterSixteen, "habitat", (state) => {
  state.world.reserve.ecology.water = 80;
  state.world.reserve.lastHabitatMetricFocus = "water";
});
assert.equal(refresh(chapterSixteen).primary.title, "截下鹈鹕白帆", "水源修复不得推进或替换本章分享任务");
assert.equal(chapterSixteen.world.reserve.chapterTheme.step, 0);
chapterSixteen = act(chapterSixteen, "sharePostcard");
assert.notEqual(refresh(chapterSixteen).primary && refresh(chapterSixteen).primary.title, "截下鹈鹕白帆", "分享完成后不得复活");
assert.equal(chapterSixteen.world.reserve.chapterTheme.completed, true);

let chapterSeventeen = setup(17);
const drought = {
  id: "real_nature_drought_extra",
  type: "real_nature_climate-17",
  title: "南部非洲长期干旱重创内陆生态系统",
  daysRemaining: 3,
  recommendedAction: "habitat"
};
chapterSeventeen.world.reserve.emergency = {
  active: drought,
  cooldown: 0,
  realNatureChapter: 17,
  realNatureChapterCount: 2,
  history: [{
    id: "required_done",
    kind: "resolved",
    type: "real_nature_ocean-01",
    title: "本章已处理真实事件"
  }]
};
const lateView = refresh(chapterSeventeen);
assert.equal(lateView.primary.title, "截下林冠猩猩", "额外干旱不得抢走第17章未完成分享任务");
assert.equal(lateView.primary.themeTask, true);
assert.ok(
  !lateView.primary.kind || lateView.primary.kind !== "crisis",
  "额外真实事件不得继续当主目标"
);
const lateBar = barFor(chapterSeventeen);
assert.equal(lateBar.chapter, 17, "第17章目标条必须写第17章");
assert.equal(lateBar.chapterTitle, "林冠交换");
assert.equal(lateBar.title, "截下林冠猩猩");

{
  const game = Object.create(Game.prototype);
  game.state = chapterSeventeen;
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
  game.missionPushKey = () => "ch17-extra-drought";
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
