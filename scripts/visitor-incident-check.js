const assert = require("assert");
const { createReserveState } = require("../js/world");
const { Game } = require("../js/game");
const { worldEventDefinition } = require("../js/worldEventSystem");
const { advanceIdleEmergency } = require("../js/simulator");
const { createGoalState, normalizeGoalState, resolveGoals } = require("../js/goalSystem");
const { buildReserveView } = require("../js/reserveView");

const definition = worldEventDefinition("visitor_conflict");
assert(definition && definition.recommendedAction === "visitorAdjust", "游客事件不得回退到猎犬巡逻");
assert.strictEqual(definition.responses.length, 1, "游客事件只保留调节现场入口");
assert.strictEqual(definition.responses[0].action, "visitorAdjust");

const reserve = createReserveState();
reserve.development.operations.today = {
  day: 1,
  visitors: 20,
  income: 100,
  trouble: "游客离开观察线"
};
reserve.emergency.active = {
  id: "visitor_conflict_test",
  type: "visitor_conflict",
  title: definition.title,
  regionId: "river",
  visualKind: "visitor-conflict",
  impact: definition.impact,
  recommendedAction: "visitorAdjust",
  progress: 0,
  target: 1,
  daysRemaining: 1,
  responses: definition.responses
};

const goalState = { world: { reserve } };
const goalResult = resolveGoals(goalState, null, "visitor-test");
assert(goalResult.active.primary, "游客事件必须生成当前目标");
assert.strictEqual(goalResult.active.primary.recommendedAction, "visitorAdjust", "游客目标不得推荐猎犬侦察");
assert.strictEqual(goalResult.active.primary.executable, true, "游客调节目标必须可执行");
reserve.emergency.active.recommendedAction = "houndScout";
const migratedEventGoals = resolveGoals(goalState, null, "visitor-legacy-test");
assert.strictEqual(migratedEventGoals.active.primary.recommendedAction, "visitorAdjust", "旧游客事件字段也必须迁移为调节现场");
reserve.emergency.active.recommendedAction = "visitorAdjust";

const blockedEmergencyState = { world: { reserve: createReserveState() } };
blockedEmergencyState.world.reserve.supplies.dogFood = 0;
blockedEmergencyState.world.reserve.ecology.grass = 40;
blockedEmergencyState.world.reserve.emergency.active = {
  id: "neighbor_dispute_blocked",
  type: "neighbor_animal_dispute",
  title: "外区转运动物归属争议",
  recommendedAction: "houndScout",
  progress: 0,
  target: 3,
  daysRemaining: 2,
  responses: [{ action: "houndScout", gain: 2 }]
};
const blockedEmergencyGoals = resolveGoals(blockedEmergencyState, null, "blocked-emergency-test");
assert.strictEqual(blockedEmergencyGoals.active.primary.kind, "crisis", "缺少猎犬物资时紧急事件仍必须保持主任务");
assert.strictEqual(blockedEmergencyGoals.active.primary.recommendedAction, "houndScout", "紧急事件不能被无关的修复任务替换");
blockedEmergencyState.world.goals = createGoalState(blockedEmergencyState);
blockedEmergencyState.world.goals.active.primary = {
  id: "ecology-risk:grass",
  kind: "recovery",
  recommendedAction: "habitat",
  executable: true
};
blockedEmergencyState.world.goals.active.generatedAtAction = blockedEmergencyState.world.reserve.progression.totalActions || 0;
const staleGoalGame = Object.create(Game.prototype);
staleGoalGame.state = blockedEmergencyState;
const refreshedGoalView = staleGoalGame.currentGoalView();
assert.strictEqual(refreshedGoalView.primary.kind, "crisis", "已有旧主任务时出现紧急事件也必须立即刷新为危机任务");

const routeGame = Object.create(Game.prototype);
routeGame.state = goalState;
routeGame.infoDetailModal = null;
routeGame.openVisitorIncidentDice = function openVisitorIncidentDice(marker) {
  this.routedVisitorMarker = marker;
  return true;
};
routeGame.openReserveViewAction = function openReserveViewAction() {
  throw new Error("visitorAdjust must never enter the patrol task route");
};
assert(routeGame.executeGoalAction(goalResult.active.primary), "游客目标点击必须成功路由");
assert(routeGame.routedVisitorMarker && routeGame.routedVisitorMarker.recommendAction === "visitorAdjust", "游客目标必须直接打开调节入口");

const staleGoalState = { world: { reserve: createReserveState() } };
const staleGoals = createGoalState(staleGoalState);
staleGoals.daily.objectives[0] = Object.assign({}, staleGoals.daily.objectives[0], { recommendedAction: "visitorAdjust", buttonLabel: "调节游客现场" });
const migratedGoals = normalizeGoalState(staleGoals, staleGoalState);
assert.notStrictEqual(migratedGoals.daily.objectives[0].recommendedAction, "visitorAdjust", "游客事件结束后旧的每日游客目标必须迁移");

const game = Object.create(Game.prototype);
game.state = { world: { reserve } };
game.render = () => {};
game.playSfx = () => {};
game.toast = () => {};
game.dismissInfoDetailModal = function dismiss() { this.infoDetailModal = null; };
assert(game.openVisitorIncidentDice({ type: "visitorIncident" }), "游客现场标记必须能打开调节弹窗");
const originalRandom = Math.random;
Math.random = () => 0.5;
// Shooting now scores the compass at release time, not Math.random().
game.archeryScoreFor = () => 4;
const outcome = game.resolveVisitorIncidentDice();
Math.random = originalRandom;
assert(outcome && outcome.kind === "resolved", "骰面4应判定为调节成功");
assert.strictEqual(game.infoDetailModal.phase, "rolling", "游客事件结果必须等待骰子动画结束后显示");
assert.strictEqual(reserve.emergency.active, null, "处理完成后必须清除现场事件");
assert.strictEqual(reserve.development.operations.today.visitors, 20, "成功调节不应减少游客");

const failedReserve = createReserveState();
failedReserve.development.operations.today = { day: 1, visitors: 20, income: 100, trouble: "游客越线" };
failedReserve.emergency.active = Object.assign({}, reserve.emergency.active, {
  id: "visitor_conflict_fail",
  type: "visitor_conflict",
  title: definition.title,
  recommendedAction: "visitorAdjust",
  target: 1,
  progress: 0,
  daysRemaining: 1
});
const failedGame = Object.create(Game.prototype);
failedGame.state = { world: { reserve: failedReserve } };
failedGame.render = () => {};
failedGame.playSfx = () => {};
failedGame.toast = () => {};
failedGame.dismissInfoDetailModal = function dismiss() { this.infoDetailModal = null; };
failedGame.openVisitorIncidentDice({ type: "visitorIncident" });
Math.random = () => 0.1;
failedGame.archeryScoreFor = () => 1;
const failedOutcome = failedGame.resolveVisitorIncidentDice();
Math.random = originalRandom;
assert(failedOutcome && failedOutcome.kind === "failed", "骰面1应判定为调节失败");
assert(failedReserve.development.operations.today.visitors < 20, "调节失败必须减少当前游客");
assert(failedReserve.development.operations.today.income < 100, "调节失败必须减少今日收入");
assert.strictEqual(failedReserve.development.operations.today.trouble, "尚无明显麻烦", "处理结束后必须清除重复游客标记");

const view = buildReserveView(failedReserve, failedReserve, { action: "houndScout", day: 1 });
assert(!view.mapMarkers.some((marker) => marker.recommendAction === "houndScout" && marker.title === definition.title), "游客事件不能生成旧猎犬处理入口");

const legacyReserve = createReserveState();
legacyReserve.development.operations.today = { day: 4, visitors: 16, income: 80, trouble: "旧存档游客越线" };
legacyReserve.emergency.active = null;
const legacyView = buildReserveView(legacyReserve, legacyReserve, { action: "habitat", day: 4 });
const legacyMarker = legacyView.mapMarkers.find((marker) => marker.title === "游客现场需要处置");
assert(legacyMarker && legacyMarker.type === "visitorIncident" && legacyMarker.recommendAction === "visitorAdjust", "旧游客麻烦必须迁移到独立调节入口");
const legacyGame = Object.create(Game.prototype);
legacyGame.state = { world: { reserve: legacyReserve } };
legacyGame.render = () => {};
legacyGame.playSfx = () => {};
legacyGame.toast = () => {};
legacyGame.dismissInfoDetailModal = function dismiss() { this.infoDetailModal = null; };
legacyGame.openMapMarkerDetail(legacyMarker);
assert(legacyGame.infoDetailModal && legacyGame.infoDetailModal.kind === "visitorIncidentDice", "旧游客事件不能再打开猎犬巡护弹窗");

const mixedReserve = createReserveState();
mixedReserve.development.operations.today = { day: 4, visitors: 16, income: 80, trouble: "旧存档游客越线" };
mixedReserve.emergency.active = {
  id: "wildfire_keep",
  type: "wildfire",
  title: "旱季雷火蔓延",
  progress: 1,
  target: 4,
  daysRemaining: 2
};
const mixedGame = Object.create(Game.prototype);
mixedGame.state = { world: { reserve: mixedReserve } };
mixedGame.render = () => {};
mixedGame.playSfx = () => {};
mixedGame.toast = () => {};
mixedGame.dismissInfoDetailModal = function dismiss() { this.infoDetailModal = null; };
mixedGame.openVisitorIncidentDice({ type: "visitorIncident" });
const mixedRandom = Math.random;
Math.random = () => 0.5;
mixedGame.resolveVisitorIncidentDice();
Math.random = mixedRandom;
assert.strictEqual(mixedReserve.emergency.active.type, "wildfire", "处理旧游客问题不得覆盖其他紧急事件");

// 空闲事件不能把默认的“尚无明显麻烦”当成游客问题，也必须遵守游客频率限制。
const idleReserve = createReserveState();
idleReserve.progression = Object.assign({}, idleReserve.progression, {
  totalActions: 100,
  totalMeaningfulActions: 100
});
idleReserve.development.operations.today = {
  day: 1,
  visitors: 20,
  income: 100,
  trouble: "尚无明显麻烦"
};
idleReserve.emergency = Object.assign({}, idleReserve.emergency, { active: null, idleNextAt: Date.now() - 1 });
const idleNoTrouble = advanceIdleEmergency(idleReserve, { name: "雨季" }, Date.now(), () => 0.01);
assert(!idleNoTrouble || idleNoTrouble.type !== "visitor_conflict", "默认无问题状态不得生成游客事件");

const cadenceReserve = createReserveState();
cadenceReserve.progression = Object.assign({}, cadenceReserve.progression, {
  stage: 2,
  level: 2,
  totalActions: 100,
  totalMeaningfulActions: 100
});
cadenceReserve.development.operations.today = {
  day: 1,
  visitors: 20,
  income: 100,
  trouble: "入口拥挤，出现排队与遗留物"
};
cadenceReserve.emergency = Object.assign({}, cadenceReserve.emergency, {
  active: null,
  cooldown: 0,
  visitorCooldown: 0,
  lastVisitorTriggerAction: 0,
  idleNextAt: Date.now() - 1
});
const idleVisitor = advanceIdleEmergency(cadenceReserve, { name: "雨季" }, Date.now(), () => 0.01);
assert(idleVisitor && idleVisitor.type === "visitor_conflict", "真实游客问题应能触发游客事件");
cadenceReserve.emergency.active = null;
cadenceReserve.emergency.idleNextAt = Date.now() - 1;
cadenceReserve.emergency.visitorCooldown = 8;
const cooldownBlocked = advanceIdleEmergency(cadenceReserve, { name: "雨季" }, Date.now(), () => 0.01);
assert.strictEqual(cooldownBlocked, null, "游客事件冷却期间不得再次触发");
cadenceReserve.emergency.visitorCooldown = 0;
cadenceReserve.progression.totalActions = 111;
cadenceReserve.progression.totalMeaningfulActions = 111;
cadenceReserve.emergency.idleNextAt = Date.now() - 1;
const cadenceBlocked = advanceIdleEmergency(cadenceReserve, { name: "雨季" }, Date.now(), () => 0.01);
assert.strictEqual(cadenceBlocked, null, "游客事件未满12次行动间隔不得再次触发");
cadenceReserve.progression.totalActions = 112;
cadenceReserve.progression.totalMeaningfulActions = 112;
cadenceReserve.emergency.idleNextAt = Date.now() - 1;
const cadenceAllowed = advanceIdleEmergency(cadenceReserve, { name: "雨季" }, Date.now(), () => 0.01);
assert(cadenceAllowed && cadenceAllowed.type === "visitor_conflict", "满足12次行动间隔后游客事件可再次触发");
console.log("visitor incident check ok");
