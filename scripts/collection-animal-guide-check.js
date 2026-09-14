const assert = require("assert");

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
    set(target, prop, value) { target[prop] = value; return true; }
  });
}

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
  createCanvas: () => ({ width: 375, height: 667, getContext: () => fakeContext() }),
  createImage: () => ({ loaded: true, set src(value) { this._src = value; if (this.onload) this.onload(); }, get src() { return this._src; } }),
  getStorageSync: () => null,
  setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const { Game } = require("../js/game");
const { normalizeCollectionState } = require("../js/collectionSystem");

const game = new Game();
game.stopLoop();
game.render = () => {};
game.state.character = { role: "warden" };
normalizeCollectionState(game.state);

const deer = (game.state.world.knownCharacters || []).find((animal) => animal.species === "鹿") || game.state.world.knownCharacters[0];
assert(deer, "新存档必须有可定位的动物");
game.state.world.collection.items.c1_footprint = {
  id: "c1_footprint",
  itemId: "c1_footprint",
  firstDay: 4,
  day: 4,
  animal: deer,
  discovery: { who: game.animalDisplayName(deer), where: "河岸", action: "修复附近环境" }
};

game.openCollectionItem("c1_footprint");
assert(game.infoDetailModal, "已收录收藏应打开详情");
assert.strictEqual(game.infoDetailModal.guideAnimal.id, deer.id, "详情必须识别收藏对应动物");
assert(/^去沙盘找/.test(game.infoDetailModal.actionLabel), "详情必须提供去沙盘定位入口");
assert(typeof game.infoDetailModal.action === "function", "去沙盘入口必须可执行");

game.infoDetailModal.action();
assert.strictEqual(game.screen, "home", "定位后应返回沙盘");
assert.strictEqual(game.infoDetailModal, null, "定位后不应残留收藏详情弹窗");
assert.strictEqual(game.speakingAnimalId, deer.id, "沙盘应选中对应动物");
assert.strictEqual(game.selectedTarget.id, deer.id, "沙盘焦点应指向对应动物");
assert(game.mapZoom >= 1.35, "定位后应自动放大沙盘");
assert(game.collectionAnimalGuide && game.collectionAnimalGuide.animalId === deer.id, "定位后应保留短时高亮引导");

console.log("collection animal guide check ok");
