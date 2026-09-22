const assert = require("node:assert/strict");
const { createCharacter, normalizeReserve } = require("../js/storage");
const {
  animalSourceSummary,
  animalSourceFlowDelta,
  animalSourceFlowLabel,
  applyBreedingIncrease,
  applyNamedSpeciesBirth,
  recordIncrease,
  livingStock,
  trackPopulationChange
} = require("../js/animalSourceLedger");
const { applySpeciesPopulationDynamics, updateReserveEmergency } = require("../js/simulator");
const { applyAnimalTotalAdReward } = require("../js/adSystem");
const { recordShareSent } = require("../js/shareSystem");
const { chapterVisitorTotal } = require("../js/chapterTargets");
const { livingAnimalTotal } = require("../js/chapterRescueSystem");
const { SPECIES_DB } = require("../js/animalWorld");
const { buildReserveView } = require("../js/reserveView");
const { facilityAnimalImpact, applyFacilityDailyEffects } = require("../js/reserveFacilities");
const { applyHabitatPopulationDelta } = require("../js/ecologyConsistency");
const { applySpecialMetric } = require("../js/chapterSpecialSystem");
const { applyCoreMetric } = require("../js/realNatureEventSystem");

function visitorsOf(reserve) {
  return chapterVisitorTotal(reserve);
}

function healthyReserve() {
  const state = createCharacter(null, "本章存量流水");
  const reserve = state.world.reserve;
  Object.assign(reserve.ecology, { water: 80, grass: 74, disease: 8 });
  reserve.safety = 80;
  reserve.poacherPressure = 10;
  reserve.ecology.herbivores.deer = 24;
  return { state, reserve };
}

const opening = healthyReserve();
const visitorStart = visitorsOf(opening.reserve);
const animalStart = livingAnimalTotal(opening.reserve);

assert.equal(applyBreedingIncrease(opening.reserve, "deer"), 1, "healthy habitat should grant one breeding remainder");
assert.equal(applyNamedSpeciesBirth(opening.reserve, "deer"), 0, "named birth must occupy the same daily slot and not double-add");
assert.equal(animalSourceSummary(opening.reserve).breeding, 1);
assert.equal(animalSourceSummary(opening.reserve).species.deer.breeding, 1);
assert.equal(livingAnimalTotal(opening.reserve), animalStart + 1, "named plus dynamics share one headcount");
assert.equal(visitorsOf(opening.reserve), visitorStart, "breeding must not touch chapter visitors");

const blockedDisease = healthyReserve();
blockedDisease.reserve.ecology.disease = 80;
assert.equal(applyBreedingIncrease(blockedDisease.reserve, "deer"), 0, "high disease blocks breeding remainder");
assert.equal(livingAnimalTotal(blockedDisease.reserve), livingStock(blockedDisease.reserve));
assert.equal(visitorsOf(blockedDisease.reserve), visitorsOf(healthyReserve().reserve));

const blockedHabitat = healthyReserve();
blockedHabitat.reserve.ecology.water = 20;
blockedHabitat.reserve.ecology.grass = 20;
assert.equal(applyBreedingIncrease(blockedHabitat.reserve, "deer"), 0, "poor water and grass block breeding remainder");

const blockedCap = healthyReserve();
blockedCap.reserve.ecology.herbivores.deer = SPECIES_DB.deer.maxPop;
assert.equal(applyBreedingIncrease(blockedCap.reserve, "deer"), 0, "at-capacity species get no breeding remainder");

const repeat = healthyReserve();
assert.equal(applyBreedingIncrease(repeat.reserve, "deer"), 1);
const afterFirst = livingAnimalTotal(repeat.reserve);
applySpeciesPopulationDynamics(repeat.reserve, "idle");
assert.ok(livingAnimalTotal(repeat.reserve) >= afterFirst - 2);
assert.equal(animalSourceSummary(repeat.reserve).species.deer.breeding, 1, "repeat settlement cannot grant a second deer birth the same day");
const reloaded = normalizeReserve(JSON.parse(JSON.stringify(repeat.reserve)));
assert.deepEqual(animalSourceSummary(reloaded).breeding, animalSourceSummary(repeat.reserve).breeding);
assert.equal(chapterVisitorTotal(reloaded), visitorsOf(repeat.reserve), "reload must not rewrite visitors");

const namedOnly = healthyReserve();
const namedBefore = livingAnimalTotal(namedOnly.reserve);
assert.equal(applyNamedSpeciesBirth(namedOnly.reserve, "hare"), 1, "named birth adds species count when the daily slot is free");
assert.equal(applyNamedSpeciesBirth(namedOnly.reserve, "hare"), 0, "reopening a named birth does not write again");
assert.equal(livingAnimalTotal(namedOnly.reserve), namedBefore + 1);
assert.equal(animalSourceSummary(namedOnly.reserve).breeding, 1);
assert.equal(visitorsOf(namedOnly.reserve), visitorStart, "named birth must not change visitors");

const shareState = createCharacter(null, "分享不进繁殖");
const shareVisitors = chapterVisitorTotal(shareState.world.reserve);
const shareAnimals = livingAnimalTotal(shareState.world.reserve);
const shared = recordShareSent(shareState, { shareId: "share_animals_ledger", kind: "birth", species: "鹿", rewardType: "animals" });
assert.equal(shared.applied, true);
assert.equal(animalSourceSummary(shareState.world.reserve).shared, shared.reward.amount);
assert.equal(animalSourceSummary(shareState.world.reserve).breeding, 0, "share must not pollute breeding remainder");
assert.equal(animalSourceSummary(shareState.world.reserve).returned, 0, "share must not pollute immigration");
assert.equal(livingAnimalTotal(shareState.world.reserve), shareAnimals + shared.reward.amount);
assert.equal(chapterVisitorTotal(shareState.world.reserve), shareVisitors, "animal share must not change visitors");

const adState = createCharacter(null, "广告不进迁入");
const adVisitors = chapterVisitorTotal(adState.world.reserve);
const adAnimals = livingAnimalTotal(adState.world.reserve);
const ad = applyAnimalTotalAdReward(adState.world.reserve, () => 0);
assert.equal(ad.ok, true);
assert.equal(animalSourceSummary(adState.world.reserve).advertised, ad.amount);
assert.equal(animalSourceSummary(adState.world.reserve).returned, 0);
assert.equal(animalSourceSummary(adState.world.reserve).breeding, 0);
assert.equal(livingAnimalTotal(adState.world.reserve), adAnimals + ad.amount);
assert.equal(chapterVisitorTotal(adState.world.reserve), adVisitors, "animal ads must not change visitors");

const comfortState = createCharacter(null, "安抚单独记账");
const comfortVisitors = chapterVisitorTotal(comfortState.world.reserve);
const comfortAnimals = livingAnimalTotal(comfortState.world.reserve);
let comfortAdded = 0;
trackPopulationChange(comfortState.world.reserve, "comforted", () => {
  comfortAdded = applyHabitatPopulationDelta(comfortState.world.reserve, 2);
});
assert.ok(comfortAdded >= 1);
assert.equal(animalSourceSummary(comfortState.world.reserve).comforted, comfortAdded);
assert.equal(animalSourceSummary(comfortState.world.reserve).returned, 0, "comfort is not immigration");
assert.equal(animalSourceSummary(comfortState.world.reserve).breeding, 0, "comfort is not breeding remainder");
assert.equal(livingAnimalTotal(comfortState.world.reserve), comfortAnimals + comfortAdded);
assert.equal(chapterVisitorTotal(comfortState.world.reserve), comfortVisitors, "comfort must not change visitors");

const ledger = animalSourceSummary(opening.reserve);
assert.equal(ledger.retained, ledger.opening + ledger.immigrated + ledger.rescued - ledger.emigrated - ledger.died);
assert.ok(ledger.ending >= ledger.retained, "retention is display-only and is not added into the total");
recordIncrease(opening.reserve, "rescued", 0);
assert.equal(animalSourceSummary(opening.reserve).rescued, 0, "zero writes must not create rescued stock");

const breedingSeason = healthyReserve();
breedingSeason.reserve.seasonDay = 12;
const sameView = buildReserveView(breedingSeason.reserve, breedingSeason.reserve, { time: { seasonDay: 12 } });
assert.equal(sameView.outcome.delta, 0, "繁殖中 status must not invent +1 when the count is unchanged");
assert.ok(/数量未变/.test(sameView.settlement.animalLine), "settlement copy must not imply a count change from 繁殖中");
assert.ok(!/数量\+1/.test(sameView.settlement.animalLine));
assert.equal(sameView.outcome.value === "繁殖中" || sameView.outcome.value === "安定" || sameView.outcome.value === "回归", true);

const facilityState = createCharacter(null, "设施只改判定");
facilityState.world.reserve.facilityConstruction = { version: 1, sites: {
  old_patrol_post: { buildStage: 3, buildSteps: 2, specialization: "enforcement" },
  hydrology_station: { buildStage: 3, buildSteps: 2, specialization: "ecology" },
  evidence_room: { buildStage: 3, buildSteps: 2, specialization: "research" },
  migration_watch: { buildStage: 3, buildSteps: 2, specialization: "ecology" },
  governance_hall: { buildStage: 3, buildSteps: 2, specialization: "community" },
  guardian_memorial: { buildStage: 3, buildSteps: 2, specialization: "ecology" }
} };
const animalImpact = facilityAnimalImpact(facilityState.world.reserve);
assert.ok(animalImpact.animalRetention > 0 && animalImpact.animalRetention <= 0.12);
assert.ok(animalImpact.breedingCondition > 0 && animalImpact.breedingCondition <= 0.12);
assert.ok(animalImpact.immigrationBias > 0 && animalImpact.immigrationBias <= 0.12);
const facilityAnimals = livingAnimalTotal(facilityState.world.reserve);
const facilityVisitors = chapterVisitorTotal(facilityState.world.reserve);
applyFacilityDailyEffects(facilityState.world.reserve, 1);
assert.equal(livingAnimalTotal(facilityState.world.reserve), facilityAnimals, "facilities must not write animal +1");
assert.equal(chapterVisitorTotal(facilityState.world.reserve), facilityVisitors, "facility judgment must not rewrite chapter visitors");

const capReserve = healthyReserve();
capReserve.reserve.guardianCycle.day = 9;
["deer", "hare", "crow", "wolf"].forEach((id) => {
  applyBreedingIncrease(capReserve.reserve, id);
});
assert.ok(animalSourceSummary(capReserve.reserve).breeding <= 3, "chapter 1 breeding remainder is capped at +3 per day");

const flowBefore = healthyReserve();
const flowAfter = healthyReserve();
applyBreedingIncrease(flowAfter.reserve, "deer");
const flow = animalSourceFlowDelta(flowBefore.reserve, flowAfter.reserve);
assert.equal(flow.breeding, 1);
assert.equal(flow.immigrated, 0);
assert.ok(animalSourceFlowLabel(flow).includes("繁殖剩余"));
assert.equal(visitorsOf(flowAfter.reserve), visitorsOf(flowBefore.reserve));

const taskLoss = healthyReserve();
const taskLossVisitors = visitorsOf(taskLoss.reserve);
const taskLossAnimals = livingAnimalTotal(taskLoss.reserve);
const lost = applySpecialMetric(taskLoss.reserve, "animals", -2);
assert.ok(lost.delta <= 0);
assert.equal(animalSourceSummary(taskLoss.reserve).emigrated, Math.abs(lost.delta));
assert.equal(animalSourceSummary(taskLoss.reserve).breeding, 0, "task losses must not pollute breeding remainder");
assert.equal(livingAnimalTotal(taskLoss.reserve), taskLossAnimals + lost.delta);
assert.equal(visitorsOf(taskLoss.reserve), taskLossVisitors, "animal task loss must not rewrite visitors");

const natureLoss = healthyReserve();
const natureVisitors = visitorsOf(natureLoss.reserve);
const natureAnimals = livingAnimalTotal(natureLoss.reserve);
const nature = applyCoreMetric(natureLoss.reserve, "animals", -2);
assert.equal(animalSourceSummary(natureLoss.reserve).emigrated, Math.abs(nature.delta));
assert.equal(animalSourceSummary(natureLoss.reserve).returned, 0);
assert.equal(livingAnimalTotal(natureLoss.reserve), natureAnimals + nature.delta);
assert.equal(visitorsOf(natureLoss.reserve), natureVisitors, "nature animal loss must not rewrite visitors");

const dispute = healthyReserve();
const disputeVisitors = visitorsOf(dispute.reserve);
const disputeAnimals = livingAnimalTotal(dispute.reserve);
dispute.reserve.emergency = {
  active: { type: "neighbor_animal_dispute", progress: 0, target: 9, daysRemaining: 1, responses: [] },
  cooldown: 0,
  history: []
};
updateReserveEmergency(dispute.reserve, "idle", { name: "雨季" }, false, false);
assert.equal(animalSourceSummary(dispute.reserve).died, 2, "neighbor dispute culls must write deaths");
assert.equal(livingAnimalTotal(dispute.reserve), disputeAnimals - 2);
assert.equal(visitorsOf(dispute.reserve), disputeVisitors, "neighbor dispute must not rewrite visitors");

const persist = healthyReserve();
applyBreedingIncrease(persist.reserve, "deer");
const persistLoaded = normalizeReserve(persist.reserve);
assert.equal(animalSourceSummary(persistLoaded).breeding, 1);
persistLoaded.animalSourceLedger.chapters[1].breeding = 99;
assert.equal(animalSourceSummary(persist.reserve).breeding, 1, "reload must clone the ledger instead of sharing the save object");
assert.equal(chapterVisitorTotal(persistLoaded), visitorsOf(persist.reserve));

console.log("animal source ledger v2 ok: chapter stock flows, shared birth quota, split sources, display-only retention, facilities judgment-only");
