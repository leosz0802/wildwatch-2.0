"use strict";

// 第三阶段建筑策略回归：统一留存上限、路线主轴、维护回本和组合收益封顶。
const assert = require("node:assert/strict");
const { createReserveState } = require("../js/world");
const {
  DEVELOPMENT_ROUTE_POLICIES,
  BUILDING_COMBINED_INCOME_CAP,
  buildReserveDevelopmentPlan,
  developmentBuildingView,
  reserveOperationsSnapshot
} = require("../js/reserveDevelopment");
const { facilityVisitorImpact, facilityAnimalImpact, FACILITY_RETENTION_CAP } = require("../js/reserveFacilities");

const routes = {
  animal: { river_shallows: "reed_refuge", meadow_edge: "native_grass_refuge", border_pass: "open_migration_gate", forest_watch: "canopy_quiet_zone" },
  visitor: { river_shallows: "visitor_boardwalk", meadow_edge: "meadow_story_trail", border_pass: "guided_border_hide", forest_watch: "forest_listening_deck" },
  economy: { river_shallows: "community_waterpoint", meadow_edge: "community_seed_field", border_pass: "shared_patrol_post", forest_watch: "research_waystation" }
};

function reserveForPlan() {
  const reserve = createReserveState();
  reserve.fund = 10000;
  reserve.wildernessKnowledge = reserve.wildernessKnowledge || {};
  reserve.wildernessKnowledge.tradeStock = {
    reed_cord: 9, pinecone_humidity: 9, seedpod_alarm: 9,
    track_cast: 9, feather_wind_tag: 9
  };
  return reserve;
}

// 六座设施同时满级时，游客留存和动物留存都只能获得一份 +12 个百分点的加成。
const capped = reserveForPlan();
capped.progression = { stage: 8, displayChapter: 8, level: 8 };
capped.facilityConstruction = { version: 1, sites: {
  old_patrol_post: { buildStage: 3, buildSteps: 2, specialization: "enforcement" },
  hydrology_station: { buildStage: 3, buildSteps: 2, specialization: "ecology" },
  evidence_room: { buildStage: 3, buildSteps: 2, specialization: "research" },
  migration_watch: { buildStage: 3, buildSteps: 2, specialization: "ecology" },
  governance_hall: { buildStage: 3, buildSteps: 2, specialization: "community" },
  guardian_memorial: { buildStage: 3, buildSteps: 2, specialization: "research" }
} };
const facilityImpact = facilityVisitorImpact(capped);
assert(facilityImpact.retention <= FACILITY_RETENTION_CAP, "设施游客留存不得超过通用 +12 个百分点封顶");
assert(facilityAnimalImpact(capped).animalRetention <= FACILITY_RETENTION_CAP, "设施动物留存不得超过通用 +12 个百分点封顶");

// 三条路线每座建筑的一级数据都必须具备稳定的主轴与透明的维护信息。
const byRoute = {};
Object.entries(routes).forEach(([route, plans]) => {
  const policy = DEVELOPMENT_ROUTE_POLICIES[route];
  byRoute[route] = [];
  Object.entries(plans).forEach(([nodeId, choiceId]) => {
    const reserve = reserveForPlan();
    const built = buildReserveDevelopmentPlan(reserve, nodeId, choiceId, 1);
    assert.equal(built.ok, true, `${route}/${nodeId} 应能完成基础建设`);
    reserve.development.nodes[nodeId].buildingLevel = 1;
    const view = developmentBuildingView(reserve, nodeId, 1);
    assert.equal(view.routeLabel, policy.label, `${route}/${nodeId} 应显示路线名称`);
    assert.equal(view.primaryAxis, policy.primaryAxis, `${route}/${nodeId} 应显示单座建筑主轴`);
    assert(view.totalMaintenance > 0, `${route}/${nodeId} 必须显示建筑总维护费用`);
    assert.equal(view.totalMaintenance, view.routeUpkeep + view.maintenance, `${route}/${nodeId} 维护费用必须可闭合`);
    assert(view.paybackLabel, `${route}/${nodeId} 必须给出回本或生态代价说明`);
    if (route !== "animal") {
      assert(view.paybackDays && view.paybackDays <= policy.paybackTargetDays, `${route}/${nodeId} 回本周期超过${policy.paybackTargetDays}日目标`);
    } else {
      assert(view.paybackLabel.includes("生态主轴"), `${route}/${nodeId} 应明确这是生态主轴，而不是假装现金回本`);
    }
    byRoute[route].push(view);
  });
});
assert(byRoute.visitor.reduce((sum, item) => sum + item.visitorCapacity, 0) > byRoute.economy.reduce((sum, item) => sum + item.visitorCapacity, 0), "游客路线应保留最高接待能力");
assert(byRoute.economy.reduce((sum, item) => sum + item.visitorCapacity, 0) > byRoute.animal.reduce((sum, item) => sum + item.visitorCapacity, 0), "经营路线应处于游客和动物路线之间");

// 四座游客建筑全部拉到最高等级时，组合收益必须触发上限且可观察。
const stacked = reserveForPlan();
stacked.fund = 999999;
stacked.progression = { stage: 18, displayChapter: 18, level: 18 };
stacked.ecology = { water: 100, grass: 100, disease: 0, predators: { wolf: 20 }, herbivores: { deer: 200 }, birds: { crow: 50 } };
stacked.safety = 100;
stacked.poacherPressure = 0;
Object.entries(routes.visitor).forEach(([nodeId, choiceId]) => {
  assert.equal(buildReserveDevelopmentPlan(stacked, nodeId, choiceId, 1).ok, true, `${nodeId} 游客建筑应可建设`);
  stacked.development.nodes[nodeId].buildingLevel = 9;
});
const snapshot = reserveOperationsSnapshot(stacked, 18);
assert(snapshot.buildingIncomeRaw > snapshot.buildingIncomeCap, "满级建筑组合应触发收益上限测试条件");
assert(snapshot.buildingIncome <= snapshot.buildingIncomeCap, "建筑组合收益不得突破日上限");
assert(snapshot.buildingIncomeCap <= BUILDING_COMBINED_INCOME_CAP.max, "建筑组合收益上限不得突破全局硬上限");
assert(snapshot.buildingIncomeOverflow > 0, "超过组合上限的部分必须被记录，便于结果页解释");

console.log("building strategy phase three check ok (retention cap, 3 route balance, payback transparency, stacked income cap)");
