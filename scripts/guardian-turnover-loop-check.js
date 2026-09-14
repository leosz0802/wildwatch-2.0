const assert = require("assert");
const { Game } = require("../js/game");
const { createCharacter, loadState } = require("../js/storage");
const { guardianContext } = require("../js/guardianCycle");
const { supplyReplenishmentPlan } = require("../js/actions");
const { simulateDay } = require("../js/simulator");

const game = new Game();
game.stopLoop();
game.render = () => {};
game.toast = () => {};
game.playSfx = () => {};
game.playSettlementSfx = () => {};
game.onboardingHomeGuide = () => null;
game.setScreen = (screen) => { game.screen = screen; return true; };
game.maybeShowInterstitialForSettlement = async () => {};
const originalWx = global.wx;
const saved = {};
global.wx = {
  getStorageSync: (key) => saved[key] ? JSON.parse(JSON.stringify(saved[key])) : null,
  setStorageSync: (key, value) => { saved[key] = JSON.parse(JSON.stringify(value)); }
};

function reset() {
  game.state = createCharacter(null, "周转任务回归");
  game.infoDetailModal = null;
  game.patrolTaskModal = null;
  game.settlementModal = null;
  game.screen = "home";
  const reserve = game.state.world.reserve;
  reserve.guardianCycle.day = 3;
  reserve.guardianCycle.actionIndex = 0;
  reserve.guardianCycle.sevenDay = { completed: {}, progress: {}, highlights: [] };
  reserve.inventory = {};
  reserve.pendingRecovered = {};
  reserve.fundLedger = [];
  reserve.fund = 987;
  Object.assign(reserve.supplies, { dogFood: 2, tranquilizer: 3, alarm: 2, fieldKit: 2, medicalKit: 2, evidenceTrap: 2 });
  return reserve;
}

try {
  let reserve = reset();
  const originalFund = reserve.fund;
  assert.match(game.sandboxPrimaryGuidance().title, /先探索/);
  game.activateGuardianBeat("salvage");
  assert.match(game.infoDetailModal.title, /先找到/);
  assert.strictEqual(game.infoDetailModal.actionLabel, "去探索样本");
  game.infoDetailModal.action();
  assert.strictEqual(game.infoDetailModal.kind, "materialExploration", "空仓任务必须进入探索，不应反复跳转空出售页或猎犬侦察");
  assert.strictEqual(game.infoDetailModal.targetId, "researchSample");
  assert.strictEqual(reserve.fund, originalFund, "导航不收钱、不伪造样本");
  assert.deepStrictEqual(reserve.inventory, {});

  // 探索成功后的真实发现 -> 收取 -> 即时出售 -> 批量补给 -> 完成。
  const exploration = simulateDay("跟随动物探索森林，寻找自然遗留。目标:researchSample 掷骰:6", game.state);
  game.state.world = exploration.world;
  game.state.character = exploration.character;
  reserve = game.state.world.reserve;
  assert(game.recoveredGoodsCount(reserve.pendingRecovered) > 0);
  assert.match(game.sandboxPrimaryGuidance().title, /先收取/);
  game.activateGuardianBeat("salvage");
  assert.strictEqual(game.infoDetailModal.actionLabel, "收取并查看移交");
  game.infoDetailModal.action();
  assert.strictEqual(game.infoDetailModal.kind, "recoveredChoice");
  assert(game.recoveredGoodsCount(reserve.inventory) > 0);
  const dayBefore = reserve.guardianCycle.day;
  const actionIndexBefore = reserve.guardianCycle.actionIndex;
  const beforeSale = reserve.fund;
  const sale = game.confirmRecoveredSale();
  assert(sale.sold.length > 0);
  assert.strictEqual(reserve.fund, beforeSale + sale.value);
  assert(reserve.guardianCycle.sevenDay.progress[3].includes("salvage"), "即时出售必须登记第一次周转的移交进度");
  assert.strictEqual(reserve.guardianCycle.day, dayBefore);
  assert.strictEqual(reserve.guardianCycle.actionIndex, actionIndexBefore, "即时出售仍不消耗巡护时段");
  assert.strictEqual(game.sandboxPrimaryGuidance().beatActionId, "buySupplies");
  const afterSale = reserve.fund;
  assert.strictEqual(game.confirmRecoveredSale(), false, "重复确认不应重复出售或加钱");
  assert.strictEqual(reserve.fund, afterSale);
  game.state = loadState();
  assert(game.state.world.reserve.guardianCycle.sevenDay.progress[3].includes("salvage"), "重启后不应要求重复移交");
  game.activateGuardianBeat("salvage"); // 出售前缓存的旧入口。
  assert.strictEqual(game.patrolTaskModal.id, "buySupplies");
  assert.strictEqual(game.patrolTaskModal.purchaseId, "all", "下一步必须补齐全部短缺，不应再次要求找样本");
  const plan = supplyReplenishmentPlan(game.state.world.reserve);
  // 此处验证基础补齐数量；随机的供应商赠品会额外增加狗粮或警报器。
  // 固定为无赠品分支，避免正确发放赠品时偶发报错。
  const randomBeforePurchase = Math.random;
  try {
    Math.random = () => 0.99;
    game.submitCommand();
  } finally {
    Math.random = randomBeforePurchase;
  }
  reserve = game.state.world.reserve;
  plan.items.forEach((item) => assert.strictEqual(reserve.supplies[item.id], item.target));
  assert.strictEqual(reserve.guardianCycle.sevenDay.completed[3], true);
  assert.strictEqual(game.sandboxPrimaryGuidance().guardianBeat, null, "完成后更多线索里不应再出现周转任务");
  game.patrolTaskModal = null;
  game.activateGuardianBeat("salvage");
  assert.strictEqual(game.infoDetailModal, null);
  assert.strictEqual(game.patrolTaskModal, null, "已完成的缓存入口不能重开任务");

  // 修复视频对应旧档：样本售完，流水存在，但七日任务没有登记。
  reserve = reset();
  reserve.fundLedger = [{ source: "样本出售收入", amount: 121, day: 3 }];
  const savedInventory = JSON.stringify(reserve.inventory);
  const fundBeforeRepair = reserve.fund;
  assert.strictEqual(game.sandboxPrimaryGuidance().beatActionId, "buySupplies");
  game.activateGuardianBeat("salvage");
  assert.strictEqual(game.patrolTaskModal.purchaseId, "all");
  assert.strictEqual(reserve.fund, fundBeforeRepair);
  assert.strictEqual(JSON.stringify(reserve.inventory), savedInventory);
  assert(loadState().world.reserve.guardianCycle.sevenDay.progress[3].includes("salvage"));
  reserve.guardianCycle.sevenDay.progress[3] = ["buySupplies"];
  assert.strictEqual(guardianContext(reserve).cycle.sevenDay.completed[3], true, "旧档已采购且已出售时应直接恢复完成状态");

  for (const entry of [
    { source: "样本出售收入", amount: 121, day: 2 },
    { source: "游客运营收入", amount: 121, day: 3 },
    { source: "样本出售收入", amount: 0, day: 3 },
    { source: "样本出售收入", amount: -121, day: 3 }
  ]) {
    reserve = reset();
    reserve.fundLedger = [entry];
    assert.strictEqual(game.sandboxPrimaryGuidance().beatActionId, "salvage", "其他收入或其他日期不得假完成移交");
  }
  reserve = reset();
  game.openRecoveredChoice();
  assert.strictEqual(reserve.guardianCycle.sevenDay.progress[3], undefined, "空仓点击不得记作有效移交");
  reserve = reset();
  reserve.guardianCycle.sevenDay.progress[3] = ["salvage"];
  Object.assign(reserve.supplies, { dogFood: 6, tranquilizer: 3, alarm: 2, fieldKit: 2, medicalKit: 2, evidenceTrap: 2 });
  const fullStockFund = reserve.fund;
  game.activateGuardianBeat("buySupplies");
  assert.strictEqual(reserve.guardianCycle.sevenDay.completed[3], true, "已通过其他方式补齐时不得再循环要求采购");
  assert.strictEqual(reserve.fund, fullStockFund, "库存达标检查不收费、不伪造采购流水");
  assert.strictEqual(game.patrolTaskModal, null);
  console.log("guardian turnover loop check ok (empty inventory, collection, sale, batch purchase, completion, reload and legacy recovery)");
} finally {
  if (originalWx === undefined) delete global.wx;
  else global.wx = originalWx;
}
