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
  createImage: () => ({ complete: true, loaded: true, set src(value) { this._src = value; if (this.onload) this.onload(); } }),
  getStorageSync: () => null,
  setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const { Game } = require("../js/game");
const game = new Game();
game.stopLoop();
game.render = () => {};
game.state.character = { role: "warden" };
game.screen = "collection";
game.collectionCaseId = "case_1";
game.drawCollection(fakeContext());
assert.strictEqual(game.renderedCollectionCards.length, 6, "剧情收藏章节应能从发现频道进入");
assert(game.renderedCollectionCaseCta, "剧情收藏章节应保留底部任务入口");

game.collectionCaseId = null;
game.drawCollection(fakeContext());
game.drawDiscoveryVisitors(fakeContext(), 120);
assert(game.renderedStoryCollectionEntry && game.renderedStoryCollectionEntry.clickable, "发现频道应提供剧情收藏入口");
assert.strictEqual(game.renderedStoryCollectionEntry.total, 45, "剧情收藏入口应读取原45件目录");
console.log("collection entry routing check passed");
