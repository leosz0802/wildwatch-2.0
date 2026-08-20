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
game.stopLoop();
game.ctx = mockContext();
game.width = 375;
game.height = 667;
game.scrollY = 0;
game.hitAreas = [];
game.render = () => {};
game.state = createCharacter(null, "保护区卫士");

const reserve = game.state.world.reserve;
reserve.social = {
  day: 18,
  title: "蓝河口保护区抢修水线",
  actor: "蓝河口保护区",
  actorScope: "world",
  action: "修复",
  marketDelta: 3,
  migrationDelta: -2,
  salvageDelta: 1,
  pressure: 1,
  priceNote: "研究样本价格小涨。",
  migrationNote: "水源好的保护区会吸引象群和羚羊，迁移竞争变强。",
  salvageNote: "边界巡护更容易带回证据。",
  log: "蓝河口保护区抢修水线：水源好的保护区会吸引象群和羚羊，迁移竞争变强。"
};

const items = game.buildWorldInfoItems(game.state.world, reserve, reserve.ecology || {}, game.state.world.aiForest || {}, null);
if (!items[0] || items[0].tag !== "世界" || !/迁移|价格|回收/.test(items[0].body)) {
  throw new Error("world info should lead with social reserve impact");
}
if (!items.find((item) => item.title === "保护地网络")) {
  throw new Error("world info should point players to the reserve network");
}

game.drawLeagueTeaser(game.ctx, 18, 120, 339);
if (game.hitAreas.length < 3) {
  throw new Error("reserve network teaser should expose card, friends and world taps");
}

game.openReserveNetwork("world");
if (game.screen !== "league" || game.leagueScope !== "world") {
  throw new Error("world reserve network entry should navigate to world league");
}
const selected = game.selectedRival();
if (!selected || selected.mine || selected.scope !== "world") {
  throw new Error("world reserve network should select a world reserve target");
}

console.log("reserve network check ok");
