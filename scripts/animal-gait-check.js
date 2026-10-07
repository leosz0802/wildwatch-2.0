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

game.state.world.reserve.progression = { displayChapter: 10, stage: 10 };
const lateCtx = fakeContext();
assert(game.drawAnimalSticker(lateCtx, 180, 220, { species: "鹿", id: "deer_late" }, 1, 1, false, { grounded: true, motion: movingMotion, groundY: 260, bodyY: 220, facingX: 1 }));
assert.strictEqual(lateCtx.drawImageCount, 1, "chapter 7+ moving animals must use one sprite blit");

const camera = { scale: 0.97, x: 0, y: 0, w: 375, h: 930, worldW: 2000, worldH: 1100 };
game.mapZoom = 0;
game.state.world.reserve.progression = { displayChapter: 1, stage: 1 };
const chapterOneCtx = fakeContext();
game.drawGroundedAnimal(chapterOneCtx, 180, 260, { species: "鹿", id: "deer_scale_1" }, movingMotion, false, false, camera, false, null, false, 1, "", false);
game.state.world.reserve.progression = { displayChapter: 8, stage: 8 };
const chapterEightCtx = fakeContext();
game.drawGroundedAnimal(chapterEightCtx, 180, 260, { species: "鹿", id: "deer_scale_8" }, movingMotion, false, false, camera, false, null, false, 1, "", false);
const destWidth = (ctx) => Math.abs(Number(ctx.lastDrawImage && ctx.lastDrawImage[7]) || 0);
assert.strictEqual(chapterEightCtx.drawImageCount, 1, "chapter 8 animals stay on one sprite blit");
assert.ok(Number(chapterEightCtx.lastDrawImage && chapterEightCtx.lastDrawImage[7]) > 0, "chapter 8 mirror must keep a positive sprite width");
assert.ok(Math.abs(destWidth(chapterOneCtx) - destWidth(chapterEightCtx)) < 0.01, "chapter 8 deer must use the chapter 1 map proportion");

const overviewCamera = { scale: 0.97, x: 0, y: 80, w: 375, h: 930, worldW: 2018, worldH: 1153 };
for (let chapter = 1; chapter <= 18; chapter += 1) {
  game.mapZoom = chapter === 1 ? 0 : 1.6;
  game.userAdjustedMapZoom = chapter !== 1;
  game.state.world.reserve.progression = { displayChapter: chapter, stage: chapter };
  game.holdSandboxChapterScale(chapter);
  assert.strictEqual(game.mapZoom, 0, `第${chapter}章必须回到第1章全景比例`);
  assert.ok(Math.abs(game.currentMapScale() - 0.97) < 0.001, `第${chapter}章相机比例必须是 0.97`);
  const ctx = fakeContext();
  game.drawGroundedAnimal(ctx, 180, 260, { species: "鹿", id: `deer_ch_${chapter}` }, movingMotion, false, game.isSandCloseView(), overviewCamera, false, null, false, 1, "", false);
  assert.ok(Math.abs(destWidth(ctx) - destWidth(chapterOneCtx)) < 0.01, `第${chapter}章鹿的绘制尺寸必须和第1章一致`);
}

console.log("animal gait check ok (layered stride before chapter 7, single blit after)");
