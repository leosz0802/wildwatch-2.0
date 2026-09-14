const assert = require("assert");

let viewport = { windowWidth: 375, windowHeight: 667, pixelRatio: 1 };
function fakeContext(width, height) {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (value) => ({ width: String(value || "").length * 7 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (prop === "canvas") return { width, height };
      if (!target[prop]) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) { target[prop] = value; return true; }
  });
}

global.wx = {
  getSystemInfoSync() { return viewport; },
  createCanvas() {
    const ctx = fakeContext(viewport.windowWidth, viewport.windowHeight);
    return { width: viewport.windowWidth, height: viewport.windowHeight, getContext() { return ctx; } };
  },
  createImage() { return { loaded: true, set src(value) { this._src = value; if (this.onload) this.onload(); } }; },
  getStorageSync() { return null; }, setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const { Game } = require("../js/game");
const game = new Game();
game.stopLoop();

const source = "完成本次行动后，保护区正在根据当前状态给出下一步；同时需要你选择一个方向。";
const compact = game.compactDescriptionText(source, 42);
assert(compact.length <= 43, "压缩文案应受长度上限控制");
assert(!compact.includes("本次") && !compact.includes("需要你") && !compact.includes("正在"), "应去除重复套话");

const original = "守护日 12 · 变动后余额 3160 星币 · 这是完整的流水说明";
const layout = game.infoListItemNaturalHeight(game.ctx, { title: "游客消费贡献收入 +733", body: original, noCompact: true }, 280);
assert(layout >= 70, "基金流水应保留完整明细布局");
assert.strictEqual(game.compactDescriptionText(original, 68), original, "短流水不应被改写");

game.stopLoop();
console.log("copy simplification check ok");
