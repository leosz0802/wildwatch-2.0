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

const state = createCharacter(null, "保护区卫士");
state.world.reserve.supplies.dogFood = 5;
state.world.reserve.houndTeam.level = 1;
state.world.reserve.houndTeam.xp = 35;
state.world.reserve.houndTeam.nextXp = 40;
state.world.reserve.houndTeam.tracking = 48;
state.world.reserve.houndTeam.stamina = 86;
const command = "派猎犬侦察：让猎犬队去中央混交林搜寻陷阱和陌生气味";
const before = game.reserveSnapshot(state.world.reserve);
const result = withRandom(0.01, () => simulateDay(command, state));
const after = game.reserveSnapshot(result.world.reserve);

if (!result.visual || !result.visual.houndGrowth || !result.visual.variableReward) {
  throw new Error("patrol result should expose hound growth and variable reward");
}
if (!result.visual.houndGrowth.levelUp || result.world.reserve.houndTeam.level < 2) {
  throw new Error("hound team should level up when enough patrol xp is earned");
}
if (!result.visual.variableReward.label || !result.visual.quickFeedback) {
  throw new Error("variable reward should be visible in quick feedback");
}
if (result.world.reserve.supplies.dogFood !== 4) {
  throw new Error("hound scout should still consume dog food while granting hound xp");
}
if ((after.houndTeam.tracking || 0) <= (before.houndTeam.tracking || 0)) {
  throw new Error("hound team training should improve as a squad, not as one dog");
}
if ((after.houndTeam.stamina || 0) >= (before.houndTeam.stamina || 0)) {
  throw new Error("hound team patrol should consume squad stamina");
}

const strongState = createCharacter(null, "保护区卫士");
strongState.world.reserve.supplies.dogFood = 5;
strongState.world.reserve.houndTeam.tracking = 48;
const strongScout = withRandom(0.2, () => simulateDay(command, strongState));
const weakState = createCharacter(null, "保护区卫士");
weakState.world.reserve.supplies.dogFood = 0;
weakState.world.reserve.houndTeam.tracking = 48;
const weakScout = withRandom(0.2, () => simulateDay(command, weakState));
if ((strongScout.visual.houndGrowth.materialSupport || 0) <= (weakScout.visual.houndGrowth.materialSupport || 0)) {
  throw new Error("dog food should improve material support for hound team growth");
}
if ((strongScout.visual.houndGrowth.xpGain || 0) <= (weakScout.visual.houndGrowth.xpGain || 0)) {
  throw new Error("dog food should make hound team training gain more xp");
}
if ((strongScout.world.reserve.houndTeam.tracking || 0) <= (weakScout.world.reserve.houndTeam.tracking || 0)) {
  throw new Error("dog food should improve hound team tracking growth");
}

game.state = Object.assign({}, result, { reports: result.reports || [] });
game.speakingAnimalId = result.world.knownCharacters[0] && result.world.knownCharacters[0].id;
const modal = game.buildPatrolSettlement(before, after, result, command);
const rewardText = (modal.rewards || []).join(" ");
if (!/猎犬队/.test(rewardText) || !/随机/.test(rewardText)) {
  throw new Error("settlement rewards should show hound growth and variable reward");
}
if (!modal.quickFeedback || !modal.houndGrowth || !modal.variableReward) {
  throw new Error("settlement modal should preserve quick feedback details");
}

const squad = game.houndTeamSummary();
if (!/猎犬队/.test(squad.title) || !Number.isFinite(squad.tracking) || !Number.isFinite(squad.pursuit) || !Number.isFinite(squad.guard)) {
  throw new Error("hound team summary should expose squad training dimensions");
}

console.log("hound team check ok");
