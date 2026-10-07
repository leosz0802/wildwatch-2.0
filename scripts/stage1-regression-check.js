const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createCharacter } = require("../js/storage");
const { simulateDay, updateReserveEmergency } = require("../js/simulator");
const { chapterEconomy } = require("../js/balanceConfig");
const { consumeVisitorRecruitment } = require("../js/visitorRecruitment");
const { visitorContributionRate } = require("../js/eventEconomy");
const { maybePrepareStrategicDilemma, strategicDilemmaById } = require("../js/strategySystem");
const { developmentBuildingView, DEVELOPMENT_BUILDING_PROFILES } = require("../js/reserveDevelopment");

const state = createCharacter(null, "保护区卫士");
const economy = chapterEconomy(state.world.reserve);
assert.strictEqual(economy.habitatCost, 90, "第一章栖息地成本应为90");
assert.strictEqual(economy.interventionCost, 115, "第一章生态干预成本应为115");

const commands = ["沿河岸追踪脚印", "修复水源并恢复草场", "沿河岸追踪脚印", "修复水源并恢复草场"];
let lastResult = null;
for (const command of commands) {
  lastResult = simulateDay(command, state);
  state.world = lastResult.world;
  state.character = lastResult.character;
}
const reserve = state.world.reserve;
assert.strictEqual(reserve.progression.totalActions, 4, "第一阶段应完成4次有效行动");
assert(reserve.fund >= 300, "四次行动后基金应保留至少300");
assert(lastResult.visual.actionFundCost && lastResult.visual.actionFundCost.cost === economy.habitatCost, "行动结算应暴露统一基金成本");
assert(lastResult.visual.strategicDilemma && lastResult.visual.strategicDilemma.id === "patrol_split", "第4次行动后应出现唯一轻策略");

const recruitmentBefore = reserve.fund;
const contributionBeforeRecruitment = visitorContributionRate(reserve);
const recruitment = consumeVisitorRecruitment(reserve, 1, () => 0.5);
assert(recruitment.ok, "第一阶段招募必须可执行");
assert(recruitment.visitors >= 8 && recruitment.visitors <= 48, "首次招募应遵循第一章8–48名动态客流区间");
assert.strictEqual(recruitment.income, Math.round(recruitment.visitors * contributionBeforeRecruitment.rate), "首次招募收入应遵循当前游客消费贡献公式");
assert.strictEqual(reserve.fund - recruitmentBefore, recruitment.income, "招募入账必须与实际收入一致");
assert(reserve.fund > recruitmentBefore, "招募必须真实增加保护基金");
const contribution = visitorContributionRate(reserve);
assert(contribution.activity * 100 >= 10 && contribution.activity * 100 <= 90, "活跃度必须处于10–90%区间");
assert(contribution.retention * 100 >= 10 && contribution.retention * 100 <= 90, "留存必须处于10–90%区间");

const eventReserve = createCharacter(null, "保护区卫士").world.reserve;
eventReserve.progression.stage = 1;
eventReserve.progression.level = 1;
eventReserve.progression.totalActions = 3;
eventReserve.progression.totalMeaningfulActions = 3;
eventReserve.progression.chapterActions = 2;
eventReserve.development.operations.recruitment.totalRecruited = 12;
eventReserve.development.operations.today.recruitedVisitors = 12;
eventReserve.development.operations.today.visitors = 2;
eventReserve.emergency = { active: null, cooldown: 0, visitorCooldown: 0, neighborCooldown: 0, history: [], lastOutcome: null };
const started = updateReserveEmergency(eventReserve, "habitat", { name: "雨季" });
assert(started && started.type === "visitor_conflict", "招募后第3次行动应触发一次游客事件");
assert(eventReserve.emergency.stageOneVisitorTriggered, "第一阶段游客事件应记录为已触发");
const stageOneNeighbor = createCharacter(null, "保护区卫士").world.reserve;
stageOneNeighbor.progression.stage = 1;
stageOneNeighbor.progression.level = 1;
stageOneNeighbor.progression.totalActions = 3;
stageOneNeighbor.progression.totalMeaningfulActions = 3;
stageOneNeighbor.progression.chapterActions = 2;
stageOneNeighbor.development.operations.recruitment.totalRecruited = 12;
stageOneNeighbor.development.operations.today.recruitedVisitors = 12;
stageOneNeighbor.development.operations.today.visitors = 2;
stageOneNeighbor.emergency = { active: null, cooldown: 0, visitorCooldown: 0, neighborCooldown: 0, history: [], lastOutcome: null };
const noNeighbor = updateReserveEmergency(stageOneNeighbor, "habitat", { name: "雨季" });
assert(!noNeighbor || !/neighbor/.test(noNeighbor.type || ""), "第一阶段不得生成相邻保护区可操作事件");

const strategyReserve = createCharacter(null, "保护区卫士").world.reserve;
strategyReserve.progression.stage = 1;
strategyReserve.progression.level = 1;
strategyReserve.progression.totalActions = 3;
strategyReserve.strategy.totalMeaningfulActions = 3;
assert(!maybePrepareStrategicDilemma(strategyReserve, { meaningfulActions: 3, totalActions: 3 }, () => 0), "第4次行动前不得弹出策略");
strategyReserve.progression.totalActions = 4;
strategyReserve.strategy.totalMeaningfulActions = 4;
const pending = maybePrepareStrategicDilemma(strategyReserve, { meaningfulActions: 4, totalActions: 4 }, () => 0);
assert(pending && strategicDilemmaById(pending.id).id === "patrol_split", "第一阶段策略应固定为巡护分线");

const developmentView = developmentBuildingView(reserve, "river_shallows", 1);
assert(developmentView.level <= 9 && developmentView.nextUpgradeCost >= 0, "建筑等级和升级成本必须在1–9级路径内");
Object.keys(DEVELOPMENT_BUILDING_PROFILES).forEach((id) => {
  const costs = DEVELOPMENT_BUILDING_PROFILES[id].upgradeCosts || [];
  assert.strictEqual(costs.length, 10, `${id}必须提供0→9级的完整升级成本`);
  assert(costs.slice(1).every((cost) => cost > 0), `${id}的1–9级升级成本必须为正数`);
  assert(costs.slice(1).every((cost, index, list) => index === 0 || cost > list[index - 1]), `${id}升级基金必须逐级上升`);
  const levelOne = costs[2];
  const levelNine = costs[9];
  const ratio = levelNine / levelOne;
  assert(ratio >= 10 && ratio <= 12, `${id}第9级基金必须是第1级的10–12倍，当前${ratio.toFixed(2)}`);
});
const source = fs.readFileSync(path.join(__dirname, "../js/game.js"), "utf8");
assert(source.includes("resourceShortfall"), "资源不足必须使用可关闭弹窗");
assert(source.includes("openMissingResourceRoute"), "资源不足弹窗必须提供补给入口");
console.log("stage 1 regression check ok");
