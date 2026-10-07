"use strict";

const assert = require("node:assert/strict");
const { createReserveState } = require("../js/world");
const { SPECIES_DB, reconcileSpeciesPopulations, speciesPopulationGroup } = require("../js/animalWorld");
const {
  chapterDefinition,
  normalizeChapterRescue,
  addRescueItem,
  rescueAnimal,
  livingAnimalTotal,
  chapterCaptiveSpeciesSet
} = require("../js/chapterRescueSystem");
const {
  chapterTargets,
  chapterVisitorCarryover,
  chapterAnimalTotal,
  beginChapterAnimalCheckpoint,
  comfortAnimalGainRange
} = require("../js/chapterTargets");
const { recordIncrease } = require("../js/animalSourceLedger");
const { recruitmentYieldBand } = require("../js/visitorRecruitment");
const { chapterSpecialDef } = require("../js/chapterSpecialSystem");
const { visitorReceptionPlan } = require("../js/visitorReception");
const { CORE_METRIC_AMOUNTS, REAL_NATURE_CHAPTER_QUOTA } = require("../js/realNatureEventSystem");
const { FACILITY_USE_PROFILES, FACILITY_USE_LIMIT, facilityAnimalGain } = require("../js/reserveFacilities");
const { BALANCE_V2, PACE_ECONOMY } = require("../js/balanceConfig");
const { BUILDING_MAX_LEVEL, BUILDING_LEVEL_CHAPTER } = require("../js/progressionGates");

function expectedSessions(chapter) {
  return Math.max(1, Math.round(Number((BALANCE_V2.progression[chapter] || {}).expectedSessions) || 1));
}

function playtimeRestores(minutes) {
  return Math.max(0, Math.floor(Math.max(0, minutes) / (PACE_ECONOMY.visitorRestoreSeconds / 60)));
}

function hallVisitors(chapter) {
  return 0;
}

function hallAnimals(chapter) {
  if (chapter < (FACILITY_USE_PROFILES.governance_hall.unlockChapter || 5)) return 0;
  return chapter * FACILITY_USE_LIMIT;
}

function liveSpeciesCount(reserve) {
  const ecology = reserve.ecology || {};
  const captive = chapterCaptiveSpeciesSet(reserve);
  const species = new Set();
  [ecology.predators, ecology.herbivores, ecology.birds].forEach((group) => {
    Object.keys(group || {}).forEach((id) => {
      if (Number(group[id]) > 0 && !captive.has(id)) species.add(id);
    });
  });
  return species.size;
}

function introduceStarters(reserve, chapter) {
  const def = chapterDefinition(chapter);
  (def.starter || []).forEach((id) => {
    const species = SPECIES_DB[id];
    if (!species) return;
    const group = speciesPopulationGroup(id);
    const bucket = reserve.ecology[group] || (reserve.ecology[group] = {});
    if (!(Number(bucket[id]) > 0)) bucket[id] = Math.max(1, Math.round(Number(species.initialPop) || 1));
  });
}

function addAnimals(reserve, amount) {
  const wanted = Math.max(0, Math.round(Number(amount) || 0));
  if (!wanted) return 0;
  const ecology = reserve.ecology || (reserve.ecology = {});
  const candidates = [];
  Object.keys(SPECIES_DB).forEach((id) => {
    const group = speciesPopulationGroup(id);
    const bucket = ecology[group] || (ecology[group] = {});
    const pop = Math.max(0, Math.round(Number(bucket[id]) || 0));
    const maxPop = Math.max(pop, Math.round(Number(SPECIES_DB[id].maxPop) || pop));
    if (pop > 0 && pop < maxPop) candidates.push({ id, group, pop, maxPop });
  });
  candidates.sort((a, b) => b.pop - a.pop);
  let added = 0;
  for (let index = 0; index < wanted; index += 1) {
    const open = candidates.filter((item) => item.pop < item.maxPop);
    if (!open.length) break;
    const pick = open[added % open.length];
    pick.pop += 1;
    ecology[pick.group][pick.id] = pick.pop;
    added += 1;
  }
  return added;
}

function setLivingTotal(reserve, target) {
  const current = livingAnimalTotal(reserve);
  const delta = Math.round(Number(target) || 0) - current;
  if (delta > 0) addAnimals(reserve, delta);
  if (delta < 0) {
    const ecology = reserve.ecology || {};
    let need = -delta;
    Object.keys(SPECIES_DB).forEach((id) => {
      if (need <= 0) return;
      const group = speciesPopulationGroup(id);
      const bucket = ecology[group] || {};
      const pop = Math.max(0, Math.round(Number(bucket[id]) || 0));
      if (pop <= 1) return;
      const cut = Math.min(need, pop - 1);
      bucket[id] = pop - cut;
      need -= cut;
    });
  }
  return livingAnimalTotal(reserve);
}

function completeRescues(reserve, chapter) {
  (normalizeChapterRescue(reserve, chapter).targets || []).forEach((record) => {
    (record.requiredItems || []).forEach((itemId) => addRescueItem(reserve, itemId));
    assert.equal(rescueAnimal(reserve, record.targetId).ok, true, `chapter ${chapter} rescue must complete`);
  });
}

function unlockableBuildingLevel(chapter) {
  let level = 1;
  for (let tier = 1; tier <= BUILDING_MAX_LEVEL; tier += 1) {
    if ((BUILDING_LEVEL_CHAPTER[tier] || tier) <= chapter) level = tier;
  }
  return level;
}

function recruitBand(chapter) {
  const first = recruitmentYieldBand(chapter, 0);
  const later = recruitmentYieldBand(chapter, 1);
  return {
    twoTyp: Math.round((first.min + first.max) / 2) + Math.round((later.min + later.max) / 2),
    twoMax: first.max + later.max,
    laterTyp: Math.round((later.min + later.max) / 2),
    laterMax: later.max
  };
}

for (let chapter = 1; chapter <= 20; chapter += 1) {
  const gate = chapterTargets(chapter);
  const sessions = expectedSessions(chapter);
  const restores = Math.max(chapter <= 2 ? 1 : 0, playtimeRestores(gate.expectedMinutes));
  const reserve = createReserveState();
  reserve.progression = Object.assign({}, reserve.progression || {}, {
    stage: chapter,
    displayChapter: chapter,
    level: Math.min(7, Math.ceil(chapter / 2))
  });
  for (let prior = 1; prior < chapter; prior += 1) {
    normalizeChapterRescue(reserve, prior, { fresh: prior === 1 });
    introduceStarters(reserve, prior);
    (normalizeChapterRescue(reserve, prior).targets || []).forEach((record) => {
      record.status = "rescued";
      record.rescuedAt = 1;
      const species = SPECIES_DB[record.speciesId];
      const group = speciesPopulationGroup(record.speciesId);
      reserve.ecology[group] = reserve.ecology[group] || {};
      reserve.ecology[group][record.speciesId] = Math.max(
        Number(reserve.ecology[group][record.speciesId]) || 0,
        Math.round(Number((species || {}).initialPop) || 1)
      );
    });
    reserve.chapterRescue.completedTargets = Object.assign({}, reserve.chapterRescue.completedTargets || {});
  }
  normalizeChapterRescue(reserve, chapter, { fresh: chapter === 1 });
  introduceStarters(reserve, chapter);
  reconcileSpeciesPopulations(reserve, { initializeUnlocked: true, removeLocked: false });
  beginChapterAnimalCheckpoint(reserve, chapter, chapter === 1 ? 0 : chapterTargets(chapter - 1).animals);

  const startAnimals = chapterAnimalTotal(reserve);
  assert.ok(startAnimals < gate.animals, `chapter ${chapter} must not start already over the animal gate: ${startAnimals}/${gate.animals}`);
  assert.ok(liveSpeciesCount(reserve) <= gate.species, `chapter ${chapter} must not start with species already complete`);

  completeRescues(reserve, chapter);
  const afterRescue = chapterAnimalTotal(reserve);
  const afterSpecies = liveSpeciesCount(reserve);
  assert.ok(afterRescue < gate.animals, `chapter ${chapter} rescue alone must not finish animals: ${afterRescue}/${gate.animals}`);
  assert.ok(afterSpecies >= gate.species, `chapter ${chapter} required rescues must meet the species gate: ${afterSpecies}/${gate.species}`);

  const special = chapterSpecialDef(chapter).success || {};
  const specialAnimals = Math.max(0, Math.round(Number(special.animals) || 0));
  const specialVisitors = Math.max(0, Math.round(Number(special.visitors) || 0));
  const comfort = comfortAnimalGainRange(chapter);
  const patrol = facilityAnimalGain(chapter) * (FACILITY_USE_LIMIT + PACE_ECONOMY.stationAdUseGrant);
  const hallAnimalGain = hallAnimals(chapter);
  const operateGain = specialAnimals + patrol + hallAnimalGain + comfort.max * sessions;
  addAnimals(reserve, operateGain);
  if (operateGain) recordIncrease(reserve, "tasked", operateGain);
  const operateAnimals = chapterAnimalTotal(reserve);
  assert.ok(
    operateAnimals >= afterRescue,
    `chapter ${chapter} maximum per-chapter patrol uses must not reduce rescued animals: ${operateAnimals}/${afterRescue}`
  );
  assert.equal(
    FACILITY_USE_LIMIT + PACE_ECONOMY.stationAdUseGrant,
    6,
    "a facility may be used at most six times in one chapter after the reward ad"
  );

  const inherit = chapter === 1 ? 0 : chapterVisitorCarryover(chapterTargets(chapter - 1).visitors, chapter);
  const need = gate.visitors - inherit;
  const band = recruitBand(chapter);
  const reception = visitorReceptionPlan(chapter).budget;
  const realVisitors = REAL_NATURE_CHAPTER_QUOTA * CORE_METRIC_AMOUNTS.visitors.中;
  const hall = hallVisitors(chapter);
  const building = chapter === 1 ? 0 : Math.round(16 * unlockableBuildingLevel(chapter) / 5);
  const sameDayTyp = inherit + band.twoTyp + specialVisitors + reception + hall;
  const slowTyp = inherit + band.twoTyp + band.laterTyp * restores + specialVisitors + reception + hall + realVisitors;
  const fullTyp = inherit
    + band.twoTyp * sessions
    + band.laterTyp * restores
    + specialVisitors
    + reception * sessions
    + hall * sessions
    + building * Math.max(0, sessions - 1)
    + realVisitors;

  assert.ok(band.twoMax + specialVisitors < need, `chapter ${chapter} two free max + special must not clear +${need}`);
  assert.ok(sameDayTyp < gate.visitors, `chapter ${chapter} typical same-day operate must stay under visitors: ${sameDayTyp}/${gate.visitors}`);
  assert.ok(slowTyp >= gate.visitors || fullTyp >= gate.visitors, `chapter ${chapter} waiting/restoring or finishing all chapter days must pass visitors`);
  if (chapter <= 2) {
    assert.ok(inherit + band.twoMax + band.laterMax >= gate.visitors, `chapter ${chapter} one extra recruit must be able to finish visitors`);
  } else {
    assert.ok(inherit + band.twoMax + band.laterMax + specialVisitors + reception < gate.visitors, `chapter ${chapter} three same-day recruits plus reception must still leave a visitor gap`);
  }
}

console.log("chapter tight balance check ok: organic operate can pass, ads only skip waits");
