const { Game } = require("../js/game");

function mockContext() {
  const gradient = { addColorStop() {} };
  return {
    save() {}, restore() {}, beginPath() {}, closePath() {}, clip() {}, fill() {}, stroke() {},
    fillRect() {}, drawImage() {}, arc() {}, arcTo() {}, ellipse() {}, moveTo() {}, lineTo() {},
    bezierCurveTo() {}, setLineDash() {}, fillText() {},
    measureText(value) { return { width: String(value || "").length * 6 }; },
    createLinearGradient() { return gradient; }, createRadialGradient() { return gradient; },
    set fillStyle(value) { this._fillStyle = value; }, set strokeStyle(value) { this._strokeStyle = value; },
    set lineWidth(value) { this._lineWidth = value; }, set font(value) { this._font = value; },
    get font() { return this._font || "12px sans-serif"; }, set textAlign(value) { this._textAlign = value; },
    set textBaseline(value) { this._textBaseline = value; }, set globalAlpha(value) { this._globalAlpha = value; },
    get globalAlpha() { return this._globalAlpha == null ? 1 : this._globalAlpha; }
  };
}

const modal = {
  kind: "reserveProsperity",
  heroMetrics: [
    { label: "市值", value: 9288, note: "保护区8级" },
    { label: "物种", value: 11, note: "种" },
    { label: "动物", value: 374, note: "只" }
  ],
  items: [
    { tag: "晋级路径", progress: 37, title: "下一站 · 世界级自然地", body: "查看晋级条件与未完成目标", action() {} },
    { tag: "生态运营", title: "82分 · 11种 / 374只", body: "水67 · 草99 · 安全91 · 食物链54" },
    { tag: "旅游圣地", title: "6星 · 4%", body: "活跃90% · 留存90%", action() {} }
  ]
};

for (const width of [320, 375, 430]) {
  const game = new Game();
  game.requestRender = () => {};
  game.ctx = mockContext();
  game.width = width;
  game.height = 667;
  game.hitAreas = [];
  game.addHit = (x, y, w, h, action) => game.hitAreas.push({ x, y, w, h, action });
  game.drawReserveProsperityContent(game.ctx, modal, 20, 160, width - 40, 390);
  const layout = modal.renderedReserveProsperity;
  if (!layout || layout.metrics.length !== 3 || !layout.promotion || layout.rows.length !== 2) {
    throw new Error(`reserve prosperity layout missing at ${width}px`);
  }
  const end = layout.rows[layout.rows.length - 1].y + layout.rows[layout.rows.length - 1].h;
  if (end > 550) throw new Error(`reserve prosperity content overflows at ${width}px`);
  if (game.hitAreas.length !== 2) throw new Error(`reserve prosperity action rows missing at ${width}px`);
}

console.log("reserve prosperity layout check ok");
