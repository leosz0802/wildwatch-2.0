// Regression for the material panel's single-sale entry.
global.wx = {
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 1 }; },
  createCanvas() { return { width: 375, height: 667, getContext() { return new Proxy({}, { get(t, p) { if (p === "measureText") return (s) => ({ width: String(s || "").length * 7 }); if (p === "createLinearGradient" || p === "createRadialGradient") return () => ({ addColorStop() {} }); if (!t[p]) t[p] = () => {}; return t[p]; }, set(t, p, v) { t[p] = v; return true; } }); } }; },
  createImage() { return { loaded: true, set src(value) { this._src = value; if (this.onload) this.onload(); } }; },
  getStorageSync() { return null; }, setStorageSync() {}, showToast() {}, onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {}, onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}
};

const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
const { sellFundCapStatus, convertRecoveredGoodsToSupplies } = require("../js/sellFundCap");

const game = new Game();
game.state = createCharacter(null, "保护区卫士");
const reserve = game.state.world.reserve;
reserve.fund = 100;
reserve.inventory = { shedAntlerA: 1, shedAntlerB: 1, naturalHide: 0, researchSample: 8, recoveredTrap: 1 };
reserve.pendingRecovered = {};
reserve.guardianCycle = Object.assign({}, reserve.guardianCycle, { day: 4 });

game.drawRecoveredGoods(game.ctx, 18, 960, game.width - 36, reserve);
if (!game.renderedRecoveredGoodsPanel || game.renderedRecoveredGoodsPanel.saleEntryCount !== 1 || game.renderedRecoveredGoodsPanel.itemSaleEntries !== 0) {
  throw new Error("sample panel should expose exactly one sale entry at the header");
}

game.openRecoveredChoice();
if (!game.infoDetailModal || game.infoDetailModal.kind !== "recoveredChoice" || !game.infoDetailModal.saleOnly) {
  throw new Error("sample panel should open one unified sale confirmation");
}
const before = reserve.fund;
const sale = game.confirmRecoveredSale();
if (!sale || !sale.sold.length || reserve.fund <= before) {
  throw new Error(`sale should increase fund within the daily cap: ${JSON.stringify(sale)}`);
}
if (sellFundCapStatus(reserve).soldTimes !== 1) {
  throw new Error(`one confirm should consume exactly one sell, got ${sellFundCapStatus(reserve).soldTimes}`);
}
if (sellFundCapStatus(reserve).freeSellsLeft !== 1) {
  throw new Error("dumping the warehouse should still leave one free sell");
}
function restockWarehouse() {
  reserve.inventory = { shedAntlerA: 1, shedAntlerB: 1, naturalHide: 0, researchSample: 3, recoveredTrap: 1 };
}
let consecutive = 1;
while (consecutive < 5) {
  restockWarehouse();
  game.openRecoveredChoice();
  const next = game.confirmRecoveredSale();
  consecutive += 1;
  if (consecutive <= 2) {
    if (!next || !next.sold.length) throw new Error(`free sell ${consecutive} should still go through`);
    if (sellFundCapStatus(reserve).soldTimes !== consecutive) {
      throw new Error(`sell ${consecutive} should record soldTimes=${consecutive}, got ${sellFundCapStatus(reserve).soldTimes}`);
    }
  } else if (next && next.sold && next.sold.length) {
    throw new Error(`sell ${consecutive} must be blocked after 2 free times`);
  }
}
if (sellFundCapStatus(reserve).soldTimes !== 2) {
  throw new Error(`five consecutive confirms must stop at 2 free sells, got ${sellFundCapStatus(reserve).soldTimes}`);
}
if (sellFundCapStatus(reserve).adEligible !== true) {
  throw new Error("leftover stock after 2 consecutive sells should unlock an ad");
}
const latest = (reserve.fundLedger || []).slice(-1)[0];
if (!latest || latest.type !== "income" || latest.source !== "样本出售收入" || latest.balance !== reserve.fund) {
  throw new Error("sale should append a fund income ledger entry with the post-sale balance");
}
reserve.inventory = { shedAntlerA: 0, shedAntlerB: 0, naturalHide: 0, researchSample: 2, recoveredTrap: 0 };
reserve.dailySellFund.soldTimes = 2;
const converted = convertRecoveredGoodsToSupplies(reserve, { onlyLeftover: true });
if (!converted.count) {
  throw new Error("samples left after 2 sells should convert into patrol supplies");
}
if (Object.values(reserve.inventory).some((value) => value !== 0)) {
  throw new Error("converting leftover samples should clear the remaining warehouse");
}
const sameFund = reserve.fund;
game.openRecoveredChoice();
if (game.infoDetailModal) throw new Error("empty inventory must not reopen a sale confirmation");
if (reserve.fund !== sameFund) throw new Error("empty sale must be a no-op");

console.log("single sale flow check ok");
