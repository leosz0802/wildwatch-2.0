const assert = require("assert");
const { createInitialWorld } = require("../js/world");
const {
  CASES, ENDINGS, collectionItemById, itemsForCase, normalizeCollectionState,
  beginStoryDiscovery, advanceStoryDiscovery, collectStoryDiscovery,
  startInvestigation, resolveInvestigation, submitCaseEnding, collectionSummary
} = require("../js/collectionSystem");

function rng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function state() {
  const world = createInitialWorld();
  world.reserve.progression.level = 5;
  world.reserve.enforcement = 90;
  world.reserve.reputation = 90;
  world.reserve.houndTeam.totalRuns = 30;
  world.reserve.strategy.totalChoices = 30;
  world.lifeMemory = { guardianLetters: [{ day: 3 }], memories: Array.from({ length: 16 }, (_, index) => ({ type: index === 0 ? "return" : "met", day: index + 1 })) };
  world.knownCharacters = (world.knownCharacters || []).map((animal) => Object.assign({}, animal, { relation: Object.assign({}, animal.relation || {}, { trust: 90 }) }));
  const result = { world, character: { role: "warden" }, ui: {} };
  normalizeCollectionState(result);
  return result;
}

function setDayAndSeason(state, day, item) {
  const condition = (item || {}).condition || {};
  state.world.day = day;
  state.world.reserve.guardianCycle = Object.assign({}, state.world.reserve.guardianCycle || {}, { day });
  const season = condition.season || (day % 2 ? "雨季" : "旱季");
  state.world.season = season;
  state.world.reserve.seasonState = { name: season, day: ((day - 1) % 12) + 1, cycleDay: ((day - 1) % 24) + 1 };
}

for (let seed = 1; seed <= 40; seed += 1) {
  const random = rng(seed * 7919);
  const current = state();
  const inventoryAtStart = JSON.stringify(current.world.reserve.inventory);
  const animals = current.world.knownCharacters || [];
  let day = 100;

  for (const caseDef of CASES.filter((entry) => !entry.hidden)) {
    for (let index = 0; index < 7; index += 1) {
      const nextItem = itemsForCase(caseDef.id)
        .filter((item) => !(item.condition || {}).finale && !current.world.collection.items[item.id])
        .sort((a, b) => a.discoveryOrder - b.discoveryOrder)[0];
      day += 1;
      setDayAndSeason(current, day, nextItem);
      const animal = animals[(day + seed + index) % animals.length];
      const started = beginStoryDiscovery(current, animal, { caseId: caseDef.id, guaranteed: true }, random);
      assert(started.created, `seed${seed}/${caseDef.id}: discovery did not start: ${started.reason}`);
      assert.strictEqual(started.discovery.itemId, nextItem.id, `seed${seed}/${caseDef.id}: story order changed`);
      const located = advanceStoryDiscovery(current, { actionId: started.discovery.actionId, actionLabel: started.discovery.actionLabel });
      assert(located.advanced && located.discovery.status === "located", `seed${seed}/${caseDef.id}: action did not locate item`);
      const archived = collectStoryDiscovery(current, started.discovery.itemId);
      assert(archived.ok, `seed${seed}/${caseDef.id}: map archive failed`);
    }
    const ending = submitCaseEnding(current, caseDef.id, ENDINGS[caseDef.id][seed % 3].id);
    assert(ending.ok, `seed${seed}: ending ${caseDef.id} unreachable`);
  }

  // Five hidden memories deliberately remain a separate optional dice path.
  for (let index = 0; index < 5; index += 1) {
    day += 1;
    const item = itemsForCase("hidden").find((entry) => !current.world.collection.items[entry.id]);
    setDayAndSeason(current, Math.max(100, day), item);
    current.world.collection.investigation.charges = 1;
    const leadId = `hidden_${seed}_${index}`;
    current.world.collection.leads = [{
      id: leadId, caseId: "hidden", day, quality: 2, sourceAction: "animalMemory", sourceLabel: "动物记忆",
      animal: { id: "forest", name: "森林里的朋友", trust: 90, security: 90, wildness: 80 }
    }];
    assert(startInvestigation(current, leadId, "field").ok, `seed${seed}: hidden investigation failed to start`);
    const result = resolveInvestigation(current, 6, () => 0);
    assert(result.ok && result.success && result.item.caseId === "hidden", `seed${seed}: hidden item unreachable`);
  }

  const summary = collectionSummary(current);
  assert.strictEqual(summary.collected, 45, `seed${seed}: only ${summary.collected}/45 discoveries archived`);
  assert.strictEqual(new Set(Object.keys(current.world.collection.items)).size, 45, `seed${seed}: duplicate item`);
  assert(CASES.filter((entry) => !entry.hidden).every((entry) => current.world.collection.cases[entry.id].ending), `seed${seed}: missing ending`);
  assert(summary.forestRemembers, `seed${seed}: hidden archive did not complete`);
  assert.strictEqual(JSON.stringify(current.world.reserve.inventory), inventoryAtStart, `seed${seed}: discoveries changed material inventory`);
  assert(!current.world.collection.investigation.pending, `seed${seed}: unresolved pending investigation`);
  assert(!current.world.collection.discovery.active, `seed${seed}: unresolved story discovery`);
  assert(Object.values(current.world.collection.discovery.states).filter((entry) => entry.status === "archived").length >= 40, `seed${seed}: discovery state was not persisted`);
  assert(collectionItemById(current.world.collection.lastDiscovery.itemId), `seed${seed}: invalid latest discovery`);
}

console.log("collection V3 soak check ok (40 seeds, 45/45 reachable, ordered story flow, hidden dice, no duplicates/deadlocks)");
