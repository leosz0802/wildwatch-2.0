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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function withRandom(value, fn) {
  const old = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = old;
  }
}

const game = new Game();
game.stopLoop();
game.state = createCharacter(null, "保护区卫士");
game.screen = "role";
game.scrollY = 0;

const reserve = game.state.world.reserve;
reserve.fund = 648;
reserve.supplies.dogFood = 3;
reserve.supplies.tranquilizer = 4;
reserve.supplies.alarm = 0;
reserve.supplies.fieldKit = 3;

const alarmDetail = game.buildMaterialDetail("supply", "alarm");
const dartDetail = game.buildMaterialDetail("supply", "tranquilizer");
assert(alarmDetail.actionLabel === "采购警报器", "alarm detail should replenish a specific supply from material page");
assert(dartDetail.actionLabel === "采购麻醉弹", "tranquilizer detail should replenish a specific supply from material page");
assert(alarmDetail.items.some((item) => item.tag === "执行后" && item.title.indexOf("警报器 +1") >= 0 && item.title.indexOf("基金 -65") >= 0), "supply detail should preview item-specific data changes");

game.useMaterialAction("buySupplies", "alarm");
assert(game.screen === "role", "material action should stay on material screen before settlement");
assert(game.patrolTaskModal && game.patrolTaskModal.id === "buySupplies", "material action should open buy supplies confirmation");

withRandom(0.99, () => game.submitCommand());
const after = game.state.world.reserve;
assert(game.screen === "home" && game.mapConsequencePulse, "material action should reveal its consequence on the sandbox first");
assert(game.settlementModal && game.settlementModal.returnScreen === "role", "material settlement should remember the material page while the sandbox reacts");
assert(after.fund === 583, `fund should drop to 583, got ${after.fund}`);
assert(after.supplies.dogFood === 3, `dog food should stay 3, got ${after.supplies.dogFood}`);
assert(after.supplies.tranquilizer === 4, `tranquilizer should stay 4, got ${after.supplies.tranquilizer}`);
assert(after.supplies.alarm === 1, `alarm should become 1, got ${after.supplies.alarm}`);
assert(after.supplies.fieldKit === 3, `field kit should stay 3, got ${after.supplies.fieldKit}`);
assert(game.materialChangeNotice && !game.materialChangeNotice.supplies.dogFood, "material page should not show unrelated dog food delta");
assert(game.materialChangeNotice.supplies.alarm === 1, "material page should keep visible alarm delta");
assert(game.settlementModal && game.settlementModal.materials.join(" ").indexOf("警报器 +1") >= 0, "settlement should show specific supply changes");
if (game.settlementModal.silent) {
  game.settlementModal.autoFinishAt = 0;
  game.drawSettlementModal();
} else {
  assert(game.settlementModal.breakthrough && game.settlementModal.revealAt > Date.now(), "only a real breakthrough may keep a delayed full-screen material summary");
  game.finishSettlement("role");
}
assert(game.screen === "role" && !game.settlementModal, "resolved sandbox feedback should return to the material page");

game.hitAreas = [];
game.drawSupplyDepot(game.ctx, 18, 180, game.width - 36, after);
assert(game.hitAreas.length >= 4, "supply cards should remain clickable after material action");

console.log("material feedback check ok");
