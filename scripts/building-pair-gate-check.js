"use strict";

const assert = require("node:assert/strict");

function fakeContext(width = 375, height = 667) {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (value) => ({ width: String(value || "").length * 7 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (prop === "canvas") return { width, height };
      if (!target[prop]) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    }
  });
}

global.wx = {
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 1 }; },
  createCanvas() { return { width: 375, height: 667, getContext: () => fakeContext() }; },
  createImage() { return { loaded: true }; },
  getStorageSync() { return null; },
  setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const { createReserveState } = require("../js/world");
const { Game } = require("../js/game");
const {
  BUILDING_FACILITY_PAIRS,
  BUILDING_PAIR_LEVEL_CAPS,
  buildReserveDevelopmentPlan,
  buildingPairStatus,
  buildingPairSummary,
  developmentBuildingView,
  upgradeDevelopmentBuilding,
  reserveOperationsSnapshot,
  settleReserveDevelopmentDay
} = require("../js/reserveDevelopment");

const PLANS = Object.freeze({
  river_shallows: "visitor_boardwalk",
  meadow_edge: "meadow_story_trail",
  border_pass: "guided_border_hide",
  forest_watch: "forest_listening_deck"
});
const SPECIALIZATIONS = Object.freeze({
  hydrology_station: "ecology",
  migration_watch: "ecology",
  old_patrol_post: "enforcement",
  evidence_room: "research"
});

function readyProgression(reserve) {
  reserve.progression = { stage: 18, displayChapter: 18, level: 18 };
  reserve.development = reserve.development || {};
  reserve.development.operations = reserve.development.operations || {};
  reserve.development.operations.today = Object.assign({}, reserve.development.operations.today, { tourismScore: 43 });
  reserve.fund = 999999;
  return reserve;
}

function setFacilityStage(reserve, facilityId, stage) {
  reserve.facilityConstruction = reserve.facilityConstruction || { version: 1, sites: {} };
  reserve.facilityConstruction.sites = reserve.facilityConstruction.sites || {};
  if (stage === "specialized") {
    reserve.facilityConstruction.sites[facilityId] = { buildStage: 3, buildSteps: 2, specialization: SPECIALIZATIONS[facilityId] };
    return;
  }
  if (stage === "built") {
    reserve.facilityConstruction.sites[facilityId] = { buildStage: 2, buildSteps: 2 };
    return;
  }
  reserve.facilityConstruction.sites[facilityId] = { buildStage: 0, buildSteps: 0 };
}

function builtReserve(nodeId, level = 3, facilityStage = "missing") {
  const reserve = createReserveState();
  readyProgression(reserve);
  assert.equal(buildReserveDevelopmentPlan(reserve, nodeId, PLANS[nodeId], 1).ok, true, `${nodeId} 应先建成`);
  reserve.development.nodes[nodeId].buildingLevel = level;
  const pair = BUILDING_FACILITY_PAIRS[nodeId];
  setFacilityStage(reserve, pair.facilityId, facilityStage);
  return reserve;
}

assert.deepEqual(Object.keys(BUILDING_FACILITY_PAIRS), ["river_shallows", "meadow_edge", "border_pass", "forest_watch"]);
assert.equal(BUILDING_FACILITY_PAIRS.river_shallows.facilityName, "水文站");
assert.equal(BUILDING_FACILITY_PAIRS.meadow_edge.facilityName, "观测站");
assert.equal(BUILDING_FACILITY_PAIRS.border_pass.facilityName, "巡护站");
assert.equal(BUILDING_FACILITY_PAIRS.forest_watch.facilityName, "线索室");
assert.deepEqual(BUILDING_PAIR_LEVEL_CAPS, { missing: 3, built: 6, specialized: 9 });

const early = builtReserve("river_shallows", 1, "missing");
const firstUpgrade = upgradeDevelopmentBuilding(early, "river_shallows", 1);
assert.equal(firstUpgrade.ok, true, "未建水文站仍可升到2级");
assert.equal(firstUpgrade.node.buildingLevel, 2);

const blocked = builtReserve("river_shallows", 3, "missing");
const blockedView = developmentBuildingView(blocked, "river_shallows", 1);
assert.equal(blockedView.level, 3);
assert.equal(blockedView.pair.stage, "missing");
assert.equal(blockedView.pair.cap, 3);
assert.equal(blockedView.upgradeAvailable, false);
assert(blockedView.upgradeMissing.includes("水文站校准水线"), "升4级应点名去水文站校准水线");
assert(blockedView.upgradeGate.nextSteps.some((step) => step.includes("浅滩升4级：去水文站校准水线一次")));
assert(!blockedView.upgradeMissing.join("").includes("建成"), "保护站不需要建设");
const blockedUpgrade = upgradeDevelopmentBuilding(blocked, "river_shallows", 1);
assert.equal(blockedUpgrade.ok, false, "未建水文站不能升到4级");
assert.equal(blocked.development.nodes.river_shallows.buildingLevel, 3, "配对门槛只能拦住继续升级，不得降级");

const built = builtReserve("river_shallows", 3, "built");
const builtUpgrade = upgradeDevelopmentBuilding(built, "river_shallows", 1);
assert.equal(builtUpgrade.ok, true, "水文站建成后应能升到4级");
assert.equal(builtUpgrade.node.buildingLevel, 4);

const capSix = builtReserve("river_shallows", 6, "built");
const capSixView = developmentBuildingView(capSix, "river_shallows", 1);
assert.equal(capSixView.pair.cap, 6);
assert.equal(capSixView.upgradeAvailable, false);
assert(capSixView.upgradeMissing.includes("水文站用满3次"), "升7级应点名把水文站用满3次");
const capSixUpgrade = upgradeDevelopmentBuilding(capSix, "river_shallows", 1);
assert.equal(capSixUpgrade.ok, false);
assert.equal(capSix.development.nodes.river_shallows.buildingLevel, 6);

const specialized = builtReserve("river_shallows", 6, "specialized");
const specializedUpgrade = upgradeDevelopmentBuilding(specialized, "river_shallows", 1);
assert.equal(specializedUpgrade.ok, true, "水文站专精后应能升到7级");
assert.equal(specializedUpgrade.node.buildingLevel, 7);
assert.equal(developmentBuildingView(specialized, "river_shallows", 1).pair.cap, 9);

const leftoverFive = builtReserve("river_shallows", 5, "missing");
assert.equal(developmentBuildingView(leftoverFive, "river_shallows", 1).level, 5, "旧档5级不得被配对门槛削下来");
const leftoverEight = builtReserve("river_shallows", 8, "missing");
assert.equal(developmentBuildingView(leftoverEight, "river_shallows", 1).level, 8, "旧档8级不得被配对门槛削下来");
assert.equal(upgradeDevelopmentBuilding(leftoverEight, "river_shallows", 1).ok, false);
assert.equal(leftoverEight.development.nodes.river_shallows.buildingLevel, 8);

const meadow = builtReserve("meadow_edge", 3, "missing");
assert(developmentBuildingView(meadow, "meadow_edge", 1).upgradeGate.nextSteps.some((step) => step.includes("草场升4级：去观测站观察迁徙一次")));
const border = builtReserve("border_pass", 3, "missing");
assert(developmentBuildingView(border, "border_pass", 1).upgradeGate.nextSteps.some((step) => step.includes("边界升4级：去巡护站派出短巡一次")));
const forest = builtReserve("forest_watch", 3, "missing");
assert(developmentBuildingView(forest, "forest_watch", 1).upgradeGate.nextSteps.some((step) => step.includes("高地升4级：去线索室整理线索一次")));
const chapterMeadow = builtReserve("meadow_edge", 3, "missing");
chapterMeadow.progression = { stage: 3, displayChapter: 3, level: 3 };
const chapterMeadowView = developmentBuildingView(chapterMeadow, "meadow_edge", 1);
assert(chapterMeadowView.upgradeGate.nextSteps.some((step) => step.includes("草场升4级：进入第4章后，去观测站观察迁徙")));
assert.equal(chapterMeadowView.pair.actionLabel, "先到第4章");
assert.equal(chapterMeadowView.pair.stationReady, false);
const chapterForest = builtReserve("forest_watch", 3, "missing");
chapterForest.progression = { stage: 3, displayChapter: 3, level: 3 };
const chapterForestView = developmentBuildingView(chapterForest, "forest_watch", 1);
assert(chapterForestView.upgradeGate.nextSteps.some((step) => step.includes("高地升4级：去线索室整理线索一次")));
assert.equal(chapterForestView.pair.actionLabel, "去整理线索");
assert.equal(chapterForestView.pair.stationReady, true);
assert(!chapterForestView.upgradeMissing.join("").includes("建成"));

const named = createReserveState();
readyProgression(named);
assert.equal(buildReserveDevelopmentPlan(named, "river_shallows", PLANS.river_shallows, 1).ok, true);
setFacilityStage(named, "hydrology_station", "specialized");
const summary = buildingPairSummary(named);
assert(summary.label.includes("浅滩×水文站"), "日结算应写明已配对的建筑和设施");
assert(summary.label.includes("草场还没用观测站"), "日结算应写明还没用哪座保护站");
const snapshot = reserveOperationsSnapshot(named, 2);
assert.equal(snapshot.pairSummary.label, summary.label);
const settled = settleReserveDevelopmentDay(named, 2);
assert(settled);
assert.equal(named.development.operations.today.pairImpact, summary.label);

const game = new Game();
game.width = 375;
game.height = 667;
game.ctx = fakeContext(375, 667);
game.state.world.reserve = blocked;
game.openDevelopmentBuildingUpgrade("river_shallows");
game.hitAreas = [];
game.drawInfoDetailModal();
assert(String(game.infoDetailModal.footer || "").includes("浅滩升4级：去水文站校准水线一次"), "升级页脚应点名去水文站校准水线");
const pairRow = (game.infoDetailModal.renderedBuildingRows || []).find((row) => row.label === "保护站");
assert(pairRow, "升级页应单独显示保护站");
assert(String(pairRow.text).includes("水文站"), "升级页配对行应写水文站");

game.drawDiscoveryVisitors(fakeContext(375, 667), 20);
assert(game.renderedVisitorTable.pairSummary, "游客页应带上配对摘要");
assert(String(game.renderedVisitorTable.pairSummary.label).includes("浅滩还没用水文站"));

assert.equal(buildingPairStatus({}, "unknown_node").available, true);

console.log("building pair gate check ok (cap 3/6/9, use the station, no downgrade)");
