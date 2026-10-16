"use strict";

const assert = require("node:assert/strict");
const { createReserveState } = require("../js/world");
const { buildReserveView } = require("../js/reserveView");
const { Game } = require("../js/game");
const {
  isHarshNatureEvent,
  harshNatureKind,
  harshNatureDamageForScore,
  harshNaturePopulationScale,
  harshNatureMeterScale,
  applyHarshNatureOutcome,
  HARSH_NATURE_ARCHERY_THRESHOLD
} = require("../js/sandboxTaskCadence");

assert.strictEqual(harshNatureDamageForScore(1), 8);
assert.strictEqual(harshNatureDamageForScore(2), 6);
assert.ok(harshNatureDamageForScore(3) < harshNatureDamageForScore(2), "≥3 伤害必须低于 1–2");
assert.ok(harshNatureDamageForScore(4) < harshNatureDamageForScore(3));
assert.ok(harshNatureDamageForScore(5) < harshNatureDamageForScore(4));
assert.ok(harshNatureDamageForScore(6) < harshNatureDamageForScore(5));
assert.ok(harshNatureDamageForScore(6) >= 1, "6点仍必须留下伤害");
assert.strictEqual(HARSH_NATURE_ARCHERY_THRESHOLD, 3);

function seededReserve() {
  const reserve = createReserveState();
  reserve.progression = Object.assign({}, reserve.progression, { stage: 4, displayChapter: 4, level: 2 });
  reserve.ecology.grass = 64;
  reserve.ecology.water = 70;
  reserve.ecology.disease = 12;
  reserve.ecology.herbivores = Object.assign({}, reserve.ecology.herbivores, { deer: 40, antelope: 36 });
  reserve.development = reserve.development || {};
  reserve.development.operations = Object.assign({}, reserve.development.operations, {
    chapterVisitors: { stage: 4, inherited: 80, legacySeed: 0, start: {}, startLifetime: 0 },
    visitorLedger: { totalVisitors: 220, recruitedVisitors: 140, lostVisitors: 0 }
  });
  return reserve;
}

const damages = [];
for (let score = 1; score <= 6; score += 1) {
  const reserve = seededReserve();
  const grassBefore = reserve.ecology.grass;
  const animalsBefore = (reserve.ecology.herbivores.deer || 0) + (reserve.ecology.herbivores.antelope || 0);
  const outcome = applyHarshNatureOutcome(reserve, "wildfire", score);
  const grassDelta = reserve.ecology.grass - grassBefore;
  const animalDelta = ((reserve.ecology.herbivores.deer || 0) + (reserve.ecology.herbivores.antelope || 0)) - animalsBefore;
  assert.ok(grassDelta < 0, `火灾 ${score} 点草场必须下降`);
  assert.ok(animalDelta < 0, `火灾 ${score} 点动物必须下降`);
  assert.ok(outcome.changes.every((item) => item.metric === "disease" ? item.delta > 0 : item.delta < 0), `火灾 ${score} 点不得出现正向经营数据`);
  damages.push(Math.abs(grassDelta) + Math.abs(animalDelta));
}
assert.ok(damages[0] > damages[1], "1点伤害必须重于2点");
assert.ok(damages[1] > damages[2], "2点伤害必须重于3点");
assert.ok(damages[2] >= damages[5], "3点伤害必须不轻于6点");

assert.equal(harshNaturePopulationScale({ progression: { stage: 1 } }), 1);
assert.equal(harshNaturePopulationScale({ progression: { stage: 11, displayChapter: 11 } }), 4);
assert.equal(harshNaturePopulationScale({ progression: { stage: 14, displayChapter: 14 } }), 5);
assert.equal(harshNatureMeterScale({ progression: { stage: 1 } }), 1);
assert.equal(harshNatureMeterScale({ progression: { stage: 14, displayChapter: 14 } }), 4);

const earlyFire = createReserveState();
earlyFire.progression = Object.assign({}, earlyFire.progression, { stage: 1, displayChapter: 1 });
earlyFire.ecology.grass = 74;
earlyFire.ecology.herbivores = Object.assign({}, earlyFire.ecology.herbivores, { deer: 80, antelope: 80 });
const lateFire = createReserveState();
lateFire.progression = Object.assign({}, lateFire.progression, { stage: 14, displayChapter: 14 });
lateFire.ecology.grass = 74;
lateFire.ecology.herbivores = Object.assign({}, lateFire.ecology.herbivores, { deer: 800, antelope: 800 });
const earlyPerfect = applyHarshNatureOutcome(earlyFire, "wildfire", 6);
const latePerfect = applyHarshNatureOutcome(lateFire, "wildfire", 6);
const earlyAnimalHit = Math.abs((earlyPerfect.changes.find((item) => item.metric === "animals") || {}).delta || 0);
const lateAnimalHit = Math.abs((latePerfect.changes.find((item) => item.metric === "animals") || {}).delta || 0);
const earlyGrassHit = Math.abs((earlyPerfect.changes.find((item) => item.metric === "grass") || {}).delta || 0);
const lateGrassHit = Math.abs((latePerfect.changes.find((item) => item.metric === "grass") || {}).delta || 0);
assert.equal(earlyAnimalHit, 1, "第1章6点动物伤害保持1只");
assert.equal(lateAnimalHit, 5, "第14章6点动物伤害只按缓慢档位放大");
assert.ok(lateGrassHit > earlyGrassHit, "第14章草场伤害也要随章节加重");
assert.ok(lateGrassHit < 8, "完美压低后的草场伤害不得一次打穿指数");

const lateMissReserve = createReserveState();
lateMissReserve.progression = Object.assign({}, lateMissReserve.progression, { stage: 14, displayChapter: 14 });
lateMissReserve.ecology.grass = 74;
lateMissReserve.ecology.herbivores = Object.assign({}, lateMissReserve.ecology.herbivores, { deer: 800, antelope: 800 });
const lateMiss = applyHarshNatureOutcome(lateMissReserve, "wildfire", 1);
const missAnimalHit = Math.abs((lateMiss.changes.find((item) => item.metric === "animals") || {}).delta || 0);
assert.ok(missAnimalHit > lateAnimalHit, "第14章1点动物伤害必须重于6点");

const lateFlood = createReserveState();
lateFlood.progression = Object.assign({}, lateFlood.progression, { stage: 14, displayChapter: 14 });
lateFlood.ecology.herbivores = Object.assign({}, lateFlood.ecology.herbivores, { deer: 800, antelope: 800 });
lateFlood.development = lateFlood.development || {};
lateFlood.development.operations = Object.assign({}, lateFlood.development.operations, {
  chapterVisitors: { stage: 14, inherited: 400, legacySeed: 0, start: {}, startLifetime: 0 },
  visitorLedger: { totalVisitors: 1200, recruitedVisitors: 800, lostVisitors: 0 },
  today: { visitors: 200, recruitedVisitors: 200 }
});
const floodPerfect = applyHarshNatureOutcome(lateFlood, "flood", 6);
const floodVisitorHit = Math.abs((floodPerfect.changes.find((item) => item.metric === "visitors") || {}).delta || 0);
assert.equal(floodVisitorHit, 5, "第14章水灾6点游客流失必须跟缓慢档位走");
const floodMissReserve = createReserveState();
floodMissReserve.progression = Object.assign({}, floodMissReserve.progression, { stage: 11, displayChapter: 11 });
floodMissReserve.ecology.herbivores = Object.assign({}, floodMissReserve.ecology.herbivores, { deer: 400, antelope: 400 });
floodMissReserve.development = floodMissReserve.development || {};
floodMissReserve.development.operations = Object.assign({}, floodMissReserve.development.operations, {
  chapterVisitors: { stage: 11, inherited: 300, legacySeed: 0, start: {}, startLifetime: 0 },
  visitorLedger: { totalVisitors: 900, recruitedVisitors: 600, lostVisitors: 0 },
  today: { visitors: 160, recruitedVisitors: 160 }
});
const floodMiss = applyHarshNatureOutcome(floodMissReserve, "flood", 1);
const floodMissVisitors = Math.abs((floodMiss.changes.find((item) => item.metric === "visitors") || {}).delta || 0);
const floodMissAnimals = Math.abs((floodMiss.changes.find((item) => item.metric === "animals") || {}).delta || 0);
assert.ok(floodMissVisitors > floodVisitorHit, "第11章水灾1点游客流失必须重于后期完美压低");
assert.ok(floodMissVisitors <= 24, "水灾游客流失不得再按章节整倍打穿客流");
assert.ok(floodMissAnimals <= 16, "水灾动物损失不得再按整章倍乘");
const fireMissEleven = createReserveState();
fireMissEleven.progression = Object.assign({}, fireMissEleven.progression, { stage: 11, displayChapter: 11 });
fireMissEleven.ecology.grass = 74;
fireMissEleven.ecology.herbivores = Object.assign({}, fireMissEleven.ecology.herbivores, { deer: 400, antelope: 400 });
const fireMiss = applyHarshNatureOutcome(fireMissEleven, "wildfire", 1);
const fireMissAnimals = Math.abs((fireMiss.changes.find((item) => item.metric === "animals") || {}).delta || 0);
const fireMissGrass = Math.abs((fireMiss.changes.find((item) => item.metric === "grass") || {}).delta || 0);
assert.ok(fireMissAnimals <= 16, "火灾动物损失不得再按整章倍乘");
assert.ok(fireMissGrass <= 12, "火灾草场伤害不得一次打掉大段指数");

const flood = seededReserve();
const visitorsBefore = require("../js/chapterTargets").chapterVisitorTotal(flood);
const floodAnimalsBefore = require("../js/chapterRescueSystem").livingAnimalTotal(flood);
const floodOutcome = applyHarshNatureOutcome(flood, "flood", 1);
assert.ok(require("../js/chapterTargets").chapterVisitorTotal(flood) < visitorsBefore, "水灾必须减少游客");
assert.ok(floodOutcome.changes.some((item) => item.metric === "animals" && item.delta < 0), "水灾必须减少动物");
assert.equal(require("../js/chapterRescueSystem").livingAnimalTotal(flood), floodAnimalsBefore + floodOutcome.changes.find((item) => item.metric === "animals").delta);
assert.equal(require("../js/animalSourceLedger").animalSourceSummary(flood).died, Math.abs(floodOutcome.changes.find((item) => item.metric === "animals").delta), "恶劣自然事件的动物损失必须记死亡，不是迁出");
assert.equal(require("../js/animalSourceLedger").animalSourceSummary(flood).breeding, 0, "水灾不得污染繁殖剩余");
assert.equal(require("../js/animalSourceLedger").animalSourceSummary(flood).emigrated, 0, "水灾不得记成迁出");

const fireLedger = seededReserve();
const fireAnimalsBefore = require("../js/chapterRescueSystem").livingAnimalTotal(fireLedger);
const fireVisitorsBefore = require("../js/chapterTargets").chapterVisitorTotal(fireLedger);
applyHarshNatureOutcome(fireLedger, "wildfire", 4);
assert.equal(require("../js/chapterTargets").chapterVisitorTotal(fireLedger), fireVisitorsBefore, "火灾不得改写本章游客");
assert.ok(require("../js/chapterRescueSystem").livingAnimalTotal(fireLedger) < fireAnimalsBefore, "火灾必须减少动物总数");
assert.ok(require("../js/animalSourceLedger").animalSourceSummary(fireLedger).died > 0);
assert.equal(require("../js/animalSourceLedger").animalSourceSummary(fireLedger).breeding, 0);

const sick = seededReserve();
const diseaseBefore = sick.ecology.disease;
applyHarshNatureOutcome(sick, "disease", 2);
assert.ok(sick.ecology.disease > diseaseBefore, "病虫害必须推高疾病");

const dry = createReserveState();
dry.seasonState = { name: "旱季", weather: "热浪", day: 4, cycleDay: 16 };
dry.ecology.grass = 40;
const fireView = buildReserveView(dry, dry, { day: 4, season: "旱季", weather: "热浪", now: 1_000 });
const fireMarker = fireView.mapMarkers.find((item) => isHarshNatureEvent(item));
assert(fireMarker, "火灾预警必须出现在沙盘");
assert.equal(harshNatureKind(fireMarker), "wildfire");
assert.equal(fireMarker.recommendAction, "harshNature");

const wet = createReserveState();
wet.seasonState = { name: "雨季", weather: "暴雨", day: 2, cycleDay: 2 };
wet.ecology.water = 86;
const floodMarker = buildReserveView(wet, wet, { day: 2, season: "雨季", weather: "暴雨", now: 1_000 })
  .mapMarkers.find((item) => harshNatureKind(item) === "flood");
assert(floodMarker && floodMarker.recommendAction === "harshNature", "水灾必须走射箭判定");

const sickView = createReserveState();
sickView.development = sickView.development || {};
sickView.development.nodes = Object.assign({}, sickView.development.nodes, {
  river_shallows: { id: "river_shallows", phase: "operational", planId: "reed_refuge", buildingLevel: 1 }
});
sickView.ecology.disease = 28;
const diseaseMarker = buildReserveView(sickView, sickView, { day: 3, season: "雨季", weather: "阴", now: 1_000 })
  .mapMarkers.find((item) => harshNatureKind(item) === "disease");
assert(diseaseMarker && diseaseMarker.recommendAction === "harshNature", "病虫害必须走射箭判定");

assert.equal(isHarshNatureEvent({
  id: "rv_2_water_0",
  presentation: "resource-flow",
  metric: "water",
  recommendAction: "habitat",
  title: "水线变紧"
}), false, "水源不足不得改成水灾射箭");
assert.equal(isHarshNatureEvent({
  id: "rv_4_water_contamination_0",
  eventType: "water_contamination",
  title: "水源污染扩散",
  recommendAction: "intervention",
  visualKind: "contaminated-water",
  responseOptions: [{ action: "intervention" }]
}), false, "水源污染世界事件不得改成水灾射箭");
assert.equal(isHarshNatureEvent({
  id: "rv_1_neighbor_water_0",
  eventType: "neighbor_water",
  title: "邻区上游截水",
  recommendAction: "habitat",
  visualKind: "shared-water",
  responseOptions: [{ action: "habitat" }]
}), false, "邻区水源事件不得改成水灾射箭");

const game = new Game();
if (game.stopLoop) game.stopLoop();
game.state.world.reserve = dry;
game.screen = "home";
game.openMapMarkerDetail(fireMarker);
assert.equal(game.screen, "home", "火灾预警不得跳进空的巡护页");
assert.equal(game.infoDetailModal && game.infoDetailModal.kind, "harshNatureDice", "火灾预警必须打开射箭判定");
assert.equal(game.infoDetailModal.harshKind, "wildfire");

game.infoDetailModal = null;
game.openMapMarkerDetail({
  id: "rv_4_water_contamination_0",
  eventType: "water_contamination",
  title: "水源污染扩散",
  recommendAction: "intervention",
  visualKind: "contaminated-water",
  responseOptions: [{ action: "intervention" }]
});
assert.notEqual(game.infoDetailModal && game.infoDetailModal.kind, "harshNatureDice", "水源污染必须保留原事件处理");

function assertHarshNatureGraphicOverlay(reserve, view, label) {
  const overlayGame = Object.create(Game.prototype);
  overlayGame.state = { world: { reserve, day: 4, weather: "热浪", season: "雨季" } };
  overlayGame.ctx = {
    save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    quadraticCurveTo() {}, bezierCurveTo() {}, arc() {}, ellipse() {}, fill() {}, stroke() {},
    fillRect() {}, rect() {}, clip() {}, setLineDash() {},
    createRadialGradient() { return { addColorStop() {} }; },
    createLinearGradient() { return { addColorStop() {} }; },
    measureText: (value) => ({ width: String(value || "").length * 7 })
  };
  overlayGame.animT = () => 1200;
  overlayGame.findRegion = (id) => ({ id, x: .5, y: .5 });
  overlayGame.mapPoint = (x, y) => ({ x: 180 + x * 20, y: 260 + y * 20 });
  overlayGame.addMapRectHit = () => {};
  overlayGame.roundRect = () => {};
  overlayGame.text = () => {};
  overlayGame.reserveViewForDisplay = () => view;
  overlayGame.mapViewport = { x: 0, y: 0, w: 375, h: 667 };
  overlayGame.scrollY = 0;
  overlayGame.mapEventBalloonHit = null;
  overlayGame.mapEventGraphicHits = [];
  overlayGame.openHarshNatureArchery = Game.prototype.openHarshNatureArchery;
  overlayGame.render = () => {};
  overlayGame.infoDetailModal = null;
  overlayGame.drawActiveWorldEventOverlay(overlayGame.ctx, { scale: 1, x: 0, y: 0, w: 375, h: 667 }, false);
  assert.equal(overlayGame.renderedWorldEventOverlay && overlayGame.renderedWorldEventOverlay.markerStyle, "graphic", `${label}必须走沙盘仿真而不是消息气球`);
  assert.ok(!(overlayGame.renderedWorldEventOverlay.features || []).some((item) => item.type === "event-balloon"), `${label}仿真上不得再叠紧急气球`);
  assert.ok(overlayGame.mapEventBalloonHit && overlayGame.mapEventBalloonHit.w > 0, `${label}仿真区域必须可点`);
  overlayGame.mapEventBalloonHit.onTap();
  assert.equal(overlayGame.infoDetailModal && overlayGame.infoDetailModal.kind, "harshNatureDice", `点击${label}仿真区域必须进入射箭判定`);
  const displayMarkers = Game.prototype.mapTaskStoryMarkersForDisplay.call(overlayGame, overlayGame.state.world, null);
  assert.ok(!displayMarkers.some((item) => isHarshNatureEvent(item)), `${label}不得再画一层任务气泡`);
}

assertHarshNatureGraphicOverlay(dry, fireView, "火灾");
assertHarshNatureGraphicOverlay(wet, buildReserveView(wet, wet, { day: 2, season: "雨季", weather: "暴雨", now: 1_000 }), "水灾");
assertHarshNatureGraphicOverlay(sickView, buildReserveView(sickView, sickView, { day: 3, season: "雨季", weather: "阴", now: 1_000 }), "病虫害");

const { REAL_NATURE_EVENT_DEFINITIONS } = require("../js/realNatureEventSystem");
const { untreatedDisasterKinds } = require("../js/sandboxTaskCadence");
const fireType = Object.keys(REAL_NATURE_EVENT_DEFINITIONS).find((key) => {
  const item = REAL_NATURE_EVENT_DEFINITIONS[key];
  return item.themeId === "fire" && item.visualKind === "wildfire" && !/火警|火灾预警|山火|野火/.test(`${item.title || ""}`);
});
const fireDef = REAL_NATURE_EVENT_DEFINITIONS[fireType];
assert(fireDef, "必须有一条复用火灾图的野外实录");
assert.equal(fireDef.target, 3, "野外实录本身带 3 次处置窗口");
const chapter6 = createReserveState();
chapter6.progression = Object.assign({}, chapter6.progression, { stage: 6, displayChapter: 6, level: 4 });
chapter6.emergency = Object.assign({}, chapter6.emergency || {}, {
  active: Object.assign({}, fireDef, { type: fireType, id: fireType, progress: 0, daysRemaining: 3, target: 3 })
});
assert.equal(untreatedDisasterKinds(chapter6).includes("wildfire"), false, "热浪图的野外实录不得冒充未处理火灾");
game.state.world.reserve = chapter6;
game.screen = "home";
game.infoDetailModal = null;
game.openActiveWorldEventFromMap(chapter6.emergency.active);
assert.notEqual(game.infoDetailModal && game.infoDetailModal.kind, "harshNatureDice", "火主题野外实录不得打开火灾预警");
assert.notEqual(game.infoDetailModal && game.infoDetailModal.kicker, "火灾预警");
game.infoDetailModal = null;
game.openMapMarkerDetail({
  eventType: fireType,
  type: fireType,
  title: fireDef.title,
  label: fireDef.title,
  visualKind: "wildfire",
  category: "realNature",
  recommendAction: "realEvent",
  target: 3,
  daysRemaining: 3,
  progress: 0
});
assert.notEqual(game.infoDetailModal && game.infoDetailModal.kind, "harshNatureDice", "点击火主题标记不得进入火灾射箭");
game.openHarshNatureArchery(Object.assign({}, chapter6.emergency.active, { eventType: fireType, type: fireType }));
assert.equal(game.finishResolvedFireEmergency(chapter6, game.infoDetailModal.marker, "wildfire"), true, "同一场事件射箭一次后必须结束");
assert.equal(chapter6.emergency.active, null, "进度不得停在 0/3");

const repeat = createReserveState();
repeat.progression = Object.assign({}, repeat.progression, { stage: 6, displayChapter: 6, level: 4 });
repeat.seasonState = { name: "旱季", weather: "热浪", day: 4, cycleDay: 16 };
repeat.ecology.grass = 50;
repeat.development = repeat.development || {};
repeat.development.nodes = Object.assign({}, repeat.development.nodes, {
  river_shallows: { id: "river_shallows", phase: "operational", planId: "reed_refuge", buildingLevel: 1 }
});
const firstFire = buildReserveView(repeat, repeat, { day: 4, season: "旱季", weather: "热浪", now: 10_000 });
assert((firstFire.mapMarkers || []).some((item) => harshNatureKind(item) === "wildfire"), "第6章旱季必须能出现一次火灾预警");
applyHarshNatureOutcome(repeat, "wildfire", 4);
for (let step = 1; step <= 3; step += 1) {
  const next = buildReserveView(repeat, repeat, { day: 4, season: "旱季", weather: "热浪", now: 10_000 + step * 25_000 });
  assert.equal((next.mapMarkers || []).some((item) => item.eventType === "sandbox_wildfire" || /火灾预警/.test(`${item.title || ""} ${item.label || ""}`)), false, `第6章火灾处理后第${step}次刷新不得再出现`);
}
game.state.world.reserve = repeat;
game.infoDetailModal = null;
assert.equal(game.openReserveViewAction("harshNature", "sandbox-task"), false, "灾害结束后不得再造一条火灾预警");
assert.notEqual(game.infoDetailModal && game.infoDetailModal.kind, "harshNatureDice");

console.log("harsh nature archery check ok");
