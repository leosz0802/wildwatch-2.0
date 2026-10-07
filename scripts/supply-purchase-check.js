const assert = require("assert");
const { createCharacter, loadState, normalizeReserve } = require("../js/storage");
const { createReserveState } = require("../js/world");
const { simulateDay } = require("../js/simulator");
const { supplyPurchaseForQuantity, supplyPurchaseById, supplyReplenishmentPlan, supplySaleEnabled, supplyPurchaseCatalog, supplyReplenishCount } = require("../js/actions");
const { Game } = require("../js/game");
const { supplyCapFor } = require("../js/balanceConfig");
const { InterstitialAdController } = require("../js/adSystem");

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
assert.strictEqual(firstLoginReserve.fund, 1000, "新玩家首次登陆应获得1000星币");
assert.strictEqual((firstLoginReserve.coreResources || {}).fund, 1000, "核心资源中的基金应与首次登陆余额一致");
const firstSupplyPlan = supplyReplenishmentPlan(firstLoginReserve);
assert(firstSupplyPlan.items.length > 0 && firstSupplyPlan.cost <= firstLoginReserve.fund, `1000星币应足够完成首次一键补齐，实际需要${firstSupplyPlan.cost}`);
const existingReserve = normalizeReserve({ fund: 347, coreResources: { fund: 347 } }, createReserveState());
assert.strictEqual(existingReserve.fund, 347, "已有存档的星币余额不得被新手赠送覆盖");
assert.strictEqual(existingReserve.coreResources.fund, 347, "已有存档的核心资源余额必须保持同步");

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
assert(evidencePurchase && evidencePurchase.amount === 2 && evidencePurchase.cost > 0, "诱迹机关必须出现在可售商店配置中");
const evidenceResult = withRandom(.99, () => simulateDay(evidencePurchase.command, quantityState));
assert.strictEqual(evidenceResult.world.reserve.supplies.evidenceTrap, 2, "诱迹机关采购应写入真实库存");
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
batchReserve.progression = Object.assign({}, batchReserve.progression, { supplyReplenishCount: 2, supplyCapUnlocked: true });
batchReserve.fund = 5000;
Object.assign(batchReserve.supplies, { dogFood: 0, alarm: 0, tranquilizer: 1, fieldKit: 0, medicalKit: 0 });
const plan = supplyReplenishmentPlan(batchReserve);
assert.strictEqual(plan.items.length, 6, "一键补齐应覆盖全部六类短缺物资");
assert(plan.fillToCap && plan.cost > 0 && plan.cost <= batchReserve.fund, "基金足够时应按仓库上限补货");
plan.items.forEach((item) => {
  const stock = batchReserve.supplies[item.id] || 0;
  assert.strictEqual(item.amount, supplyCapFor(item.id, batchReserve) - stock, `${item.itemLabel}应按上限计算缺口`);
});
const batchResult = withRandom(.99, () => simulateDay(plan.command, batchState));
plan.items.forEach((item) => {
  assert.strictEqual(batchResult.world.reserve.supplies[item.id], supplyCapFor(item.id, batchResult.world.reserve), `${item.itemLabel}应精确补到仓库上限`);
});
assert.strictEqual(batchResult.world.reserve.lastPurchase.batch, true, "结算应保留批量采购标记");
assert.strictEqual(supplyCapFor("dogFood", batchResult.world.reserve), 10, "狗粮最大库存应为10");
assert.strictEqual(supplyCapFor("tranquilizer", batchResult.world.reserve), 10, "阻滞弹最大库存应为10");
assert.strictEqual(supplyCapFor("fieldKit", batchResult.world.reserve), 8, "野外工具包最大库存应为8");

const evenState = createCharacter(null, "最优补货测试");
quietGoal(evenState);
const evenReserve = evenState.world.reserve;
evenReserve.progression = Object.assign({}, evenReserve.progression, { supplyReplenishCount: 2, supplyCapUnlocked: true });
evenReserve.fund = 450;
Object.assign(evenReserve.supplies, { dogFood: 0, alarm: 0, tranquilizer: 0, fieldKit: 0, medicalKit: 0, evidenceTrap: 0 });
const evenPlan = supplyReplenishmentPlan(evenReserve);
assert(evenPlan.cost <= evenReserve.fund, "基金不足填满时必须按可负担数量采购");
assert(evenPlan.maxAffordableAmount === evenPlan.amount, "计划应记录基金可负担的最大采购数量");
assert(evenPlan.amount > 0, "基金足够购买至少一件物资时不能返回空计划");
assert(evenPlan.items.every((item) => item.amount > 0), "最优补货计划不得包含零数量项目");
const evenResult = withRandom(.99, () => simulateDay(evenPlan.command, evenState));
assert.ok(evenResult.world.reserve.fund < 450, "平均补货必须扣除保护基金");
assert.ok(evenResult.world.reserve.supplies.fieldKit < 8 || evenResult.world.reserve.supplies.dogFood < supplyCapFor("dogFood", evenResult.world.reserve), "基金不足时不得假装已经补满仓库");

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

const shortfallState = createCharacter(null, "采购短缺1303");
quietGoal(shortfallState);
const shortfallReserve = shortfallState.world.reserve;
shortfallReserve.fund = 1303;
const shortfallPlan = supplyReplenishmentPlan(shortfallReserve);
assert.equal(shortfallPlan.fillToCap, false, "采购短缺前两次必须补到安全线，不能一次买空仓库");
assert(shortfallPlan.cost > 0 && shortfallPlan.cost <= 1303 - 500, `1303 基金不得扣到只剩个位数，实际花费 ${shortfallPlan.cost}`);
const shortfallResult = withRandom(.99, () => simulateDay(shortfallPlan.command, shortfallState));
assert.ok(shortfallResult.world.reserve.fund >= 500, `执行结算后基金应留下安全余额，实际 ${shortfallResult.world.reserve.fund}`);
assert.ok(!shortfallResult.world.reserve.lastPurchase.blocked, "采购短缺执行结算必须真正入库");
const nextPlan = supplyReplenishmentPlan(shortfallResult.world.reserve);
assert.ok(nextPlan.amount > 0 || nextPlan.items.length === 0, "第一次补齐后补充物资仍可继续，不能整页锁死");

// 默认采购数量回归：成功采购次数由所有物资共用，而不是每个物资各自计数。
// 前两次默认补到安全线；第三次开始默认补到仓库上限，基金不足时取可负担最大数量。
const defaultState = createCharacter(null, "默认采购线测试");
quietGoal(defaultState);
defaultState.world.reserve.progression = Object.assign({}, defaultState.world.reserve.progression, {
  stage: 2,
  displayChapter: 2,
  supplyReplenishCount: 0,
  supplyCapUnlocked: true
});
defaultState.world.reserve.fund = 50000;
Object.assign(defaultState.world.reserve.supplies, {
  dogFood: 0,
  alarm: 0,
  tranquilizer: 0,
  fieldKit: 0,
  medicalKit: 0,
  evidenceTrap: 0
});
const defaultGame = new Game();
defaultGame.stopLoop();
defaultGame.render = () => {};
defaultGame.toast = () => {};
defaultGame.state = defaultState;
const firstDefault = defaultGame.currentSupplyPurchase(defaultState.world.reserve, { purchaseId: "dogFood" });
assert.strictEqual(firstDefault.amount, firstDefault.target, "第一次单项默认采购应补到安全线");
defaultGame.useMaterialAction("buySupplies", "dogFood");
assert.strictEqual(defaultGame.patrolTaskModal.purchaseAmount, firstDefault.amount, "第一次单项采购确认框应使用安全线数量");
defaultGame.submitCommand();
assert.strictEqual(supplyReplenishCount(defaultGame.state.world.reserve), 1, "第一次成功采购应写入统一采购次数");
const secondDefault = defaultGame.currentSupplyPurchase(defaultGame.state.world.reserve, { purchaseId: "alarm" });
assert.strictEqual(secondDefault.amount, Math.max(0, secondDefault.target - (defaultGame.state.world.reserve.supplies.alarm || 0)), "第二次不同物资默认采购仍应补到安全线缺口");
defaultGame.useMaterialAction("buySupplies", "alarm");
defaultGame.submitCommand();
assert.strictEqual(supplyReplenishCount(defaultGame.state.world.reserve), 2, "第二次成功采购应写入统一采购次数");
const thirdReserve = defaultGame.state.world.reserve;
const thirdDefault = defaultGame.currentSupplyPurchase(thirdReserve, { purchaseId: "dogFood" });
assert.strictEqual(thirdDefault.amount, supplyCapFor("dogFood", thirdReserve) - (thirdReserve.supplies.dogFood || 0), "第三次默认采购应补到仓库上限");

const budgetState = createCharacter(null, "基金上限采购线测试");
quietGoal(budgetState);
budgetState.world.reserve.progression = Object.assign({}, budgetState.world.reserve.progression, {
  stage: 2,
  displayChapter: 2,
  supplyReplenishCount: 2,
  supplyCapUnlocked: true
});
budgetState.world.reserve.fund = 70;
budgetState.world.reserve.supplies.dogFood = 0;
const budgetGame = new Game();
budgetGame.stopLoop();
budgetGame.render = () => {};
budgetGame.state = budgetState;
const budgetDefault = budgetGame.currentSupplyPurchase(budgetState.world.reserve, { purchaseId: "dogFood" });
assert.strictEqual(budgetDefault.amount, 3, "第三次起默认数量必须受基金限制并取可负担最大数量");
assert(budgetDefault.amount < supplyCapFor("dogFood", budgetState.world.reserve), "基金不足时不得假装补满仓库");

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

// 真机触摸回归：采购确认的右侧按钮必须是 HUD 命中。鸿蒙/部分安卓
// 在 touchend 丢失时会只执行 touchstart，因此不能依赖普通页面命中区。
const tapGame = new Game();
tapGame.stopLoop();
const fakeGradient = { addColorStop() {} };
tapGame.ctx = new Proxy({}, {
  get(target, key) {
    if (key === "measureText") return (value) => ({ width: String(value || "").length * 7 });
    if (key === "createLinearGradient" || key === "createRadialGradient") return () => fakeGradient;
    if (!target[key]) target[key] = () => {};
    return target[key];
  },
  set(target, key, value) { target[key] = value; return true; }
});
tapGame.width = 375;
tapGame.height = 667;
tapGame.dpr = 1;
tapGame.render = () => {};
tapGame.toast = () => {};
tapGame.state = createCharacter(null, "采购真机点击测试");
tapGame.screen = "role";
tapGame.state.world.reserve.fund = 1403;
tapGame.state.world.reserve.supplies.fieldKit = 0;
tapGame.useMaterialAction("buySupplies", "fieldKit", 1);
tapGame.hitAreas = [];
tapGame.drawPatrolTaskModal();
const purchaseConfirmHit = tapGame.hitAreas[tapGame.hitAreas.length - 1];
assert(purchaseConfirmHit && purchaseConfirmHit.hud, "执行结算必须注册为HUD命中");
// 还原部分鸿蒙/安卓构建上报物理像素坐标的情况，必须先归一化到逻辑画布。
tapGame.canvas = { width: 750, height: 1334 };
const physicalConfirmPoint = tapGame.touchPoint({
  x: (purchaseConfirmHit.x + purchaseConfirmHit.w / 2) * 2,
  y: (purchaseConfirmHit.y + purchaseConfirmHit.h / 2) * 2
});
tapGame.handleTap(physicalConfirmPoint.x, physicalConfirmPoint.y);
assert.strictEqual(tapGame.state.world.reserve.fund, 1298, "真机确认点击必须扣除采购基金");
assert.strictEqual(tapGame.state.world.reserve.supplies.fieldKit, 1, "真机确认点击必须写入采购库存");
assert.strictEqual(tapGame.patrolTaskModal, null, "真机确认点击后不得残留采购弹窗");
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
assert.strictEqual(guidedGame.settlementModal, null, "任务引导采购必须就地完成，不能留下卡住后续采购的结算卡");
assert.strictEqual(guidedGame.state.world.reserve.supplies.fieldKit, 1, "任务引导采购必须写入库存");

const screenshotGame = new Game();
screenshotGame.stopLoop();
screenshotGame.render = () => {};
screenshotGame.toast = () => {};
screenshotGame.setScreen = (screen) => { screenshotGame.screen = screen; };
screenshotGame.playSfx = () => {};
screenshotGame.playSettlementSfx = () => {};
screenshotGame.configureSettlementReveal = () => {};
screenshotGame.setMapPatrolReplay = () => false;
screenshotGame.setMapConsequencePulse = () => {};
screenshotGame.maybeShowInterstitialForSettlement = () => Promise.resolve();
screenshotGame.state = createCharacter(null, "高基金补给卡死测试");
screenshotGame.state.world.reserve.fund = 94031;
screenshotGame.state.world.reserve.progression = Object.assign({}, screenshotGame.state.world.reserve.progression, {
  stage: 6,
  displayChapter: 6,
  level: 4,
  supplyReplenishCount: 2,
  supplyCapUnlocked: true
});
screenshotGame.state.world.reserve.guardianCycle = Object.assign({}, screenshotGame.state.world.reserve.guardianCycle || {}, { day: 9 });
Object.assign(screenshotGame.state.world.reserve.supplies, {
  dogFood: 10,
  tranquilizer: 3,
  alarm: 6,
  fieldKit: 0,
  medicalKit: 2,
  evidenceTrap: 2
});
screenshotGame.screen = "role";
screenshotGame.settlementModal = {
  silent: false,
  grade: "A",
  presentationScreen: "home",
  title: "过期结算"
};
screenshotGame.useMaterialAction("buySupplies", "all");
assert.strictEqual(screenshotGame.patrolTaskModal.purchaseId, "all", "物资页一键补齐必须打开批量采购确认");
assert.strictEqual(screenshotGame.confirmPatrolTask(screenshotGame.patrolTaskModal), true, "未展示在当前页的结算不得卡住补给采购");
assert.strictEqual(screenshotGame.state.world.reserve.supplies.fieldKit, 8, "高基金时野外工具包必须能补到上限8");
assert.strictEqual(screenshotGame.screen, "role", "物资页采购完成后应留在物资页看到库存变化");
assert.ok(screenshotGame.state.world.reserve.fund < 94031, "采购必须扣除保护基金");

const freezeGame = new Game();
freezeGame.stopLoop();
freezeGame.render = () => {};
freezeGame.toast = () => {};
freezeGame.setScreen = (screen) => { freezeGame.screen = screen; };
freezeGame.playSfx = () => {};
freezeGame.playSettlementSfx = () => {};
freezeGame.configureSettlementReveal = () => {};
freezeGame.setMapPatrolReplay = () => false;
freezeGame.setMapConsequencePulse = () => {};
let freezeTaps = 0;
freezeGame.hitAreaAt = () => ({ onTap() { freezeTaps += 1; } });
freezeGame.interstitialAds = new InterstitialAdController({
  createInterstitialAd() {
    return {
      onClose() {},
      onError() {},
      show() { return Promise.resolve(); }
    };
  },
  getStorageSync() { return null; },
  setStorageSync() {}
}, { now: () => Date.now(), config: { timeCooldownMs: 0, minActionCount: 0, firstGuardianDay: 1, guardianDayCooldown: 0, minActiveSeconds: 0 } });
freezeGame.state = createCharacter(null, "补给插屏卡死测试");
quietGoal(freezeGame.state);
freezeGame.state.world.reserve.fund = 5000;
freezeGame.state.world.reserve.progression = Object.assign({}, freezeGame.state.world.reserve.progression, { totalActions: 8 });
Object.assign(freezeGame.state.world.reserve.supplies, {
  dogFood: 0, alarm: 0, tranquilizer: 0, fieldKit: 0, medicalKit: 0, evidenceTrap: 0
});
freezeGame.screen = "role";
withRandom(.99, () => {
  freezeGame.useMaterialAction("buySupplies", "all");
  assert.strictEqual(freezeGame.confirmPatrolTask(freezeGame.patrolTaskModal), true, "物资页就地采购必须能完成结算");
});
assert.strictEqual(freezeGame.screen, "role", "补充物资后应留在物资页");
assert.strictEqual(freezeGame.patrolTaskModal, null, "补充物资后不得留下确认弹窗");
assert.strictEqual(freezeGame.settlementModal, null, "补充物资后不得留下结算弹窗");
assert.strictEqual(freezeGame.interstitialAds.showing, false, "物资页采购不得留下插屏锁");
freezeGame.handleTap(24, 24);
assert.strictEqual(freezeTaps, 1, "补充物资后任意按钮必须仍可点击");
delete global.wx;

console.log("supply purchase check ok");
