#!/usr/bin/env node
/* Regression coverage for the visitor/ecology/economy/goal loop.
 * This script is intentionally side-effect free: it clones the current save
 * and never calls storage.saveState.
 */
const assert = require("node:assert/strict");
const storage = require("../js/storage");
const simulator = require("../js/simulator");
const visitor = require("../js/visitorRecruitment");
const economy = require("../js/eventEconomy");
const development = require("../js/reserveDevelopment");
const goals = require("../js/goalSystem");

const clone = (value) => JSON.parse(JSON.stringify(value));
const state = clone(storage.loadState());
state.character = Object.assign({}, state.character, {
  role: "warden",
  location: "中央混交林",
  status: "alive"
});
state.world = Object.assign({}, state.world, { day: 1 });
state.world.reserve = clone(state.world.reserve || {});
const reserve = state.world.reserve;
reserve.ecology = Object.assign({ water: 66, grass: 66, disease: 18 }, reserve.ecology);
reserve.safety = Number.isFinite(Number(reserve.safety)) ? reserve.safety : 70;
reserve.poacherPressure = Number.isFinite(Number(reserve.poacherPressure)) ? reserve.poacherPressure : 25;

const healthy = visitor.visitorRecruitmentFactors(clone(reserve));
const crisisReserve = clone(reserve);
crisisReserve.ecology = Object.assign({}, crisisReserve.ecology, { water: 24, grass: 30, disease: 76 });
const crisis = visitor.visitorRecruitmentFactors(crisisReserve);
assert(crisis.environmentFactor < healthy.environmentFactor, "游客环境因子应随水草恶化/疾病上升而下降");
assert.notEqual(crisis.reason, healthy.reason, "游客反馈应说明当前主要生态问题");

const engagement = economy.visitorEngagement(crisisReserve);
assert.equal(typeof engagement.water, "number");
assert.equal(typeof engagement.grass, "number");
assert.equal(typeof engagement.disease, "number");
assert.equal(engagement.risk, "critical");

// 让每个可用节点进入运营态，验证日维护与游客用水能落到账本。
development.normalizeReserveDevelopment(reserve);
for (const node of development.RESERVE_DEVELOPMENT_NODES) {
  const choice = development.choicesForNode(node.id).find((item) => item.kind === "building")
    || development.choicesForNode(node.id)[0];
  const saved = reserve.development.nodes[node.id];
  saved.phase = choice.kind === "temporary" ? "managed" : "operational";
  saved.planId = choice.id;
  saved.buildingLevel = choice.kind === "building" ? 5 : 0;
}
const beforeWater = reserve.ecology.water;
const snapshot = development.reserveOperationsSnapshot(reserve, 2, { weather: "晴" });
assert(snapshot.baseMaintenance >= 3, "基金维护应包含保护区基础维护");
assert(snapshot.visitorServiceMaintenance >= 0, "游客服务维护应可计算");
assert(snapshot.visitorWaterUse >= 0, "游客用水应可计算");
const settled = development.settleReserveDevelopmentDay(reserve, 2, { weather: "晴" });
assert(settled && settled.visitorWater, "游客运营结算应记录用水变化");
if (settled.visitors > 0) assert(settled.visitorWaterUse > 0 && settled.visitorWater.after < beforeWater, "实际到访游客应从水源扣除用水");
assert(reserve.fund >= 0, "基金结算不能出现负数");

// 固定动作跑过完整的生态周期，检查恢复、种群边界与章节目标投影。
let current = state;
const waterSamples = [];
for (let day = 0; day < 120; day += 1) {
  const result = simulator.simulateDay("休息", current);
  current = { world: result.world, character: result.character, messages: result.reports || [] };
  const ecology = current.world.reserve.ecology || {};
  waterSamples.push(Number(ecology.water) || 0);
  assert((Number(ecology.water) || 0) >= 0 && (Number(ecology.water) || 0) <= 100);
  assert((Number(ecology.grass) || 0) >= 0 && (Number(ecology.grass) || 0) <= 100);
  assert((Number(ecology.disease) || 0) >= 0 && (Number(ecology.disease) || 0) <= 100);
}
assert(waterSamples.some((value, index) => index > 0 && value > waterSamples[index - 1]), "长周期内应能观察到水源自然回补");
const goalView = goals.buildGoalView(current, current.world.goals);
assert(goalView.primary && goalView.primary.title, "章节目标卡必须始终有唯一主目标");
assert(goalView.primary.buttonLabel || goalView.primary.action, "主目标必须提供下一步动作入口");

console.log(JSON.stringify({
  ok: true,
  days: 120,
  finalDay: current.world.day,
  finalEcology: current.world.reserve.ecology,
  healthyVisitorFactor: Number(healthy.environmentFactor.toFixed(3)),
  crisisVisitorFactor: Number(crisis.environmentFactor.toFixed(3)),
  visitorWaterUse: settled.visitorWaterUse,
  fund: current.world.reserve.fund,
  primaryGoal: goalView.primary.title
}, null, 2));
