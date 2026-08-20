const { createInitialWorld } = require("../js/world");
const { simulateDay } = require("../js/simulator");
const { buildReserveView } = require("../js/reserveView");
const { Game } = require("../js/game");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeState() {
  return {
    world: createInitialWorld(),
    character: { role: "warden", location: "中央混交林", stamina: 82, health: 92 },
    reports: [],
    messages: []
  };
}

function run(state, command) {
  const result = simulateDay(command, state);
  return {
    result,
    state: {
      world: result.world,
      character: result.character,
      reports: (state.reports || []).concat(result.reports || []).slice(-12),
      messages: []
    }
  };
}

const oldRandom = Math.random;
Math.random = () => 0.20;
try {
  let rainy = makeState();
  rainy.world.reserve.seasonDay = 1;
  rainy.world.reserve.seasonState = { name: "雨季", day: 1, cycleDay: 1, changed: false };
  const rainyWater = rainy.world.reserve.ecology.water;
  // A guardian day now contains morning/noon/dusk. Seasonal ecology and
  // carrying-capacity pressure settle together at night, not per action.
  rainy = run(rainy, "采购狗粮包").state;
  rainy = run(rainy, "采购狗粮包").state;
  rainy = run(rainy, "采购狗粮包").state;
  assert(rainy.world.season === "雨季", "early cycle should be rainy season");
  assert(rainy.world.reserve.lastSeasonEffect && rainy.world.reserve.lastSeasonEffect.water > 0, "rainy season should contribute positive water replenishment");
  assert(rainy.world.reserve.lastHabitatBalance && rainy.world.reserve.lastHabitatBalance.deferred === false, "night settlement should record habitat pressure");
  assert(rainy.world.reserve.ecology.water === rainyWater
    + rainy.world.reserve.lastSeasonEffect.water
    + rainy.world.reserve.lastHabitatBalance.water.delta,
  "final water should equal seasonal replenishment plus the explicit night habitat balance");

  let dry = makeState();
  dry.world.reserve.guardianCycle = Object.assign({}, dry.world.reserve.guardianCycle || {}, {
    day: 13,
    actionIndex: 0,
    completedDays: 12,
    actionsToday: []
  });
  dry.world.reserve.seasonDay = 12;
  dry.world.reserve.seasonState = { name: "雨季", day: 12, cycleDay: 12, changed: false };
  const dryBefore = JSON.parse(JSON.stringify(dry.world.reserve));
  const dryWater = dry.world.reserve.ecology.water;
  const dryResult = run(dry, "采购狗粮包");
  dry = dryResult.state;
  dry = run(dry, "采购狗粮包").state;
  dry = run(dry, "采购狗粮包").state;
  assert(dry.world.season === "旱季", "guardian day 13 should enter dry season");
  assert(dry.world.reserve.ecology.water < dryWater, "dry season should consume water");
  const game = Object.create(Game.prototype);
  const seasonPopup = game.detectReserveBreakthrough(dryBefore, dry.world.reserve);
  assert(seasonPopup && seasonPopup.kind === "season_change", "season change should trigger a popup");

  let poacher = makeState();
  poacher.world.reserve.poacherPressure = 100;
  poacher.world.reserve.progression.totalActions = 6;
  poacher.world.reserve.progression.daysManaged = 6;
  poacher.world.reserve.progression.chapterActions = 3;
  const poacherBefore = JSON.parse(JSON.stringify(poacher.world.reserve));
  let step = run(poacher, "修复水源和草场");
  poacher = step.state;
  assert(poacher.world.reserve.emergency.active && poacher.world.reserve.emergency.active.type === "poacher_ring", "high pressure should trigger a poacher ring");
  const poacherPopup = game.detectReserveBreakthrough(poacherBefore, poacher.world.reserve);
  assert(poacherPopup && poacherPopup.kind === "emergency_started", "new poacher event should trigger a popup");
  assert(poacher.world.reserve.emergency.lastOutcome.kind === "started", "poacher event should announce its start");
  step = run(poacher, "驱赶偷猎者"); poacher = step.state;
  assert(poacher.world.reserve.emergency.active, "one response should not instantly clear a major event");
  step = run(poacher, "驱赶偷猎者"); poacher = step.state;
  assert(!poacher.world.reserve.emergency.active, "two strong responses should resolve the poacher event");
  assert(poacher.world.reserve.emergency.lastOutcome.kind === "resolved", "poacher resolution should be announced");

  let disease = makeState();
  disease.world.reserve.poacherPressure = 5;
  disease.world.reserve.ecology.disease = 50;
  disease.world.reserve.progression.totalActions = 6;
  disease.world.reserve.progression.daysManaged = 6;
  disease.world.reserve.progression.chapterActions = 3;
  step = run(disease, "派猎犬侦察"); disease = step.state;
  assert(disease.world.reserve.emergency.active && disease.world.reserve.emergency.active.type === "disease_outbreak", "high disease should trigger an outbreak");
  const activeView = buildReserveView(disease.world.reserve, disease.world.reserve, { action: "houndScout", season: disease.world.season, weather: disease.world.weather });
  assert(activeView.broadcasts.some((row) => /疾病集中爆发/.test(`${row.title} ${row.body}`)), "active emergency should be visible in reserve broadcasts");
  step = run(disease, "生态干预"); disease = step.state;
  step = run(disease, "生态干预"); disease = step.state;
  assert(!disease.world.reserve.emergency.active, "two interventions should control disease outbreak");
  assert(disease.world.reserve.emergency.lastOutcome.kind === "resolved", "disease resolution should be announced");
} finally {
  Math.random = oldRandom;
}

console.log("season emergency check ok");
