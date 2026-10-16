"use strict";

const assert = require("node:assert/strict");
const { createCharacter } = require("../js/storage");
const { applyGoalProgress, resolveGoals, systemGoalCanRepeat, normalizeGoalState } = require("../js/goalSystem");

function stateFor(chapter) {
  const state = createCharacter(null, `当前目标只提醒一次第${chapter}章`);
  const reserve = state.world.reserve;
  reserve.progression.stage = chapter;
  reserve.progression.displayChapter = chapter;
  reserve.progression.totalActions = 4;
  reserve.fund = 1750;
  reserve.ecology = Object.assign({}, reserve.ecology || {}, { water: 66, grass: 62, disease: 8 });
  reserve.chapterTheme = { chapter, step: 99, version: 9 };
  state.ui = { onboarding: { version: 2, completed: true, seen: {} }, chapterSystemAutoGuides: {}, chapterSystemAutoGuideKeys: [] };
  state.world.goals = normalizeGoalState(state.world.goals, state);
  state.world.goals.active = {
    primary: {
      id: "pass:visitors:recruit",
      kind: "stage",
      title: "游客：发布一次招募",
      recommendedAction: "viewVisitors",
      passGoal: true,
      chapter,
      executable: true,
      taskCategory: "metric"
    },
    alternatives: [],
    manualSelectedId: null
  };
  return state;
}

function settle(state, action) {
  const before = JSON.parse(JSON.stringify(state));
  return applyGoalProgress(before, state, { action, now: Date.now() });
}

for (const chapter of [1, 3, 7, 11]) {
  const state = stateFor(chapter);
  const progress = settle(state, "viewVisitors");
  const key = `chapter:${chapter}:goal:pass:visitors:recruit`;
  assert.equal(state.ui.chapterSystemAutoGuides[key] > 0, true, `第${chapter}章完成一次招募提醒后要记下这个任务`);
  assert.notEqual(progress.primary && progress.primary.id, "pass:visitors:recruit", `第${chapter}章同一个招募任务不能立刻再成为当前目标`);
  for (let time = 0; time < 3; time += 1) {
    state.world.reserve.progression.totalActions += 1;
    const again = resolveGoals(state, normalizeGoalState(state.world.goals, state), "refresh").active.primary;
    assert.notEqual(again && again.id, "pass:visitors:recruit", `第${chapter}章招募提醒后连续刷新也不能再出现`);
  }
}

{
  const state = stateFor(1);
  state.world.goals.active.primary = {
    id: "theme:1:observe-footprints",
    kind: "stage",
    title: "观察脚印",
    recommendedAction: "houndScout",
    themeTask: true,
    chapter: 1,
    executable: true,
    taskCategory: "story"
  };
  settle(state, "viewVisitors");
  assert.equal(state.ui.chapterSystemAutoGuides["chapter:1:goal:pass:visitors:recruit"], undefined, "玩家主动招募时，当前目标不是这条任务，就不能把它记成已提醒");
}

{
  const state = stateFor(4);
  state.world.goals.active.primary = {
    id: "recovery:supplies",
    kind: "recovery",
    title: "接通基金与补给",
    body: "先发布游客招募获得基金，再采购补给。",
    recommendedAction: "viewVisitors",
    chapter: 4,
    executable: true,
    taskCategory: "metric"
  };
  assert.equal(systemGoalCanRepeat(state, state.world.goals.active.primary), true, "缺基金时的招募恢复路线仍允许重复");
  settle(state, "viewVisitors");
  assert.equal(state.ui.chapterSystemAutoGuides["chapter:4:goal:recovery:supplies"], undefined, "允许重复的恢复任务不能被一次结算关掉");
}

console.log("current goal remind once check ok");
