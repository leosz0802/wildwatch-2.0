const { createCharacter, normalizeReserve } = require("../js/storage");
const { createReserveState } = require("../js/world");
const { simulateDay } = require("../js/simulator");
const {
  normalizeEcologyEconomy,
  applyAnimalEcologyEconomy,
  collectEcologyDrop,
  ecologyCompetitionReward
} = require("../js/ecologyEconomy");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function withRandom(value, fn) {
  const previous = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = previous; }
}

const state = createCharacter(null, "保护区卫士");
state.world.reserve.guardianCycle.actionIndex = 2;
const result = withRandom(0.5, () => simulateDay("修复水源和栖息地", state));
const reserve = result.world.reserve;
const economy = normalizeEcologyEconomy(reserve.ecologyEconomy, reserve);

assert(result.visual.animalEconomy, "animal economy must be exposed in visual settlement data");
assert(result.visual.animalEconomy.fundSpent === 0, "animals must not silently consume protection fund");
assert(!reserve.lastHabitatBalance.deferred, "animal water/grass pressure must settle at night");
assert(reserve.lastHabitatBalance.water.consumption >= 0 && reserve.lastHabitatBalance.grass.consumption >= 0, "animal pressure must be recorded as water/grass consumption");
assert(economy.competition.contribution > 0, "valid action must add regional contribution");
assert(economy.competition.rank >= 1 && economy.competition.rank <= 12, "competition rank must stay in bracket");
assert(economy.mapDrops.length <= 3, "map drops must stay visually bounded");
assert(!Object.prototype.hasOwnProperty.call(reserve.economyLedger.sinks, "animalUpkeep"), "economy ledger must not expose the retired hidden animal-upkeep charge");

const direct = createCharacter(null, "保护区卫士");
direct.world.reserve.fund = 0;
direct.world.reserve.ecology.water = 30;
direct.world.reserve.ecology.grass = 28;
direct.world.reserve.ecology.disease = 45;
direct.world.reserve.supplies.fieldKit = 1;
const ledger = applyAnimalEcologyEconomy(direct.world.reserve, direct.world.knownCharacters, {
  action: "habitat",
  day: 9,
  season: "旱季"
});
assert(ledger.careDebt > 0, "low water/grass must become explicit carrying pressure");
assert(direct.world.reserve.fund === 0, "animal pressure must not create a hidden fund charge");
assert(ledger.medicalSpent === 0 && direct.world.reserve.supplies.fieldKit === 1, "animal pressure must not silently consume a medical kit");

direct.world.reserve.ecologyEconomy.productionMeter = 3;
const harvestLedger = applyAnimalEcologyEconomy(direct.world.reserve, direct.world.knownCharacters, {
  action: "habitat",
  day: 10,
  season: "雨季"
});
assert(harvestLedger.produced.length > 0, "animal activity must create a visible map drop");
const drop = direct.world.reserve.ecologyEconomy.mapDrops[0];
const collected = collectEcologyDrop(direct.world.reserve, drop.id);
assert(collected && collected.total >= 1, "map drop must be collectible into its canonical fragment counter");
assert(direct.world.reserve.ecologyEconomy.mapDrops.every((item) => item.id !== drop.id), "collected drop must disappear from map");

assert(ecologyCompetitionReward(1) > ecologyCompetitionReward(12), "better regional rank must award more scarce fragments");

const seasonState = createCharacter(null, "保护区卫士");
seasonState.world.reserve.ecologyEconomy.competition.contribution = 500;
const seasonLedger = applyAnimalEcologyEconomy(seasonState.world.reserve, seasonState.world.knownCharacters, {
  action: "antiPoacher",
  day: 12,
  season: "雨季"
});
assert(seasonLedger.competitionReward > 0, "regional season must actually settle scarce resource");
assert(seasonState.world.reserve.ecologyEconomy.fragments.coGuardShard === seasonLedger.competitionReward, "season reward must enter canonical scarce-fragment balance");
assert(seasonState.world.reserve.ecologyEconomy.competition.poolRemaining < 30, "finite regional pool must shrink after settlement");

const stress = createCharacter(null, "保护区卫士");
for (let day = 1; day <= 120; day += 1) {
  stress.world.reserve.fund += 35;
  const stressLedger = applyAnimalEcologyEconomy(stress.world.reserve, stress.world.knownCharacters, {
    action: day % 3 === 0 ? "antiPoacher" : day % 2 === 0 ? "habitat" : "houndScout",
    day,
    season: day % 24 < 12 ? "雨季" : "旱季"
  });
  assert(Number.isFinite(stress.world.reserve.fund) && stress.world.reserve.fund >= 0, `invalid fund on stress day ${day}`);
  assert(stress.world.reserve.ecologyEconomy.mapDrops.length <= 3, `map drop overflow on stress day ${day}`);
  assert(Number.isFinite(stressLedger.careDebt) && stressLedger.careDebt >= 0, `invalid carrying pressure on stress day ${day}`);
  const first = stress.world.reserve.ecologyEconomy.mapDrops[0];
  if (first && day % 2 === 0) collectEcologyDrop(stress.world.reserve, first.id);
}
assert(stress.world.reserve.ecologyEconomy.totalCollected > 0, "120-day loop should sustain collectible animal output");
assert(stress.world.reserve.ecologyEconomy.competition.lastReward, "120-day loop should complete regional seasons");

const migrated = normalizeReserve(reserve, createReserveState());
assert(migrated.ecologyEconomy.version === 1, "save migration must preserve ecology economy state");
assert(migrated.ecologyEconomy.mapDrops.length <= 3, "save normalization must bound map drops");

console.log("ecology economy check ok");
