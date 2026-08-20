const assert = require("assert");
const { createCharacter } = require("../js/storage");
const { simulateDay } = require("../js/simulator");
const { Game } = require("../js/game");

function withRandom(value, fn) {
  const previous = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = previous; }
}

const waterState = createCharacter(null, "水位平衡测试");
waterState.world.reserve.ecology.water = 87;
waterState.world.reserve.ecology.grass = 70;
waterState.world.reserve.guardianCycle.actionIndex = 2;
waterState.world.reserve.guardianCycle.actionsToday = [{ action: "houndScout" }, { action: "houndScout" }];
waterState.world.weather = "小雨";
const waterResult = withRandom(.99, () => simulateDay("批量移交守护样本", waterState));
assert(waterResult.world.reserve.ecology.water < 87, "高水位在雨季入夜后也必须自然回落");
assert((waterResult.world.reserve.lastHabitatBalance.water.outflow || 0) >= 3, "87点水源应触发明确的高水位外流");
assert(/高水位自然外流/.test(waterResult.world.reserve.lastHabitatBalance.note), "入夜说明必须解释水位为何下降");

const game = new Game();
game.stopLoop();
game.render = () => {};
game.state = createCharacter(null, "风险引导测试");
game.state.world.reserve.ecology.grass = 30;
game.state.world.reserve.ecology.water = 87;
game.state.world.reserve.supplies.fieldKit = 0;
const detail = game.buildReserveMetricDetail("grass");
assert.strictEqual(detail.readOnly, true, "核心指标必须保持只读");
assert.strictEqual(detail.navigationOnly, true, "风险按钮只能导航到沙盘任务，不能直接结算操作");
assert.strictEqual(detail.actionLabel, "去沙盘找任务", "高风险详情必须提供清晰下一步");
assert(detail.items.some((item) => item.tag === "怎么改善" && /物资页一键补齐/.test(item.body)), "缺工具包时必须说明先补给");

detail.action();
assert.strictEqual(game.patrolTaskModal, null, "点击风险引导不得绕过沙盘任务直接打开操作");
assert(game.focusedReserveMetric && game.focusedReserveMetric.type === "grass", "应记录需要高亮的草场任务");
const focusedView = game.reserveViewForDisplay();
assert.strictEqual((focusedView.mapMarkers[0] || {}).id, "metric_focus_grass", "沙盘首位必须出现可点击的草场修复点");
assert.strictEqual((focusedView.mapMarkers[0] || {}).recommendAction, "habitat", "草场修复点必须正确指向栖息地修复");

const waterDetail = game.buildReserveMetricDetail("water");
assert(!waterDetail.action, "丰沛水源不应误导玩家继续修复");
assert(/自然外流/.test(waterDetail.items[0].body), "高水位详情必须解释自然回落机制");

console.log("water grass guidance check ok");
