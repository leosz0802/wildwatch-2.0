const assert = require("node:assert/strict");
const { Game } = require("../js/game");

function context() {
  return {
    measureText(value) { return { width: String(value || "").length * 7 }; },
    fillText() {},
    roundRect() {},
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
game.drawPremiumInfoCard = () => {};
game.statusPill = () => {};
game.text = () => {};
const ctx = context();
const item = {
  tag: "1",
  title: "解救回归 +0只",
  body: "开地图解救，备物资完成，按结果计入。",
  noCompact: true,
  largeText: true,
  stackTag: true
};

const layout = game.infoListItem(ctx, item, 20, 100, 320, 90);
assert.equal(layout.inlineNumberTag, true, "numeric stack tags should use the inline title layout");
assert(layout.titleBounds.x >= layout.tagBounds.x + layout.tagBounds.w + 8, "title must start after the number pill");
assert(layout.titleBounds.y < layout.tagBounds.y + layout.tagBounds.h, "title must share the number pill row");
assert(layout.bodyBounds.y < 100 + 68, "body should move up after the title row is merged");

const inlineHeight = game.infoListItemNaturalHeight(ctx, item, 320);
assert(inlineHeight >= 70, "inline numbered cards should retain enough height for the body");

const textTag = Object.assign({}, item, { tag: "游客影响", inlineTitle: true });
const textLayout = game.infoListItem(ctx, textTag, 20, 100, 320, 90);
assert.equal(textLayout.inlineTag, true, "text-tag cards should use the same compact inline layout");
assert(textLayout.titleBounds.x >= textLayout.tagBounds.x + textLayout.tagBounds.w + 8, "text-tag title must start after its label");

const stackedTag = Object.assign({}, item, { tag: "来源", inlineTitle: false });
const stackedLayout = game.infoListItem(ctx, stackedTag, 20, 100, 320, 90);
assert.equal(stackedLayout.inlineTag, false, "non-inline stack tags should retain the stacked layout");
assert.equal(stackedLayout.titleBounds.x, 34, "stacked titles should start at the card content edge");
assert(stackedLayout.bodyBounds.y > stackedLayout.titleBounds.y + 20, "stacked body should remain below the title");

const fundItem = {
  tag: "来源",
  title: "科研与执法样本",
  body: "打开物资页，先收取样本，再出售获得保护基金。",
  action() {}
};
const fundHeight = game.infoListItemNaturalHeight(ctx, fundItem, 320);
const fundLayout = game.infoListItem(ctx, fundItem, 20, 100, 320, fundHeight);
assert(fundLayout.titleBounds.x + fundLayout.titleBounds.w <= 20 + 320 - 14 - 46, "actionable titles must reserve the right-side action area");
assert(!fundLayout.title.truncated, "fund source title should remain visible beside the action");
assert(fundLayout.bodyBounds.y > fundLayout.titleBounds.y + fundLayout.titleBounds.h - 2, "fund source body must stay below its title");

console.log("inline number title check ok");
