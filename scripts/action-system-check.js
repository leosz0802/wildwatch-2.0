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
if (!view.actionSystem || !/基金/.test(view.actionSystem.summary || "") || /巡护节奏|线索|现场凭据/.test(view.actionSystem.summary || "")) {
  throw new Error("reserveView action summary should focus on fund and ecology, without deprecated shifts/intel/field permits");
}

const blockedReserve = game.state.world.reserve;
blockedReserve.poacherPressure = 66;
blockedReserve.fieldPermits = 0;
blockedReserve.supplies.alarm = 1;
const blocked = game.actionResourceStatus("antiPoacher", blockedReserve);
if (!blocked.canRun || blocked.missing.indexOf("现场凭据") >= 0) {
  throw new Error("field permits must not block high-risk anti-poacher action");
}

const interventionStatus = game.actionResourceStatus("intervention", blockedReserve);
if (interventionStatus.missing.indexOf("现场凭据") >= 0) {
  throw new Error("field permits must not affect intervention");
}

const routingGame = new Game();
routingGame.stopLoop();
routingGame.render = () => {};
const routingReserve = routingGame.state.world.reserve;
routingReserve.actionPoints = 0;
routingReserve.fieldPermits = 0;
routingReserve.intel = 0;
routingReserve.fund = 900;
routingReserve.supplies.tranquilizer = 2;
const interventionOpen = routingGame.actionResourceStatus("intervention", routingReserve);
if (!interventionOpen.canRun || interventionOpen.missing.includes("线索") || interventionOpen.missing.includes("现场凭据")) {
  throw new Error("intervention should only depend on its actual supply and fund costs");
}

// Non-patrol business actions must never be coerced into the default hound
// scout action.  The business/status CTA should open the real purchase flow.
routingGame.patrolTaskModal = null;
routingGame.openReserveViewAction("buySupplies", "material");
if (routingGame.screen !== "role" || routingGame.selectedReserveAction !== "buySupplies"
  || !routingGame.patrolTaskModal || routingGame.patrolTaskModal.id !== "buySupplies") {
  throw new Error("business purchase route should open the material purchase modal, not hound scout");
}

const state = createCharacter(null, "保护区卫士");
state.world.reserve.poacherPressure = 66;
state.world.reserve.fieldPermits = 1;
state.world.reserve.base.raidTickets = 1;
state.world.reserve.supplies.alarm = 2;
state.world.reserve.intel = 2;
const beforePermit = state.world.reserve.fieldPermits;
const beforeIntel = state.world.reserve.intel;
const result = withRandom(0.05, () => simulateDay("驱赶偷猎者：带白河去西部岩坡洞域排查可疑人影", state));
if ((result.visual.authorization || {}).permitUsed === true || (result.visual.authorization || {}).intelUsed === true) {
  throw new Error("deprecated permit/intel authorization must not affect simulation");
}
if (JSON.stringify(result.world.reserve.lastTaskReward || {}).includes("fieldPermits")
  || JSON.stringify(result.world.reserve.economyLedger || {}).includes("现场凭据")) {
  throw new Error("deprecated permit/intel values must not appear as action rewards or costs");
}
if (!result.world.reserveView.actionSystem || /巡护节奏|线索|现场凭据/.test(result.world.reserveView.actionSystem.summary || "")) {
  throw new Error("reserveView should not surface deprecated permit/intel system");
}

console.log("action system check ok");
