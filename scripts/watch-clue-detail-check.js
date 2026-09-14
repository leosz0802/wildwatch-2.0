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
  getStorageSync() {
    return null;
  },
  setStorageSync() {},
  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
  onTouchCancel() {},
  onKeyboardConfirm() {},
  showToast() {}
};

const { Game } = require("../js/game");

function checkClue(modal, label, options = {}) {
  if (!modal || modal.kind !== "watchClue") throw new Error(`${label} should open watchClue detail`);
  const tags = (modal.items || []).map((item) => item.tag).join("/");
  if (options.stateDetail) {
    if (!/^总览\/指标\/指标\/指标/.test(tags)) throw new Error(`${label} should expose primary-state sub metrics, got ${tags}`);
    if (!modal.readOnly || modal.actionLabel || typeof modal.action === "function" || /行动/.test(tags)) {
      throw new Error(`${label} must remain a read-only data and risk view`);
    }
  } else if (tags !== "发生/影响/风险/行动") {
    throw new Error(`${label} should expose happen/impact/risk/action, got ${tags}`);
  }
  if (!options.stateDetail && (!modal.actionLabel || typeof modal.action !== "function" || modal.operationChannel !== "sandbox-info")) {
    throw new Error(`${label} should have a sandbox-information operation channel`);
  }
  const text = JSON.stringify(modal.items || []);
  if (!/明日|不处理|恢复点/.test(text)) throw new Error(`${label} should explain tomorrow risk or recovery opportunity`);
}

const game = new Game();
const view = game.reserveViewForDisplay();

const waterState = (view.states || []).find((item) => item.id === "water") || (view.states || [])[0] || {};
game.infoDetailModal = game.buildWatchClueDetail({ source: "state", state: waterState, view });
checkClue(game.infoDetailModal, "state", { stateDetail: true });

game.infoDetailModal = null;
game.infoDetailModal = game.buildWatchClueDetail({ source: "broadcast", row: (view.broadcasts || [])[1] || {}, view });
checkClue(game.infoDetailModal, "broadcast");

game.infoDetailModal = null;
game.openMapMarkerDetail((view.mapMarkers || [])[0]);
checkClue(game.infoDetailModal, "map marker");

console.log("watch clue detail check ok");
