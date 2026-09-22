const assert = require("assert");
const { createReserveState } = require("../js/world");
const { Game } = require("../js/game");
const {
  worldEventDefinition,
  isNeighborExchangeEvent,
  neighborExchangeAdvantage,
  NEIGHBOR_EXCHANGE_SELF_MIN,
  NEIGHBOR_EXCHANGE_FAIR_MIN
} = require("../js/worldEventSystem");
const { neighborExchangeShareKey, NEIGHBOR_EXCHANGE_SHARES } = require("../js/eventEconomy");
const { updateReserveEmergency, simulateDay } = require("../js/simulator");
const { createCharacter } = require("../js/storage");
const { resolveGoals } = require("../js/goalSystem");
const { buildReserveView } = require("../js/reserveView");

const definition = worldEventDefinition("neighbor_exchange");
assert(isNeighborExchangeEvent("neighbor_exchange"));
assert(definition && definition.recommendedAction === "neighborExchange", "邻区交换不得回退到猎犬巡逻");
assert.strictEqual(definition.responses.length, 1, "邻区交换只保留射箭入口");
assert.strictEqual(definition.responses[0].action, "neighborExchange");
assert.strictEqual(definition.target, 1);
assert.strictEqual(NEIGHBOR_EXCHANGE_SELF_MIN, 5);
assert.strictEqual(NEIGHBOR_EXCHANGE_FAIR_MIN, 3);
assert.strictEqual(neighborExchangeAdvantage(6), "self");
assert.strictEqual(neighborExchangeAdvantage(5), "self");
assert.strictEqual(neighborExchangeAdvantage(4), "fair");
assert.strictEqual(neighborExchangeAdvantage(3), "fair");
assert.strictEqual(neighborExchangeAdvantage(2), "neighbor");
assert.strictEqual(neighborExchangeAdvantage(1), "neighbor");
assert(/射箭/.test(definition.responses[0].preview), "邻区交换必须说明用射箭判定");
assert(!definition.responses.some((item) => ["houndScout", "habitat", "intervention", "patrol"].includes(item.action)), "邻区交换不得保留猎犬或栖息地入口");

function primedExchangeReserve(id = "neighbor_exchange_test") {
  const reserve = createReserveState();
  reserve.ecology.grass = 50;
  reserve.ecology.disease = 12;
  reserve.inventory.researchSample = 2;
  reserve.pendingRecovered.researchSample = 0;
  reserve.development.operations.today = {
    day: 1,
    visitors: 20,
    recruitedVisitors: 180,
    recruitedIncome: 800,
    income: 800,
    trouble: "尚无明显麻烦"
  };
  reserve.emergency.active = {
    id,
    type: "neighbor_exchange",
    title: definition.title,
    regionId: "center",
    visualKind: "neighbor-exchange",
    impact: definition.impact,
    recommendedAction: "neighborExchange",
    progress: 0,
    target: 1,
    daysRemaining: 1,
    responses: definition.responses
  };
  return reserve;
}

const goalState = { world: { reserve: primedExchangeReserve() } };
const goalResult = resolveGoals(goalState, null, "exchange-test");
assert(goalResult.active.primary, "邻区交换必须生成当前目标");
assert.strictEqual(goalResult.active.primary.recommendedAction, "neighborExchange", "邻区交换目标不得推荐猎犬侦察");
assert.strictEqual(goalResult.active.primary.executable, true, "射箭交换目标必须可执行");
goalState.world.reserve.emergency.active.recommendedAction = "houndScout";
const migratedEventGoals = resolveGoals(goalState, null, "exchange-legacy-test");
assert.strictEqual(migratedEventGoals.active.primary.recommendedAction, "neighborExchange", "旧邻区交换字段也必须迁移为射箭判定");
goalState.world.reserve.emergency.active.recommendedAction = "neighborExchange";

const routeGame = Object.create(Game.prototype);
routeGame.state = goalState;
routeGame.infoDetailModal = null;
routeGame.openNeighborEventDice = function openNeighborEventDice(marker) {
  this.routedExchangeMarker = marker;
  return true;
};
routeGame.openReserveViewAction = function openReserveViewAction() {
  throw new Error("neighborExchange must never enter the patrol task route");
};
assert(routeGame.executeGoalAction(goalResult.active.primary), "邻区交换目标点击必须成功路由");
assert(routeGame.routedExchangeMarker && routeGame.routedExchangeMarker.recommendAction === "neighborExchange", "邻区交换必须直接打开射箭入口");

function settleRoll(roll) {
  const reserve = primedExchangeReserve(`neighbor_exchange_roll_${roll}`);
  const grassBefore = reserve.ecology.grass;
  const sampleBefore = (reserve.pendingRecovered.researchSample || 0) + (reserve.inventory.researchSample || 0);
  const visitorsBefore = reserve.development.operations.today.visitors + reserve.development.operations.today.recruitedVisitors;
  reserve.emergency.pendingArcheryRoll = roll;
  const outcome = updateReserveEmergency(reserve, "neighborExchange", { name: "雨季" }, true);
  assert(outcome && outcome.kind === "resolved", `射箭${roll}点必须完成交换，而不是失败或巡逻`);
  assert.strictEqual(reserve.emergency.active, null, `射箭${roll}点后必须清掉交换事件`);
  assert.strictEqual(outcome.businessChange.exchangeShare, neighborExchangeShareKey(roll));
  assert.strictEqual(outcome.businessChange.grassDelta, NEIGHBOR_EXCHANGE_SHARES[neighborExchangeShareKey(roll)].grass);
  assert.strictEqual(reserve.ecology.grass, grassBefore + outcome.businessChange.grassDelta);
  const sampleAfter = (reserve.pendingRecovered.researchSample || 0) + (reserve.inventory.researchSample || 0);
  assert.strictEqual(sampleAfter - sampleBefore, outcome.businessChange.sampleDelta);
  assert(outcome.businessChange.visitorsAfter > visitorsBefore, `射箭${roll}点仍是一次完成的交换，客流应可见变化`);
  return { reserve, outcome, visitorsDelta: outcome.businessChange.visitorsDelta, grass: reserve.ecology.grass };
}

const self = settleRoll(6);
const fair = settleRoll(4);
const neighbor = settleRoll(2);
assert.strictEqual(self.outcome.businessChange.exchangeShare, "self");
assert.strictEqual(fair.outcome.businessChange.exchangeShare, "fair");
assert.strictEqual(neighbor.outcome.businessChange.exchangeShare, "neighbor");
assert(self.visitorsDelta > fair.visitorsDelta, "5–6点我方得利必须高于互惠客流");
assert(fair.visitorsDelta > neighbor.visitorsDelta, "1–2点邻区得利必须低于互惠客流");
assert(self.grass > fair.grass, "我方得利必须拿到更多草种收益");
assert(fair.grass > neighbor.grass, "邻区得利必须留下更少草种收益");
assert(self.outcome.businessChange.sampleDelta > fair.outcome.businessChange.sampleDelta);
assert(fair.outcome.businessChange.sampleDelta > neighbor.outcome.businessChange.sampleDelta);

const game = Object.create(Game.prototype);
game.state = { world: { reserve: primedExchangeReserve("neighbor_exchange_ui") } };
game.render = () => {};
game.playSfx = () => {};
game.toast = () => {};
game.dismissInfoDetailModal = function dismiss() { this.infoDetailModal = null; };
assert(game.openNeighborEventDice({ eventType: "neighbor_exchange" }), "邻区交换标记必须能打开射箭弹窗");
assert.strictEqual(game.infoDetailModal.actionLabel, "射箭判定交换");
assert(game.infoDetailModal.scoreGuide.includes("我方得利"));
game.archeryScoreFor = () => 5;
const uiOutcome = game.resolveNeighborEventDice();
assert(uiOutcome && uiOutcome.success, "射箭5点必须完成交换");
assert.strictEqual(uiOutcome.exchangeShare, "self", "5点必须判定为我方更得利");
assert.strictEqual(game.infoDetailModal.phase, "rolling", "邻区交换结果必须等待箭矢动画结束后显示");
assert.strictEqual(game.state.world.reserve.emergency.active, null, "处理完成后必须清除交换事件");

const twoPointReserve = primedExchangeReserve("neighbor_exchange_ui_2");
const twoPointGame = Object.create(Game.prototype);
twoPointGame.state = { world: { reserve: twoPointReserve } };
twoPointGame.render = () => {};
twoPointGame.playSfx = () => {};
twoPointGame.toast = () => {};
twoPointGame.dismissInfoDetailModal = function dismiss() { this.infoDetailModal = null; };
twoPointGame.openNeighborEventDice({ eventType: "neighbor_exchange" });
twoPointGame.archeryScoreFor = () => 2;
const twoPointOutcome = twoPointGame.resolveNeighborEventDice();
assert(twoPointOutcome && twoPointOutcome.success, "1–2点仍是完成交换，不是失败");
assert.strictEqual(twoPointOutcome.exchangeShare, "neighbor", "2点必须判定为邻区更得利");
assert.strictEqual(twoPointReserve.emergency.active, null, "邻区得利后也必须清掉事件");

const view = buildReserveView(primedExchangeReserve("neighbor_exchange_map"), primedExchangeReserve("neighbor_exchange_map"), { action: "houndScout", day: 1 });
assert(!view.mapMarkers.some((marker) => ["houndScout", "habitat", "intervention"].includes(marker.recommendAction) && marker.eventType === "neighbor_exchange"), "邻区交换不能生成旧猎犬处理入口");
const exchangeMarker = view.mapMarkers.find((marker) => marker.eventType === "neighbor_exchange");
assert(exchangeMarker && exchangeMarker.recommendAction === "neighborExchange", "地图标记必须指向射箭交换");

const patrolState = createCharacter(null, "邻区交换不得走猎犬");
patrolState.world.reserve.emergency = {
  active: {
    id: "neighbor_exchange_patrol_skip",
    type: "neighbor_exchange",
    title: definition.title,
    recommendedAction: "houndScout",
    progress: 0,
    target: 1,
    daysRemaining: 1,
    responses: definition.responses
  },
  cooldown: 0,
  history: []
};
patrolState.world.reserve.supplies = Object.assign({}, patrolState.world.reserve.supplies, { dogFood: 8, alarm: 4, fieldKit: 4 });
const afterPatrol = simulateDay("派猎犬侦察：确认边界脚印", patrolState);
assert(afterPatrol.world.reserve.emergency.active, "猎犬巡逻不得把邻区交换直接结算");
assert.strictEqual(afterPatrol.world.reserve.emergency.active.type, "neighbor_exchange");
assert.strictEqual(afterPatrol.world.reserve.emergency.active.progress, 0, "猎犬巡逻不得推进邻区交换进度");
const stillActive = updateReserveEmergency(afterPatrol.world.reserve, "houndScout", { name: "雨季" });
assert.strictEqual(stillActive, null, "猎犬行动不得作为邻区交换的结果判定");
assert(afterPatrol.world.reserve.emergency.active && afterPatrol.world.reserve.emergency.active.type === "neighbor_exchange");

const archeryResolve = updateReserveEmergency(afterPatrol.world.reserve, "neighborExchange", { name: "雨季" }, true);
assert(archeryResolve && archeryResolve.kind === "resolved", "射箭交换必须能结束邻区交换");
assert.strictEqual(archeryResolve.businessChange.exchangeShare, "fair", "未指定点数时按互惠 4 点结算");

const hijackReserve = createReserveState();
hijackReserve.emergency.active = {
  id: "neighbor_exchange_hijack",
  type: "neighbor_exchange",
  title: definition.title,
  recommendedAction: "habitat",
  progress: 0,
  target: 1,
  daysRemaining: 1
};
const hijackGame = Object.create(Game.prototype);
hijackGame.state = { world: { reserve: hijackReserve } };
hijackGame.infoDetailModal = null;
hijackGame.openNeighborEventDice = function openNeighborEventDice() {
  this.openedExchangeArchery = true;
  this.infoDetailModal = { kind: "neighborEventDice", phase: "ready" };
  return true;
};
hijackGame.openReserveViewAction = function openReserveViewAction() {
  throw new Error("neighbor exchange crisis cards must not open hound patrol");
};
assert(hijackGame.executeGoalAction({ id: "crisis:exchange", kind: "crisis", recommendedAction: "habitat" }), "旧的栖息地危机卡也必须改走射箭");
assert(hijackGame.openedExchangeArchery, "邻区交换必须打开射箭判定");

const missed = primedExchangeReserve("neighbor_exchange_missed");
missed.emergency.active.daysRemaining = 1;
const missedOutcome = updateReserveEmergency(missed, "none", { name: "雨季" }, false);
assert.strictEqual(missedOutcome.kind, "failed");
assert.strictEqual(missedOutcome.businessChange.fundDelta, 0, "错过交换不得虚构扣款");

console.log("neighbor exchange archery check ok");
