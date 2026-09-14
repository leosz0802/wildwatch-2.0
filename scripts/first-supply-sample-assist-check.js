const context = new Proxy({}, {
  get(target, prop) {
    if (prop === "measureText") return () => ({ width: 10 });
    if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => ({ addColorStop() {} });
    if (!target[prop]) target[prop] = () => {};
    return target[prop];
  },
  set(target, prop, value) { target[prop] = value; return true; }
});

global.wx = {
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 1 }; },
  createCanvas() { return { width: 375, height: 667, getContext() { return context; } }; },
  createImage() { return { loaded: true, set src(value) { this._src = value; if (this.onload) this.onload(); } }; },
  getStorageSync() { return null; }, setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function prepareGame() {
  const game = new Game();
  game.stopLoop();
  game.render = () => {};
  game.state = createCharacter(null, "保护区卫士");
  game.state.ui = { onboarding: { version: 2, completed: false } };
  game.state.world.reserve.progression.totalActions = 1;
  game.state.world.reserve.fund = 0;
  game.state.world.reserve.inventory = { researchSample: 2, shedAntlerA: 1, naturalHide: 1 };
  game.screen = "action";
  return game;
}


async function main() {
  for (const [width, height] of [[320, 568], [375, 667], [430, 932]]) {
    const game = prepareGame();
    game.width = width;
    game.height = height;
    game.toast = () => {};
    game.nativeTemplateAds = { isSupported: () => true, layoutSize: () => ({ width: width - 48, height: 160 }) };
    game.render = () => {
      game.hitAreas = [];
      game.contentHeight = 0;
      game.drawRole(context);
      game.clampScroll();
    };
    const reserve = game.state.world.reserve;
    reserve.guardianCycle.day = 2;
    let ads = 0;
    let completed = false;
    game.rewardedSupplyAds = { show: async () => { ads++; return { completed, reason: completed ? "completed" : "closed_early" }; } };
    const before = JSON.stringify({ fund: reserve.fund, inventory: reserve.inventory, actions: reserve.progression.totalActions });
    game.openMaterialsForMissing({ id: "buySupplies", missing: ["基金"], purchase: { id: "all", cost: 500 } });
    const panel = game.renderedRecoveredGoodsPanel;
    assert(game.screen === "role" && !game.patrolTaskModal && !game.infoDetailModal, "shortage should show the sample table without opening another task");
    assert(panel && panel.fundGuidance && panel.actionLabel === "出售", "stored samples should offer sale first");
    assert(panel.y - game.scrollY >= game.systemTopInset() && panel.y - game.scrollY < Math.max(game.systemTopInset() + 48, height * .25), `sample header must be visible after focusing at ${width}`);
    assert(panel.h === game.recoveredGoodsHeight(reserve), "following sections must leave room for relief guidance");
    assert(ads === 0 && before === JSON.stringify({ fund: reserve.fund, inventory: reserve.inventory, actions: reserve.progression.totalActions }), "navigation must not sell, spend actions, or start ads");
    assert(panel.adAvailable, "day two should offer optional rewarded fund support");
    game.claimEmergencyFundAd();
    await Promise.resolve();
    assert(reserve.fund === 0, "closing the video early must not grant funds");
    completed = true;
    game.claimEmergencyFundAd();
    await Promise.resolve();
    assert(reserve.fund === 1000, "completed video should grant the existing exact fund reward");
    assert(!game.infoDetailModal && game.screen === "role", "reward should leave the player at the sample table");
    assert(!game.renderedRecoveredGoodsPanel.fundGuidance, "resolved shortage must remove relief guidance");

    reserve.fund = 0;
    reserve.inventory = {};
    reserve.pendingRecovered = { researchSample: 2 };
    game.render();
    assert(game.renderedRecoveredGoodsPanel.actionLabel === "收取" && !game.renderedRecoveredGoodsPanel.actionDisabled, "pending samples need a collection route");
    game.openSampleHandoverTask();
    assert(game.infoDetailModal.actionLabel === "收取并查看移交", "collection route must be executable");
    game.infoDetailModal = null;
    reserve.pendingRecovered = {};
    game.render();
    assert(game.renderedRecoveredGoodsPanel.actionLabel === "找样本", "empty stores need exploration instead of a disabled sale");
    game.openSampleHandoverTask();
    assert(game.infoDetailModal.actionLabel === "去探索样本", "empty stores must expose exploration");
    game.infoDetailModal = null;
    reserve.guardianCycle.day = 1;
    game.render();
    assert(!game.renderedRecoveredGoodsPanel.adAvailable, "day one must preserve the existing fund ad eligibility");
    reserve.fund = 400;
    game.routeReserveDevelopmentResources({ missing: ["基金还差600"] });
    assert(game.screen === "role" && game.fundSampleTarget === 1000 && game.renderedRecoveredGoodsPanel.fundGuidance, "building shortages above the low-fund threshold still need targeted support");
    reserve.fund = 0;
    game.openReserveMetricDetail("fund");
    assert(game.screen === "role" && !game.infoDetailModal, "low fund HUD should lead to the sample table");
  }
  console.log("fund sample guidance checks passed (3 viewports, stock/pending/empty, optional ads and rewards)");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
