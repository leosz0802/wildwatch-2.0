const assert = require("assert");
const { createReserveState } = require("../js/world");
const { normalizeReserveDevelopment, reserveOperationsSnapshot } = require("../js/reserveDevelopment");
const { facilityVisitorImpact, facilityAnimalImpact, applyFacilityDailyEffects } = require("../js/reserveFacilities");
const { livingAnimalTotal } = require("../js/chapterRescueSystem");
const { chapterVisitorTotal } = require("../js/chapterTargets");

function reserveWithFacilities(enabled) {
  const reserve = createReserveState();
  normalizeReserveDevelopment(reserve);
  reserve.development.nodes.river_shallows.phase = "operational";
  reserve.development.nodes.river_shallows.planId = "visitor_boardwalk";
  reserve.development.nodes.river_shallows.buildingLevel = 2;
  reserve.ecology = { water: 80, grass: 60, disease: 10 };
  reserve.safety = 70;
  reserve.poacherPressure = 20;
  if (enabled) {
    reserve.facilityConstruction = { version: 1, sites: {
      old_patrol_post: { buildStage: 3, buildSteps: 2, specialization: "enforcement" },
      hydrology_station: { buildStage: 3, buildSteps: 2, specialization: "ecology" },
      evidence_room: { buildStage: 3, buildSteps: 2, specialization: "research" },
      migration_watch: { buildStage: 3, buildSteps: 2, specialization: "ecology" },
      governance_hall: { buildStage: 3, buildSteps: 2, specialization: "community" }
    } };
  }
  return reserve;
}

const withoutFacilities = reserveWithFacilities(false);
const withFacilities = reserveWithFacilities(true);
const impact = facilityVisitorImpact(withFacilities);
assert.strictEqual(impact.activeFacilities, 5, "五类设施都应进入运营聚合");
assert(impact.incomeRate > 0 && impact.retention > 0 && impact.activity > 0, "设施应直接影响游客收入、留存和活跃度");
assert(impact.water > 0 && impact.grass > 0 && impact.poacherPressure < 0, "设施应直接影响水源、草场和巡护压力");

const before = { water: withFacilities.ecology.water, grass: withFacilities.ecology.grass, disease: withFacilities.ecology.disease, safety: withFacilities.safety };
const animalsBeforeFacility = livingAnimalTotal(withFacilities);
const visitorsBeforeFacility = chapterVisitorTotal(withFacilities);
const first = applyFacilityDailyEffects(withFacilities, 1);
const second = applyFacilityDailyEffects(withFacilities, 1);
assert(first.changes.length > 0, "首个日结算应落地设施生态变化");
assert.strictEqual(second.changes.length, 0, "同一天重复结算不得重复叠加设施变化");
assert(withFacilities.ecology.water > before.water && withFacilities.ecology.grass > before.grass, "水文站和观测站应提升水源、草场");
assert.strictEqual(livingAnimalTotal(withFacilities), animalsBeforeFacility, "设施日结算不得改写动物总数");
assert.strictEqual(chapterVisitorTotal(withFacilities), visitorsBeforeFacility, "设施日结算不得改写本章游客");

const baseSnapshot = reserveOperationsSnapshot(withoutFacilities, 1);
const facilitySnapshot = reserveOperationsSnapshot(withFacilities, 1);
assert(facilitySnapshot.visitors > baseSnapshot.visitors, "设施容量应增加游客到访");
assert(facilitySnapshot.income > baseSnapshot.income, "设施收入率与游客留存应进入游客结算");
assert(facilitySnapshot.tourism.activity >= baseSnapshot.tourism.activity, "设施应提升游客活跃度");
assert(facilitySnapshot.tourism.retention >= baseSnapshot.tourism.retention, "设施应提升游客留存");

const animalImpact = facilityAnimalImpact(withFacilities);
assert(animalImpact.animalRetention > 0 && animalImpact.animalRetention <= 0.12, "动物留存判定应独立封顶 +12 个百分点");
assert(animalImpact.breedingCondition > 0 && animalImpact.breedingCondition <= 0.12, "繁殖条件判定应独立封顶 +12 个百分点");
assert(animalImpact.immigrationBias > 0 && animalImpact.immigrationBias <= 0.12, "迁入判定应独立封顶 +12 个百分点");

console.log("facility operating impact check ok");
