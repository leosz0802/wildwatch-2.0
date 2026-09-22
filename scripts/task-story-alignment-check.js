const assert = require("assert");
const { createCharacter } = require("../js/storage");
const { simulateDay } = require("../js/simulator");
const { buildGoalView, actionExecutable, resolveGoals } = require("../js/goalSystem");
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

let state = supply(createCharacter(null, "任务剧情一致性"));

// 第一次行动建立事件线；随后任务必须复用剧情给出的“修水源”条件。
state = run("派猎犬侦察：确认边界脚印", state);
let chain = state.world.reserve.eventChain;
let primary = view(state).primary;
assert.strictEqual(chain.step, 1, "首次有效行动应建立第1段剧情");
assert.strictEqual(chain.next.recommendedAction, "habitat", "第2段剧情应明确要求修复栖息地");
assert(primary.storyAligned, "剧情未完成时，章节目标必须标记为剧情对齐目标");
assert.strictEqual(primary.recommendedAction, "habitat", "任务按钮必须与剧情要求同为修复栖息地");
assert(/水线|水源|回流/.test(`${primary.title} ${primary.body}`), "任务文案必须解释正在推进哪段剧情");
assert(primary.storyValidActions.includes(primary.recommendedAction), "任务动作必须属于剧情判定接受的动作集合");
assert(actionExecutable(state, primary.recommendedAction), "剧情任务必须可以直接执行");

// 间隔期继续展示同一剧情条件，不能漂移成无关侦察。
state = run("修复水源和草场", state);
primary = view(state).primary;
assert.strictEqual(state.world.reserve.eventChain.step, 1, "剧情间隔期不应连续弹出下一段");
assert.strictEqual(primary.recommendedAction, "habitat", "间隔期任务仍应与下一剧情条件一致");

state = run("修复水源和草场", state);
state = run("修复水源和草场", state);
chain = state.world.reserve.eventChain;
assert.strictEqual(chain.step, 2, "满足间隔和水源条件后应推进第2段剧情");

// 前半章只要求2段，不能继续播放第3段导致后半章剧情被提前消耗。
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
assert(!primary.storyAligned, "本阶段剧情已完成后，目标应自动接棒到其他晋级条件");

// 缺少剧情动作资源时，先给恢复路径；补齐后自动回到剧情动作。
const prepared = supply(createCharacter(null, "剧情资源恢复"));
prepared.world.reserve.progression = Object.assign({}, prepared.world.reserve.progression, {
  stage: 2,
  level: 1,
  objectives: [
    { id: "chapterStory", label: "阶段剧情", current: 2, target: 7, unit: "段", complete: false },
    { id: "actions", label: "有效经营操作", current: 7, target: 7, unit: "次", complete: true }
  ]
});
prepared.world.reserve.eventChain = {
  chapterLevel: 1,
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
prepared.world.reserve.supplies.alarm = 0;
prepared.world.reserve.supplies.dogFood = 0;
let preparedView = resolveGoals(prepared, prepared.world.goals, "story_audit");
let preparedPrimary = preparedView.active.primary;
assert(preparedPrimary.storyAligned, "资源不足时仍应保留剧情上下文");
assert.strictEqual(preparedPrimary.recommendedAction, "buySupplies", "剧情动作缺补给时必须先指向采购恢复路径");
assert(actionExecutable(prepared, preparedPrimary.recommendedAction), "剧情恢复路径必须真实可执行");

// 旧存档只有剧情标题和提示，也必须在首次操作前恢复正确动作映射。
delete prepared.world.reserve.eventChain.next.recommendedAction;
delete prepared.world.reserve.eventChain.next.validActions;
prepared.world.reserve.supplies.alarm = 6;
prepared.world.reserve.supplies.dogFood = 6;
preparedView = resolveGoals(prepared, prepared.world.goals, "legacy_story_audit");
preparedPrimary = preparedView.active.primary;
assert(preparedPrimary.storyAligned, "旧存档剧情目标必须自动恢复对齐信息");
assert(["antiPoacher", "houndScout"].includes(preparedPrimary.recommendedAction), "旧存档第3段应恢复为侦察/驱赶动作");
assert(preparedPrimary.storyValidActions.includes(preparedPrimary.recommendedAction), "旧存档恢复动作必须属于剧情有效集合");

// 二十个经营章节逐项核对，以实际章节配置指定的剧情段数为准；
// 每个未完成节点都必须给出剧情接受且真实可执行的动作。
for (let stage = 1; stage <= 20; stage += 1) {
  const gate = progressionGate(stage);
  const startStep = gate.storyBeats >= 5 && stage % 2 === 0 ? 2 : 0;
  for (let step = startStep; step < gate.storyBeats; step += 1) {
    const fixture = supply(createCharacter(null, `第${stage}章第${step + 1}段`));
    const reserve = fixture.world.reserve;
    const guidance = eventStepGuidance(reserve, step + 1);
    reserve.progression = Object.assign({}, reserve.progression, {
      stage,
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
      next: Object.assign({ title: `第${step + 1}段`, prompt: `推进第${step + 1}段剧情。` }, guidance)
    };
    const matrixGoals = resolveGoals(fixture, fixture.world.goals, `stage_${stage}_step_${step + 1}`);
    const matrixPrimary = matrixGoals.active.primary;
    assert(matrixPrimary.storyAligned, `第${stage}章第${step + 1}段没有成为剧情对齐任务`);
    assert(matrixPrimary.storyValidActions.includes(matrixPrimary.recommendedAction), `第${stage}章第${step + 1}段推荐了剧情不接受的动作 ${matrixPrimary.recommendedAction}`);
    assert(actionExecutable(fixture, matrixPrimary.recommendedAction), `第${stage}章第${step + 1}段动作不可执行`);
  }
}

console.log("task/story alignment check ok");
