const assert = require("assert");
const { createCharacter } = require("../js/storage");
const { simulateDay } = require("../js/simulator");
const { normalizeGoalState, buildGoalView, actionExecutable } = require("../js/goalSystem");

function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (text) => ({ width: String(text || "").length * 7 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (prop === "canvas") return { width: 375, height: 667 };
      if (!target[prop]) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) { target[prop] = value; return true; }
  });
}

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
  createCanvas: () => ({ width: 375, height: 667, getContext: fakeContext }),
  getStorageSync: () => null,
  setStorageSync() {}, onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, showToast() {}
};

const { Game } = require("../js/game");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function withRandom(value, fn) {
  const original = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = original; }
}

function fullySupplied(name = "任务资源专项") {
  const state = createCharacter(null, name);
  const reserve = state.world.reserve;
  // This pipeline fixture verifies task/resource progression; rescue gates are
  // covered by the chapter-rescue regression suite.
  reserve.chapterRescue = Object.assign({}, reserve.chapterRescue || {}, { enforceCompletion: false });
  reserve.fund = 10000;
  reserve.base.raidTickets = 0;
  reserve.poacherPressure = 60;
  reserve.safety = 65;
  reserve.ecology.water = 55;
  reserve.ecology.grass = 55;
  reserve.supplies = { dogFood: 10, alarm: 5, tranquilizer: 5, fieldKit: 3 };
  reserve.inventory.researchSample = 3;
  state.world.goals = normalizeGoalState(state.world.goals, state, Date.now());
  return state;
}

function suppressGoalRewards(state) {
  const goals = state.world.goals;
  goals.daily.objectives = goals.daily.objectives.map((objective) => Object.assign({}, objective, {
    progress: objective.target,
    complete: true
  }));
  goals.daily.coreClaimed = true;
  goals.daily.fullClaimed = true;
  goals.active = { primary: { id: "test:none", recommendedAction: "observeReserve", executable: true }, alternatives: [], generatedAtAction: 0 };
  return state;
}

function run(command, state, random = 0.99) {
  return withRandom(random, () => simulateDay(command, state));
}

// 入口策略：指标卡不能直接绕路；沙盘信息/任务、动物、物资、收藏才可发起操作。
const routeGame = new Game();
routeGame.stopLoop();
routeGame.render = () => {};
let blockedToast = "";
routeGame.toast = (message) => { blockedToast = message; };
const oldScreen = routeGame.screen;
assert.strictEqual(routeGame.openReserveViewAction("houndScout", "metric-card"), false);
assert.strictEqual(routeGame.screen, oldScreen);
assert(/沙盘信息/.test(blockedToast), "非法指标入口应解释正确的操作入口");
assert.strictEqual(routeGame.openReserveViewAction("houndScout", "sandbox-task"), true);
assert(routeGame.patrolTaskModal && routeGame.patrolTaskModal.id === "houndScout", "沙盘任务应准确打开猎犬侦察");

// A single depleted patrol item must become an explicit supply reminder,
// rather than leaving the same unexecutable patrol task in place.
const shortageState = fullySupplied("单项巡护补给提醒");
shortageState.world.reserve.poacherPressure = 72;
shortageState.world.reserve.supplies.alarm = 0;
shortageState.world.goals = normalizeGoalState(shortageState.world.goals, shortageState, Date.now());
// Resolve from the live state: callers may retain a normalized goal object
// after inventory changes, so the view path must still surface the new
// single-item shortage instead of trusting the stale primary.
const shortageGoal = buildGoalView(shortageState).primary;
assert(shortageGoal && shortageGoal.kind === "recovery" && /补警报器|补齐.*警报器/.test(`${shortageGoal.title}${shortageGoal.body}`), "缺少单项巡护物资时必须显示明确补给任务");

// V3只让玩家管理基金、水源、草场和具体补给。巡护节奏、线索、现场仅保留
// 旧存档字段，任何行动都不得再生产、消耗或用它们阻断任务。
let state = suppressGoalRewards(fullySupplied("三核心资源专项"));
let before = clone(state.world.reserve);
let result = run("派猎犬侦察：确认边界脚印", state);
let reserve = result.world.reserve;
assert.strictEqual(result.visual.actionType, "houndScout");
assert.strictEqual(reserve.supplies.dogFood, before.supplies.dogFood - 1, "猎犬侦察必须消耗1狗粮");
assert(!Object.prototype.hasOwnProperty.call(reserve, "actionPoints") && !Object.prototype.hasOwnProperty.call(reserve, "intel") && !Object.prototype.hasOwnProperty.call(reserve, "fieldPermits"));
assert(!Object.prototype.hasOwnProperty.call(reserve, "actionPoints") && !Object.prototype.hasOwnProperty.call(reserve, "intel") && !Object.prototype.hasOwnProperty.call(reserve, "fieldPermits"));
assert(!Object.prototype.hasOwnProperty.call(reserve, "actionPoints") && !Object.prototype.hasOwnProperty.call(reserve, "intel") && !Object.prototype.hasOwnProperty.call(reserve, "fieldPermits"));
assert(reserve.poacherPressure < before.poacherPressure, "猎犬侦察必须降低真实风险");
assert.strictEqual(reserve.eventChain.step, 1, "第一项有效任务应立即建立剧情事件线");

state = suppressGoalRewards(fullySupplied("采购补给"));
state.world.reserve.supplies.dogFood = 0;
before = clone(state.world.reserve);
result = run("采购狗粮包", state);
reserve = result.world.reserve;
assert.strictEqual(reserve.supplies.dogFood, 4, "采购应加入具体狗粮数量");
assert(reserve.fund < before.fund, "采购必须消耗保护基金");
assert(!Object.prototype.hasOwnProperty.call(reserve, "actionPoints") && !Object.prototype.hasOwnProperty.call(reserve, "intel") && !Object.prototype.hasOwnProperty.call(reserve, "fieldPermits"));

state = suppressGoalRewards(fullySupplied("样本移交"));
result = run("出售研究样本", state);
reserve = result.world.reserve;
assert((reserve.lastSalvageSale || {}).sold.length > 0, "出售任务必须消耗具体库存");
assert(!Object.prototype.hasOwnProperty.call(reserve, "actionPoints") && !Object.prototype.hasOwnProperty.call(reserve, "intel") && !Object.prototype.hasOwnProperty.call(reserve, "fieldPermits"));

state = suppressGoalRewards(fullySupplied("高危驱赶"));
before = clone(state.world.reserve);
result = run("驱赶偷猎者：封锁可疑路线", state);
reserve = result.world.reserve;
assert.strictEqual(reserve.supplies.alarm, before.supplies.alarm - 1);
assert(reserve.poacherPressure < before.poacherPressure, "驱赶应真实降低偷猎压力");
assert(!Object.prototype.hasOwnProperty.call(reserve, "actionPoints") && !Object.prototype.hasOwnProperty.call(reserve, "intel") && !Object.prototype.hasOwnProperty.call(reserve, "fieldPermits"));

state = suppressGoalRewards(fullySupplied("生态干预"));
before = clone(state.world.reserve);
result = run("执行许可内生态干预：麻醉转移过密鹿群", state);
reserve = result.world.reserve;
assert.strictEqual(result.visual.actionType, "intervention");
assert.strictEqual(reserve.supplies.tranquilizer, before.supplies.tranquilizer - 1);
assert(reserve.ecology.grass > before.ecology.grass, "生态干预应改善目标生态数值");
assert.strictEqual(reserve.eventChain.step, 1, "生态干预也必须能建立剧情事件线，不能等待保底推进");
assert(!Object.prototype.hasOwnProperty.call(reserve, "actionPoints") && !Object.prototype.hasOwnProperty.call(reserve, "intel") && !Object.prototype.hasOwnProperty.call(reserve, "fieldPermits"));

const blockedReserve = routeGame.state.world.reserve;
blockedReserve.poacherPressure = 40;
blockedReserve.supplies.alarm = 1;
const blockedAnti = routeGame.actionResourceStatus("antiPoacher", blockedReserve);
assert(blockedAnti.canRun, "废弃字段不存在时不得阻断驱赶；警报器才是明确成本");

// 任务闭环：真实操作推进正确目标，完成后立即生成下一项可执行目标。
state = fullySupplied("任务闭环");
state.world.reserve.poacherPressure = 48;
result = run("派猎犬侦察：推进守护目标", state, 0.05);
state = Object.assign({}, state, { world: result.world, character: result.character, reports: result.reports });
assert.strictEqual(state.world.goals.daily.objectives.find((item) => item.kind === "guard").progress, 1);
result = run("派猎犬侦察：完成守护目标", state, 0.05);
state = Object.assign({}, state, { world: result.world, character: result.character, reports: result.reports });
assert(state.world.goals.daily.objectives.find((item) => item.kind === "guard").complete, "两次守护操作应正确完成守护目标");
result = run("采购医疗包", state, 0.99);
state = Object.assign({}, state, { world: result.world, character: result.character, reports: result.reports });
assert(state.world.goals.daily.objectives.find((item) => item.kind === "economy").complete, "采购应正确完成经营目标");
const nextView = buildGoalView(state, state.world.goals);
assert(nextView.primary && nextView.primary.id && nextView.primary.title, "目标完成后必须立即生成下一目标");
assert(actionExecutable(state, nextView.primary.recommendedAction), `下一目标必须可执行：${nextView.primary.recommendedAction}`);
assert((state.world.goals.history || []).some((item) => item.type === "daily_objective"), "单项任务完成应进入统一历史并推动奖励反馈");

// 剧情节奏与死循环：前半章只播放两段，不能提前透支后半章剧情。
state = fullySupplied("剧情循环");
const commands = [
  "派猎犬侦察：确认边界脚印",
  "采购狗粮包",
  "修复水源和草场",
  "驱赶偷猎者：封锁可疑路线",
  "出售研究样本",
  "执行许可内生态干预：麻醉转移过密鹿群"
];
let previousStep = 0;
let previousAdvanceAction = -99;
for (let index = 0; index < 70; index += 1) {
  const current = state.world.reserve;
  current.fund = Math.max(current.fund || 0, 10000);
  current.supplies.dogFood = Math.max(current.supplies.dogFood || 0, 4);
  current.supplies.alarm = Math.max(current.supplies.alarm || 0, 3);
  current.supplies.tranquilizer = Math.max(current.supplies.tranquilizer || 0, 3);
  current.inventory.researchSample = Math.max(current.inventory.researchSample || 0, 2);
  result = run(commands[index % commands.length], state, 0.31);
  state = Object.assign({}, state, { world: result.world, character: result.character, reports: result.reports });
  const chain = state.world.reserve.eventChain || {};
  assert(chain.step >= previousStep && chain.step <= 7, "剧情步骤不得倒退、跳出范围");
  if (chain.advanced && chain.lastAdvancedAction !== previousAdvanceAction) {
    if (previousAdvanceAction >= 0) assert(chain.lastAdvancedAction - previousAdvanceAction >= 3, "剧情事件之间必须有操作间隔");
    previousAdvanceAction = chain.lastAdvancedAction;
  } else if (!chain.completed) {
    assert(chain.waitingText, "剧情未推进时必须说明下一条件，不能形成假循环");
  }
  previousStep = chain.step || 0;
  ["fund"].forEach((key) => {
    assert(Number.isFinite(state.world.reserve[key]) && state.world.reserve[key] >= 0, `${key}不得为NaN或负数`);
  });
  assert(!Object.prototype.hasOwnProperty.call(state.world.reserve, "actionPoints") && !Object.prototype.hasOwnProperty.call(state.world.reserve, "intel") && !Object.prototype.hasOwnProperty.call(state.world.reserve, "fieldPermits"));
  assert(!Object.prototype.hasOwnProperty.call(state.world.reserve, "actionPoints") && !Object.prototype.hasOwnProperty.call(state.world.reserve, "intel") && !Object.prototype.hasOwnProperty.call(state.world.reserve, "fieldPermits"));
  assert(!Object.prototype.hasOwnProperty.call(state.world.reserve, "actionPoints") && !Object.prototype.hasOwnProperty.call(state.world.reserve, "intel") && !Object.prototype.hasOwnProperty.call(state.world.reserve, "fieldPermits"));
  const view = buildGoalView(state, state.world.goals);
  assert(view.primary && view.primary.recommendedAction, "任意结算后都必须保留下一任务");
}
assert.strictEqual(state.world.reserve.eventChain.step, 2, "前半章只应播放两段剧情，不能提前透支后半章五段内容");
assert(state.world.reserve.eventChain.stageBound, "两段剧情完成后必须明确等待其余晋级条件");
assert(/其余晋级条件/.test(state.world.reserve.eventChain.waitingText || ""), "阶段剧情暂停时必须说明如何继续");

// 补齐前半章的非剧情条件后，下一次有效操作进入后半章并继续第3段，
// 证明阶段边界不是死锁，只是让任务与剧情保持同步。
state.world.reserve.strategy = Object.assign({}, state.world.reserve.strategy || {}, {
  totalChoices: 8,
  totalMajorChoices: 3,
  totalMeaningfulActions: Math.max(80, ((state.world.reserve.progression || {}).totalMeaningfulActions) || 0)
});
state.world.reserve.progression = Object.assign({}, state.world.reserve.progression || {}, {
  totalStrategicChoices: 8,
  totalMajorStrategicChoices: 3,
  totalMeaningfulActions: Math.max(80, ((state.world.reserve.progression || {}).totalMeaningfulActions) || 0),
  totalFundEarned: Math.max(5000, ((state.world.reserve.progression || {}).totalFundEarned) || 0),
  totalMigratedIn: Math.max(20, ((state.world.reserve.progression || {}).totalMigratedIn) || 0),
  totalRareRecovered: Math.max(4, ((state.world.reserve.progression || {}).totalRareRecovered) || 0)
});
state.world.reserve.safety = 90;
state.world.reserve.poacherPressure = 20;
state.world.reserve.ecology.water = 85;
state.world.reserve.ecology.grass = 85;
result = run("驱赶偷猎者：封锁可疑路线", state, 0.99);
state = Object.assign({}, state, { world: result.world, character: result.character, reports: result.reports });
assert((state.world.reserve.progression.stage || 1) >= 2, "补齐其余晋级条件后应进入后半章");
assert((state.world.reserve.eventChain.step || 0) >= 3, "进入后半章后剧情应从第3段继续，不能重置或卡住");

console.log("task/resource pipeline check ok");
