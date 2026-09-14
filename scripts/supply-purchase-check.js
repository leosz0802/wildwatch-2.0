const assert = require("assert");
const { createCharacter, loadState } = require("../js/storage");
const { simulateDay } = require("../js/simulator");
const { supplyPurchaseForQuantity, supplyPurchaseById, supplyReplenishmentPlan, supplySaleEnabled, supplyPurchaseCatalog } = require("../js/actions");
const { Game } = require("../js/game");

function withRandom(value, fn) {
  const previous = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = previous; }
}

function quietGoal(state) {
  state.world.goals.daily = Object.assign({}, state.world.goals.daily, { progress: 0, target: 99 });
}

const firstLoginState = createCharacter(null, "首次登陆补给测试");
const firstLoginReserve = firstLoginState.world.reserve;
assert.strictEqual(firstLoginReserve.fund, 800, "新玩家首次登陆应获得800保护基金");
assert.strictEqual((firstLoginReserve.coreResources || {}).fund, 800, "核心资源中的基金应与首次登陆余额一致");
const firstSupplyPlan = supplyReplenishmentPlan(firstLoginReserve);
assert(firstSupplyPlan.items.length > 0 && firstSupplyPlan.cost <= firstLoginReserve.fund, `800基金应足够完成首次一键补齐，实际需要${firstSupplyPlan.cost}`);

const quantityState = createCharacter(null, "数量采购测试");
quietGoal(quantityState);
const quantityReserve = quantityState.world.reserve;
quantityReserve.fund = 5000;
quantityReserve.supplies.dogFood = 1;
const dogPurchase = supplyPurchaseForQuantity("dogFood", 3, quantityReserve);
assert.strictEqual(dogPurchase.amount, 3, "单项采购应接受任意整数数量");
assert.strictEqual(dogPurchase.cost, 70, "狗粮3份应按略紧张曲线随基金和库存向5取整");
const quantityResult = withRandom(.99, () => simulateDay(dogPurchase.command, quantityState));
assert.strictEqual(quantityResult.world.reserve.supplies.dogFood, 4, "采购数量应精确进入狗粮库存");
assert.strictEqual(quantityResult.world.reserve.lastPurchase.amount, 3, "结算应记录真实采购数量");

const evidencePurchase = supplyPurchaseForQuantity("evidenceTrap", 2, quantityReserve);
assert(evidencePurchase && evidencePurchase.amount === 2 && evidencePurchase.cost > 0, "证据陷阱必须出现在可售商店配置中");
const evidenceResult = withRandom(.99, () => simulateDay(evidencePurchase.command, quantityState));
assert.strictEqual(evidenceResult.world.reserve.supplies.evidenceTrap, 2, "证据陷阱采购应写入真实库存");
const evidenceItem = supplyPurchaseById("evidenceTrap", quantityReserve);
assert(supplySaleEnabled(evidenceItem) && !supplySaleEnabled(evidenceItem, { items: { evidenceTrap: { saleEnabled: false } } }), "售卖开关必须能明确阻止下架道具");
assert.strictEqual(supplyPurchaseById("evidenceTrap", quantityReserve, { items: { evidenceTrap: false } }), null, "下架道具不得绕过商店配置购买");


// 每个物资入口都必须精确采购点击的那一项，避免详情页、目标卡或确认框丢失 purchaseId 后买成默认狗粮。
supplyPurchaseCatalog(quantityReserve).forEach((catalogItem) => {
  const state = createCharacter(null, `逐项采购-${catalogItem.id}`);
  quietGoal(state);
  const reserve = state.world.reserve;
  reserve.fund = 5000;
  Object.keys(reserve.supplies).forEach((key) => { reserve.supplies[key] = 0; });
  const purchase = supplyPurchaseForQuantity(catalogItem.id, 1, reserve);
  const result = withRandom(.99, () => simulateDay(purchase.command, state));
  Object.keys(reserve.supplies).forEach((key) => {
    const expected = key === catalogItem.id ? 1 : 0;
    assert.strictEqual(result.world.reserve.supplies[key] || 0, expected, `${catalogItem.itemLabel}采购不得改变${key}库存`);
  });
  assert.strictEqual(result.world.reserve.lastPurchase.id, catalogItem.id, `${catalogItem.itemLabel}结算应保留真实物资ID`);
});

const batchState = createCharacter(null, "批量补齐测试");
quietGoal(batchState);
const batchReserve = batchState.world.reserve;
batchReserve.fund = 5000;
Object.assign(batchReserve.supplies, { dogFood: 0, alarm: 0, tranquilizer: 1, fieldKit: 0, medicalKit: 0 });
const plan = supplyReplenishmentPlan(batchReserve);
assert.strictEqual(plan.items.length, 6, "一键补齐应覆盖全部六类短缺物资");
assert(plan.cost > 0 && plan.amount === 16, "一键补齐应给出完整数量与成本");
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

// 覆盖视频中的真实路径：数量确认 -> 执行结算 -> 返回物资页 -> 重载存档。
const persisted = {};
global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
  createCanvas: () => ({ width: 375, height: 667, getContext: () => null }),
  getStorageSync: (key) => persisted[key] ? JSON.parse(JSON.stringify(persisted[key])) : null,
  setStorageSync: (key, value) => { persisted[key] = JSON.parse(JSON.stringify(value)); },
  onTouchStart() {}, onTouchMove() {}, onAppHide() {}, onAppShow() {},
  showToast() {}, showModal() {}
};
const uiGame = new Game();
uiGame.stopLoop();
uiGame.render = () => {};
uiGame.toast = () => {};
uiGame.setScreen = (screen) => { uiGame.screen = screen; };
uiGame.playSfx = () => {};
uiGame.playSettlementSfx = () => {};
uiGame.configureSettlementReveal = () => {};
uiGame.setMapPatrolReplay = () => false;
uiGame.setMapConsequencePulse = () => {};
uiGame.state = createCharacter(null, "UI采购持久化测试");
uiGame.state.world.reserve.fund = 6447;
uiGame.state.world.reserve.supplies.fieldKit = 0;
uiGame.screen = "role";
uiGame.useMaterialAction("buySupplies", "fieldKit", 2);
assert.strictEqual(uiGame.patrolTaskModal.purchaseId, "fieldKit", "采购确认弹窗必须保留物资ID");
uiGame.submitCommand();
assert.strictEqual(uiGame.state.world.reserve.fund, 6217, "UI结算应立即扣除采购基金");
assert.strictEqual(uiGame.state.world.reserve.supplies.fieldKit, 2, "UI结算应立即刷新物资库存");
const reloaded = loadState();
assert.strictEqual(reloaded.world.reserve.fund, 6217, "采购基金变化必须写入正式存档");
assert.strictEqual(reloaded.world.reserve.supplies.fieldKit, 2, "采购库存变化必须写入正式存档");
// 任务资源不足引导到物资页后，采购结算必须带回沙盘，而不是停在物资页。
const guidedGame = new Game();
guidedGame.stopLoop();
guidedGame.render = () => {};
guidedGame.toast = () => {};
guidedGame.setScreen = (screen) => { guidedGame.screen = screen; };
guidedGame.playSfx = () => {};
guidedGame.playSettlementSfx = () => {};
guidedGame.configureSettlementReveal = (modal, returnScreen) => { modal.returnScreen = returnScreen; };
guidedGame.setMapPatrolReplay = () => false;
guidedGame.setMapConsequencePulse = () => {};
guidedGame.state = createCharacter(null, "任务补给返回测试");
guidedGame.state.world.reserve.fund = 5000;
guidedGame.state.world.reserve.supplies.fieldKit = 0;
guidedGame.screen = "action";
guidedGame.openMaterialsForMissing({ id: "habitat", missing: ["野外工具包"] });
guidedGame.useMaterialAction("buySupplies", "fieldKit", 1);
assert.strictEqual(guidedGame.pendingTaskOriginScreen, "home", "任务引导采购必须记录沙盘返回位置");
guidedGame.submitCommand();
assert.strictEqual(guidedGame.settlementModal.returnScreen, "home", "任务引导采购结算后必须返回沙盘");
delete global.wx;

console.log("supply purchase check ok");
