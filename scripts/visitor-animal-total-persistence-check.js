"use strict";

const assert = require("node:assert/strict");
const { createCharacter } = require("../js/storage");
const { visitorRecruitmentStatus } = require("../js/visitorRecruitment");
const {
  chapterVisitorTotal,
  chapterAnimalTotal,
  applyChapterVisitorDelta
} = require("../js/chapterTargets");
const { livingAnimalTotal } = require("../js/chapterRescueSystem");
const { animalSourceSummary } = require("../js/animalSourceLedger");
const { resolveEcologyChain } = require("../js/coreResourceSystem");
const { applyNarrativeBusinessPressure } = require("../js/eventEconomy");
const { resolveAnimalInteraction } = require("../js/animalInteractionStories");
const { chapterCoreMetrics } = require("../js/game");

function fixture() {
  const reserve = createCharacter(null, "游客与动物总数跨日回归").world.reserve;
  reserve.progression = Object.assign({}, reserve.progression, { stage: 1, displayChapter: 1 });
  reserve.development = reserve.development || {};
  reserve.development.operations = reserve.development.operations || {};
  return reserve;
}

// A large, player-initiated visitor wave must remain in the chapter ledger
// while its "today" snapshot expires. The old bug repeatedly consumed the
// stale snapshot and made the visible total drift back toward the opening
// crowd. Animal totals must stay independent from that visitor rollover.
const reserve = fixture();
const firstDay = new Date("2026-09-01T12:00:00+08:00").getTime();
visitorRecruitmentStatus(reserve, 1, firstDay);
applyChapterVisitorDelta(reserve, 3, "visit");
applyChapterVisitorDelta(reserve, 60, "recruit");
const visitorsAfterWave = chapterVisitorTotal(reserve);
const animalsAfterWave = chapterAnimalTotal(reserve);
const liveAnimalsAfterWave = livingAnimalTotal(reserve);
assert.equal(visitorsAfterWave, 63);

for (let day = 2; day <= 8; day += 1) {
  visitorRecruitmentStatus(reserve, day, firstDay + day * 86400000);
  applyNarrativeBusinessPressure(reserve, {
    id: `visitor_pressure_day_${day}`,
    title: "生态剧情压力",
    demand: 0.9
  });
  assert.equal(chapterVisitorTotal(reserve), visitorsAfterWave, `visitor ledger must survive day ${day}`);
  assert.equal(chapterAnimalTotal(reserve), animalsAfterWave, `animal HUD must survive visitor day ${day}`);
  assert.equal(livingAnimalTotal(reserve), liveAnimalsAfterWave, `live animals must survive visitor day ${day}`);
}

// The daily snapshot is also replaced at a real-date boundary. Preserve the
// last ecological snapshot for reports/secondary views instead of briefly
// dropping animalTotal to zero.
reserve.development.operations.today.animalTotal = 81;
visitorRecruitmentStatus(reserve, 9, firstDay + 9 * 86400000);
assert.equal(reserve.development.operations.today.animalTotal, 81);
assert.equal(chapterCoreMetrics(reserve, 1).animals, animalsAfterWave);

// Water-chain population changes are real animal inflows. They must close the
// animal source ledger, even though immigration is intentionally excluded from
// the chapter-progress HUD.
const chainReserve = fixture();
const chainBefore = livingAnimalTotal(chainReserve);
chainReserve.ecologyChain = { id: "water_food_predator", stage: 1, history: [] };
const key = Object.keys(chainReserve.ecology.herbivores).sort(
  (a, b) => (chainReserve.ecology.herbivores[b] || 0) - (chainReserve.ecology.herbivores[a] || 0)
)[0];
resolveEcologyChain(chainReserve, chainReserve, { day: 2, dayClosed: true });
assert.equal(livingAnimalTotal(chainReserve), chainBefore + 1);
assert.equal(animalSourceSummary(chainReserve).immigrated, 1);
assert.equal(
  animalSourceSummary(chainReserve).ending,
  animalSourceSummary(chainReserve).opening
    + animalSourceSummary(chainReserve).immigrated
    + animalSourceSummary(chainReserve).rescued
    + animalSourceSummary(chainReserve).breeding
    + animalSourceSummary(chainReserve).comforted
    + animalSourceSummary(chainReserve).advertised
    + animalSourceSummary(chainReserve).shared
    + animalSourceSummary(chainReserve).tasked
    - animalSourceSummary(chainReserve).emigrated
    - animalSourceSummary(chainReserve).died
);
assert.equal(chainReserve.ecology.herbivores[key], (fixture().ecology.herbivores[key] || 0) + 1);

const predatorChainReserve = fixture();
const predatorBefore = livingAnimalTotal(predatorChainReserve);
predatorChainReserve.ecologyChain = { id: "water_food_predator", stage: 2, history: [] };
resolveEcologyChain(predatorChainReserve, predatorChainReserve, { day: 3, dayClosed: true });
assert.equal(livingAnimalTotal(predatorChainReserve), predatorBefore + 1);
assert.equal(animalSourceSummary(predatorChainReserve).immigrated, 1);

// Animal-interaction outcomes also mutate species populations. Their task
// result must be recorded instead of changing only the live map.
const interactionReserve = fixture();
interactionReserve.ecology.water = 60;
interactionReserve.ecology.herbivores.deer = 24;
interactionReserve.ecology.predators.wolf = 2;
interactionReserve.animalInteractions = {
  active: { storyId: "deer_wolf_waterline" },
  history: []
};
const interactionBefore = livingAnimalTotal(interactionReserve);
const interaction = resolveAnimalInteraction(interactionReserve, "deer_wolf_waterline", "separate_waterline", 1);
assert.equal(interaction.ok, true);
assert.equal(livingAnimalTotal(interactionReserve), interactionBefore + 2);
assert.equal(animalSourceSummary(interactionReserve).tasked, 2);

console.log("visitor and animal total persistence check ok");
