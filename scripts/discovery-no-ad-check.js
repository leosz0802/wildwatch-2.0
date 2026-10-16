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
let shown = null;
game.nativeTemplateAds = {
  isSupported: () => true,
  shown: false,
  requestedVisible: false,
  setViewportSlot() {},
  layoutSize() { return { width: 300, height: 90 }; },
  setVisible(value) { shown = value; }
};
for (const [width, height] of [[320,568],[375,667],[430,932]]) {
  game.width = width; game.height = height; game.ctx = mockContext(); game.scrollY = 0;
  for (const tab of ["visitors", "population"]) {
    game.discoveryTab = tab;
    game.nativeTemplateAdSlot = null;
    game.renderedNativeTemplateAdSlot = null;
    shown = null;
    game.drawCollection(game.ctx);
    const ad = game.renderedNativeTemplateAdSlot;
    assert(ad && ad.frame, `${tab} must reserve a native ad below the page`);
    if (tab === "visitors") {
      assert.strictEqual(game.renderedVisitorTable.visibleBuildings, 4);
      const lastCard = game.renderedVisitorTable.buildingCards[game.renderedVisitorTable.buildingCards.length - 1];
      assert(lastCard, "visitor operations must keep its building cards");
      assert(ad.frame.y >= 120, "visitor ad must stay at the bottom of the operations list");
    } else {
      assert.strictEqual(game.renderedSpeciesCards.length, game.renderedSpeciesPagination.visible);
      assert.ok(game.renderedSpeciesCards.length > 0);
      const lastCard = game.renderedSpeciesCards[game.renderedSpeciesCards.length - 1];
      assert(ad.frame.y >= lastCard.y + lastCard.h - 1, "population ad must sit below the species cards");
    }
    const slot = game.nativeTemplateAdSlot;
    const safeTop = Math.max(10, game.compactStageTop() + 42);
    const navTop = game.height - game.navHeight();
    game.scrollY = Math.max(0, slot.y - safeTop);
    game.syncNativeTemplateAd();
    const screenTop = slot.y - game.scrollY;
    const inside = screenTop >= safeTop && screenTop + 90 <= navTop - 8;
    assert.strictEqual(shown, inside ? true : false, `${tab} ad is visible only when its slot is fully on screen`);
  }
}
console.log("discovery bottom native ad check ok");
