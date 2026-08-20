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

const game = new Game();
game.stopLoop();
game.render = () => {};
const view = game.reserveViewForDisplay();
if (!view.actionSystem || !/班次/.test(view.actionSystem.summary || "") || !/外勤/.test(view.actionSystem.summary || "")) {
  throw new Error("reserveView should expose actionSystem summary with shifts/intel/field permits");
}

const blockedReserve = game.state.world.reserve;
blockedReserve.poacherPressure = 66;
blockedReserve.fieldPermits = 0;
blockedReserve.supplies.alarm = 1;
const blocked = game.actionResourceStatus("antiPoacher", blockedReserve);
if (blocked.canRun || blocked.missing.indexOf("外勤证") < 0) {
  throw new Error("high-risk anti-poacher action should require field permit");
}

const interventionStatus = game.actionResourceStatus("intervention", blockedReserve);
if (interventionStatus.missing.indexOf("外勤证") < 0) {
  throw new Error("intervention should require field permit");
}

const routingGame = new Game();
routingGame.stopLoop();
routingGame.render = () => {};
const routingReserve = routingGame.state.world.reserve;
routingReserve.actionPoints = 4;
routingReserve.fieldPermits = 3;
routingReserve.intel = 0;
routingReserve.fund = 900;
routingReserve.supplies.tranquilizer = 2;
const intelBlocked = routingGame.actionResourceStatus("intervention", routingReserve);
const intelRoute = routingGame.missingResourceRoute(intelBlocked);
if (!intelRoute || intelRoute.kind !== "intel" || intelRoute.label !== "去侦察获取") {
  throw new Error("missing intel should expose a direct hound-scout route");
}
routingGame.patrolTaskModal = routingGame.reserveActionOptions().find((item) => item.id === "intervention");
routingGame.openMissingResourceRoute(intelBlocked);
if (routingGame.screen !== "action" || routingGame.selectedReserveAction !== "houndScout"
  || !routingGame.patrolTaskModal || routingGame.patrolTaskModal.id !== "houndScout") {
  throw new Error("missing intel route should open the real hound-scout operation");
}
if (routingReserve.intel !== 0) {
  throw new Error("opening an acquisition route must not grant intel before settlement");
}

// Non-patrol business actions must never be coerced into the default hound
// scout action.  The business/status CTA should open the real purchase flow.
routingGame.patrolTaskModal = null;
routingGame.openReserveViewAction("buySupplies", "material");
if (routingGame.screen !== "role" || routingGame.selectedReserveAction !== "buySupplies"
  || !routingGame.patrolTaskModal || routingGame.patrolTaskModal.id !== "buySupplies") {
  throw new Error("business purchase route should open the material purchase modal, not hound scout");
}

const resourceGuides = [
  ["actionPoints", "采购 +2", "现场行动 -1"],
  ["intel", "侦察 +1~2", "情报 2 + 基金 60"],
  ["fieldPermits", "完成当前目标 +1", "情报 2 + 基金 60"]
];
resourceGuides.forEach(([kind, gain, cost]) => {
  const detail = routingGame.buildActionResourceDetail(kind);
  const text = JSON.stringify(detail);
  if (detail.resourceKind !== kind || !/用途/.test(text) || !text.includes(gain) || !text.includes(cost)) {
    throw new Error(`${kind} guide must explain purpose, real gain and real consumption`);
  }
});

const state = createCharacter(null, "保护区卫士");
state.world.reserve.poacherPressure = 66;
state.world.reserve.fieldPermits = 1;
state.world.reserve.base.raidTickets = 1;
state.world.reserve.supplies.alarm = 2;
state.world.reserve.intel = 2;
const beforePermit = state.world.reserve.fieldPermits;
const result = withRandom(0.05, () => simulateDay("驱赶偷猎者：带白河去西部岩坡洞域排查可疑人影", state));
if ((result.visual.authorization || {}).permitUsed !== true) {
  throw new Error("high-risk anti-poacher simulation should consume field permit authorization");
}
if ((result.world.reserve.fieldPermits || 0) !== beforePermit - 1) {
  throw new Error("high-risk action should spend one earned field permit without automatic daily refill");
}
if (!result.world.reserveView.actionSystem || !result.world.reserveView.actionSystem.lastAuthorization) {
  throw new Error("reserveView should carry last authorization");
}

const settlementGame = new Game();
settlementGame.stopLoop();
settlementGame.render = () => {};
settlementGame.state = state;
const before = settlementGame.reserveSnapshot(state.world.reserve);
const after = settlementGame.reserveSnapshot(result.world.reserve);
const modal = settlementGame.buildPatrolSettlement(before, after, result, "驱赶偷猎者：带白河去西部岩坡洞域排查可疑人影");
if (!JSON.stringify(modal.rewards || []).includes("外勤证")) {
  throw new Error("settlement should mention field permit cost");
}

console.log("action system check ok");
