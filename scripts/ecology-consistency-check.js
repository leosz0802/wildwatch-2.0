const assert = require("assert");
const { createCharacter, normalizeReserve } = require("../js/storage");
const { createReserveState } = require("../js/world");
const { simulateDay } = require("../js/simulator");
const { Game } = require("../js/game");
const {
  habitatCapacitySnapshot,
  habitatMigrationAssessment,
  consistentMigrationSnapshot
} = require("../js/ecologyConsistency");

function withRandom(value, fn) {
  const previous = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = previous; }
}

function setScreenshotConflict(reserve) {
  reserve.progression.level = 3;
  reserve.ecology.water = 96;
  reserve.ecology.grass = 27;
  reserve.ecology.disease = 12;
  Object.keys(reserve.ecology.herbivores || {}).forEach((id) => { reserve.ecology.herbivores[id] = 0; });
  reserve.ecology.herbivores.deer = 210;
  reserve.ecology.herbivores.antelope = 186;
  reserve.migration = { trend: "in", delta: 2, reason: "水草承载稳定，少量动物回流" };
  return reserve;
}

let state = createCharacter(null, "数值一致性");
let reserve = setScreenshotConflict(state.world.reserve);
let capacity = habitatCapacitySnapshot(reserve);
let assessment = habitatMigrationAssessment(reserve);
let migration = consistentMigrationSnapshot(reserve, reserve.migration);

assert.strictEqual(capacity.herbivores, 396, "截图复现应为396只食草动物");
assert(capacity.effectiveHerbivoreCapacity < capacity.herbivores, "草场27时当前食草动物必须超过有效承载");
assert(assessment.forced && assessment.delta < 0, "草场高风险必须强制迁出");
assert(migration.delta < 0 && migration.trend === "out", "旧的迁入+2必须被生态真值覆盖");
assert(/草场/.test(migration.reason) && !/承载稳定|回流/.test(migration.reason), "迁徙原因必须明确指出草场短板");

const game = Object.create(Game.prototype);
game.state = state;
const grassDetail = game.buildReserveMetricDetail("grass");
assert(/396 只 \/ 当前约/.test(grassDetail.items[1].title), "草场详情必须同时展示当前数量和有效承载");
assert(grassDetail.items[2].tag === "怎么改善" && /修复栖息地/.test(grassDetail.items[2].title), "草场高风险必须直接给出改善路径");
assert(grassDetail.navigationOnly && grassDetail.actionLabel === "去沙盘找任务", "草场风险入口只能引导到沙盘任务点");

const normalized = normalizeReserve(JSON.parse(JSON.stringify(reserve)), createReserveState());
assert(normalized.migration.delta < 0, "旧存档载入时必须修复矛盾迁徙方向");

const beforePopulation = Object.values(reserve.ecology.herbivores).reduce((sum, value) => sum + value, 0);
reserve.supplies.dogFood = 8;
const result = withRandom(0.4, () => simulateDay("派猎犬侦察：检查水边路线", state));
const after = result.world.reserve;
const afterPopulation = Object.values(after.ecology.herbivores).reduce((sum, value) => sum + value, 0);
assert(after.migration.delta < 0, "结算后低草场不得重新变成迁入");
assert(afterPopulation <= beforePopulation, "草场严重不足时食草种群不得继续净增长");
assert(/草场|承载/.test(after.migration.reason), "结算解释必须和草场/承载一致");

const healthy = createCharacter(null, "健康生态").world.reserve;
healthy.progression.level = 3;
healthy.ecology.water = 82;
healthy.ecology.grass = 80;
healthy.ecology.disease = 10;
Object.keys(healthy.ecology.herbivores).forEach((id) => { healthy.ecology.herbivores[id] = Math.min(18, healthy.ecology.herbivores[id]); });
healthy.migration = { trend: "in", delta: 3, reason: "水草充足，动物迁入" };
assessment = habitatMigrationAssessment(healthy);
migration = consistentMigrationSnapshot(healthy, healthy.migration);
assert(assessment.allowIn, "健康且未超载的保护区应允许迁入");
assert.strictEqual(migration.delta, 3, "合理的迁入结果不应被误伤");

console.log("ecology consistency check ok");
