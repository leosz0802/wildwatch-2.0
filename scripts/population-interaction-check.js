const assert = require("assert");

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

const touchHandlers = {};
global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
  createCanvas: () => ({ width: 375, height: 667, getContext: () => fakeContext() }),
  createImage: () => ({ loaded: true }),
  getStorageSync: () => null,
  setStorageSync() {},
  onTouchStart(handler) { touchHandlers.start = handler; },
  onTouchMove(handler) { touchHandlers.move = handler; },
  onTouchEnd(handler) { touchHandlers.end = handler; },
  onTouchCancel(handler) { touchHandlers.cancel = handler; },
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
const { SPECIES_DB, getUnlockedSpecies, reconcileSpeciesPopulations } = require("../js/animalWorld");

const game = new Game();
game.stopLoop();
game.render = () => {};
game.state = createCharacter(null, "保护区卫士");
game.state.world.reserve.progression.level = 1;
reconcileSpeciesPopulations(game.state.world.reserve, { initializeUnlocked: true, removeLocked: true });
game.screen = "collection";
game.discoveryTab = "population";
game.scrollY = 0;
game.contentHeight = 1200;

let localPortraitDraws = 0;
const localPortraitContext = fakeContext();
localPortraitContext.drawImage = () => { localPortraitDraws += 1; };
game.art.animalPortraits = null;
game.art.animalMapSprites = { loaded: true, width: 896, height: 512 };
assert(game.drawAnimalMapPortraitAsset(localPortraitContext, { species: "鹿" }, 40, 40, 64), "种群观察在远程头像未就绪时必须使用本地动物图集");
assert(localPortraitDraws === 1, "本地种群头像必须真正绘制动物图集，而不是程序占位头像");
let speciesUsedLocalArt = false;
const originalLocalPortrait = game.drawAnimalMapPortraitAsset;
const originalAnimalAvatar = game.drawAnimalAvatar;
game.drawAnimalMapPortraitAsset = () => { speciesUsedLocalArt = true; return true; };
game.drawAnimalAvatar = () => { throw new Error("种群卡不应优先采用远程占位头像"); };
game.drawSpeciesAvatar(localPortraitContext, "deer", 40, 40, 64);
assert(speciesUsedLocalArt, "种群观察必须优先复用沙盘本地动物图标");
game.drawAnimalMapPortraitAsset = originalLocalPortrait;
game.drawAnimalAvatar = originalAnimalAvatar;

function drawPopulationPage() {
  const reserve = game.state.world.reserve;
  const unlocked = getUnlockedSpecies(1);
  const locked = Object.keys(SPECIES_DB).filter((id) => SPECIES_DB[id].unlockLevel > 1);
  game.hitAreas = [];
  game.drawSpeciesSelector(fakeContext(), 12, 120, 351, unlocked, locked, reserve, 1);
  game.contentHeight = 1200;
  return game.renderedSpeciesCards[0];
}

let card = drawPopulationPage();
assert(card && card.role && card.status && card.detailAction, "种群卡必须展示生态角色、状态并声明详情入口");

const point = { x: card.x + card.w / 2, y: card.y + card.h / 2 };
touchHandlers.start({ touches: [{ clientX: point.x, clientY: point.y }] });
touchHandlers.move({ touches: [{ clientX: point.x + 3, clientY: point.y - 72 }] });
assert(game.gesture && game.gesture.axis === "vertical", "从动物卡起手的纵向拖动应识别为页面滚动");
assert(game.scrollY > 0, "种群观察必须允许从卡片区域纵向滑动");
touchHandlers.end();
assert(!game.infoDetailModal, "纵向滑动结束后不得误开动物详情");

game.scrollY = 0;
game.speciesPage = 0;
card = drawPopulationPage();
const swipePoint = { x: card.x + card.w / 2, y: card.y + card.h / 2 };
touchHandlers.start({ touches: [{ clientX: swipePoint.x, clientY: swipePoint.y }] });
touchHandlers.move({ touches: [{ clientX: swipePoint.x - 64, clientY: swipePoint.y + 2 }] });
assert(game.gesture && game.gesture.axis === "horizontal", "横向拖动应识别为种群翻页");
touchHandlers.end();
assert.strictEqual(game.speciesPage, 1, "左滑动物卡应进入下一页种群");

game.speciesPage = 0;
game.scrollY = 0;
card = drawPopulationPage();
const foodChainBounds = game.renderedSpeciesSummary && game.renderedSpeciesSummary.foodChainBounds;
assert(foodChainBounds && foodChainBounds.w > 0 && foodChainBounds.h >= 22, "存在待解救种群时，生态关系也必须保留可点击的入口");
const foodChainPoint = { x: foodChainBounds.x + foodChainBounds.w / 2, y: foodChainBounds.y + foodChainBounds.h - 6 };
touchHandlers.start({ touches: [{ clientX: foodChainPoint.x, clientY: foodChainPoint.y }] });
touchHandlers.end();
assert(game.infoDetailModal && game.infoDetailModal.title === "保护区食物链", "点击生态关系统计区下半部也必须打开食物链详情");
game.infoDetailModal = null;

card = drawPopulationPage();
const tapPoint = { x: card.x + card.w / 2, y: card.y + card.h / 2 };
touchHandlers.start({ touches: [{ clientX: tapPoint.x, clientY: tapPoint.y }] });
touchHandlers.end();
const expectedKind = card.rescueStatus === "captive" ? "chapterRescueTask" : "speciesProfile";
assert(game.infoDetailModal && game.infoDetailModal.kind === expectedKind, "轻触动物卡必须打开对应的解救任务或种群档案");
if (card.rescueStatus === "captive") assert.strictEqual(game.infoDetailModal.rescueRecord.speciesId, card.id, "被困种群必须路由到自己的解救记录");

console.log("population interaction check ok (ecology relation, detail, vertical scroll, horizontal paging)");
