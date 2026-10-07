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

const game = new Game();
game.stopLoop();
game.state = createCharacter(null, "保护区卫士");
game.screen = "action";
game.infoDetailModal = null;
game.patrolTaskModal = null;

const reserve = game.state.world.reserve;
reserve.poacherPressure = 62;
reserve.ecology.water = 60;
reserve.ecology.disease = 12;
reserve.ecology.grass = 41;
reserve.migration = { delta: 6, reason: "安全等级较高，周边动物迁入保护区" };

const expected = {
  poacher: "antiPoacher",
  water: "habitat",
  disease: "houndScout",
  grass: "habitat",
  migration: "habitat",
  safety: "antiPoacher"
};

Object.keys(expected).forEach((type) => {
  const action = game.reserveMetricAction(type, reserve);
  if (!action || action.id !== expected[type] || !action.shortLabel || !action.ctaLabel) {
    throw new Error(`${type} should link to ${expected[type]}, got ${action && action.id}`);
  }
});

const fundDetail = game.buildReserveMetricDetail("fund");
if (!fundDetail.readOnly || fundDetail.action || fundDetail.actionLabel) throw new Error("fund detail should remain data-only");
const waterDetail = game.buildReserveMetricDetail("water");
const grassDetail = game.buildReserveMetricDetail("grass");
if (!waterDetail.readOnly || waterDetail.navigationOnly || waterDetail.actionLabel !== "修复饮水点") throw new Error("low water should expose a direct repair task");
if (!grassDetail.readOnly || grassDetail.navigationOnly || grassDetail.actionLabel !== "恢复草场") throw new Error("low grass should expose a direct repair task");

game.infoDetailModal = grassDetail;
game.infoDetailModal.action();
if (!game.patrolTaskModal || game.patrolTaskModal.id !== "habitat" || game.patrolTaskModal.metricFocus !== "grass") {
  throw new Error("grass detail should open the focused repair operation directly");
}
if (game.screen !== "action") {
  throw new Error("threat detail action should stay on the current screen");
}

game.patrolTaskModal = null;
game.hitAreas = [];
game.scrollY = 0;
reserve.poacherPressure = 62;
reserve.ecology.water = 33;
game.drawPatrolThreatBoard(game.ctx, 12, 88, game.width - 24, reserve);
const urgent = (game.renderedPatrolThreatTiles || [])[0];
if (!urgent || urgent.clickable !== true || urgent.recommendedAction !== "antiPoacher") {
  throw new Error("high poacher pressure on the patrol board must be tappable");
}
const alarmBeforeUrgent = reserve.supplies.alarm || 0;
game.handleTap(urgent.x + 40, urgent.y + 24);
if (game.patrolTaskModal) {
  throw new Error("tapping 当前最急 must settle 驱赶偷猎 immediately, not open an intermediate page");
}
if ((reserve.supplies.alarm || 0) >= alarmBeforeUrgent && !game.settlementModal) {
  throw new Error("tapping 当前最急 must start the matching patrol settlement");
}

console.log("threat action check ok");
