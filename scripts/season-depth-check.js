const assert = require("assert");
const { createCharacter } = require("../js/storage");
const { simulateDay } = require("../js/simulator");
const { seasonProfile, buildSeasonDynamics, seasonLifeModifiers } = require("../js/seasonSystem");
const { ITEMS, itemEligible, normalizeCollectionState } = require("../js/collectionSystem");

const rain = seasonProfile("雨季");
const dry = seasonProfile("旱季");
assert(rain.activityRange > 1 && rain.activityRange > dry.activityRange, "rain should visibly expand animal activity range");
assert.strictEqual(rain.waterPointCount, 4, "rain should open four water areas");
assert.strictEqual(dry.waterPointCount, 2, "drought should concentrate animals at two water points");
assert(rain.diseasePressure > dry.diseasePressure, "rain should increase disease pressure");
assert(seasonLifeModifiers("雨季").birthCadence < seasonLifeModifiers("旱季").birthCadence, "rain should create more newborn opportunities");
assert(dry.predatorConcentration > rain.predatorConcentration && dry.poacherConcentration > rain.poacherConcentration, "drought should concentrate predation and poaching");
assert(dry.elephantMigrationWeight > rain.elephantMigrationWeight, "drought should strengthen elephant migration");
assert.notStrictEqual(buildSeasonDynamics({ name: "雨季", day: 1 }).riverVariant, buildSeasonDynamics({ name: "雨季", day: 2 }).riverVariant, "rain channel must change deterministically by season day");

function prepared(guardianDay) {
  const state = createCharacter(null, "季节测试员");
  state.world.reserve.guardianCycle.day = guardianDay;
  state.world.reserve.guardianCycle.actionIndex = 2;
  state.world.reserve.guardianCycle.completedDays = guardianDay - 1;
  state.world.reserve.progression.totalActions = (guardianDay - 1) * 3 + 2;
  state.world.reserve.progression.chapterActions = 5;
  state.world.reserve.emergency.cooldown = 99;
  return state;
}

const oldRandom = Math.random;
Math.random = () => 0.8;
const rainResult = simulateDay("采购狗粮补给", prepared(1));
const dryResult = simulateDay("采购狗粮补给", prepared(13));
Math.random = oldRandom;
assert.strictEqual(rainResult.world.season, "雨季");
assert.strictEqual(dryResult.world.season, "旱季");
assert(rainResult.world.reserve.lastSeasonEffect.water > 0 && rainResult.world.reserve.lastSeasonEffect.disease > 0, "rain settlement must change water and disease");
assert(dryResult.world.reserve.lastSeasonEffect.water < 0 && dryResult.world.reserve.lastSeasonEffect.poacher > 0 && dryResult.world.reserve.lastSeasonEffect.predation > 0, "drought settlement must reduce water and concentrate risks");
assert.strictEqual(dryResult.world.reserve.seasonDynamics.activeWaterPoints.length, 2, "saved drought state must expose two water points");

const state = createCharacter(null, "藏品季节测试员");
normalizeCollectionState(state);
const rainIds = ["c2_seed", "c2_mudline", "c2_pump"];
const dryIds = ["c2_gauge", "c2_key", "c2_salt"];
const byId = (id) => ITEMS.find((item) => item.id === id);
state.world.season = "雨季";
state.world.reserve.seasonState.name = "雨季";
rainIds.forEach((id) => assert(itemEligible(byId(id), state), `${id} should be a rain hydrology collectible`));
dryIds.forEach((id) => assert(!itemEligible(byId(id), state), `${id} must wait for drought`));
state.world.season = "旱季";
state.world.reserve.seasonState.name = "旱季";
dryIds.forEach((id) => assert(itemEligible(byId(id), state), `${id} should appear in drought`));
rainIds.forEach((id) => assert(!itemEligible(byId(id), state), `${id} must remain rain-specific`));
assert(dryIds.map((id) => byId(id).name).join("|").includes("盐地") && dryIds.map((id) => byId(id).name).join("|").includes("旧井") && dryIds.map((id) => byId(id).name).join("|").includes("干河床"), "drought collection names must be concrete");

console.log("season depth check ok");
