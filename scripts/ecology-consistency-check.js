const assert = require("assert");
const { createCharacter, normalizeReserve } = require("../js/storage");
const { createReserveState } = require("../js/world");
const { simulateDay } = require("../js/simulator");
const { Game } = require("../js/game");
const {
  habitatCapacitySnapshot,
  habitatMigrationAssessment,
  consistentMigrationSnapshot,
  applyHabitatPopulationDelta,
  presentHerbivoreIds,
  scaleHabitatMigrationDelta
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
assert(grassDetail.items[2].tag === "可做任务" && /恢复草场/.test(grassDetail.items[2].title), "草场高风险必须直接给出可执行的恢复任务");
assert(typeof grassDetail.items[2].action === "function" && grassDetail.actionLabel === "恢复草场", "草场风险入口必须能从当前详情页直接发起恢复任务");

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

const opening = createReserveState();
const openingView = habitatMigrationAssessment(opening);
assert.strictEqual(openingView.delta, 0, "第1章开局即使水草可用也只观望");
assert(/观望|路过/.test(openingView.reason), "第1章迁徙文案应对齐泥岸试探");
assert(openingView.allowIn, "开局水草允许停留，只是还没有新的迁入");

const chapterTwo = JSON.parse(JSON.stringify(opening));
chapterTwo.progression.stage = 2;
chapterTwo.progression.displayChapter = 2;
const trickle = habitatMigrationAssessment(chapterTwo);
assert(trickle.delta >= 1 && trickle.delta <= 2, `第2章浅滩站稳应有少量停留，实际 ${trickle.delta}`);
assert(/停留|靠近/.test(trickle.reason), "第2章迁入原因应对齐浅滩停留剧情");
chapterTwo.safety = 40;
assert.strictEqual(habitatMigrationAssessment(chapterTwo).delta, 0, "安全低于45必须拦住回归");
assert(/暂缓回归/.test(habitatMigrationAssessment(chapterTwo).reason));

const diseased = JSON.parse(JSON.stringify(opening));
diseased.ecology.disease = 48;
const sick = habitatMigrationAssessment(diseased);
assert(sick.delta < 0, "疾病偏高应外迁");
assert(/疾病/.test(sick.reason), "疾病外迁必须写疾病而不是只写缺水");

const zebraBefore = opening.ecology.herbivores.zebra;
const hareBefore = opening.ecology.herbivores.hare;
applyHabitatPopulationDelta(opening, 5);
assert(presentHerbivoreIds(opening).includes("zebra"));
assert(opening.ecology.herbivores.zebra > zebraBefore || opening.ecology.herbivores.hare > hareBefore, "自然回归应分给已有食草种群，不能只动鹿和羚羊");

const safetyState = createCharacter(null, "安全不被覆盖");
const safetyBefore = safetyState.world.reserve.safety;
const habitatDay = withRandom(0.5, () => simulateDay("修复水源和草场", safetyState));
assert.notEqual(habitatDay.world.reserve.safety, habitatDay.world.reserve.ecologyScore, "迁移结算不得把安全写成生态分");
assert(Math.abs(habitatDay.world.reserve.safety - safetyBefore) <= 8, "栖息地日结算不应大幅改写安全线");

const forced = habitatMigrationAssessment(setScreenshotConflict(createCharacter(null, "闲时外迁").world.reserve));
assert(scaleHabitatMigrationDelta(forced, "idle") >= -2 && scaleHabitatMigrationDelta(forced, "idle") < 0, "闲时强制外迁必须缓慢");
assert.equal(scaleHabitatMigrationDelta(forced, "task"), forced.delta, "任务应保留完整迁徙幅度");
assert.equal(scaleHabitatMigrationDelta({ delta: 4 }, "idle"), 1, "闲时迁入每次最多1只");
assert.equal(scaleHabitatMigrationDelta({ delta: 4 }, "task"), 4, "任务迁入应明显大于闲时");

function livingTotal(reserve) {
  return ["predators", "herbivores", "birds"].reduce((sum, group) => (
    sum + Object.values((reserve.ecology || {})[group] || {}).reduce((sub, value) => sub + Math.max(0, Number(value) || 0), 0)
  ), 0);
}

const { reconcileSpeciesPopulations } = require("../js/animalWorld");
const idleState = createCharacter(null, "闲时种群");
idleState.world.reserve.supplies.dogFood = 8;
reconcileSpeciesPopulations(idleState.world.reserve, { initializeUnlocked: true, removeLocked: true });
const idleBefore = livingTotal(idleState.world.reserve);
const idleAfter = withRandom(0.4, () => simulateDay("派猎犬侦察：检查水边路线", idleState)).world.reserve;
assert(Math.abs(livingTotal(idleAfter) - idleBefore) <= 3, `不做栖息地任务时动物总数应缓慢变化，实际 ${livingTotal(idleAfter) - idleBefore}`);

const { normalizeChapterRescue } = require("../js/chapterRescueSystem");
const taskState = createCharacter(null, "任务种群");
taskState.world.reserve.progression.stage = 2;
taskState.world.reserve.progression.displayChapter = 2;
taskState.world.reserve.progression.level = 2;
normalizeChapterRescue(taskState.world.reserve, 2, { fresh: true });
taskState.world.reserve.ecology.water = 82;
taskState.world.reserve.ecology.grass = 80;
taskState.world.reserve.ecology.disease = 10;
taskState.world.reserve.safety = 78;
taskState.world.reserve.supplies.fieldKit = 5;
Object.keys(taskState.world.reserve.ecology.herbivores).forEach((id) => {
  taskState.world.reserve.ecology.herbivores[id] = Math.min(12, taskState.world.reserve.ecology.herbivores[id] || 0);
});
reconcileSpeciesPopulations(taskState.world.reserve, { initializeUnlocked: true, removeLocked: true });
Object.keys(taskState.world.reserve.ecology.herbivores).forEach((id) => {
  if (Number(taskState.world.reserve.ecology.herbivores[id]) > 12) {
    taskState.world.reserve.ecology.herbivores[id] = 12;
  }
});
const taskBefore = livingTotal(taskState.world.reserve);
const taskAfter = withRandom(0.2, () => simulateDay("修复水源和草场", taskState)).world.reserve;
assert(livingTotal(taskAfter) - taskBefore >= 3, `栖息地任务应触发较多动物增长，实际 ${livingTotal(taskAfter) - taskBefore}`);

const chapterOneGrow = createCharacter(null, "第一章动物缺口");
chapterOneGrow.world.reserve.supplies.fieldKit = 5;
const chapterOneBefore = livingTotal(chapterOneGrow.world.reserve);
const chapterOneAfter = withRandom(0.2, () => simulateDay("修复水源和草场", chapterOneGrow)).world.reserve;
assert(livingTotal(chapterOneAfter) - chapterOneBefore >= 3, `动物总数未达标时第1章栖息地也必须带入动物，实际 ${livingTotal(chapterOneAfter) - chapterOneBefore}`);

console.log("ecology consistency check ok");
