const assert = require("assert");
const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");

function fakeContext() {
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({
    drawImageCount: 0
  }, {
    get(target, prop) {
      if (prop === "measureText") return (text) => ({ width: String(text || "").length * 7 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (prop === "canvas") return { width: 375, height: 667 };
      if (prop === "drawImage") {
        return (...args) => {
          target.drawImageCount += 1;
          target.lastDrawImage = args;
        };
      }
      if (!target[prop]) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    }
  });
  return ctx;
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

const game = new Game();
game.stopLoop();
game.render = () => {};
game.deferredRuntimeServicesReady = true;
game.state = createCharacter(null, "保护区卫士");
game.art.animalMapSprites = { loaded: true, width: 896, height: 512 };

const movingMotion = { key: "deer_0", dirX: 0.02, dirY: 0.01, facingX: 1 };
const stillMotion = { key: "deer_1", dirX: 0, dirY: 0, facingX: 1 };

const walkCtx = fakeContext();
assert(game.drawAnimalSticker(walkCtx, 180, 220, { species: "鹿", id: "deer_0" }, 1, 1, false, { grounded: true, motion: movingMotion, groundY: 260, bodyY: 220, facingX: 1 }));
assert(walkCtx.drawImageCount >= 2, "moving animals should use layered stride rendering");

const stillCtx = fakeContext();
assert(game.drawAnimalSticker(stillCtx, 180, 220, { species: "鹿", id: "deer_1" }, 1, 1, false, { grounded: true, motion: stillMotion, groundY: 260, bodyY: 220, facingX: 1 }));
assert.strictEqual(stillCtx.drawImageCount, 1, "idle animals should stay on the single-image render path");

const otherCtx = fakeContext();
assert(game.drawAnimalSticker(otherCtx, 180, 220, { species: "野猪", id: "boar_0" }, 1, 1, false, { grounded: true, motion: movingMotion, groundY: 260, bodyY: 220, facingX: 1 }));
assert(otherCtx.drawImageCount >= 2, "all grounded animals should use layered stride rendering");

const airCtx = fakeContext();
assert(game.drawAnimalSticker(airCtx, 180, 220, { species: "乌鸦", id: "crow_0" }, 1, 1, false, { grounded: true, motion: movingMotion, groundY: 260, bodyY: 220, facingX: 1 }));
assert(airCtx.drawImageCount >= 2, "flying animals should also get the layered motion treatment");

console.log("animal gait check ok (layered stride rendering for all animals)");
