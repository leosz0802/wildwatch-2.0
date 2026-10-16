const assert = require("assert");
const { createCharacter } = require("../js/storage");
const { simulateDay, reserveProgressionFor } = require("../js/simulator");
const { buildReserveView } = require("../js/reserveView");
const { consumeProjectPreparation } = require("../js/resourceLedger");
const { chapterEconomy } = require("../js/balanceConfig");

function withRandom(value, fn) {
  const original = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = original; }
}

function stateWithResources(name = "三资源回归") {
  const state = createCharacter(null, name);
  const reserve = state.world.reserve;
  reserve.fund = 900;
  reserve.supplies = { dogFood: 8, alarm: 5, tranquilizer: 6, fieldKit: 5 };
  reserve.ecology.water = 62;
  reserve.ecology.grass = 60;
  reserve.ecology.disease = 16;
  reserve.highStockProject = null;
  return state;
}

function run(state, command, random = 0.01) {
  const result = withRandom(random, () => simulateDay(command, state));
  return Object.assign({}, state, {
    world: result.world,
    character: result.character,
    reports: result.reports || []
  });
}

function animalTotal(reserve) {
  const eco = reserve.ecology || {};
  return [eco.herbivores, eco.predators, eco.birds].reduce((sum, group) => (
    sum + Object.values(group || {}).reduce((subtotal, value) => subtotal + (Number(value) || 0), 0)
  ), 0);
}

// 首页唯一三个玩家资源必须稳定为基金、水源、草场。
let state = stateWithResources();
let reserve = state.world.reserve;
let view = buildReserveView(reserve, reserve, { action: "view", day: 1, season: "雨季", weather: "小雨" });
assert.strictEqual(view.version, "reserve-view-v2-core3");
assert.deepStrictEqual(view.states.map((item) => item.id), ["fund", "water", "grass"]);
assert(!Object.prototype.hasOwnProperty.call(view.actionSystem, "lastAuthorization"), "废弃授权不得进入玩家视图");

// 旧资源即使全部为0，也不能阻断现场任务；普通巡护不会暗增或暗扣基金。
const patrolCases = [
  ["派猎犬侦察：检查河岸脚印", "dogFood"],
  ["驱赶偷猎者：封住水边入口", "alarm"],
  ["修复水源和草场：清理堵塞水道", "fieldKit"],
  ["执行许可内生态干预：转移过度聚集个体", "tranquilizer"]
];
function taskFundReward(visual) {
  return ((visual && visual.goalResult && visual.goalResult.rewards) || [])
    .filter((item) => item && item.type === "fund")
    .reduce((sum, item) => sum + Math.max(0, Math.round(Number(item.amount) || 0)), 0);
}

for (const [command, supply] of patrolCases) {
  const fixture = stateWithResources(command);
  const before = JSON.parse(JSON.stringify(fixture.world.reserve));
  const result = withRandom(0.01, () => simulateDay(command, fixture));
  const after = result.world.reserve;
  ["actionPoints", "intel", "fieldPermits"].forEach((key) => assert(!Object.prototype.hasOwnProperty.call(after, key), `${command}不得恢复废弃字段${key}`));
  const actionCost = command.includes("修复水源")
    ? chapterEconomy(before).habitatCost
    : command.includes("生态干预")
      ? chapterEconomy(before).interventionCost
      : 0;
  const reward = taskFundReward(result.visual);
  assert.strictEqual(after.fund, before.fund - actionCost + reward, `${command}应按章节成本与任务奖励结算基金`);
  if (actionCost) {
    assert.strictEqual(result.visual.actionFundCost.cost, actionCost, `${command}必须披露行动成本`);
  }
  if (command.includes("修复水源") && reward) {
    assert.strictEqual(reward, 0, "每日任务基金奖励已删除");
  }
  assert(after.supplies[supply] < before.supplies[supply], `${command}应消耗具体补给${supply}`);
}

// 基金只由回收物移交增加，并由补给采购减少。
state = stateWithResources("基金闭环");
state.world.reserve.inventory.researchSample = 2;
const fundBeforeTransfer = state.world.reserve.fund;
state = run(state, "移交守护样本：提交研究样本", 0.4);
assert(state.world.reserve.fund > fundBeforeTransfer, "移交库存回收物应增加基金");
const fundAfterTransfer = state.world.reserve.fund;
const dogFoodBefore = state.world.reserve.supplies.dogFood;
state = run(state, "采购狗粮包", 0.4);
assert(state.world.reserve.fund < fundAfterTransfer, "采购具体补给应消耗基金");
assert(state.world.reserve.supplies.dogFood > dogFoodBefore, "采购后对应补给应入库");

// 小额持续项目成本必须按100点累计，不能把每个-20都向上取整成一份补给。
const projectCost = stateWithResources("项目成本累计").world.reserve;
const suppliesBeforeProject = Object.values(projectCost.supplies).reduce((sum, value) => sum + value, 0);
for (let index = 0; index < 4; index += 1) consumeProjectPreparation(projectCost, -20);
assert.strictEqual(Object.values(projectCost.supplies).reduce((sum, value) => sum + value, 0), suppliesBeforeProject, "累计不足100不得提前扣补给");
consumeProjectPreparation(projectCost, -20);
assert.strictEqual(Object.values(projectCost.supplies).reduce((sum, value) => sum + value, 0), suppliesBeforeProject - 1, "累计100只应扣一份补给");
assert.strictEqual(projectCost.ecology.grass, 60, "项目补给不足或换算时不得暗扣草场");

// 相同随机序列下，高水草必须带来更好的健康、迁徙和种群结果。
const low = stateWithResources("低水草");
low.world.reserve.ecology.water = 24;
low.world.reserve.ecology.grass = 28;
low.world.reserve.ecology.disease = 34;
const high = stateWithResources("高水草");
high.world.reserve.ecology.water = 82;
high.world.reserve.ecology.grass = 80;
high.world.reserve.ecology.disease = 12;
const lowBeforePopulation = animalTotal(low.world.reserve);
const highBeforePopulation = animalTotal(high.world.reserve);
const lowAfter = run(low, "派猎犬侦察：检查水边路线", 0.3).world.reserve;
const highAfter = run(high, "派猎犬侦察：检查水边路线", 0.3).world.reserve;
assert(lowAfter.habitatHealth && highAfter.habitatHealth, "每次结算必须生成水草健康因果记录");
assert(highAfter.habitatHealth.score > lowAfter.habitatHealth.score, "高水草应产生更高健康承载分");
assert((highAfter.migration.delta || 0) > (lowAfter.migration.delta || 0), "高水草应产生更好的迁入/迁出结果");
assert(animalTotal(highAfter) - highBeforePopulation >= animalTotal(lowAfter) - lowBeforePopulation, "高水草种群结果不应差于低水草");
assert(reserveProgressionFor(highAfter).score > reserveProgressionFor(lowAfter).score, "保护区生态评分只能由可见生态结果解释");

// 一个守护日的入夜结算必须把动物数量、迁徙、偷猎和疾病转成真实水草变化。
function closeGuardianDay(fixture, command = "修复水源和草场：维护饮水点") {
  let result = fixture;
  for (let index = 0; index < 3; index += 1) result = run(result, command, 0.4);
  return result.world.reserve;
}
const lightLoad = stateWithResources("低承载压力");
Object.keys(lightLoad.world.reserve.ecology.herbivores).forEach((id) => { lightLoad.world.reserve.ecology.herbivores[id] = 2; });
Object.keys(lightLoad.world.reserve.ecology.predators).forEach((id) => { lightLoad.world.reserve.ecology.predators[id] = 1; });
Object.keys(lightLoad.world.reserve.ecology.birds).forEach((id) => { lightLoad.world.reserve.ecology.birds[id] = 1; });
const heavyLoad = stateWithResources("高承载压力");
Object.keys(heavyLoad.world.reserve.ecology.herbivores).forEach((id) => { heavyLoad.world.reserve.ecology.herbivores[id] = 120; });
Object.keys(heavyLoad.world.reserve.ecology.predators).forEach((id) => { heavyLoad.world.reserve.ecology.predators[id] = 28; });
Object.keys(heavyLoad.world.reserve.ecology.birds).forEach((id) => { heavyLoad.world.reserve.ecology.birds[id] = 36; });
const lightNight = closeGuardianDay(lightLoad);
const heavyNight = closeGuardianDay(heavyLoad);
assert(lightNight.lastHabitatBalance && !lightNight.lastHabitatBalance.deferred, "入夜必须生成水草承载账单");
assert(heavyNight.lastHabitatBalance.water.animalConsumption > lightNight.lastHabitatBalance.water.animalConsumption, "更多动物必须消耗更多水源");
assert(heavyNight.lastHabitatBalance.grass.animalConsumption > lightNight.lastHabitatBalance.grass.animalConsumption, "更多食草动物必须消耗更多草场");

const calmHabitat = stateWithResources("低干扰生态");
calmHabitat.world.reserve.poacherPressure = 18;
calmHabitat.world.reserve.ecology.disease = 10;
const stressedHabitat = stateWithResources("高干扰生态");
stressedHabitat.world.reserve.poacherPressure = 80;
stressedHabitat.world.reserve.ecology.disease = 62;
const calmNight = closeGuardianDay(calmHabitat);
const stressedNight = closeGuardianDay(stressedHabitat);
assert(stressedNight.lastHabitatBalance.water.damage > calmNight.lastHabitatBalance.water.damage, "偷猎和疾病必须加剧水源损耗");
assert(stressedNight.lastHabitatBalance.grass.damage > calmNight.lastHabitatBalance.grass.damage, "偷猎和疾病必须加剧草场损耗");
assert(stressedNight.lastHabitatBalance.note.includes("偷猎") && stressedNight.lastHabitatBalance.note.includes("疾病"), "生态账单必须解释损耗原因");

const actionFixture = stateWithResources("玩家行动影响");
const untouchedFixture = JSON.parse(JSON.stringify(actionFixture));
const repaired = run(actionFixture, "修复水源和草场：维护饮水点", 0.2).world.reserve;
const observed = run(untouchedFixture, "派猎犬侦察：检查水边路线", 0.2).world.reserve;
assert(repaired.ecology.water > observed.ecology.water && repaired.ecology.grass > observed.ecology.grass, "玩家修复行动必须即时提高水源与草场");

const latePressure = stateWithResources("中后期水草承压");
latePressure.world.reserve.progression = Object.assign({}, latePressure.world.reserve.progression || {}, { stage: 3, displayChapter: 3, level: 2 });
latePressure.world.reserve.ecology.water = 58;
latePressure.world.reserve.ecology.grass = 58;
let lateState = latePressure;
for (let day = 0; day < 4; day += 1) {
  for (let action = 0; action < 3; action += 1) lateState = run(lateState, "派猎犬侦察：检查水边路线", 0.4);
}
assert(lateState.world.reserve.ecology.water < 45 || lateState.world.reserve.ecology.grass < 45, "过了第2章后，不修水草应经常掉到45以下");
assert(/任务或栖息地操作回补/.test((lateState.world.reserve.lastHabitatBalance || {}).note || ""), "中后期水草账单必须提示需要任务回补");
const lateRepair = run(lateState, "修复水源和草场：维护饮水点", 0.2).world.reserve;
assert(lateRepair.ecology.water > lateState.world.reserve.ecology.water || lateRepair.ecology.grass > lateState.world.reserve.ecology.grass, "掉到45以下后，栖息地任务必须能把水草抬回去");

// 固定循环验证无负数、NaN和旧资源复活。
state = stateWithResources("长循环");
const commands = [
  "派猎犬侦察：检查水边路线",
  "驱赶偷猎者：封住可疑入口",
  "修复水源和草场：维护饮水点",
  "执行许可内生态干预：分散过度聚集个体",
  "采购野外工具包",
  "移交守护样本"
];
for (let index = 0; index < 120; index += 1) {
  reserve = state.world.reserve;
  reserve.inventory.researchSample = Math.max(1, reserve.inventory.researchSample || 0);
  reserve.supplies.dogFood = Math.max(1, reserve.supplies.dogFood || 0);
  reserve.supplies.alarm = Math.max(1, reserve.supplies.alarm || 0);
  reserve.supplies.tranquilizer = Math.max(1, reserve.supplies.tranquilizer || 0);
  reserve.supplies.fieldKit = Math.max(1, reserve.supplies.fieldKit || 0);
  state = run(state, commands[index % commands.length], (index % 9 + 1) / 11);
  reserve = state.world.reserve;
  [reserve.fund, reserve.ecology.water, reserve.ecology.grass, reserve.ecology.disease].forEach((value) => {
    assert(Number.isFinite(value) && value >= 0, `核心数值异常: ${value}`);
  });
  ["actionPoints", "intel", "fieldPermits"].forEach((key) => assert(!Object.prototype.hasOwnProperty.call(reserve, key), `不得恢复废弃字段${key}`));
}

console.log("core resource system check ok");
