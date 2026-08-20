const assert = require("assert");
const { createCharacter } = require("../js/storage");
const { simulateDay } = require("../js/simulator");
const { supplyPurchaseForQuantity, supplyReplenishmentPlan } = require("../js/actions");
const { Game } = require("../js/game");

function withRandom(value, fn) {
  const previous = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = previous; }
}

function quietGoal(state) {
  state.world.goals.daily = Object.assign({}, state.world.goals.daily, { progress: 0, target: 99 });
}

const quantityState = createCharacter(null, "数量采购测试");
quietGoal(quantityState);
const quantityReserve = quantityState.world.reserve;
quantityReserve.fund = 5000;
quantityReserve.supplies.dogFood = 1;
const dogPurchase = supplyPurchaseForQuantity("dogFood", 3, quantityReserve);
assert.strictEqual(dogPurchase.amount, 3, "单项采购应接受任意整数数量");
assert.strictEqual(dogPurchase.cost, 40, "狗粮3份应按包价比例并向5取整");
const quantityResult = withRandom(.99, () => simulateDay(dogPurchase.command, quantityState));
assert.strictEqual(quantityResult.world.reserve.supplies.dogFood, 4, "采购数量应精确进入狗粮库存");
assert.strictEqual(quantityResult.world.reserve.lastPurchase.amount, 3, "结算应记录真实采购数量");

const batchState = createCharacter(null, "批量补齐测试");
quietGoal(batchState);
const batchReserve = batchState.world.reserve;
batchReserve.fund = 5000;
Object.assign(batchReserve.supplies, { dogFood: 0, alarm: 0, tranquilizer: 1, fieldKit: 0, medicalKit: 0 });
const plan = supplyReplenishmentPlan(batchReserve);
assert.strictEqual(plan.items.length, 5, "一键补齐应覆盖全部五类短缺物资");
assert(plan.cost > 0 && plan.amount === 14, "一键补齐应给出完整数量与成本");
const batchResult = withRandom(.99, () => simulateDay(plan.command, batchState));
plan.items.forEach((item) => {
  assert.strictEqual(batchResult.world.reserve.supplies[item.id], item.target, `${item.itemLabel}应精确补到安全线`);
});
assert.strictEqual(batchResult.world.reserve.lastPurchase.batch, true, "结算应保留批量采购标记");

const insufficientState = createCharacter(null, "原子结算测试");
quietGoal(insufficientState);
const insufficientReserve = insufficientState.world.reserve;
insufficientReserve.fund = 1;
insufficientReserve.inventory.researchSample = 1;
Object.assign(insufficientReserve.supplies, { dogFood: 0, alarm: 0, tranquilizer: 0, fieldKit: 0, medicalKit: 0 });
const beforeSupplies = JSON.stringify(insufficientReserve.supplies);
const insufficientPlan = supplyReplenishmentPlan(insufficientReserve);
const insufficientResult = withRandom(.99, () => simulateDay(insufficientPlan.command, insufficientState));
assert.strictEqual(JSON.stringify(insufficientResult.world.reserve.supplies), beforeSupplies, "基金不足时批量采购不得只补一部分");
assert.strictEqual(insufficientResult.world.reserve.lastPurchase.blocked, "基金不足", "基金不足应明确阻止整单");

const game = new Game();
game.stopLoop();
game.render = () => {};
game.state = createCharacter(null, "医疗拆分测试");
const reserve = game.state.world.reserve;
reserve.supplies.fieldKit = 2;
reserve.supplies.medicalKit = 0;
const rescueStatus = game.animalActionStatus("rescueCare");
assert.strictEqual(rescueStatus.canRun, false, "只有野外工具包不能执行动物救助");
assert(rescueStatus.missing.includes("医疗包"), "动物救助应明确提示医疗包短缺");
reserve.supplies.medicalKit = 2;
game.openSupplyQuantityPicker("medicalKit");
assert(game.infoDetailModal && game.infoDetailModal.kind === "supplyQuantity", "点击补给卡应打开数量选择器");
assert.strictEqual(game.infoDetailModal.supplyId, "medicalKit", "医疗包卡片不得误指向野外工具包");

console.log("supply purchase check ok");
