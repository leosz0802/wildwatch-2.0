const { createCharacter } = require("../js/storage");
const { BALANCE_V2, supplyPrice, fundHealth } = require("../js/balanceConfig");
const { reserveProgressionFor } = require("../js/simulator");
const { populationYieldMultiplier } = require("../js/ecologyEconomy");
const { FACILITIES } = require("../js/reserveFacilities");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const gates = Object.values(BALANCE_V2.progression);
const minutes = gates.map((gate) => gate.expectedMinutes);
assert(gates.length === 10, `V2 must expose ten operating stages, got ${gates.length}`);
assert(minutes.join(",") === "10,20,30,35,40,45,50,55,60,60", `unexpected stage forecast: ${minutes.join("/")}`);
assert(minutes.reduce((sum, value) => sum + value, 0) === 405, "campaign forecast should total 405 effective minutes");
assert(Math.ceil(405 / 15) === 27 && Math.ceil(405 / 10) === 41, "10-15 minute daily play should forecast 27-41 days");
gates.forEach((gate, index) => {
  assert(gate.stage === index + 1, `stage ${index + 1} id mismatch`);
  assert(gate.storyLevel === Math.ceil(gate.stage / 2), `stage ${gate.stage} story mapping mismatch`);
  assert(!Object.prototype.hasOwnProperty.call(gate, "activeMinutes"), `stage ${gate.stage} must not restore a hard online-time gate`);
  if (index) assert(gate.expectedMinutes >= gates[index - 1].expectedMinutes, `stage ${gate.stage} has a pacing cliff`);
});
assert([2, 4, 6, 8, 10].map((stage) => BALANCE_V2.progression[stage].strategicChoices).join(",") === "3,4,5,5,4", "story strategy totals drifted");
assert([2, 4, 6, 8, 10].map((stage) => BALANCE_V2.progression[stage].majorChoices).join(",") === "1,1,2,2,1", "story major-choice totals drifted");
assert(Object.values(BALANCE_V2.progression).reduce((sum, gate) => sum + gate.actions, 0) === 90, "campaign actions should leave room for story pacing inside 27-41 guardian days");

const state = createCharacter(null, "保护区卫士");
const reserve = state.world.reserve;
reserve.safety = 100;
reserve.stability = 100;
reserve.reputation = 100;
reserve.poacherPressure = 0;
reserve.ecology.water = 100;
reserve.ecology.grass = 100;
reserve.guardianRun.score = 100;
reserve.progression = Object.assign({}, reserve.progression, {
  level: 1,
  stage: 1,
  activeSeconds: 0,
  totalActions: 4,
  totalMeaningfulActions: 4,
  totalStrategicChoices: 1,
  totalMajorStrategicChoices: 0,
  totalFundEarned: 1000,
  totalMigratedIn: 4,
  totalRareRecovered: 1,
  stageStart: { stage: 1, level: 1, totalActions: 0, totalMeaningfulActions: 0, totalStrategicChoices: 0, totalMajorStrategicChoices: 0, activeSeconds: 0, totalFundEarned: 0, totalMigratedIn: 0, totalRareRecovered: 0 }
});
reserve.strategy.totalMeaningfulActions = 4;
reserve.strategy.totalChoices = 1;
reserve.eventChain = { chapterLevel: 1, step: 2, length: 7, completed: false };
const advanced = reserveProgressionFor(reserve);
assert(advanced.stage === 2 && advanced.level === 1, "stage 1 should advance without an online-time requirement once real goals are met");

assert(supplyPrice("dogFood", 1) === 50 && supplyPrice("dogFood", 5) === 60, "dog-food chapter price curve mismatch");
assert(supplyPrice("alarm", 5) === 80 && supplyPrice("tranquilizer", 5) === 90 && supplyPrice("fieldKit", 5) === 55, "late supply prices must round to five");
assert(populationYieldMultiplier(100, 1) === 0.75, "low carrying yield mismatch");
assert(populationYieldMultiplier(240, 1) === 1.15, "healthy carrying yield mismatch");
assert(populationYieldMultiplier(350, 1) === 0.60, "over-capacity yield decay mismatch");

const facilityTotals = Object.fromEntries(FACILITIES.map((facility) => [facility.id, facility.buildCosts.reduce((sum, cost) => sum + cost, 0) + facility.specializeCost]));
assert(JSON.stringify(facilityTotals) === JSON.stringify({ old_patrol_post: 450, hydrology_station: 650, intel_room: 900, migration_watch: 1200, governance_hall: 1570, guardian_memorial: 980 }), "facility V2 cost curve mismatch");
for (let level = 1; level <= 5; level += 1) {
  const band = fundHealth(level);
  assert(band.danger < band.healthyMin && band.healthyMin < band.healthyMax && band.healthyMax < band.high, `Lv.${level} fund health bands overlap`);
}

console.log("balance V2 check ok (10 stages, 27-41 day forecast, no hard time gate, economy curves exact)");
