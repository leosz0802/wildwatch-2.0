"use strict";

// Visitor buildings keep the existing visitor, fund and animal ledgers.
// Attendance only changes how many of tonight's facility visits are recorded.
const assert = require("assert");

function fakeContext() {
  const gradient = { addColorStop() {} };
  const rendered = [];
  const ctx = new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (value) => ({ width: String(value || "").length * 7 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (prop === "fillText") return (value) => { rendered.push(String(value)); };
      if (prop === "canvas") return { width: 375, height: 812 };
      if (!target[prop]) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    }
  });
  ctx.rendered = rendered;
  return ctx;
}

global.wx = {
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 812, pixelRatio: 1 }; },
  createCanvas() { return { width: 375, height: 812, getContext: () => fakeContext() }; },
  createImage() { return { loaded: true }; },
  getStorageSync() { return null; },
  setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const { createReserveState } = require("../js/world");
const {
  buildReserveDevelopmentPlan,
  reserveDevelopmentNodeView,
  reserveDevelopmentAnimalTarget,
  settleReserveDevelopmentDay
} = require("../js/reserveDevelopment");
const { livingAnimalTotal } = require("../js/chapterRescueSystem");
const { chapterVisitorTotal, chapterVisitorBreakdown, beginChapterVisitorCheckpoint } = require("../js/chapterTargets");
const { animalSourceSummary } = require("../js/animalSourceLedger");
const { Game } = require("../js/game");

const buildings = [
  { node: "river_shallows", choice: "visitor_boardwalk", species: "鹿", setBad: (reserve) => { reserve.ecology.water = 40; }, full: "鹿在饮水", half: "鹿离开了浅滩" },
  { node: "meadow_edge", choice: "meadow_story_trail", species: "鹿", setBad: (reserve) => { reserve.ecology.grass = 40; }, full: "幼兽在穿行", half: "幼兽离开了草场" },
  { node: "border_pass", choice: "guided_border_hide", species: "狼", setBad: (reserve) => { reserve.poacherPressure = 60; }, full: "动物在经过边界", half: "动物没有经过边界" },
  { node: "forest_watch", choice: "forest_listening_deck", species: "乌鸦", setBad: (reserve) => { reserve.ecology.disease = 50; }, full: "鸟还在高地", half: "鸟离开了高地" }
];

buildings.forEach((building) => {
  const fullReserve = createReserveState();
  assert(buildReserveDevelopmentPlan(fullReserve, building.node, building.choice, 1).ok, building.choice);
  const fullView = reserveDevelopmentNodeView(fullReserve, building.node, 2);
  assert.strictEqual(fullView.attendanceReduced, false, `${building.choice} 条件满足时应满额`);
  assert.strictEqual(fullView.attendanceReason, building.full);
  assert.strictEqual(fullView.animalUse, true, `${building.choice} 满额时动物应停在节点`);
  assert.strictEqual(reserveDevelopmentAnimalTarget(building.species, fullReserve, 2).state, "using");

  const halfReserve = JSON.parse(JSON.stringify(fullReserve));
  building.setBad(halfReserve);
  const halfView = reserveDevelopmentNodeView(halfReserve, building.node, 2);
  assert.strictEqual(halfView.attendanceReduced, true, `${building.choice} 动物离开时应减半`);
  assert.strictEqual(halfView.attendanceReason, building.half);
  assert.strictEqual(halfView.animalUse, false);
  assert.strictEqual(halfView.visitors, Math.floor(fullView.visitors / 2), `${building.choice} 到访应为满额的一半`);
  assert.strictEqual(reserveDevelopmentAnimalTarget(building.species, halfReserve, 2).state, "avoiding");

  beginChapterVisitorCheckpoint(halfReserve, 2, 100);
  halfReserve.progression.stage = 2;
  halfReserve.progression.displayChapter = 2;
  const animalsBefore = livingAnimalTotal(halfReserve);
  const closureBefore = animalSourceSummary(halfReserve).closureDelta;
  const fundBefore = halfReserve.fund;
  const chapterBefore = chapterVisitorTotal(halfReserve);
  assert.strictEqual(chapterBefore, 10, "减半结算必须从本章 10% 继承起算");
  const fullSettlement = settleReserveDevelopmentDay(JSON.parse(JSON.stringify(fullReserve)), 2);
  const settlement = settleReserveDevelopmentDay(halfReserve, 2);
  assert(settlement && settlement.visitors > 0);
  assert.strictEqual(settlement.byNode[0].upkeep, fullSettlement.byNode[0].upkeep, `${building.choice} 减半后维护额不变`);
  assert.strictEqual(halfReserve.fund, fundBefore + settlement.income, `${building.choice} 基金只增加当晚净收入`);
  assert.strictEqual(livingAnimalTotal(halfReserve), animalsBefore, `${building.choice} 不得改变动物数量`);
  assert.strictEqual(animalSourceSummary(halfReserve).closureDelta, closureBefore, `${building.choice} 不得改动物账缺口`);
  const mix = chapterVisitorBreakdown(halfReserve);
  assert.strictEqual(mix.inherited, 10);
  assert.strictEqual(mix.facility, settlement.visitors, "减半人数整笔记入本章到访");
  assert.strictEqual(mix.recruited, 0);
  assert.strictEqual(mix.task, 0);
  assert.strictEqual(chapterVisitorTotal(halfReserve), chapterBefore + settlement.visitors);
  assert.strictEqual(settlement.facilityAttendance[0].reason, building.half);
  assert.strictEqual(settlement.facilityAttendance[0].reduced, true);
});

const economy = createReserveState();
assert(buildReserveDevelopmentPlan(economy, "river_shallows", "community_waterpoint", 1).ok);
economy.ecology.water = 40;
const economyView = reserveDevelopmentNodeView(economy, "river_shallows", 2);
assert.strictEqual(economyView.attendanceReason, "", "经营建筑不走游客到访减半");
assert.strictEqual(economyView.attendanceReduced, false);

const shown = createReserveState();
assert(buildReserveDevelopmentPlan(shown, "river_shallows", "visitor_boardwalk", 1).ok);
shown.ecology.water = 40;
beginChapterVisitorCheckpoint(shown, 2, 100);
shown.progression.stage = 2;
shown.progression.displayChapter = 2;
settleReserveDevelopmentDay(shown, 2);
const game = new Game();
game.stopLoop();
game.render = () => {};
game.width = 375;
game.height = 812;
game.state = { character: { name: "游客建筑" }, world: { reserve: shown, day: 2 } };
const visitorItems = game.buildChapterProgressDetail().metricDetails.visitors.items || [];
const body = ((visitorItems.find((item) => item.title === "当前游客构成") || visitorItems[0] || {}).body || "");
assert(/到访 \d+ 人/.test(body));
assert(body.includes("高架观察步道") && body.includes("鹿离开了浅滩") && body.includes("到访减半"), body);
assert(body.includes("继承 10 人"));

const ctx = fakeContext();
game.ctx = ctx;
game.drawDiscoveryVisitors(ctx, 80);
const visitorPage = ctx.rendered.join("\n");
assert(visitorPage.includes("到访减半"), visitorPage);
assert(visitorPage.includes("鹿离开了浅滩"), visitorPage);

const mapCtx = fakeContext();
const camera = { x: 0, y: 0, w: 375, h: 812, worldX: 0, worldY: 0, worldW: 375, worldH: 812, worldSize: 812, scale: 1 };
game.drawLivingReserveNode(mapCtx, camera, false, {
  view: reserveDevelopmentNodeView(shown, "river_shallows", 2),
  interactive: false,
  showDialogue: false
});
assert(mapCtx.rendered.some((line) => line.includes("减半")), mapCtx.rendered.join(" | "));

console.log("visitor building attendance check ok");
