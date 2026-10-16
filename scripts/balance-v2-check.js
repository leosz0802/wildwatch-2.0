const { createCharacter } = require("../js/storage");
const { BALANCE_V2, supplyPrice, fundHealth } = require("../js/balanceConfig");
const { reserveProgressionFor } = require("../js/simulator");
const { chapterTargets, beginChapterAnimalCheckpoint, chapterAnimalTotal } = require("../js/chapterTargets");
const { recordIncrease } = require("../js/animalSourceLedger");
const { populationYieldMultiplier } = require("../js/ecologyEconomy");
const { FACILITIES } = require("../js/reserveFacilities");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const gates = Object.values(BALANCE_V2.progression);
const minutes = gates.map((gate) => gate.expectedMinutes);
assert(gates.length === 11, `V2 must expose eleven operating stages, got ${gates.length}`);
assert(minutes.join(",") === "5,20,30,35,40,45,50,55,60,60,120", `unexpected stage forecast: ${minutes.join("/")}`);
assert(minutes.reduce((sum, value) => sum + value, 0) === 520, "campaign forecast should total 520 effective minutes");
assert(Math.ceil(520 / 15) === 35 && Math.ceil(520 / 10) === 52, "10-15 minute daily play should forecast 35-52 days");
gates.forEach((gate, index) => {
  assert(gate.stage === index + 1, `stage ${index + 1} id mismatch`);
  const storyLevel = gate.stage === 11 ? 7 : Math.min(7, Math.ceil(gate.stage / 2));
  assert(gate.storyLevel === storyLevel, `stage ${gate.stage} story mapping mismatch`);
  assert(!Object.prototype.hasOwnProperty.call(gate, "activeMinutes"), `stage ${gate.stage} must not restore a hard online-time gate`);
  if (index) assert(gate.expectedMinutes >= gates[index - 1].expectedMinutes, `stage ${gate.stage} has a pacing cliff`);
});
assert([2, 4, 6, 8, 10].map((stage) => BALANCE_V2.progression[stage].strategicChoices).join(",") === "3,4,5,5,5", "story strategy totals drifted");
assert([2, 4, 6, 8, 10].map((stage) => BALANCE_V2.progression[stage].majorChoices).join(",") === "1,1,2,2,2", "story major-choice totals drifted");
assert(Object.values(BALANCE_V2.progression).reduce((sum, gate) => sum + gate.actions, 0) === 111, "eleven-chapter action total drifted");

const state = createCharacter(null, "保护区卫士");
const reserve = state.world.reserve;
// This balance fixture isolates numeric gates; rescue completion is exercised
// by the dedicated chapter-rescue suites.
reserve.chapterRescue = Object.assign({}, reserve.chapterRescue || {}, { enforceCompletion: false });
reserve.safety = 100;
reserve.stability = 100;
reserve.reputation = 100;
reserve.poacherPressure = 0;
reserve.ecology.water = 100;
reserve.ecology.grass = 100;
reserve.ecology.herbivores.deer = 1000;
reserve.development.operations.totalVisitors = 1000;
reserve.development.operations.visitorLedger = { totalVisitors: 1000 };
beginChapterAnimalCheckpoint(reserve, 1, 0);
recordIncrease(reserve, "tasked", Math.max(0, chapterTargets(1).animals - chapterAnimalTotal(reserve)));
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
reserve.strategy.totalMeaningfulActions = 3;
reserve.strategy.totalChoices = 1;
reserve.eventChain = { chapterLevel: 1, step: 2, length: 7, completed: false };
const advanced = reserveProgressionFor(reserve);
assert(advanced.stage === 2 && advanced.level === 1, "stage 1 should advance without an online-time requirement once real goals are met");

Object.keys(BALANCE_V2.supplyBasePrices).forEach((id) => {
  let previous = 0;
  for (let chapter = 1; chapter <= 11; chapter += 1) {
    const expected = 5 * Math.round((
      BALANCE_V2.supplyBasePrices[id]
      * BALANCE_V2.tuning.supplyPriceScale
      * Math.pow(1 + BALANCE_V2.tuning.supplyChapterGrowth, chapter - 1)
    ) / 5);
    const actual = supplyPrice(id, chapter);
    assert(actual === expected, `${id} chapter ${chapter} must follow the exact 5% chapter curve`);
    assert(actual > previous, `${id} displayed price must increase at chapter ${chapter}`);
    previous = actual;
  }
});
const chapterTenReserve = { progression: { level: 1, stage: 10, displayChapter: 10 } };
assert(supplyPrice("dogFood", chapterTenReserve) === supplyPrice("dogFood", 10), "supply pricing must use the actual chapter instead of the seven-level story rank");
const richReserve = { progression: { level: 5 }, guardianCycle: { day: 18 }, fund: 6400, supplies: { dogFood: 8 } };
assert(supplyPrice("dogFood", richReserve) > supplyPrice("dogFood", 5), "late stocked reserves should pay a controlled scarcity premium");
assert(populationYieldMultiplier(100, 1) === 0.75, "low carrying yield mismatch");
assert(populationYieldMultiplier(240, 1) === 1.15, "healthy carrying yield mismatch");
assert(populationYieldMultiplier(350, 1) === 0.60, "over-capacity yield decay mismatch");

const facilityTotals = Object.fromEntries(FACILITIES.map((facility) => [facility.id, facility.buildCosts.reduce((sum, cost) => sum + cost, 0) + facility.specializeCost]));
assert(JSON.stringify(facilityTotals) === JSON.stringify({ old_patrol_post: 660, hydrology_station: 990, evidence_room: 1430, migration_watch: 1940, governance_hall: 2620, guardian_memorial: 1540 }), "facility V2 cost curve mismatch");
for (let level = 1; level <= 7; level += 1) {
  const band = fundHealth(level);
  assert(band.danger < band.healthyMin && band.healthyMin < band.healthyMax && band.healthyMax < band.high, `Lv.${level} fund health bands overlap`);
}

console.log("balance V2 check ok (11 stages, 35-52 day forecast, no hard time gate, economy curves exact)");
