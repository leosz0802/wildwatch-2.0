const { createInitialWorld } = require("../js/world");
const { simulateDay } = require("../js/simulator");

function createFakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (text) => ({ width: String(text || "").length * 6 });
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
    return {};
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

function wardenState() {
  return {
    world: createInitialWorld(),
    character: {
      id: "warden",
      role: "warden",
      animalId: "warden",
      species: "卫士",
      animalName: "保护区卫士",
      location: "中央混交林",
      stamina: 82,
      health: 92,
      status: "alive",
      statusText: "正常",
      skills: {},
      inventory: {}
    },
    reports: [],
    messages: []
  };
}

const game = new Game();
if (game.stopLoop) game.stopLoop();
game.state = wardenState();
game.width = 375;
game.height = 667;
game.scrollY = 0;
game.hitAreas = [];
game.render = () => {};
game.speakingAnimalId = "deer_chen";
game.state.world.reserve.poacherPressure = 66;

const reserve = game.state.world.reserve;
const clueAnimal = game.state.world.knownCharacters.find((animal) => animal.id === game.speakingAnimalId) || game.state.world.knownCharacters[0];
const thought = game.buildAnimalThoughtDetail(clueAnimal, game.createAnimalDialogueContext(clueAnimal));
if (!thought.animal || !thought.prose || !thought.actionLabel || !/执行/.test(thought.actionLabel)) {
  throw new Error("sandbox animal thought should be the only clue entry and expose a patrol task action");
}
if (!/线索：偷猎/.test(thought.footer)) {
  throw new Error(`animal clue should translate current threat into footer guidance, got: ${thought.footer}`);
}
const alarmBeforeClue = game.state.world.reserve.supplies.alarm || 0;
thought.action();
if (game.patrolTaskModal) {
  throw new Error("sandbox animal clue action should settle 驱赶偷猎 immediately");
}
if ((game.state.world.reserve.supplies.alarm || 0) >= alarmBeforeClue && !game.settlementModal) {
  throw new Error("sandbox animal clue action should start recommended patrol settlement");
}

const state = wardenState();
const before = JSON.parse(JSON.stringify(state.world.reserve));
const command = "驱赶偷猎者：带白河去西部岩坡洞域排查可疑人影";
const result = simulateDay(command, state);
const after = result.world.reserve;

if (!result.world.lastPlayerAction || result.world.lastPlayerAction.action !== "antiPoacher") {
  throw new Error("simulator should persist the last player reserve action");
}
if (!Array.isArray(result.world.actionHistory) || result.world.actionHistory.length !== 1) {
  throw new Error("simulator should keep action history for animal memory");
}
const deer = result.world.knownCharacters.find((animal) => animal.species === "鹿");
if (!deer || !(deer.memory || []).some((line) => /卫士|偷猎者|幼鹿|边界/.test(line))) {
  throw new Error("animal memory should reference the player's latest action");
}

game.state = {
  world: result.world,
  character: result.character,
  reports: result.reports,
  messages: []
};
game.speakingAnimalId = deer.id;
const context = game.createAnimalDialogueContext(deer);
const memoryLine = game.animalPlayerMemoryLine(deer, context);
if (!/猎犬|偷猎|幼鹿|核心区|边界/.test(memoryLine)) {
  throw new Error(`animal player memory line should be vivid and action-aware, got: ${memoryLine}`);
}

const modal = game.buildPatrolSettlement(before, after, result, command);
if (!modal.rewards || modal.rewards.length !== 3) {
  throw new Error("settlement should keep three compact outcome lines");
}
if (!/^获得：/.test(modal.rewards[0]) || !/^消耗：/.test(modal.rewards[1]) || !/^明日：/.test(modal.rewards[2])) {
  throw new Error(`settlement outcome lines should be gain/cost/tomorrow, got: ${modal.rewards.join(" | ")}`);
}
if (!/偷猎|幼鹿|边界|脚步|安全/.test(modal.speech)) {
  throw new Error(`settlement animal reaction should respond to the action, got: ${modal.speech}`);
}

console.log("core loop check ok");
