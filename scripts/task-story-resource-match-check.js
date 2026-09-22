const assert = require("assert");
const { createCharacter } = require("../js/storage");
const { simulateDay } = require("../js/simulator");
const { actionSupplyRequirement } = require("../js/actions");
const { Game } = require("../js/game");

function withRandom(value, fn) {
  const previous = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = previous; }
}

function fresh(name) {
  return createCharacter(null, name);
}

const routine = fresh("常规干预");
routine.world.reserve.ecology.disease = 10;
assert.strictEqual(actionSupplyRequirement("intervention", routine.world.reserve).id, "tranquilizer", "常规种群干预应使用麻醉弹");

const outbreak = fresh("疫病处置");
const outbreakReserve = outbreak.world.reserve;
outbreakReserve.ecology.disease = 40;
outbreakReserve.supplies.medicalKit = 1;
outbreakReserve.supplies.tranquilizer = 3;
outbreakReserve.emergency = {
  active: { id: "test_contamination", type: "water_contamination", title: "水源污染扩散", recommendedAction: "intervention", progress: 0, target: 3, daysRemaining: 3 },
  cooldown: 0,
  history: []
};
assert.strictEqual(actionSupplyRequirement("intervention", outbreakReserve).id, "medicalKit", "疾病剧情必须改用医疗包");

const game = Object.create(Game.prototype);
game.state = outbreak;
const blocked = game.actionResourceStatus("intervention", Object.assign({}, outbreakReserve, {
  supplies: Object.assign({}, outbreakReserve.supplies, { medicalKit: 0 })
}));
assert(!blocked.canRun && blocked.missing.includes("医疗包") && !blocked.missing.includes("麻醉弹"), "剧情任务、执行门槛与提示必须指向同一物资");
const goal = { id: "crisis:test", kind: "crisis", title: "控制疾病扩散", recommendedAction: "intervention", buttonLabel: "隔离病群" };
outbreak.world.goals.active = { primary: goal, alternatives: [], generatedAtAction: 0 };
assert.strictEqual(game.recommendedPatrolAction(outbreakReserve), "intervention", "危机任务必须成为巡护推荐行动");
assert(game.goalNarrativeItems(goal).find((item) => item.tag === "行动").body.includes("医疗包 1"), "剧情详情必须展示真实执行消耗");
outbreakReserve.supplies.medicalKit = 0;
const fundUse = game.buildReserveMetricDetail("fund").items.find((item) => item.tag === "用途");
assert(/补医疗包需 \d+ 星币/.test(fundUse.title) && fundUse.body.includes("控制疾病扩散"), "保护基金必须说明当前剧情的精确采购用途");

outbreakReserve.supplies.medicalKit = 1;
const diseaseBefore = outbreakReserve.ecology.disease;
const outbreakResult = withRandom(0.05, () => simulateDay("执行许可内生态干预：隔离病群", outbreak));
assert.strictEqual(outbreakResult.world.reserve.supplies.medicalKit, 0, "执行疾病任务必须消耗医疗包");
assert.strictEqual(outbreakResult.world.reserve.supplies.tranquilizer, 3, "疾病任务不得误扣麻醉弹");
assert(outbreakResult.world.reserve.ecology.disease < diseaseBefore, "疾病剧情完成后必须真实降低疾病值");
assert.strictEqual(outbreakResult.world.reserve.emergency.active.progress, 2, "匹配危机行动必须推进剧情进度");

const evidenceState = fresh("执法取证");
evidenceState.world.reserve.supplies.alarm = 2;
evidenceState.world.reserve.supplies.evidenceTrap = 0;
const evidenceGame = Object.create(Game.prototype);
evidenceGame.state = evidenceState;
const evidenceBlocked = evidenceGame.actionResourceStatus("antiPoacher", evidenceState.world.reserve, null, { nodeIds: ["evidence", "exit"] });
assert(!evidenceBlocked.canRun && evidenceBlocked.missing.includes("证据陷阱"), "选择取证路线时必须展示并校验额外消耗");
assert(evidenceGame.actionResourceStatus("antiPoacher", evidenceState.world.reserve, null, { nodeIds: ["ambush", "exit"] }).canRun, "不经过取证点的路线不应消耗证据陷阱");

evidenceState.world.reserve.supplies.evidenceTrap = 1;
const evidenceResult = withRandom(0.05, () => simulateDay("驱赶偷猎者：[路线:evidence>exit]", evidenceState));
assert.strictEqual(evidenceResult.world.reserve.supplies.evidenceTrap, 0, "取证路线结算必须扣除证据陷阱");
assert(evidenceResult.visual.patrolOperation && evidenceResult.visual.patrolOperation.nodeIds.includes("evidence"), "路线成本和剧情结果必须保留同一取证选择");

console.log("task/story/resource match check ok");
