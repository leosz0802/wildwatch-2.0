const assert = require("assert");
const { createReserveState } = require("../js/world");
const { Game } = require("../js/game");
const { worldEventDefinition, isVisitorArcheryEvent, visitorArcherySuccess, VISITOR_ARCHERY_THRESHOLD } = require("../js/worldEventSystem");
const { advanceIdleEmergency, updateReserveEmergency, simulateDay } = require("../js/simulator");
const { createCharacter } = require("../js/storage");
const { createGoalState, normalizeGoalState, resolveGoals } = require("../js/goalSystem");
const { buildReserveView } = require("../js/reserveView");
const { livingAnimalTotal } = require("../js/chapterRescueSystem");
const { CHAPTERS } = require("../js/animalWorld");

const definition = worldEventDefinition("visitor_conflict");
assert(definition && definition.recommendedAction === "visitorAdjust", "游客事件不得回退到猎犬巡逻");
assert.strictEqual(definition.responses.length, 1, "游客事件只保留调节现场入口");
assert.strictEqual(definition.responses[0].action, "visitorAdjust");
assert.strictEqual(VISITOR_ARCHERY_THRESHOLD, 3, "游客冲突射箭成功线必须是3点");
assert(isVisitorArcheryEvent("visitor_conflict"));
assert(isVisitorArcheryEvent("visitor_litter"), "游客遗留物事件必须进入射箭处置");
assert(isVisitorArcheryEvent("visitor_queue"), "游客排队冲突必须进入射箭处置");
assert(visitorArcherySuccess(3) && visitorArcherySuccess(6), "3点及以上必须是正向结果");
assert(!visitorArcherySuccess(1) && !visitorArcherySuccess(2), "1、2点必须是负向结果");
assert(/射箭/.test(definition.responses[0].preview), "游客冲突必须说明用射箭判定");

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
assert.strictEqual(blockedEmergencyGoals.active.primary.recommendedAction, "neighborExchange", "邻区争议必须保持邻区交换入口，不能被无关的修复任务替换");
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
staleGoals.daily.objectives = [{ id: "daily_visitor", kind: "visitor", recommendedAction: "visitorAdjust", buttonLabel: "调节游客现场", progress: 0, target: 1, complete: false }];
const migratedGoals = normalizeGoalState(staleGoals, staleGoalState);
assert.equal(migratedGoals.daily.objectives.length, 0, "旧的每日游客目标必须删除，不能迁回沙盘");

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
const animalsBeforeSuccess = livingAnimalTotal(reserve);
const outcome = game.resolveVisitorIncidentDice();
Math.random = originalRandom;
assert(outcome && outcome.kind === "resolved", "骰面4应判定为调节成功");
assert.strictEqual(game.infoDetailModal.phase, "resolved", "游客事件必须直接停在确认得分页");
assert.strictEqual(game.infoDetailModal.actionLabel, "确认得分", "游客事件必须手动确认得分");
assert.strictEqual(reserve.emergency.active, null, "处理完成后必须清除现场事件");
assert(reserve.development.operations.today.visitors >= 20, "成功调节不应减少游客");
assert(livingAnimalTotal(reserve) > animalsBeforeSuccess, "游客事件正向结果必须同时增加动物");

const thresholdReserve = createReserveState();
thresholdReserve.development.operations.today = { day: 1, visitors: 20, income: 100, trouble: "游客越线" };
thresholdReserve.emergency.active = Object.assign({}, reserve.emergency.active, {
  id: "visitor_conflict_threshold_ok",
  type: "visitor_conflict",
  title: definition.title,
  recommendedAction: "visitorAdjust",
  target: 1,
  progress: 0,
  daysRemaining: 1
});
const thresholdGame = Object.create(Game.prototype);
thresholdGame.state = { world: { reserve: thresholdReserve } };
thresholdGame.render = () => {};
thresholdGame.playSfx = () => {};
thresholdGame.toast = () => {};
thresholdGame.dismissInfoDetailModal = function dismiss() { this.infoDetailModal = null; };
thresholdGame.openVisitorIncidentDice({ type: "visitorIncident" });
thresholdGame.archeryScoreFor = () => 3;
const thresholdOutcome = thresholdGame.resolveVisitorIncidentDice();
assert(thresholdOutcome && thresholdOutcome.kind === "resolved", "射箭3点必须是正向结果");
assert.strictEqual(thresholdReserve.emergency.active, null, "3点正向后必须清掉游客冲突");

const twoPointReserve = createReserveState();
twoPointReserve.development.operations.today = { day: 1, visitors: 20, income: 100, trouble: "游客越线" };
twoPointReserve.emergency.active = {
  id: "visitor_conflict_threshold_fail",
  type: "visitor_conflict",
  title: definition.title,
  recommendedAction: "visitorAdjust",
  target: 1,
  progress: 0,
  daysRemaining: 1
};
const twoPointGame = Object.create(Game.prototype);
twoPointGame.state = { world: { reserve: twoPointReserve } };
twoPointGame.render = () => {};
twoPointGame.playSfx = () => {};
twoPointGame.toast = () => {};
twoPointGame.dismissInfoDetailModal = function dismiss() { this.infoDetailModal = null; };
twoPointGame.openVisitorIncidentDice({ type: "visitorIncident" });
twoPointGame.archeryScoreFor = () => 2;
const twoPointOutcome = twoPointGame.resolveVisitorIncidentDice();
assert(twoPointOutcome && twoPointOutcome.kind === "failed", "射箭2点必须是负向结果");
assert.strictEqual(twoPointOutcome.title, "游客冲突引发投诉", "负向结果必须是投诉而不是猎犬巡逻");
assert(twoPointReserve.development.operations.today.visitors < 20, "1–2点负向必须减少当前游客");

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
assert(legacyGame.infoDetailModal && legacyGame.infoDetailModal.kind === "visitorIncidentDice", "游客标记必须直接打开射箭判定");

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

const patrolState = createCharacter(null, "游客冲突不得走猎犬");
patrolState.world.reserve.emergency = {
  active: {
    id: "visitor_conflict_patrol_skip",
    type: "visitor_conflict",
    title: definition.title,
    recommendedAction: "houndScout",
    progress: 0,
    target: 1,
    daysRemaining: 1,
    responses: definition.responses
  },
  cooldown: 0,
  visitorCooldown: 0,
  history: []
};
patrolState.world.reserve.supplies = Object.assign({}, patrolState.world.reserve.supplies, { dogFood: 8, alarm: 4, fieldKit: 4 });
const afterPatrol = simulateDay("派猎犬侦察：确认边界脚印", patrolState);
assert(afterPatrol.world.reserve.emergency.active, "猎犬巡逻不得把游客冲突直接结算成投诉");
assert.strictEqual(afterPatrol.world.reserve.emergency.active.type, "visitor_conflict");
assert.strictEqual(afterPatrol.world.reserve.emergency.active.progress, 0, "猎犬巡逻不得推进游客冲突进度");
const stillActive = updateReserveEmergency(afterPatrol.world.reserve, "houndScout", { name: "雨季" });
assert.strictEqual(stillActive, null, "猎犬行动不得作为游客冲突的结果判定");
assert(afterPatrol.world.reserve.emergency.active && afterPatrol.world.reserve.emergency.active.type === "visitor_conflict");

const archeryResolve = updateReserveEmergency(afterPatrol.world.reserve, "visitorAdjust", { name: "雨季" }, true);
assert(archeryResolve && archeryResolve.kind === "resolved", "射箭调节必须能正向结束游客冲突");

const hijackReserve = createReserveState();
hijackReserve.emergency.active = {
  id: "visitor_conflict_hijack",
  type: "visitor_conflict",
  title: definition.title,
  recommendedAction: "houndScout",
  progress: 0,
  target: 1,
  daysRemaining: 1
};
const hijackGame = Object.create(Game.prototype);
hijackGame.state = { world: { reserve: hijackReserve } };
hijackGame.infoDetailModal = null;
hijackGame.openVisitorIncidentDice = function openVisitorIncidentDice() {
  this.openedVisitorArchery = true;
  this.infoDetailModal = { kind: "visitorIncidentDice", phase: "ready" };
  return true;
};
hijackGame.openReserveViewAction = function openReserveViewAction() {
  throw new Error("visitor conflict crisis cards must not open hound patrol");
};
assert(hijackGame.executeGoalAction({ id: "crisis:visitor", kind: "crisis", recommendedAction: "houndScout" }), "旧的猎犬危机卡也必须改走射箭");
assert(hijackGame.openedVisitorArchery, "游客冲突必须打开射箭判定");

const duplicateReserve = createReserveState();
duplicateReserve.development.operations.today = { day: 3, visitors: 21, income: 80, trouble: "入口拥挤，出现排队与遗留物" };
duplicateReserve.emergency.active = {
  id: "visitor_litter_dup",
  type: "visitor_litter",
  title: "游客遗留物进入草场",
  visualKind: "visitor-conflict",
  recommendedAction: "visitorAdjust",
  regionId: "meadow",
  progress: 0,
  target: 1,
  daysRemaining: 1,
  responses: [{ action: "visitorAdjust" }]
};
const duplicateView = buildReserveView(duplicateReserve, duplicateReserve, { day: 3 });
assert.strictEqual(
  duplicateView.mapMarkers.filter((marker) => marker.type === "visitorIncident" || marker.recommendAction === "visitorAdjust").length,
  1,
  "同一游客任务不得同时生成图形事件和文字型现场标记"
);
assert(!duplicateView.mapMarkers.some((marker) => marker.title === "游客现场需要处置"), "有游客紧急事件时不得再生成文字型游客现场标记");
duplicateReserve.reserveView = {
  mapMarkers: [
    { id: "rv_visitor_trouble", type: "visitorIncident", title: "游客现场需要处置", recommendAction: "visitorAdjust", visualKind: "visitor-conflict" },
    { id: "visitor_litter_dup", type: "visitorIncident", eventType: "visitor_litter", title: "游客遗留物进入草场", recommendAction: "visitorAdjust" }
  ]
};
const leftoverGame = Object.create(Game.prototype);
leftoverGame.state = { world: { reserve: duplicateReserve, mapEvents: duplicateReserve.reserveView.mapMarkers.slice() } };
leftoverGame.render = () => {};
leftoverGame.playSfx = () => {};
leftoverGame.toast = () => {};
leftoverGame.dismissInfoDetailModal = function dismiss() { this.infoDetailModal = null; };
leftoverGame.archeryScoreFor = () => 4;
leftoverGame.openVisitorIncidentDice({ type: "visitorIncident", eventType: "visitor_litter" });
leftoverGame.resolveVisitorIncidentDice();
const leftoverReserve = ((leftoverGame.state.world || {}).reserve) || {};
assert.strictEqual(leftoverReserve.emergency.active, null, "完成后必须清除游客紧急事件");
assert(!(leftoverReserve.reserveView.mapMarkers || []).some((marker) => marker.type === "visitorIncident" || marker.recommendAction === "visitorAdjust"), "完成后文字型游客提示必须一并消失");
assert(!(((leftoverGame.state.world || {}).mapEvents) || []).some((marker) => marker.type === "visitorIncident" || marker.recommendAction === "visitorAdjust"), "完成后地图事件队列不得残留游客提示");

assert.strictEqual(CHAPTERS.length, 11, "主线必须包含11章");
const VISITOR_SANDBOX_TYPES = ["visitor_conflict", "visitor_litter", "visitor_queue"];
function visitorOverlayContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, key) {
      if (key === "measureText") return (value) => ({ width: String(value || "").length * 7 });
      if (key === "createLinearGradient" || key === "createRadialGradient") return () => gradient;
      if (!(key in target)) target[key] = () => {};
      return target[key];
    }
  });
}
function chapterVisitorGame() {
  const game = Object.create(Game.prototype);
  game.ctx = visitorOverlayContext();
  game.animT = () => 1200;
  game.findRegion = (id) => ({ id, x: .52, y: .58 });
  game.mapPoint = (x, y) => ({ x: 180 + x * 20, y: 360 + y * 20 });
  game.addMapRectHit = () => {};
  game.roundRect = () => {};
  game.text = () => {};
  game.drawRangerMapCharacter = () => {};
  game.drawTouristMapCharacter = () => {};
  game.width = 375;
  game.height = 667;
  game.scrollY = 0;
  game.mapViewport = { x: 0, y: 0, w: 375, h: 667 };
  game.render = () => {};
  game.playSfx = () => {};
  game.toast = () => {};
  game.dismissInfoDetailModal = function dismiss() { this.infoDetailModal = null; };
  game.archeryScoreFor = () => 4;
  return game;
}
for (let chapter = 1; chapter <= CHAPTERS.length; chapter += 1) {
  for (const type of VISITOR_SANDBOX_TYPES) {
    const eventDef = worldEventDefinition(type);
    const reserve = createReserveState();
    Object.assign(reserve.progression, {
      stage: chapter,
      displayChapter: chapter,
      level: CHAPTERS[chapter - 1].level
    });
    reserve.development.operations.today = {
      day: chapter,
      visitors: 18 + chapter,
      income: 90 + chapter,
      trouble: "入口拥挤，出现排队与遗留物"
    };
    reserve.emergency.active = {
      id: `${type}_ch${chapter}`,
      type,
      title: eventDef.title,
      visualKind: eventDef.visualKind,
      impact: eventDef.impact,
      recommendedAction: "visitorAdjust",
      regionId: eventDef.regionId || "meadow",
      progress: 0,
      target: 1,
      daysRemaining: 1,
      responses: eventDef.responses
    };
    const view = buildReserveView(reserve, reserve, { day: chapter });
    const visitorPins = view.mapMarkers.filter((marker) => marker.type === "visitorIncident" || marker.recommendAction === "visitorAdjust");
    assert.strictEqual(visitorPins.length, 1, `第${chapter}章 ${type} 不得再生成文字型游客现场标记`);
    assert(!view.mapMarkers.some((marker) => marker.title === "游客现场需要处置"), `第${chapter}章 ${type} 不得保留文字气球任务`);
    const game = chapterVisitorGame();
    game.state = { world: { day: chapter, reserve } };
    assert(!game.mapTaskStoryMarkersForDisplay(game.state.world).some((marker) => game.isVisitorSandboxReminder(marker)), `第${chapter}章 ${type} 沙盘只能保留图形现场，不能再画文字针`);
    game.drawActiveWorldEventOverlay(game.ctx, {
      scale: 1, x: 0, y: 0, w: 375, h: 667,
      worldX: 0, worldY: 0, worldW: 375, worldH: 667
    }, false);
    assert.strictEqual(game.renderedWorldEventOverlay.markerStyle, "graphic", `第${chapter}章 ${type} 必须使用图形化沙盘提醒`);
    assert(game.renderedWorldEventOverlay.features.some((feature) => feature.type === "visitor-zone"), `第${chapter}章 ${type} 必须画出游客现场`);
    assert(!game.renderedWorldEventOverlay.features.some((feature) => feature.type === "event-balloon"), `第${chapter}章 ${type} 不得叠文字气球`);
    assert(game.mapEventBalloonHit && game.mapEventBalloonHit.w > 0, `第${chapter}章 ${type} 图形现场必须可点`);
    game.infoDetailModal = { kind: "worldEventDetail", title: "游客现场需要处置" };
    game.mapEventBalloonHit.onTap();
    assert.strictEqual(game.infoDetailModal && game.infoDetailModal.kind, "visitorIncidentDice", `第${chapter}章 ${type} 点击图形必须直接进入射箭判定`);
    game.infoDetailModal = null;
    game.activeTaskLock = null;
    game.openMapMarkerDetail(visitorPins[0]);
    assert.strictEqual(game.infoDetailModal && game.infoDetailModal.kind, "visitorIncidentDice", `第${chapter}章 ${type} 地图入口不得打开文字任务详情`);
    game.infoDetailModal = null;
    game.activeTaskLock = null;
    assert(game.executeGoalAction({
      id: `crisis:${type}_ch${chapter}`,
      kind: "crisis",
      recommendedAction: "visitorAdjust",
      title: eventDef.title
    }), `第${chapter}章 ${type} 任务入口必须仍能打开射箭判定`);
    assert.strictEqual(game.infoDetailModal.kind, "visitorIncidentDice");
    game.resolveVisitorIncidentDice();
    const after = ((game.state.world || {}).reserve) || {};
    assert.strictEqual(after.emergency.active, null, `第${chapter}章 ${type} 完成后必须清除现场事件`);
    assert.strictEqual(after.development.operations.today.trouble, "尚无明显麻烦", `第${chapter}章 ${type} 完成后必须清除重复游客麻烦`);
    assert(!buildReserveView(after, after, { day: chapter }).mapMarkers.some((marker) => marker.type === "visitorIncident" || marker.recommendAction === "visitorAdjust"), `第${chapter}章 ${type} 完成后沙盘提示必须消失`);
    game.infoDetailModal = { kind: "worldEventDetail", title: "游客现场需要处置" };
    assert.strictEqual(game.openVisitorIncidentDice({ type: "visitorIncident" }), false, `第${chapter}章 ${type} 完成后不得重复处理`);
    assert.strictEqual(game.infoDetailModal, null, `第${chapter}章 ${type} 残留文字详情必须被关掉`);
  }
}

console.log("visitor incident check ok (20 chapters × 3 visitor events)");
