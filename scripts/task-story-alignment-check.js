const assert = require("assert");
const { createCharacter } = require("../js/storage");
const { simulateDay } = require("../js/simulator");
const { buildGoalView, actionExecutable, resolveGoals, CHAPTER_THEME_TASKS } = require("../js/goalSystem");
const { eventStepGuidance } = require("../js/storyGuidance");
const { progressionGate } = require("../js/balanceConfig");

function withRandom(value, fn) {
  const original = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = original; }
}

function run(command, state, random = 0.99) {
  const result = withRandom(random, () => simulateDay(command, state));
  return Object.assign({}, state, { world: result.world, character: result.character, reports: result.reports });
}

function supply(state) {
  const reserve = state.world.reserve;
  reserve.fund = 10000;
  reserve.base.raidTickets = 3;
  reserve.supplies = { dogFood: 10, alarm: 6, tranquilizer: 6, fieldKit: 4 };
  reserve.safety = 72;
  reserve.poacherPressure = 38;
  reserve.ecology.water = 65;
  reserve.ecology.grass = 65;
  reserve.ecology.disease = 18;
  return state;
}

function view(state) {
  return buildGoalView(state, state.world.goals);
}

function completeTheme(state, chapter) {
  const tasks = CHAPTER_THEME_TASKS[chapter] || [];
  state.world.reserve.chapterTheme = {
    version: 1,
    chapter,
    step: tasks.length,
    completed: true,
    completedTaskIds: tasks.map((task) => task.id)
  };
  return state;
}

let state = supply(createCharacter(null, "任务剧情一致性"));
state.world.reserve.progression = Object.assign({}, state.world.reserve.progression, {
  stage: 7,
  displayChapter: 7,
  level: 4
});
state.world.reserve.eventChain = Object.assign({}, state.world.reserve.eventChain, {
  chapterLevel: 4
});
completeTheme(state, 7);

// 第一次行动建立事件线；七天事件链仍在内部推进，不再占用玩家主任务。
state = run("派猎犬侦察：确认边界脚印", state);
let chain = state.world.reserve.eventChain;
let primary = view(state).primary;
assert.strictEqual(chain.step, 1, "首次有效行动应建立第1段剧情");
assert.strictEqual(chain.next.recommendedAction, "habitat", "第2段剧情应明确要求修复栖息地");
assert(primary && primary.recommendedAction, "章节主题完成后仍应给出可执行的下一目标");
assert(actionExecutable(state, primary.recommendedAction), "下一目标必须可以直接执行");

state = run("修复水源和草场", state);
assert.strictEqual(state.world.reserve.eventChain.step, 1, "剧情间隔期不应连续弹出下一段");

state = run("修复水源和草场", state);
state = run("修复水源和草场", state);
chain = state.world.reserve.eventChain;
assert.strictEqual(chain.step, 2, "满足间隔和水源条件后应推进第2段剧情");

for (let index = 0; index < 10; index += 1) {
  state.world.reserve.fund = 10000;
  state.world.reserve.supplies.dogFood = 10;
  state.world.reserve.supplies.alarm = 6;
  state = run(index % 2 ? "派猎犬侦察：确认边界脚印" : "驱赶偷猎者：封锁可疑路线", state);
}
chain = state.world.reserve.eventChain;
assert.strictEqual(chain.step, 2, "前半章剧情不得越过本阶段2段上限");
assert(chain.stageBound && /其余晋级条件/.test(chain.waitingText || ""), "剧情暂停必须给出明确晋级说明");
primary = view(state).primary;
assert(!primary.themeTask, "本阶段内部剧情暂停后，不应再占用本章主题卡");

const prepared = supply(createCharacter(null, "剧情资源恢复"));
prepared.world.reserve.progression = Object.assign({}, prepared.world.reserve.progression, {
  stage: 7,
  displayChapter: 7,
  level: 4,
  objectives: [
    { id: "chapterStory", label: "阶段剧情", current: 2, target: 7, unit: "段", complete: false },
    { id: "actions", label: "有效经营操作", current: 7, target: 7, unit: "次", complete: true }
  ]
});
completeTheme(prepared, 7);
prepared.world.reserve.eventChain = {
  chapterLevel: 4,
  step: 2,
  length: 7,
  completed: false,
  next: {
    title: "坏脚印：方向改变",
    prompt: "把偷猎压力压到50以下。",
    recommendedAction: "antiPoacher",
    validActions: ["antiPoacher", "houndScout"]
  }
};
const guidance = eventStepGuidance(prepared.world.reserve, 3);
assert.strictEqual(guidance.recommendedAction, "antiPoacher", "资源不足时内部剧情仍应保留驱赶动作");
assert(guidance.validActions.includes("antiPoacher"), "内部剧情有效动作必须包含驱赶偷猎");

delete prepared.world.reserve.eventChain.next.recommendedAction;
delete prepared.world.reserve.eventChain.next.validActions;
const legacy = eventStepGuidance(prepared.world.reserve, 3);
assert(["antiPoacher", "houndScout"].includes(legacy.recommendedAction), "旧存档第3段应恢复为侦察/驱赶动作");
assert(legacy.validActions.includes(legacy.recommendedAction), "旧存档恢复动作必须属于剧情有效集合");

for (let stage = 1; stage <= 20; stage += 1) {
  const gate = progressionGate(stage);
  const startStep = gate.storyBeats >= 5 && stage % 2 === 0 ? 2 : 0;
  for (let step = startStep; step < gate.storyBeats; step += 1) {
    const fixture = supply(createCharacter(null, `第${stage}章第${step + 1}段`));
    const reserve = fixture.world.reserve;
    const stepGuidance = eventStepGuidance(reserve, step + 1);
    reserve.progression = Object.assign({}, reserve.progression, {
      stage,
      displayChapter: stage,
      level: gate.storyLevel,
      objectives: [
        { id: "chapterStory", label: "阶段剧情", current: step, target: gate.storyBeats, unit: "段", complete: false },
        { id: "actions", label: "有效经营操作", current: gate.actions, target: gate.actions, unit: "次", complete: true }
      ]
    });
    reserve.eventChain = {
      chapterLevel: gate.storyLevel,
      step,
      length: 7,
      completed: false,
      next: Object.assign({ title: `第${step + 1}段`, prompt: `推进第${step + 1}段剧情。` }, stepGuidance)
    };
    const matrixGoals = resolveGoals(fixture, fixture.world.goals, `stage_${stage}_step_${step + 1}`);
    const matrixPrimary = matrixGoals.active.primary;
    assert(matrixPrimary.themeTask, `第${stage}章应优先显示章节主题任务，而不是通用剧情任务`);
    assert(actionExecutable(fixture, matrixPrimary.recommendedAction), `第${stage}章主题任务动作不可执行`);
  }
}

console.log("task/story alignment check ok");
