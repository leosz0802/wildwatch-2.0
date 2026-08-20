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
if (!waterDetail.readOnly || !waterDetail.navigationOnly || waterDetail.actionLabel !== "去沙盘找任务") throw new Error("low water should expose navigation guidance");
if (!grassDetail.readOnly || !grassDetail.navigationOnly || grassDetail.actionLabel !== "去沙盘找任务") throw new Error("low grass should expose navigation guidance");

game.infoDetailModal = grassDetail;
game.infoDetailModal.action();
if (game.patrolTaskModal || !game.focusedReserveMetric || game.focusedReserveMetric.type !== "grass") {
  throw new Error("grass detail should highlight a sandbox task without opening the operation directly");
}
if (game.screen !== "action") {
  throw new Error("threat detail action should stay on the current screen");
}

console.log("threat action check ok");
