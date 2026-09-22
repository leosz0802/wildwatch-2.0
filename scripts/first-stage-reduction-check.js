const assert = require("assert");
const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");

function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (text) => ({ width: String(text || "").length * 7 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (prop === "canvas") return { width: 375, height: 667 };
      if (!target[prop]) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) { target[prop] = value; return true; }
  });
}

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
  createCanvas: () => ({ width: 375, height: 667, getContext: () => fakeContext() }),
  createImage: () => ({ loaded: true }),
  getStorageSync: () => null,
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

function makeGame() {
  const game = new Game();
  game.stopLoop();
  game.render = () => {};
  game.deferredRuntimeServicesReady = true;
  game.state = createCharacter(null, "保护区卫士");
  game.state.world.reserve.progression.level = 1;
  game.state.world.reserve.progression.totalActions = 0;
  game.state.world.lifeMemory = {
    animalLetters: [{ id: "letter-1", dateKey: "2026-09-05", animal: { species: "鹿" }, body: "测试来信", readAt: 0 }]
  };
  game.screen = "home";
  game.scrollY = 0;
  return game;
}

const game = makeGame();
assert(game.firstStageReductionActive(), "chapter 1 should activate first-stage content reduction");
game.drawHome(fakeContext());
assert.strictEqual(game.renderedLeagueTeaser, null, "first-stage home should not expose the league teaser");
assert.strictEqual(game.renderedAnimalLetterChip, null, "first-stage home should keep animal letters out of the primary sandbox view");

game.screen = "collection";
game.discoveryTab = "visitors";
game.drawCollection(fakeContext());
assert(game.renderedVisitorTable && game.renderedVisitorTable.stageOneLight, "visitor page should report first-stage reduction");
assert.strictEqual(game.renderedVisitorTable.visibleBuildings, 4, "visitor page should show all four building cards");
assert.strictEqual(game.renderedVisitorTable.buildings, 4, "first-stage visitor page must preserve the full building model behind the reduced UI");
assert(game.renderedVisitorTable.recruitment && Number.isFinite(game.renderedVisitorTable.recruitment.totalRecruited), "visitor recruitment metrics must remain available in stage one");

game.state.ui.firstSessionFocus.completed = true;
assert(game.firstStageReductionActive(), "finishing the introduction alone must not bypass chapter 1");
game.state.world.reserve.progression.stage = 3;
game.state.world.reserve.progression.displayChapter = 3;
game.state.world.reserve.progression.level = 2;
game.drawHome(fakeContext());
assert(game.firstStageReductionActive() === false, "completed first-session focus should release the reduced first-stage shell when the reserve is already beyond chapter 1");

console.log("first-stage reduction check ok (home declutter, visitor page shortened, recruitment preserved)");
