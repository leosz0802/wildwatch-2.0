function createFakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (text) => ({ width: String(text || "").length * 7 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (prop === "canvas") return { width: 375, height: 667 };
      if (!target[prop]) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    }
  });
}

global.wx = {
  getSystemInfoSync() {
    return { windowWidth: 375, windowHeight: 667, pixelRatio: 1 };
  },
  createCanvas() {
    return {
      width: 375,
      height: 667,
      getContext() {
        return createFakeContext();
      }
    };
  },
  createImage() {
    return {
      loaded: true,
      set src(value) {
        this._src = value;
        this.loaded = true;
        if (this.onload) this.onload();
      },
      get src() {
        return this._src;
      }
    };
  },
  getStorageSync() {
    return null;
  },
  setStorageSync() {},
  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
  onTouchCancel() {},
  onKeyboardConfirm() {},
  onAppHide() {},
  onAppShow() {},
  showToast() {}
};

const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
const { simulateDay } = require("../js/simulator");

function withRandom(value, fn) {
  const old = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = old;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const game = new Game();
game.ctx = createFakeContext();
game.width = 375;
game.height = 667;
game.state = createCharacter(null, "保护区卫士");

const reserve = game.state.world.reserve;
reserve.inventory.shedAntlerA = 1;
reserve.inventory.researchSample = 2;

const salvageAction = game.reserveActionOptions().find((item) => item.id === "salvage");
assert(salvageAction && salvageAction.label === "移交守护样本", "salvage action should be presented as transferring guardian samples");

const salvageStatus = game.actionResourceStatus("salvage", reserve);
assert(salvageStatus.costs.some((line) => /库存/.test(line)), "salvage status should consume inventory, not vague recovered goods");

const labels = game.recoveredGoodsCollectionSignals(reserve).map((item) => item.label).join("/");
assert(labels === "等级/关系/随机", `collection signals should be level, animal relationship and randomness, got ${labels}`);

const detail = game.buildMaterialDetail("goods", "shedAntlerA");
const detailText = JSON.stringify(detail.items || []);
assert(/探索/.test(detailText) && /移交/.test(detailText), "goods detail should separate exploration and transfer");
["等级", "关系", "随机"].forEach((word) => {
  assert(detailText.includes(word), `goods detail should explain ${word}`);
});
assert(detail.actionLabel === "移交守护样本", `goods detail action should transfer inventory, got ${detail.actionLabel}`);

const emptyGame = new Game();
emptyGame.ctx = createFakeContext();
emptyGame.width = 375;
emptyGame.height = 667;
emptyGame.state = createCharacter(null, "保护区卫士");
emptyGame.state.world.reserve.inventory.shedAntlerA = 0;
const emptyDetail = emptyGame.buildMaterialDetail("goods", "shedAntlerA");
assert(emptyDetail.actionLabel === "去探索", `empty goods should point to exploration, got ${emptyDetail.actionLabel}`);
emptyGame.render = () => {};
emptyGame.screen = "role";
emptyGame.infoDetailModal = emptyDetail;
emptyDetail.action();
assert(emptyGame.screen === "role", "empty goods exploration should stay on the materials page");
assert(emptyGame.infoDetailModal && emptyGame.infoDetailModal.kind === "materialExploration" && /动物引路/.test(emptyGame.infoDetailModal.kicker), "empty goods should open the current animal-guided material exploration modal");
assert(!emptyGame.patrolTaskModal, "empty goods exploration should not open the patrol task modal");

const patrolOverviewGame = new Game();
patrolOverviewGame.ctx = createFakeContext();
patrolOverviewGame.width = 375;
patrolOverviewGame.height = 667;
patrolOverviewGame.render = () => {};
patrolOverviewGame.screen = "role";
patrolOverviewGame.state = createCharacter(null, "保护区卫士");
const patrolOverview = patrolOverviewGame.buildMaterialDetail("patrolDays");
assert(patrolOverview.actionLabel === "去巡护", `patrol sustain detail should expose patrol shortcut, got ${patrolOverview.actionLabel}`);
patrolOverviewGame.infoDetailModal = patrolOverview;
patrolOverview.action();
assert(patrolOverviewGame.screen === "action", "patrol sustain shortcut should open the full patrol operation screen");
assert(!patrolOverviewGame.infoDetailModal && !patrolOverviewGame.patrolTaskModal, "patrol sustain shortcut should not open the legacy task modal");

const pendingGame = new Game();
pendingGame.ctx = createFakeContext();
pendingGame.width = 375;
pendingGame.height = 667;
pendingGame.render = () => {};
pendingGame.state = createCharacter(null, "保护区卫士");
pendingGame.state.world.reserve.inventory.recoveredTrap = 0;
pendingGame.state.world.reserve.pendingRecovered.recoveredTrap = 2;
const pendingDetail = pendingGame.buildMaterialDetail("goods", "recoveredTrap");
assert(pendingDetail.actionLabel === "收取入库", `pending goods should be collected before sale, got ${pendingDetail.actionLabel}`);
pendingGame.collectRecoveredGood("recoveredTrap");
assert(pendingGame.state.world.reserve.pendingRecovered.recoveredTrap === 0, "collect should clear pending recovered goods");
assert(pendingGame.state.world.reserve.inventory.recoveredTrap === 2, "collect should move pending goods into inventory");
const collectedDetail = pendingGame.buildMaterialDetail("goods", "recoveredTrap");
assert(collectedDetail.actionLabel === "移交执法部门", `collected evidence should be transferred to law enforcement, got ${collectedDetail.actionLabel}`);

const saleState = createCharacter(null, "保护区卫士");
saleState.world.reserve.inventory.shedAntlerA = 1;
saleState.world.reserve.inventory.researchSample = 2;
const saleBeforeFund = saleState.world.reserve.fund;
const saleResult = withRandom(0.99, () => simulateDay("移交仓库里的脱落鹿角和研究样本", saleState));
const sale = saleResult.visual && saleResult.visual.salvageEconomy;
assert(sale && sale.sold.length === 3, "selling recovered goods should expose sold inventory");
assert(saleResult.world.reserve.fund > saleBeforeFund, "selling recovered goods should increase fund");
assert(saleResult.world.reserve.inventory.shedAntlerA === 0, "selling recovered goods should consume antler inventory");

// 覆盖真机问题：物资页滚动到广告和出售区后完成移交，不应跳回沙盘、
// 启动五秒回放或重置滚动位置，否则原生广告会被隐藏并表现为卡顿。
const saleUiGame = new Game();
saleUiGame.stopLoop();
saleUiGame.render = () => {};
saleUiGame.toast = () => {};
saleUiGame.playSfx = () => {};
saleUiGame.state = createCharacter(null, "出售留页测试");
saleUiGame.state.world.reserve.inventory.researchSample = 2;
saleUiGame.screen = "role";
saleUiGame.scrollY = 426;
const saleUiBeforeFund = saleUiGame.state.world.reserve.fund;
saleUiGame.openRecoveredChoice("researchSample");
saleUiGame.confirmRecoveredChoice();
assert(saleUiGame.patrolTaskModal && saleUiGame.patrolTaskModal.id === "salvage", "sale confirmation should prepare the salvage command");
withRandom(0.99, () => saleUiGame.submitCommand());
assert(saleUiGame.screen === "role", "completed sale should remain on the materials page");
assert(saleUiGame.scrollY === 426, "completed sale should preserve the ad and goods viewport");
assert(!saleUiGame.settlementModal && !saleUiGame.mapPatrolReplay, "completed sale should not leave a hidden sandbox settlement or replay");
assert(saleUiGame.state.world.reserve.fund > saleUiBeforeFund, "inline sale should still grant the exact project funding");
assert(saleUiGame.state.world.reserve.inventory.researchSample === 0, "inline sale should still consume the transferred samples");

const emptySaleState = createCharacter(null, "保护区卫士");
["shedAntlerA", "shedAntlerB", "naturalHide", "researchSample", "recoveredTrap"].forEach((key) => {
  emptySaleState.world.reserve.inventory[key] = 0;
});
const emptySaleResult = withRandom(0.9, () => simulateDay("移交仓库里的守护样本", emptySaleState));
const emptySale = emptySaleResult.visual && emptySaleResult.visual.salvageEconomy;
assert(emptySale && emptySale.sold.length === 0 && emptySale.value === 0, "empty sale should not create sale value");
assert(!/(?:研究补助|联合执法拨款)\s*\+\d+/.test(emptySaleResult.visual.quickFeedback || ""), "empty transfer should not claim funding from empty inventory");

const patrolState = createCharacter(null, "保护区卫士");
patrolState.world.reserve.inventory.recoveredTrap = 0;
patrolState.world.reserve.pendingRecovered.recoveredTrap = 0;
patrolState.world.reserve.supplies.alarm = 2;
patrolState.world.reserve.intel = 2;
const patrolResult = withRandom(0.1, () => simulateDay("驱赶偷猎者，检查河岸直线脚印", patrolState));
assert((patrolResult.world.reserve.pendingRecovered.recoveredTrap || 0) > 0, "patrol recovered goods should enter pending collection");
assert((patrolResult.world.reserve.inventory.recoveredTrap || 0) === 0, "patrol recovered goods should not become sellable before collection");

const socialRecoveryState = createCharacter(null, "保护区卫士");
socialRecoveryState.world.reserve.pendingRecovered.researchSample = 0;
socialRecoveryState.world.reserve.pendingRecovered.recoveredTrap = 0;
const socialRecoveryResult = withRandom(0.9, () => simulateDay("抢回回收物：派猎犬搜寻共享回收点", socialRecoveryState));
const recoveredGain = socialRecoveryResult.visual && socialRecoveryResult.visual.recoveredGoodsGain;
assert(recoveredGain && recoveredGain.total === 2, "social recovery should expose a two-item material gain");
assert(socialRecoveryResult.world.reserve.pendingRecovered.researchSample >= 1, "social recovery should add at least one research sample to pending collection");
assert(socialRecoveryResult.world.reserve.pendingRecovered.recoveredTrap >= 1, "social recovery should add at least one trap evidence to pending collection");
assert(/物质回收\+2/.test(socialRecoveryResult.visual.quickFeedback || ""), "social recovery feedback should state the material increase");

console.log("recovered goods flow check ok");
