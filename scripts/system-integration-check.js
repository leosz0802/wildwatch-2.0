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
  onAppHide() {},
  onAppShow() {},
  showToast() {}
};

const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
const { simulateDay } = require("../js/simulator");
const { reserveActionCatalog } = require("../js/actions");

function withRandom(value, fn) {
  const old = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = old;
  }
}

function makeGame() {
  const game = new Game();
  game.stopLoop();
  game.render = () => {};
  game.state = createCharacter(null, "保护区卫士");
  return game;
}

const game = makeGame();
const actions = reserveActionCatalog();
const options = game.reserveActionOptions();

if (options.length !== 6 || actions.length !== 6) {
  throw new Error("reserve should expose exactly six main actions");
}

actions.forEach((action, index) => {
  const option = options[index];
  if (!option || option.id !== action.id) throw new Error(`action order mismatch at ${action.id}`);
  ["label", "icon", "template", "hint", "placeholder", "effect", "rewardPreview"].forEach((key) => {
    if (!action[key]) throw new Error(`${action.id} missing ${key} in action catalog`);
  });
  if (/砾灰|白河|苔点/.test(action.placeholder)) {
    throw new Error(`${action.id} placeholder should use squad wording, not one dog`);
  }
  if (game.patrolEffectText(action.id) !== action.effect) {
    throw new Error(`${action.id} effect text should come from action catalog`);
  }
});

const reserve = game.state.world.reserve;
reserve.fund = 800;
reserve.supplies.dogFood = 8;
reserve.supplies.alarm = 3;
reserve.supplies.tranquilizer = 4;
reserve.supplies.fieldKit = 2;
reserve.inventory.shedAntlerA = 1;
reserve.inventory.researchSample = 1;
game.selectedPurchaseId = "dogFood";

const statusExpectations = {
  houndScout: ["狗粮 1"],
  antiPoacher: ["警报器 1"],
  habitat: ["野外工具包 1"],
  salvage: ["库存"],
  intervention: ["阻滞弹 1"],
  buySupplies: ["基金 95", "狗粮 +4"]
};

actions.forEach((action) => {
  const status = game.actionResourceStatus(action.id, reserve);
  if (!status.canRun) throw new Error(`${action.id} should be runnable in prepared reserve`);
  const line = game.patrolCostLine(action.id, reserve);
  statusExpectations[action.id].forEach((text) => {
    if (!line.includes(text)) throw new Error(`${action.id} cost line missing ${text}: ${line}`);
  });
});

const state = createCharacter(null, "保护区卫士");
state.world.reserve.fund = 800;
state.world.reserve.supplies.dogFood = 8;
state.world.reserve.supplies.alarm = 3;
state.world.reserve.supplies.tranquilizer = 4;
state.world.reserve.supplies.fieldKit = 2;
state.world.reserve.inventory.shedAntlerA = 1;
state.world.reserve.inventory.researchSample = 1;
state.world.reserve.houndTeam.tracking = 48;
state.world.reserve.houndTeam.stamina = 86;

const scout = withRandom(0.2, () => simulateDay(actions[0].placeholder.replace("例如：", ""), state));
if (scout.world.reserve.supplies.dogFood !== 7) {
  throw new Error("hound scout should consume one dog food");
}
if ((scout.world.reserve.houndTeam.tracking || 0) <= 48) {
  throw new Error("hound scout should improve squad tracking");
}

const legacy = withRandom(0.8, () => simulateDay("资源运营：整理回收记录", state));
if (!legacy.visual || !/移交守护样本/.test(legacy.visual.quickFeedback || "")) {
  throw new Error("legacy resource-operation wording should resolve into the six-action salvage loop");
}

const supplyState = createCharacter(null, "保护区卫士");
supplyState.world.reserve.fund = 800;
const supply = withRandom(0.8, () => simulateDay("采购狗粮包", supplyState));
if (supply.world.reserve.fund >= supplyState.world.reserve.fund || supply.world.reserve.supplies.dogFood <= supplyState.world.reserve.supplies.dogFood) {
  throw new Error("buy supplies should convert fund into the selected supply");
}
if (supply.world.reserve.supplies.tranquilizer !== supplyState.world.reserve.supplies.tranquilizer) {
  throw new Error("buy supplies should not replenish unrelated supplies");
}

const squad = game.houndTeamSummary();
if (!squad.title || !Number.isFinite(squad.tracking) || !Number.isFinite(squad.pursuit) || !Number.isFinite(squad.guard)) {
  throw new Error("hound team summary should expose squad-level progression");
}

console.log("system integration check ok");
