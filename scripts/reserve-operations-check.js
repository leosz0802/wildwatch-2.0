const assert = require("assert");
const { createReserveState, createInitialWorld } = require("../js/world");
const { normalizeReserve } = require("../js/storage");
const { simulateDay } = require("../js/simulator");
const { buildReserveDevelopmentPlan, reserveOperationsSnapshot, settleReserveDevelopmentDay } = require("../js/reserveDevelopment");

function visitorReserve() {
  const reserve = createReserveState();
  assert(buildReserveDevelopmentPlan(reserve, "river_shallows", "visitor_boardwalk", 1).ok);
  return reserve;
}

const clear = visitorReserve();
const rainy = JSON.parse(JSON.stringify(clear));
const clearView = reserveOperationsSnapshot(clear, 2, { weather: "晴" });
const rainyView = reserveOperationsSnapshot(rainy, 2, { weather: "大雨" });
assert(clearView.visitors > rainyView.visitors, "weather must change actual visitor attendance");

const unsafe = JSON.parse(JSON.stringify(clear));
unsafe.safety = 20;
unsafe.poacherPressure = 80;
assert(reserveOperationsSnapshot(clear, 2, { weather: "阴" }).visitors > reserveOperationsSnapshot(unsafe, 2, { weather: "阴" }).visitors, "safety and poaching must affect visitors");

const experienced = JSON.parse(JSON.stringify(clear));
experienced.wildernessKnowledge.discoveries = { resin_tinder: { count: 1 }, reed_cord: { count: 1 }, track_cast: { count: 1 }, feather_wind_tag: { count: 1 } };
experienced.wildernessKnowledge.tradeStock = { resin_tinder: 1, reed_cord: 1 };
const experienceView = reserveOperationsSnapshot(experienced, 2, { weather: "阴" });
assert(experienceView.survivalIncome > 0 && experienceView.income > reserveOperationsSnapshot(clear, 2, { weather: "阴" }).income, "survival materials must create visitor-program income");

const fundBefore = experienced.fund;
const settlement = settleReserveDevelopmentDay(experienced, 2, { weather: "阴" });
assert(settlement && experienced.fund === fundBefore + settlement.income, "visitor income must enter the reserve fund once");
assert.strictEqual(settleReserveDevelopmentDay(experienced, 2, { weather: "晴" }), null, "the same day must not settle twice");
assert(experienced.development.operations.today.speciesCount > 0 && experienced.development.operations.history.length === 1, "dual-layer operations must persist in the save state");
assert(experienced.development.operations.letters.length === 1 && experienced.development.operations.letters[0].body, "a completed visitor day must persist a readable visitor letter");
const restored = normalizeReserve(JSON.parse(JSON.stringify(experienced)), createReserveState());
assert.strictEqual(restored.development.operations.totalIncome, settlement.income, "save migration must preserve operations history");
assert.strictEqual(restored.development.operations.letters.length, 1, "save migration must preserve visitor letters");

const world = createInitialWorld();
world.reserve = visitorReserve();
let state = { character: { role: "warden", location: "中央混交林", stamina: 82, health: 92 }, world, messages: [], reports: [] };
const oldRandom = Math.random;
Math.random = () => .5;
state = simulateDay("派猎犬侦察", state);
assert.strictEqual(((state.world.reserve.development.operations || {}).lastSettlementDay || 0), 0, "visitors must not settle before natural-law actions are complete");
state = simulateDay("派猎犬侦察", state);
assert.strictEqual(((state.world.reserve.development.operations || {}).lastSettlementDay || 0), 0, "the second shift must still defer visitor settlement");
state = simulateDay("派猎犬侦察", state);
Math.random = oldRandom;
assert(((state.world.reserve.development.operations || {}).lastSettlementDay || 0) >= 1, "closing the day must settle ecology before visitors");
const settledIncome = state.world.reserve.development.operations.history.at(-1).income;
assert.strictEqual(state.world.reserve.economyLedger.sources.operatingIncome || 0, settledIncome, "operating ledger must equal the actual net income, including zero when maintenance exceeds contribution");

console.log("reserve operations check ok (ecology -> visitors -> materials -> fund)");
