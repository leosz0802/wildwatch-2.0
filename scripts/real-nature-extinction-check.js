const assert = require("assert");
const { REAL_NATURE_EVENTS } = require("../js/realNatureEventCatalog");
const { realNatureDefinition, realNatureEventForDate, FAMILIAR_EXTINCTION_IDS } = require("../js/realNatureEventSystem");
const { applyEventBusinessOutcome } = require("../js/eventEconomy");

const extinction = REAL_NATURE_EVENTS.filter((event) => event.extinction === true);
assert(extinction.length >= 30 && extinction.length <= 40, `物种消失档案应为30–40条，实际 ${extinction.length}`);
assert(extinction.every((event) => event.category === "物种消失档案" && event.metrics.includes("fund") && event.metrics.includes("animals")));
const definition = realNatureDefinition(extinction[0]);
assert.strictEqual(definition.categoryLabel, "保护区野外实录");
assert.strictEqual(definition.extinction, true);
assert(definition.resolvedBody.includes("感谢你为物种保护贡献一份力量"));

// Familiar flagship animals should lead the archive, while specialist records
// remain reachable instead of being removed from the rotation.
const rotationReserve = {
  progression: { stage: 3, displayChapter: 3, activeSeconds: 100, chapterStart: { activeSeconds: 0 } },
  emergency: { history: [] }
};
const rotation = [];
for (let index = 0; index < 10; index += 1) {
  const event = realNatureEventForDate(rotationReserve, Date.UTC(2026, 0, 1 + index));
  assert(event && event.extinction === true, "extinction rotation must return archive records");
  rotation.push(event.id);
  rotationReserve.emergency.history.push({ type: `real_nature_${event.id}`, realEventId: event.id });
}
assert(new Set(rotation.slice(0, 8)).size === 8, "recent extinction records must not repeat immediately");
assert(rotation.filter((id) => FAMILIAR_EXTINCTION_IDS.has(id)).length >= 4, "familiar flagship animals should be prioritized");
assert(rotation.some((id) => !FAMILIAR_EXTINCTION_IDS.has(id)), "specialist extinction records must remain in rotation");

const run = (score) => {
  const reserve = {
    fund: 200,
    emergency: { pendingArcheryRoll: score },
    ecology: { predators: {}, herbivores: { deer: 10 }, birds: {} },
    progression: { stage: 3 },
    development: { operations: { today: { visitors: 0, recruitedVisitors: 0, income: 0 }, totalIncome: 0 } },
    animalSourceLedger: {}
  };
  return applyEventBusinessOutcome(reserve, {
    type: `real_nature_${extinction[0].id}`,
    realEventId: extinction[0].id,
    title: extinction[0].title
  }, true, false);
};
const low = run(1);
const high = run(6);
assert(low.fundDelta < 0 && high.fundDelta < 0);
assert(Math.abs(high.fundDelta) < Math.abs(low.fundDelta));
assert(high.animalsDelta > low.animalsDelta);
assert(high.note.includes("感谢你为物种保护贡献一份力量"));
console.log(`real-nature-extinction-check: ${extinction.length}条档案，射箭1→基金${low.fundDelta}/动物+${low.animalsDelta}，射箭6→基金${high.fundDelta}/动物+${high.animalsDelta}`);
