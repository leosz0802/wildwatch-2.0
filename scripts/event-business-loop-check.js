const assert = require("assert");
const { createReserveState, createInitialWorld } = require("../js/world");
const { normalizeReserve } = require("../js/storage");
const { WORLD_EVENT_DEFINITIONS, worldEventIdleTriggerType } = require("../js/worldEventSystem");
const { eventCategory, eventBusinessFactors, applyEventBusinessOutcome, applyNarrativeBusinessOutcome } = require("../js/eventEconomy");
const { updateReserveEmergency, simulateDay } = require("../js/simulator");
const { previewVisitorRecruitment, visitorRealDateKey } = require("../js/visitorRecruitment");
const { buildReserveView } = require("../js/reserveView");
const { Game } = require("../js/game");

function reserveWithEvent(type, visitors = 200) {
  const reserve = createReserveState();
  reserve.fund = 2000;
  reserve.development.operations.today = { visitors: 0, recruitedVisitors: visitors, recruitedIncome: visitors * 4, income: visitors * 4, realDateKey: visitorRealDateKey() };
  reserve.development.operations.totalIncome = visitors * 4;
  reserve.development.operations.totalVisitors = visitors;
  reserve.emergency.active = Object.assign({ id: `test_${type}`, type, progress: 0 }, WORLD_EVENT_DEFINITIONS[type], { daysRemaining: 3 });
  return reserve;
}

const categories = new Set();
for (const [type, definition] of Object.entries(WORLD_EVENT_DEFINITIONS)) {
  categories.add(definition.category);
  for (const response of definition.responses) {
    const reserve = reserveWithEvent(type);
    let outcome;
    for (let turn = 0; turn < 3 && reserve.emergency.active; turn++) outcome = updateReserveEmergency(reserve, response.action, { name: "雨季" });
    assert(outcome && outcome.kind === "resolved", `${type}/${response.action} must be completable inside its window`);
    assert.strictEqual(outcome.businessChange.fundAfter, reserve.fund);
    assert(outcome.businessChange.visitorsDelta > 0, `${type} should restore real visitor attendance`);
    assert.strictEqual(reserve.fundLedger.reduce((sum, entry) => sum + entry.amount, 0), reserve.fund - 2000, "event contribution is recorded once");
    assert(outcome.body.includes("保护基金") && outcome.body.includes("游客"), "story result must explain both core metrics");
    const restored = normalizeReserve(JSON.parse(JSON.stringify(reserve)), createReserveState());
    assert.deepStrictEqual(restored.emergency.businessEffect, reserve.emergency.businessEffect, "post-event demand effect must survive reload");
  }
  const failed = reserveWithEvent(type);
  let outcome;
  for (let turn = 0; turn < 3; turn++) outcome = updateReserveEmergency(failed, "none", { name: "雨季" });
  assert.strictEqual(outcome.kind, "failed");
  assert(type === "neighbor_exchange" ? outcome.businessChange.fundDelta === 0 : outcome.businessChange.fundDelta < 0, "failure refunds actual contribution; missed exchange creates no fictional expense");
  const blocked = reserveWithEvent(type);
  updateReserveEmergency(blocked, definition.responses[0].action, { name: "雨季" }, false);
  assert.strictEqual(blocked.emergency.active.progress, 0, "failed/unsupported action cannot complete a response");
}
assert.deepStrictEqual([...categories].sort(), ["nature", "neighbor", "social"]);

const empty = reserveWithEvent("wildfire", 0);
assert.strictEqual(applyEventBusinessOutcome(empty, empty.emergency.active, false).visitorsDelta, 0);
assert.strictEqual(empty.fund, 2000, "no guests means no fabricated refunds");
const smallCrowd = reserveWithEvent("wildfire", 9);
const smallCrowdOutcome = applyEventBusinessOutcome(smallCrowd, smallCrowd.emergency.active, true);
assert(smallCrowdOutcome.visitorsDelta >= 1, "small crowds must visibly respond to a resolved event");
assert.strictEqual(smallCrowd.development.operations.totalVisitors, smallCrowdOutcome.visitorsAfter, "event visitor delta must reconcile with aggregate visitors");
const smallStory = reserveWithEvent("wildfire", 9);
const smallStoryOutcome = applyNarrativeBusinessOutcome(smallStory, { id: "small_story", type: "predation", title: "低客流剧情" }, "observe");
assert(smallStoryOutcome.visitorsDelta >= 1, "small crowds must visibly respond to a resolved narrative choice");
assert.strictEqual(smallStory.development.operations.totalVisitors, smallStoryOutcome.visitorsAfter, "narrative visitor delta must reconcile with aggregate visitors");
const repeat = reserveWithEvent("visitor_queue");
const incident = repeat.emergency.active;
applyEventBusinessOutcome(repeat, incident, false);
const saved = JSON.stringify(repeat);
applyEventBusinessOutcome(repeat, incident, false);
assert.strictEqual(JSON.stringify(repeat), saved, "same result cannot settle twice");
const normal = reserveWithEvent("wildfire");
normal.emergency.active = null;
const risky = reserveWithEvent("wildfire");
assert(previewVisitorRecruitment(risky, 1, .5).visitors < previewVisitorRecruitment(normal, 1, .5).visitors, "active emergency reduces actual recruit count");
assert.strictEqual(eventBusinessFactors(reserveWithEvent("neighbor_exchange")).demand, 1, "opportunities must not close the reserve");

const poolReserve = reserveWithEvent("neighbor_water");
poolReserve.progression.level = 3;
poolReserve.ecology.water = 45; poolReserve.ecology.grass = 50;
poolReserve.emergency.active = null;
const sampled = new Set(Array.from({ length: 1000 }, (_, i) => worldEventIdleTriggerType(poolReserve, { name: "旱季" }, () => i / 1000)));
for (const id of ["animal_water_conflict", "visitor_queue", "visitor_litter", "neighbor_water", "neighbor_exchange", "neighbor_migration"]) assert(sampled.has(id), `${id} must be reachable in live scheduling`);

const game = new Game(); game.render = () => {};
const gradient = { addColorStop() {} };
const layoutContext = new Proxy({}, {
  get(target, key) {
    if (key === "measureText") return (value) => ({ width: String(value).length * 6.4 });
    if (key === "createLinearGradient" || key === "createRadialGradient") return () => gradient;
    return target[key] || (() => {});
  },
  set(target, key, value) { target[key] = value; return true; }
});
game.ctx = layoutContext;
for (const type of ["wildfire", "visitor_litter", "neighbor_water"]) {
  game.state.world.reserve = reserveWithEvent(type);
  const view = buildReserveView(game.state.world.reserve, game.state.world.reserve, { day: 1 });
  const marker = view.mapMarkers.find((item) => item.eventType === type);
  game.openMapMarkerDetail(marker);
  const detail = game.infoDetailModal;
  assert.strictEqual(detail.kind, "neighborEventDice", "map event must resolve in its current modal instead of opening a patrol task");
  assert(detail.kicker.includes(eventCategory({ type }).label));
  assert.strictEqual(typeof detail.action, "function");
  for (const [width, height] of [[320, 568], [375, 667], [430, 932]]) {
    game.width = width; game.height = height;
    game.settlementModal = null; game.patrolTaskModal = null;
    game.drawInfoDetailModal();
    assert(detail.renderedNeighborEventLayout && detail.renderedNeighborEventLayout.compact, `${type} must use the compact in-place dice layout`);
    assert(detail.renderedNeighborEventLayout.die.x >= 0 && detail.renderedNeighborEventLayout.die.x + detail.renderedNeighborEventLayout.die.size <= width, `${type} dice must fit at ${width}x${height}`);
  }
}
game.state.world.reserve = reserveWithEvent("neighbor_water");
game.state.world.reserve.reserveView = buildReserveView(game.state.world.reserve, game.state.world.reserve, { day: 1 });
game.state.world.mapEvents = game.state.world.reserve.reserveView.mapMarkers.slice();
game.openMapMarkerDetail(game.state.world.reserve.reserveView.mapMarkers.find((item) => item.eventType === "neighbor_water"));
const inlineEvent = game.infoDetailModal;
const originalRandom = Math.random;
Math.random = () => .99;
try { inlineEvent.action(); } finally { Math.random = originalRandom; }
assert(inlineEvent.result && inlineEvent.result.success && inlineEvent.result.businessChange, "one in-place dice roll must settle the event and expose visitor/fund changes");
assert.strictEqual(inlineEvent.phase, "rolling", "in-place event result must remain hidden while the dice animation runs");
assert.strictEqual(game.state.world.reserve.emergency.active, null, "the in-place dice result must clear the map event without opening another task");
assert(!game.patrolTaskModal, "event resolution must not open a hound patrol modal");
assert(!game.state.world.reserve.reserveView.mapMarkers.some((item) => item.eventType === "neighbor_water"), "completed event prompt must disappear from the reserve view");
assert(!game.state.world.mapEvents.some((item) => item.eventType === "neighbor_water"), "completed event prompt must disappear from the map event queue");
const drawn = [];
const ctx = { measureText: (text) => ({ width: text.length * 6 }) };
game.text = (_ctx, value, x, y, size, color) => drawn.push({ value, color });
game.drawChangeText(ctx, "100 ↑ 120 ↓ 110", 0, 0, 12, "#111");
assert(drawn.filter((item) => /^[↑↓]$/.test(item.value)).every((item) => item.color === "#d84b42"));
assert(game.settlementRewardDisplayLines({ fundBefore: 100, fundAfter: 100, visitorsBefore: 0, visitorsAfter: 0 }).every((line) => line.includes("持平") && !line.includes("→")));

// Exercise the complete simulator, including its aggregate ledger, for refunds.
const world = createInitialWorld(); world.reserve = reserveWithEvent("wildfire");
world.reserve.emergency.active.daysRemaining = 1;
const beforeFund = world.reserve.fund;
const oldRandom = Math.random; Math.random = () => .5;
let result;
try { result = simulateDay("派猎犬侦察", { character: { role: "warden", location: "中央混交林", stamina: 82, health: 92 }, world, messages: [], reports: [] }); }
finally { Math.random = oldRandom; }
const after = result.world.reserve;
assert(after.emergency.lastOutcome && after.emergency.lastOutcome.businessChange.fundDelta < 0);
assert.strictEqual(after.fundLedger.filter((entry) => entry.source === "事件游客退款").length, 1, "simulator must not duplicate the event refund in its ledger");
assert.strictEqual(after.fundLedger.reduce((sum, entry) => sum + entry.amount, 0), after.fund - beforeFund, "actual ledger entries must reconcile with the balance change");
assert.strictEqual(Object.values(after.economyLedger.sources).reduce((a, b) => a + b, 0) - Object.values(after.economyLedger.sinks).reduce((a, b) => a + b, 0), after.fund - beforeFund);
console.log("event business loop check ok (15 events, all response routes, failure, empty attendance, reload, no duplicate refund, 3 map categories, red arrows)");
