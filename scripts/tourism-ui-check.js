const assert = require("assert");
const { createReserveState } = require("../js/world");
const { visitorEngagement, visitorContributionRate } = require("../js/eventEconomy");
const { tourismProgression, TOURISM_THRESHOLDS, reserveOperationsSnapshot, buildRiverShallowsPlan } = require("../js/reserveDevelopment");
const { consumeVisitorRecruitment } = require("../js/visitorRecruitment");
const { Game } = require("../js/game");

for (const value of [0, 15, 45, 70, 100, 10000]) {
  for (const effect of [null, { active: { type: "wildfire" } }, { businessEffect: { remainingActions: 3, resolved: true } }]) {
    const reserve = createReserveState();
    reserve.safety = value;
    reserve.ecology.water = value;
    reserve.ecology.grass = value;
    reserve.emergency = effect || {};
    for (const weather of ["晴", "阴", "大雨"]) {
      reserve.seasonState = { weather };
      const rates = visitorContributionRate(reserve);
      const snapshot = reserveOperationsSnapshot(reserve, 1, { weather });
      for (const key of ["activity", "retention"]) {
        assert(rates[key] >= .1 && rates[key] <= .9, `${key} must stay within 10–90% after modifiers`);
        assert.strictEqual(snapshot.tourism[key], Math.round(rates[key] * 100), "display and contribution must use the same rates");
      }
    }
  }
}
const reserve = createReserveState();
const before = visitorEngagement(reserve);
reserve.safety = 15;
const damaged = visitorEngagement(reserve);
assert(damaged.activity < before.activity && damaged.retention < before.retention, "rates must respond to safety rather than stay stuck at a cap");
const fundBefore = reserve.fund;
const rate = visitorContributionRate(reserve).rate;
const result = consumeVisitorRecruitment(reserve, 1, .5);
assert(result.ok && result.income === Math.round(result.visitors * rate));
assert.strictEqual(reserve.fund - fundBefore, result.income, "recruitment must deposit exactly the computed contribution");
for (let star = 1; star <= 9; star++) {
  const threshold = TOURISM_THRESHOLDS[star - 1];
  const current = tourismProgression(threshold);
  assert.strictEqual(current.stars, star);
  assert.strictEqual(current.progress, star === 9 ? 100 : 0);
  assert.strictEqual(current.path.filter((step) => step.current).length, 1);
  if (star > 1) assert.strictEqual(tourismProgression(threshold - .01).stars, star - 1);
}
assert.strictEqual(tourismProgression(TOURISM_THRESHOLDS[1] / 2).progress, 50);
assert.strictEqual(tourismProgression(100).progress, 100);

// 星级是经营质量的缓慢追踪值：连续经营才会上升，停摆后也会逐步下降。
const dynamicReserve = createReserveState();
assert(buildRiverShallowsPlan(dynamicReserve, "visitor_boardwalk", 1).ok, "dynamic tourism fixture must have an operating route");
const firstTourism = reserveOperationsSnapshot(dynamicReserve, 1, { weather: "阴" }).tourism;
assert(firstTourism.score < firstTourism.rawScore, "tourism score must not jump to the raw score in one day");
dynamicReserve.development.operations.today.tourismScore = firstTourism.score;
const continuedTourism = reserveOperationsSnapshot(dynamicReserve, 2, { weather: "阴" }).tourism;
assert(continuedTourism.score > firstTourism.score, "stable operation should gradually improve tourism score");
dynamicReserve.development.nodes.river_shallows.phase = "available";
dynamicReserve.development.nodes.river_shallows.planId = "";
dynamicReserve.development.operations.today.tourismScore = continuedTourism.score;
const idleTourism = reserveOperationsSnapshot(dynamicReserve, 3, { weather: "阴" }).tourism;
assert(idleTourism.score < continuedTourism.score && idleTourism.trend === "down", "poor operation must be able to lower tourism score");

const previewDir = process.env.UI_PREVIEW_DIR;
const canvasLibrary = previewDir ? require("@napi-rs/canvas") : null;
if (canvasLibrary && process.env.UI_PREVIEW_FONT) canvasLibrary.GlobalFonts.registerFromPath(process.env.UI_PREVIEW_FONT, "PingFang SC");
function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, key) {
      if (key === "measureText") return (text) => ({ width: [...String(text)].reduce((sum, c) => sum + (/[^\x00-\xff]/.test(c) ? 1 : .56), 0) * (Number((target.font || "12px").match(/([\d.]+)px/)[1])) });
      if (key === "createLinearGradient" || key === "createRadialGradient") return () => gradient;
      return target[key] || (() => {});
    },
    set(target, key, value) { target[key] = value; return true; }
  });
}
const game = new Game();
game.stopLoop(); game.render = () => {};
game.dpr = 1;
function capture(name, width) {
  if (previewDir) require("fs").writeFileSync(require("path").join(previewDir, `${name}-${width}.png`), game.canvas.toBuffer("image/png"));
}
for (const [width, height] of [[320, 568], [375, 667], [430, 932]]) {
  game.width = width; game.height = height;
  game.info = { windowWidth: width, windowHeight: height, pixelRatio: 1, safeArea: { top: 0, bottom: height } };
  game.canvas = canvasLibrary ? canvasLibrary.createCanvas(width, height) : null;
  game.ctx = game.canvas ? game.canvas.getContext("2d") : fakeContext();
  game.hitAreas = []; game.scrollY = 0;
  game.state.world.reserve.development.operations.today = { visitors: 160, recruitedVisitors: 0, income: 598 };
  game.ctx.fillStyle = "#f6efdd"; game.ctx.fillRect(0, 0, width, height);
  game.drawDiscoveryVisitors(game.ctx, 10);
  capture("visitors", width);
  const starHit = game.hitAreas.find((area) => area.y === 49);
  assert(starHit, "star progress must be clickable");
  starHit.onTap();
  assert.strictEqual(game.infoDetailModal.kind, "tourismProgress");
  game.ctx.clearRect(0, 0, width, height);
  game.hitAreas = [];
  game.drawInfoDetailModal();
  const path = game.infoDetailModal.renderedTourismPath;
  assert.strictEqual(path.length, 9, "all nine ranks must be visible");
  assert(path[8].y + path[8].h < height - 90, "last rank must stay above footer/buttons");
  capture("tourism-path", width);
  game.infoDetailModal = null;
  game.openReserveProsperityDetail();
  game.ctx.clearRect(0, 0, width, height);
  game.hitAreas = [];
  game.drawInfoDetailModal();
  const dashboard = game.infoDetailModal;
  const prosperity = dashboard.renderedReserveProsperity;
  assert(prosperity && prosperity.metrics.length === 3, "prosperity dashboard must render three metrics");
  assert(prosperity.metrics.every((metric) => metric.h >= 62 && metric.h <= 78), "metric cards must stay compact");
  const promotion = prosperity.promotion;
  assert(promotion && promotion.h >= 96, "promotion card must receive the space saved above");
  const lastRow = prosperity.rows.at(-1);
  assert(lastRow && lastRow.y + lastRow.h < height - 90);
  const hit = game.hitAreas.find((area) => area.x === promotion.x && area.y === promotion.y);
  assert(hit, "promotion conditions must be clickable");
  capture("reserve", width);
  hit.onTap();
  assert.notStrictEqual(game.infoDetailModal, dashboard, "tap must open progression conditions");
  game.infoDetailModal = null;
}
console.log("tourism UI check ok (rate bounds, income reconciliation, rank thresholds, 3 viewports, clickable progression)");
