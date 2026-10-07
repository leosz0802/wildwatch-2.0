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

function makeGame() {
  const game = new Game();
  game.stopLoop();
  game.state = createCharacter(null, "保护区卫士");
  game.render = () => {};
  return game;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

const game = makeGame();
let reserve = game.state.world.reserve;
reserve.supplies.dogFood = 0;
let status = game.actionResourceStatus("houndScout", reserve);
if (status.canRun || status.missing.indexOf("狗粮") < 0) {
  throw new Error("hound scout should be blocked without dog food");
}

reserve.supplies.dogFood = 2;
reserve.fund = 40;
reserve.supplies.fieldKit = 0;
status = game.actionResourceStatus("habitat", reserve);
if (status.canRun || status.missing.indexOf("野外工具包") < 0) {
  throw new Error("habitat repair should be blocked without a field kit");
}
reserve.supplies.fieldKit = 1;
const fundedStatus = game.actionResourceStatus("habitat", reserve);
if (fundedStatus.canRun || fundedStatus.missing.indexOf("基金") < 0) {
  throw new Error("habitat repair should also reserve the configured chapter fund cost");
}

const animal = game.state.world.knownCharacters[0];
game.openAnimalThought(animal);
game.openAnimalThought(animal);
if (Object.prototype.hasOwnProperty.call(game.state.world.reserve, "intel")) {
  throw new Error("animal listening must not restore retired resource fields");
}
if (!game.infoDetailModal || !(game.infoDetailModal.mapActions || []).some((item) => item.label && typeof item.action === "function")) {
  throw new Error("animal thought detail should expose clear animal care or exploration actions");
}
const animalBefore = game.state.world.knownCharacters.find((item) => item.id === animal.id);
game.speakingAnimalId = animal.id;
game.performAnimalAction(animalBefore, "calmObserve");
if (game.speakingAnimalId !== null || game.mapSpeakerFocus !== null) {
  throw new Error("完成动物任务后必须清理地图选中态");
}
const animalAfter = game.state.world.knownCharacters.find((item) => item.id === animal.id);
if (Object.prototype.hasOwnProperty.call(game.state.world.reserve, "actionPoints")) {
  throw new Error("light animal interaction should not restore retired action field");
}
if (((animalAfter.relation || {}).trust || 0) <= ((animalBefore.relation || {}).trust || 0)) {
  throw new Error("animal interaction should improve animal trust");
}
game.speakingAnimalId = animal.id;
if (game.animalActionStatus("calmObserve").canRun) {
  throw new Error("animal interaction should be limited to once per animal per day");
}

const scoutState = createCharacter(null, "保护区卫士");
scoutState.world.reserve.supplies.dogFood = 3;
const scoutResult = withRandom(0.9, () => simulateDay("派猎犬侦察：让砾灰去中央混交林搜寻陷阱和陌生气味", scoutState));
if (scoutResult.world.reserve.supplies.dogFood !== 2) {
  throw new Error("hound scout should consume dog food");
}
if (Object.prototype.hasOwnProperty.call(scoutResult.world.reserve, "intel")) {
  throw new Error("hound scout must not restore retired resource fields");
}

const weakState = createCharacter(null, "保护区卫士");
weakState.world.reserve.poacherPressure = 60;
weakState.world.reserve.supplies.alarm = 2;
const strongState = clone(weakState);
strongState.world.reserve.__legacyClue = 2;
const weakResult = withRandom(0.9, () => simulateDay("驱赶偷猎者：带白河去西部岩坡洞域排查可疑人影", weakState));
const strongResult = withRandom(0.9, () => simulateDay("驱赶偷猎者：带白河去西部岩坡洞域排查可疑人影", strongState));
if (strongResult.world.reserve.poacherPressure !== weakResult.world.reserve.poacherPressure) {
  throw new Error("retired resource data must not secretly alter anti-poacher results");
}

const salvageState = createCharacter(null, "保护区卫士");
salvageState.world.reserve.inventory.shedAntlerA = 1;
salvageState.world.reserve.inventory.researchSample = 8;
const fundBefore = salvageState.world.reserve.fund;
const salvageResult = withRandom(0.9, () => simulateDay("出售仓库里的脱落岩角和研究样本", salvageState));
if (salvageResult.world.reserve.fund <= fundBefore) {
  throw new Error("salvage should convert recovered goods into fund");
}
if (salvageResult.world.reserve.inventory.shedAntlerA !== 0) {
  throw new Error("salvage should consume recovered goods that fit today's sell cap");
}
if (salvageResult.world.reserve.inventory.researchSample) {
  throw new Error("one salvage sell should dump accumulated samples instead of clipping by fund");
}

const leagueGame = makeGame();
leagueGame.state.world.reserve.base.raidTickets = 1;
leagueGame.state.world.reserve.supplies.dogFood = 1;
leagueGame.selectedRivalId = "base_sun";
withRandom(0, () => leagueGame.raidRival());
if (Object.prototype.hasOwnProperty.call(leagueGame.state.world.reserve, "fieldPermits") || leagueGame.state.world.reserve.supplies.dogFood !== 1) {
  throw new Error("removed border patrol must not consume dog food or restore retired permit fields");
}

console.log("resource loop check ok");
