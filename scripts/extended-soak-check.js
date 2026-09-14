const { performance } = require("perf_hooks");
const { createCharacter } = require("../js/storage");
const { simulateDay, reserveProgressionFor } = require("../js/simulator");
const { strategicDilemmaById, applyStrategicChoice } = require("../js/strategySystem");
const { promiseByChapter, applyGuardianPromiseChoice } = require("../js/guardianPromises");
const { normalizeCollectionState, updateCollectionAfterAction, offerAnimalCollectionLead, startInvestigation, resolveInvestigation } = require("../js/collectionSystem");
const { SPECIES_DB, getUnlockedSpecies, reconcileSpeciesPopulations, speciesPopulation } = require("../js/animalWorld");
const { syncKnownCharactersForReserve } = require("../js/world");
const { actionExecutable, resolveGoals } = require("../js/goalSystem");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function finite(value, label) {
  assert(Number.isFinite(value), `${label} is not finite: ${value}`);
}

function nonNegativeObject(object, label) {
  Object.keys(object || {}).forEach((key) => {
    if (key === "rescueItems") return;
    finite(object[key], `${label}.${key}`);
    assert(object[key] >= 0, `${label}.${key} is negative: ${object[key]}`);
  });
}

const routeActions = {
  enforcement: ["antiPoacher", "houndScout", "habitat"],
  ecology: ["habitat", "intervention", "houndScout"],
  research: ["houndScout", "salvage", "habitat"],
  community: ["buySupplies", "habitat", "antiPoacher"]
};
const commands = {
  houndScout: "派猎犬侦察：确认边界脚印",
  antiPoacher: "驱赶偷猎者：封锁可疑路线",
  habitat: "修复水源和草场：恢复动物通道",
  intervention: "执行许可内生态干预：转移拥挤个体",
  salvage: "出售仓库里的回收物",
  buySupplies: "采购狗粮包"
};

function affordableAction(reserve, candidate, day) {
  const supplies = reserve.supplies || {};
  if ((reserve.actionPoints || 0) < 1 && !["buySupplies", "salvage"].includes(candidate)) {
    return (reserve.fund || 0) >= 50 ? "buySupplies" : "salvage";
  }
  if ((reserve.fund || 0) <= 45 && !Object.values(reserve.inventory || {}).some((value) => value > 0)) return "salvage";
  if (candidate === "houndScout" && (supplies.dogFood || 0) < 1) return (reserve.fund || 0) >= 50 ? "buySupplies" : "salvage";
  if (candidate === "antiPoacher" && (supplies.alarm || 0) < 1) return (supplies.dogFood || 0) > 0 ? "houndScout" : ((reserve.fund || 0) >= 50 ? "buySupplies" : "salvage");
  if (candidate === "intervention" && ((supplies.tranquilizer || 0) < 1 || (reserve.intel || 0) < 1)) return (supplies.dogFood || 0) > 0 ? "houndScout" : ((reserve.fund || 0) >= 50 ? "buySupplies" : "salvage");
  if (candidate === "buySupplies" && (reserve.fund || 0) < 50) return "salvage";
  if (day % 19 === 0 && (reserve.fund || 0) >= 50) return "buySupplies";
  return candidate;
}

function resolvePendingSystems(state, route, day, rng) {
  const reserve = state.world.reserve;
  const pendingStrategy = (reserve.strategy || {}).pendingDilemma;
  if (pendingStrategy) {
    const dilemma = strategicDilemmaById(pendingStrategy.id);
    const choice = dilemma && (dilemma.choices.find((item) => item.route === route) || dilemma.choices[day % dilemma.choices.length]);
    assert(choice, `day ${day} pending strategy has no reachable choice`);
    const dice = choice.dice ? { roll: 1 + Math.floor(rng() * 6), routeModifier: 0, resourceModifier: 0 } : null;
    assert(applyStrategicChoice(reserve, dilemma.id, choice.id, dice), `day ${day} pending strategy could not be resolved`);
    reserve.progression = reserveProgressionFor(reserve);
  }
  const pendingPromise = (reserve.guardianPromises || {}).pending;
  if (pendingPromise) {
    const promise = promiseByChapter(pendingPromise.chapter);
    const choice = promise && (promise.choices.find((item) => item.route === route) || promise.choices[0]);
    assert(choice && applyGuardianPromiseChoice(reserve, pendingPromise.chapter, choice.id, { day, totalActions: reserve.progression.totalActions }), `day ${day} guardian promise could not be resolved`);
  }
  normalizeCollectionState(state);
  const collection = state.world.collection;
  if (collection.investigation.pending) {
    assert(resolveInvestigation(state, 1 + Math.floor(rng() * 6), rng).ok, `day ${day} pending investigation could not resume`);
  } else if (collection.leads.length && collection.investigation.charges > 0 && day % 3 === 0) {
    const method = (reserve.intel || 0) > 0 && day % 2 === 0 ? "field" : "animal";
    const started = startInvestigation(state, collection.leads[0].id, method);
    assert(started.ok, `day ${day} investigation could not start: ${started.error || "unknown"}`);
    assert(resolveInvestigation(state, 1 + Math.floor(rng() * 6), rng).ok, `day ${day} investigation could not finish`);
  }
  // 专项测试直接调用底层收藏接口，手动执行与游戏控制器相同的派生目标重算。
  state.world.goals = resolveGoals(state, state.world.goals, "soak_external");
}

function validateState(state, seedIndex, day, previousLevel) {
  const reserve = state.world.reserve;
  const prefix = `seed${seedIndex}.day${day}`;
  ["fund", "safety", "stability", "business", "reputation", "enforcement", "ecologyScore", "poacherPressure", ].forEach((key) => finite(reserve[key], `${prefix}.${key}`));
  [reserve.supplies, reserve.inventory, reserve.pendingRecovered, (reserve.ecology || {}).predators, (reserve.ecology || {}).herbivores, (reserve.ecology || {}).birds].forEach((object, index) => nonNegativeObject(object, `${prefix}.resources${index}`));
  const level = reserve.progression.level;
  assert(level >= previousLevel, `${prefix} level regressed`);
  assert(level <= previousLevel + 1, `${prefix} level skipped`);
  const unlocked = getUnlockedSpecies(level);
  const unlockedIds = new Set(unlocked.map((item) => item.id));
  Object.keys(SPECIES_DB).forEach((id) => {
    const count = speciesPopulation(reserve, id);
    finite(count, `${prefix}.species.${id}`);
    assert(count >= 0, `${prefix}.${id} has negative population`);
    if (!unlockedIds.has(id)) assert(count === 0, `${prefix} locked species ${id} appeared early`);
  });
  assert(state.world.knownCharacters.length === unlocked.length, `${prefix} sandbox species count diverged from chapter unlocks`);
  const collection = state.world.collection;
  assert(collection.leads.length <= 3, `${prefix} collection lead cap exceeded`);
  assert(collection.investigation.charges >= 0 && collection.investigation.charges <= 3, `${prefix} investigation chance out of range`);
  assert(new Set(Object.keys(collection.items)).size === Object.keys(collection.items).length, `${prefix} duplicate collection item ids`);
  assert((reserve.strategy.choiceHistory || []).length <= 80 && (reserve.strategy.consequences || []).length <= 16, `${prefix} strategy history cap exceeded`);
  assert(((reserve.guardianPromises || {}).history || []).length <= 8, `${prefix} guardian history cap exceeded`);
  assert(((reserve.emergency || {}).history || []).length <= 8, `${prefix} emergency history cap exceeded`);
  const goals = state.world.goals || {};
  const visibleGoals = [((goals.active || {}).primary)].concat(((goals.active || {}).alternatives) || []).filter(Boolean);
  assert(goals.version === 3 && goals.daily && goals.daily.target >= 1, `${prefix} V3 daily goal is missing or impossible`);
  assert((goals.daily.objectives || []).length === 4, `${prefix} daily objective set must stay at four`);
  assert(visibleGoals.length >= 1 && visibleGoals.length <= 3, `${prefix} must expose one to three visible goals`);
  visibleGoals.forEach((goal) => assert(goal.executable && actionExecutable(state, goal.recommendedAction), `${prefix} recommended goal ${goal.id} is not executable`));
  assert(new Set(visibleGoals.map((goal) => goal.id)).size === visibleGoals.length, `${prefix} visible goals contain duplicates`);
  assert(["雨季", "旱季"].includes((reserve.seasonState || {}).name), `${prefix} invalid season`);
  return level;
}

const routeIds = Object.keys(routeActions);
const seeds = Array.from({ length: 40 }, (_, index) => 7001 + index * 7919);
let maxStepMs = 0;
const oldRandom = Math.random;
try {
  seeds.forEach((seed, seedIndex) => {
    const rng = seededRandom(seed);
    Math.random = rng;
    const route = routeIds[seedIndex % routeIds.length];
    const startLevel = 1 + (seedIndex % 5);
    let state = createCharacter(null, "保护区卫士");
    const reserve = state.world.reserve;
    reserve.progression.level = startLevel;
    reserve.progression.chapterStart = Object.assign({}, reserve.progression.chapterStart, { level: startLevel });
    reserve.fund = seedIndex % 8 === 0 ? 0 : 1200;
    reserve.intel = seedIndex % 8 === 1 ? 0 : 4;
    reserve.supplies.dogFood = seedIndex % 8 === 2 ? 0 : 10;
    reserve.supplies.alarm = seedIndex % 8 === 2 ? 0 : 6;
    reserve.supplies.tranquilizer = seedIndex % 8 === 2 ? 0 : 6;
    reserve.supplies.fieldKit = seedIndex % 8 === 2 ? 0 : 3;
    if (seedIndex % 8 === 3) {
      Object.keys(reserve.inventory).forEach((key) => { reserve.inventory[key] = 0; });
      Object.keys(reserve.pendingRecovered).forEach((key) => { reserve.pendingRecovered[key] = 0; });
    }
    reconcileSpeciesPopulations(reserve, { removeLocked: true, initializeUnlocked: true });
    state.world.knownCharacters = syncKnownCharactersForReserve([], reserve);
    normalizeCollectionState(state);
    let previousLevel = startLevel;
    let previousMission = `${state.world.goals.daily.id}:${state.world.goals.daily.progress}`;
    let stalledMissionSteps = 0;
    for (let day = 1; day <= 200; day += 1) {
      const before = JSON.parse(JSON.stringify(state));
      const currentReserve = state.world.reserve;
      currentReserve.progression.activeSeconds = (currentReserve.progression.activeSeconds || 0) + 5 * 60;
      const dailyAction = ((state.world.goals || {}).daily || {}).recommendedAction;
      const policy = routeActions[route];
      const requested = day % 2 === 0 && commands[dailyAction] ? dailyAction : policy[(day + seedIndex) % policy.length];
      const actionId = affordableAction(state.world.reserve, requested, day);
      const startedAt = performance.now();
      const result = simulateDay(commands[actionId], state);
      maxStepMs = Math.max(maxStepMs, performance.now() - startedAt);
      state = { world: result.world, character: result.character, reports: (state.reports || []).concat(result.reports || []).slice(-12), messages: [] };
      updateCollectionAfterAction(before, state, { actionId, actionLabel: actionId }, rng);
      const clueAnimal = (state.world.knownCharacters || [])[(day + seedIndex) % Math.max(1, (state.world.knownCharacters || []).length)];
      if (clueAnimal) offerAnimalCollectionLead(state, clueAnimal, { season: state.world.season, weather: state.world.weather }, rng);
      resolvePendingSystems(state, route, day, rng);
      previousLevel = validateState(state, seedIndex, day, previousLevel);
      const mission = state.world.goals.daily;
      const missionSignature = `${mission.id}:${mission.progress}`;
      if (requested === dailyAction && missionSignature === previousMission) stalledMissionSteps += 1;
      else stalledMissionSteps = 0;
      assert(stalledMissionSteps < 20, `seed ${seedIndex} daily mission remained blocked for 20 guided actions`);
      previousMission = missionSignature;
    }
    assert(state.world.reserve.progression.totalActions >= 200, `seed ${seedIndex} lost operating-day progress`);
    assert(state.world.reserve.fund < 50000, `seed ${seedIndex} economy inflated beyond the tested operating range`);
  });
} finally {
  Math.random = oldRandom;
}

assert(maxStepMs < 250, `single simulation step exceeded safety timeout: ${maxStepMs.toFixed(1)}ms`);
console.log(`extended soak check ok (${seeds.length} seeds × 200 days, max step ${maxStepMs.toFixed(1)}ms)`);
