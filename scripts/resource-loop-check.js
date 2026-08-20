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
if (!game.actionResourceStatus("habitat", reserve).canRun) {
  throw new Error("fund must not block habitat repair when the concrete field kit is available");
}

const listenedBefore = reserve.intel || 0;
const animal = game.state.world.knownCharacters[0];
game.openAnimalThought(animal);
const listenedAfter = game.state.world.reserve.intel || 0;
game.openAnimalThought(animal);
if (listenedAfter !== listenedBefore || game.state.world.reserve.intel !== listenedBefore) {
  throw new Error("animal listening must not revive the retired intel resource");
}
if (!game.infoDetailModal || !(game.infoDetailModal.mapActions || []).some((item) => item.label && typeof item.action === "function")) {
  throw new Error("animal thought detail should expose clear animal care or exploration actions");
}
const animalBefore = game.state.world.knownCharacters.find((item) => item.id === animal.id);
const actionPointsBefore = game.state.world.reserve.actionPoints;
game.performAnimalAction(animalBefore, "calmObserve");
const animalAfter = game.state.world.knownCharacters.find((item) => item.id === animal.id);
if ((game.state.world.reserve.actionPoints || 0) !== actionPointsBefore) {
  throw new Error("light animal interaction should not consume patrol shift");
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
scoutState.world.reserve.intel = 0;
const scoutResult = withRandom(0.9, () => simulateDay("派猎犬侦察：让砾灰去中央混交林搜寻陷阱和陌生气味", scoutState));
if (scoutResult.world.reserve.supplies.dogFood !== 2) {
  throw new Error("hound scout should consume dog food");
}
if ((scoutResult.world.reserve.intel || 0) !== 0) {
  throw new Error("hound scout must not produce the retired intel resource");
}

const weakState = createCharacter(null, "保护区卫士");
weakState.world.reserve.poacherPressure = 60;
weakState.world.reserve.supplies.alarm = 2;
weakState.world.reserve.intel = 0;
const strongState = clone(weakState);
strongState.world.reserve.intel = 2;
const weakResult = withRandom(0.9, () => simulateDay("驱赶偷猎者：带白河去西部岩坡洞域排查可疑人影", weakState));
const strongResult = withRandom(0.9, () => simulateDay("驱赶偷猎者：带白河去西部岩坡洞域排查可疑人影", strongState));
if (strongResult.world.reserve.poacherPressure !== weakResult.world.reserve.poacherPressure) {
  throw new Error("retired intel must not secretly alter anti-poacher results");
}

const salvageState = createCharacter(null, "保护区卫士");
salvageState.world.reserve.inventory.shedAntlerA = 1;
salvageState.world.reserve.inventory.researchSample = 2;
const fundBefore = salvageState.world.reserve.fund;
const salvageResult = withRandom(0.9, () => simulateDay("出售仓库里的脱落鹿角和研究样本", salvageState));
if (salvageResult.world.reserve.fund <= fundBefore) {
  throw new Error("salvage should convert recovered goods into fund");
}
if (salvageResult.world.reserve.inventory.shedAntlerA !== 0 || salvageResult.world.reserve.inventory.researchSample !== 0) {
  throw new Error("salvage should consume recovered goods");
}

const leagueGame = makeGame();
leagueGame.state.world.reserve.fieldPermits = 1;
leagueGame.state.world.reserve.base.raidTickets = 1;
leagueGame.state.world.reserve.supplies.dogFood = 1;
leagueGame.selectedRivalId = "base_sun";
withRandom(0, () => leagueGame.raidRival());
if (leagueGame.state.world.reserve.fieldPermits !== 1 || leagueGame.state.world.reserve.supplies.dogFood !== 0) {
  throw new Error("border patrol should consume dog food without touching retired field permits");
}

console.log("resource loop check ok");
