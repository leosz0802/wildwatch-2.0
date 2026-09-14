const {
  ANIMAL_INTERACTION_STORIES,
  normalizeAnimalInteractionState,
  advanceAnimalInteractionStories,
  resolveAnimalInteraction
} = require("../js/animalInteractionStories");

function reserveFixture() {
  return {
    fund: 500, safety: 72, stability: 70,
    ecology: {
      water: 45, grass: 60, disease: 12,
      predators: { wolf: 4 },
      herbivores: { deer: 35, antelope: 30, zebra: 30, boar: 15 },
      birds: { crow: 5, vulture: 4 }
    },
    development: { operations: { today: { visitors: 100, recruitedVisitors: 0, income: 300, recruitedIncome: 0 }, totalVisitors: 100, totalIncome: 300 } }
  };
}

if (ANIMAL_INTERACTION_STORIES.length < 6) throw new Error("animal relationship story pool should contain at least six stories");
const reserve = reserveFixture();
normalizeAnimalInteractionState(reserve);
let spawned = null;
for (let day = 1; day < 30 && !spawned; day += 1) {
  const result = advanceAnimalInteractionStories(reserve, {}, { day });
  if (result.kind === "spawn") spawned = result;
}
if (!spawned || !reserve.animalInteractions.active) throw new Error("eligible animal relationship should create one pending story");
const active = reserve.animalInteractions.active;
if (!active.choices || active.choices.length < 2) throw new Error("animal story should expose at least two adjustment choices");
const playerReserve = reserveFixture();
playerReserve.animalInteractions = JSON.parse(JSON.stringify(reserve.animalInteractions));
const playerResult = resolveAnimalInteraction(playerReserve, active.storyId, active.choices[0].id, 8);
if (!playerResult.ok || playerReserve.animalInteractions.active) throw new Error("player adjustment should resolve and clear the pending story");
if (!playerResult.businessChange || !Number.isFinite(playerResult.businessChange.fundDelta)) throw new Error("animal story should update visitor/fund feedback");

const ignoredReserve = reserveFixture();
ignoredReserve.animalInteractions = JSON.parse(JSON.stringify(reserve.animalInteractions));
const beforeSafety = ignoredReserve.safety;
const ignored = advanceAnimalInteractionStories(ignoredReserve, {}, { day: active.expiresDay + 1 });
if (ignored.kind !== "auto" || !ignored.automatic) throw new Error("unhandled animal story should auto-resolve");
if (ignoredReserve.safety >= beforeSafety || ignoredReserve.animalInteractions.ignoredCount < 1) throw new Error("automatic resolution must move the reserve in a negative direction");

console.log(`animal interaction checks passed (${ANIMAL_INTERACTION_STORIES.length} stories)`);
