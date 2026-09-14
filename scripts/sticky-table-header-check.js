function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (value) => ({ width: String(value || "").length * 7 });
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
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 1 }; },
  createCanvas() { return { width: 375, height: 667, getContext: () => fakeContext() }; },
  createImage() { return { loaded: true, set src(value) { this._src = value; if (this.onload) this.onload(); } }; },
  getStorageSync() { return null; },
  setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");

function buildGame(screen) {
  const game = new Game();
  game.stopLoop();
  game.state = createCharacter(null, "保护区卫士");
  game.ctx = fakeContext();
  game.screen = screen;
  game.discoveryTab = "visitors";
  game.survivalArchiveOpen = false;
  game.scrollY = 48;
  game.hitAreas = [];
  return game;
}

const cases = [
  ["collection", "visitorOperations"],
  ["survival", "survivalMaterials"],
  ["role", "patrolSupplies"]
];

for (const [screen] of cases) {
  const game = buildGame(screen);
  game.drawStickyTableHeader();
  if (game.renderedStickyTableHeader) throw new Error(`${screen} should keep table headers in normal document flow`);
  if (game.hitAreas.length) throw new Error(`${screen} normal scrolling must not register a fixed header hit area`);
}

const archiveGame = buildGame("survival");
archiveGame.survivalArchiveOpen = true;
archiveGame.drawStickyTableHeader();
if (archiveGame.renderedStickyTableHeader) throw new Error("survival archive should not pin the list header");

console.log("sticky table header check ok");
