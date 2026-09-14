const assert = require("assert");
const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
function mockContext() {
  const gradient = { addColorStop() {} };
  return {
    save() {},
    restore() {},
    scale() {},
    translate() {},
    rotate() {},
    clearRect() {},
    fillRect() {},
    drawImage() {},
    beginPath() {},
    closePath() {},
    rect() {},
    clip() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    bezierCurveTo() {},
    arc() {},
    arcTo() {},
    ellipse() {},
    fill() {},
    stroke() {},
    setLineDash() {},
    fillText() {},
    measureText(text) { return { width: String(text || "").length * 6 }; },
    createLinearGradient() { return gradient; },
    createRadialGradient() { return gradient; },
    set fillStyle(value) { this._fillStyle = value; },
    get fillStyle() { return this._fillStyle; },
    set strokeStyle(value) { this._strokeStyle = value; },
    get strokeStyle() { return this._strokeStyle; },
    set lineWidth(value) { this._lineWidth = value; },
    get lineWidth() { return this._lineWidth; },
    set font(value) { this._font = value; },
    get font() { return this._font || "12px sans-serif"; },
    set textAlign(value) { this._textAlign = value; },
    get textAlign() { return this._textAlign || "left"; },
    set textBaseline(value) { this._textBaseline = value; },
    get textBaseline() { return this._textBaseline || "alphabetic"; },
    set globalAlpha(value) { this._globalAlpha = value; },
    get globalAlpha() { return this._globalAlpha == null ? 1 : this._globalAlpha; }
  };
}


const game = new Game();
game.state = createCharacter(null, "保护区卫士");
game.screen = "collection";
game.drawNativeTemplateAdSlot = () => { throw new Error("发现频道不得创建广告槽"); };
let shown = null;
game.nativeTemplateAds = { setViewportSlot() {}, layoutSize() { return {height: 90}; }, setVisible(value) { shown = value; } };
for (const [width, height] of [[320,568],[375,667],[430,932]]) {
  game.width = width; game.height = height; game.ctx = mockContext(); game.scrollY = 0;
  for (const tab of ["visitors", "population"]) {
    game.discoveryTab = tab;
    game.drawCollection(game.ctx);
    // Even a stale slot from another page cannot make discovery display an ad.
    game.nativeTemplateAdSlot = {y: 260, w: 300, h: 90};
    game.syncNativeTemplateAd();
    assert.strictEqual(shown, false);
    if (tab === "visitors") assert.strictEqual(game.renderedVisitorTable.visibleBuildings, 4);
    else {
      assert.strictEqual(game.renderedSpeciesCards.length, game.renderedSpeciesPagination.visible);
      assert.ok(game.renderedSpeciesCards.length > 0);
    }
  }
}
console.log("discovery no-ad and complete cards check ok");
