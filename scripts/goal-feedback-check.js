const { createInitialWorld } = require("../js/world");
const { simulateDay } = require("../js/simulator");
const { Game } = require("../js/game");

const state = {
  world: createInitialWorld(),
  character: {
    id: "warden",
    role: "warden",
    animalId: "warden",
    species: "卫士",
    animalName: "保护区卫士",
    location: "中央混交林",
    stamina: 82,
    health: 92,
    status: "alive",
    statusText: "正常",
    skills: {},
    inventory: {}
  },
  reports: [],
  messages: []
};

const before = JSON.parse(JSON.stringify(state.world.reserve));
const first = simulateDay("驱赶偷猎者：带白河去西部岩坡洞域排查可疑人影", state);
if ((first.world.goals.daily.progress || 0) !== 1 || first.world.goals.daily.completedPrevious) {
  throw new Error("阶段任务应先累计进度，不能一次操作后立刻完成并刷新");
}
const secondState = Object.assign({}, state, { world: first.world, character: first.character, reports: first.reports });
const second = simulateDay("派猎犬侦察：确认边界直线脚印", secondState);
const result = second;
const after = result.world.reserve;

if (!after.guardianRun || after.guardianRun.completedDays < before.guardianRun.completedDays + 2) {
  throw new Error("多次经营操作没有推进守护挑战");
}

if (!result.visual.guardianRun || typeof result.visual.dailyGoalDone !== "boolean") {
  throw new Error("结算视觉缺少守护挑战信息");
}

if (!result.world.goals.daily || result.world.goals.daily.completedPrevious !== true || result.world.goals.daily.cycle <= state.world.goals.daily.cycle) {
  throw new Error("阶段目标达到要求次数后没有进入下一项任务");
}

const rewardState = result.world.goals.lastReward || after.lastTaskReward || {};
const pendingDelta = Object.values(after.pendingRecovered || {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0)
  - Object.values(before.pendingRecovered || {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
if (!rewardState.rewards && pendingDelta <= 0) {
  throw new Error("完成目标后应该有明确的待收样本或奖励反馈");
}

const game = Object.create(Game.prototype);
game.state = {
  world: result.world,
  character: result.character,
  reports: result.reports,
  messages: []
};
game.speakingAnimalId = "crow_hei";

const modal = game.buildPatrolSettlement(before, after, result, "驱赶偷猎者");
if (!modal.grade || typeof modal.guardianScore !== "number" || !modal.rewards || !modal.rewards.length) {
  throw new Error("结算弹窗缺少评级、守护分或奖励列表");
}
if (!modal.nextHint || !modal.causality) {
  throw new Error("结算弹窗缺少下一步建议或三条因果反馈");
}
if (!modal.causality.statLine || !/原因/.test(modal.causality.statLine)) {
  throw new Error(`结算数值变化应解释实际变化原因，实际: ${modal.causality.statLine}`);
}
if (!/动物/.test(modal.causality.animalLine || "")) {
  throw new Error(`结算动物变化应解释动物状态，实际: ${modal.causality.animalLine}`);
}
if (!/^明日/.test(modal.causality.tomorrowRiskLine || "")) {
  throw new Error(`结算应给出明日风险或机会，实际: ${modal.causality.tomorrowRiskLine}`);
}

console.log("goal feedback check ok");
