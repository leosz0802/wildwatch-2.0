const assert = require("node:assert/strict");
const { Game } = require("../js/game");

function mockContext() {
  const draws = [];
  return {
    draws,
    measureText(text) {
      return { width: String(text || "").length * 6 };
    },
    fillText(text, x, y) {
      draws.push({ text, x, y, fillStyle: this.fillStyle, font: this.font });
    },
    set fillStyle(value) { this._fillStyle = value; },
    get fillStyle() { return this._fillStyle; },
    set font(value) { this._font = value; },
    get font() { return this._font || "11px sans-serif"; },
    set textAlign(value) { this._textAlign = value; },
    get textAlign() { return this._textAlign || "left"; },
    set textBaseline(value) { this._textBaseline = value; },
    get textBaseline() { return this._textBaseline || "alphabetic"; }
  };
}

const game = Object.create(Game.prototype);
const ctx = mockContext();
const layout = game.drawNumericHighlightTextBlock(
  ctx,
  "基金0星币；下次招募约152人（预估）\n生态记录+1，不把迁徙路线固化成人类设施。",
  0,
  12,
  320,
  80,
  { size: 11, numberSize: 12, color: "#26352b", numberColor: "#c54838" }
);

assert.deepEqual(layout.numberTokens, ["0", "152", "+1"]);
const numberDraws = ctx.draws.filter((item) => ["0", "152", "+1"].includes(item.text));
assert.equal(numberDraws.length, 3);
numberDraws.forEach((item) => {
  assert.equal(item.fillStyle, "#c54838");
  assert.match(item.font, /12px/);
});
const unitDraws = ctx.draws.filter((item) => /星币|人|生态记录/.test(item.text));
assert(unitDraws.every((item) => item.fillStyle !== "#c54838"), "数字周围文字不能被染红");

const wrapCtx = mockContext();
const wrapLayout = game.drawNumericHighlightTextBlock(
  wrapCtx,
  "分隔取食地能暂时减少冲突，却会把公共资源变成人类划定的份额",
  0,
  12,
  90,
  51,
  { size: 15, minSize: 12, lineHeight: 17, weight: "700" }
);
assert(wrapLayout.lineCount >= 2, "long CJK titles must wrap instead of remaining one overflowing line");
wrapCtx.draws.forEach((item) => {
  assert(item.x + String(item.text || "").length * 6 <= 96, `wrapped CJK overflowed: ${item.text}`);
});

console.log("numeric highlight ui check ok");
