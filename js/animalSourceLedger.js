// Chapter animal totals are cross-chapter stock. This ledger records this
// chapter's flows only. Retention is derived and must never be added back.
const { SPECIES_DB, speciesPopulationGroup } = require("./animalWorld");

const INFLOW_ALIASES = Object.freeze({
  rescued: "rescued",
  immigrated: "immigrated",
  returned: "immigrated",
  breeding: "breeding",
  growth: "breeding",
  comforted: "comforted",
  advertised: "advertised",
  shared: "shared",
  tasked: "tasked"
});
const OUTFLOW_ALIASES = Object.freeze({
  emigrated: "emigrated",
  died: "died"
});
const OUTFLOW_FOR_SOURCE = Object.freeze({
  returned: "emigrated",
  immigrated: "emigrated",
  emigrated: "emigrated",
  died: "died"
});
const INFLOW_KEYS = ["immigrated", "rescued", "breeding", "comforted", "advertised", "shared", "tasked"];
const EARLY_CHAPTER_BREEDING_CAP = 3;

function chapterKey(reserve = {}) {
  return Math.max(1, Number((reserve.progression || {}).stage) || 1);
}

function populationSnapshot(reserve = {}) {
  const ecology = reserve.ecology || {};
  return Object.assign({}, ecology.herbivores, ecology.predators, ecology.birds);
}

function livingStock(reserve = {}) {
  try {
    return Math.max(0, Math.round(Number(require("./chapterRescueSystem").livingAnimalTotal(reserve)) || 0));
  } catch (_) {
    const snap = populationSnapshot(reserve);
    return Object.keys(snap).reduce((sum, id) => sum + Math.max(0, Math.round(Number(snap[id]) || 0)), 0);
  }
}

function currentLedgerDay(reserve = {}) {
  const cycle = reserve.guardianCycle || {};
  return Math.max(1, Math.round(Number(cycle.day || reserve.seasonDay || 1)));
}

function emptyTotals() {
  return {
    opening: 0,
    immigrated: 0,
    rescued: 0,
    breeding: 0,
    comforted: 0,
    advertised: 0,
    shared: 0,
    tasked: 0,
    emigrated: 0,
    died: 0,
    species: {},
    birthQuotaDay: 0,
    birthQuota: {},
    birthQuotaTotal: 0,
    openingSet: false
  };
}

function numberOf(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function ledgerRoot(reserve = {}) {
  const ledger = reserve.animalSourceLedger || (reserve.animalSourceLedger = { version: 2, chapters: {} });
  ledger.version = 2;
  ledger.chapters = ledger.chapters || {};
  return ledger;
}

function migrateChapter(entry, reserve) {
  if (!entry || typeof entry !== "object") return emptyTotals();
  if (numberOf(entry.returned) && !numberOf(entry.immigrated)) entry.immigrated = numberOf(entry.returned);
  if (numberOf(entry.growth) && !numberOf(entry.breeding)) entry.breeding = numberOf(entry.growth);
  entry.species = entry.species && typeof entry.species === "object" ? entry.species : {};
  entry.birthQuota = entry.birthQuota && typeof entry.birthQuota === "object" ? entry.birthQuota : {};
  entry.birthQuotaTotal = numberOf(entry.birthQuotaTotal);
  entry.birthQuotaDay = numberOf(entry.birthQuotaDay);
  INFLOW_KEYS.concat(["opening", "emigrated", "died"]).forEach((key) => {
    entry[key] = numberOf(entry[key]);
  });
  if (!entry.openingSet) {
    const inflows = INFLOW_KEYS.reduce((sum, key) => sum + numberOf(entry[key]), 0);
    const outflows = numberOf(entry.emigrated) + numberOf(entry.died);
    if (inflows || outflows) {
      entry.opening = Math.max(0, livingStock(reserve) - inflows + outflows);
      entry.openingSet = true;
    }
  }
  return entry;
}

function chapterEntry(reserve = {}) {
  const chapter = chapterKey(reserve);
  const ledger = ledgerRoot(reserve);
  const current = ledger.chapters[chapter] || (ledger.chapters[chapter] = emptyTotals());
  return migrateChapter(current, reserve);
}

function snapshotOpeningIfNeeded(reserve, pendingDelta = 0) {
  const entry = chapterEntry(reserve);
  if (entry.openingSet) return entry;
  entry.opening = Math.max(0, livingStock(reserve) - Math.round(Number(pendingDelta) || 0));
  entry.openingSet = true;
  return entry;
}

function addSpeciesBreeding(entry, speciesId, amount) {
  if (!speciesId || !amount) return;
  const row = entry.species[speciesId] || (entry.species[speciesId] = { breeding: 0 });
  row.breeding = numberOf(row.breeding) + amount;
}

function recordIncrease(reserve, source, count, options = {}) {
  const key = INFLOW_ALIASES[source];
  if (!key) throw new Error("Unknown animal source");
  const amount = numberOf(count);
  if (!amount) return 0;
  const entry = snapshotOpeningIfNeeded(reserve, amount);
  entry[key] = numberOf(entry[key]) + amount;
  if (key === "breeding") addSpeciesBreeding(entry, options.speciesId, amount);
  return amount;
}

function recordDecrease(reserve, source, count, options = {}) {
  const key = OUTFLOW_ALIASES[source] || OUTFLOW_ALIASES[OUTFLOW_FOR_SOURCE[source]];
  if (!key) throw new Error("Unknown animal source");
  const amount = numberOf(count);
  if (!amount) return 0;
  const entry = snapshotOpeningIfNeeded(reserve, -amount);
  entry[key] = numberOf(entry[key]) + amount;
  if (options.speciesId) {
    const row = entry.species[options.speciesId] || (entry.species[options.speciesId] = { breeding: 0 });
    row[key] = numberOf(row[key]) + amount;
  }
  return amount;
}

function trackPopulationChange(reserve, source, action) {
  snapshotOpeningIfNeeded(reserve, 0);
  const before = populationSnapshot(reserve);
  const result = action();
  const after = populationSnapshot(reserve);
  let increase = 0;
  let decrease = 0;
  Object.keys(Object.assign({}, before, after)).forEach((id) => {
    const delta = Math.round(Number(after[id]) || 0) - Math.round(Number(before[id]) || 0);
    if (delta > 0) increase += delta;
    else if (delta < 0) decrease += -delta;
  });
  if (increase) recordIncrease(reserve, source, increase);
  if (decrease) recordDecrease(reserve, OUTFLOW_FOR_SOURCE[source] || "emigrated", decrease);
  return result;
}

function breedingBlocked(reserve = {}, species = {}, pop = 0) {
  const ecology = reserve.ecology || {};
  const water = Number(ecology.water) || 0;
  const grass = Number(ecology.grass) || 0;
  const disease = Number(ecology.disease) || 0;
  const maxPop = Math.max(0, Number(species.maxPop) || 0);
  if (pop <= 0) return "empty";
  if (maxPop && pop >= maxPop) return "capacity";
  if (disease >= 55) return "disease";
  if (water < 45 || grass < 45) return "habitat";
  return "";
}

function claimDailyBreedingSlot(reserve, speciesId) {
  const entry = chapterEntry(reserve);
  const day = currentLedgerDay(reserve);
  if (entry.birthQuotaDay !== day) {
    entry.birthQuotaDay = day;
    entry.birthQuota = {};
    entry.birthQuotaTotal = 0;
  }
  const id = String(speciesId || "");
  if (!id) return false;
  if (entry.birthQuota[id]) return false;
  if (chapterKey(reserve) <= 3 && numberOf(entry.birthQuotaTotal) >= EARLY_CHAPTER_BREEDING_CAP) return false;
  entry.birthQuota[id] = 1;
  entry.birthQuotaTotal = numberOf(entry.birthQuotaTotal) + 1;
  return true;
}

function applyBreedingIncrease(reserve, speciesId, requested = 1) {
  if (!reserve || !speciesId) return 0;
  const species = SPECIES_DB[speciesId];
  if (!species) return 0;
  const group = speciesPopulationGroup(speciesId);
  const ecology = reserve.ecology || (reserve.ecology = {});
  const bucket = ecology[group] || (ecology[group] = {});
  const pop = Math.max(0, Math.round(Number(bucket[speciesId]) || 0));
  if (breedingBlocked(reserve, species, pop)) return 0;
  const room = Math.max(0, Math.round(Number(species.maxPop) || pop) - pop);
  const amount = Math.min(1, Math.max(0, Math.round(Number(requested) || 0)), room);
  if (!amount) return 0;
  if (!claimDailyBreedingSlot(reserve, speciesId)) return 0;
  bucket[speciesId] = pop + amount;
  recordIncrease(reserve, "breeding", amount, { speciesId });
  return amount;
}

function applyNamedSpeciesBirth(reserve, speciesId) {
  return applyBreedingIncrease(reserve, speciesId, 1);
}

function animalSourceSummary(reserve = {}) {
  const chapter = chapterKey(reserve);
  const raw = ((reserve.animalSourceLedger || {}).chapters || {})[chapter] || {};
  const immigrated = numberOf(raw.immigrated) || numberOf(raw.returned);
  const breeding = numberOf(raw.breeding) || numberOf(raw.growth);
  const rescued = numberOf(raw.rescued);
  const comforted = numberOf(raw.comforted);
  const advertised = numberOf(raw.advertised);
  const shared = numberOf(raw.shared);
  const tasked = numberOf(raw.tasked);
  const emigrated = numberOf(raw.emigrated);
  const died = numberOf(raw.died);
  const ending = livingStock(reserve);
  const inflows = immigrated + rescued + breeding + comforted + advertised + shared + tasked;
  const opening = raw.openingSet
    ? numberOf(raw.opening)
    : (inflows || emigrated || died ? Math.max(0, ending - inflows + emigrated + died) : ending);
  const retainedBase = opening + immigrated + rescued;
  const retained = Math.max(0, retainedBase - emigrated - died);
  return {
    chapter,
    opening,
    immigrated,
    rescued,
    breeding,
    comforted,
    advertised,
    shared,
    tasked,
    emigrated,
    died,
    ending,
    retained,
    retainedBase,
    retainedRate: retainedBase > 0 ? retained / retainedBase : 1,
    species: raw.species && typeof raw.species === "object" ? raw.species : {},
    returned: immigrated,
    growth: breeding
  };
}

function animalSourceFlowDelta(beforeReserve = {}, afterReserve = {}) {
  const before = animalSourceSummary(beforeReserve);
  const after = animalSourceSummary(afterReserve);
  const keys = ["immigrated", "rescued", "breeding", "comforted", "advertised", "shared", "tasked", "emigrated", "died"];
  const delta = {};
  keys.forEach((key) => {
    delta[key] = numberOf(after[key]) - numberOf(before[key]);
  });
  return delta;
}

function animalSourceFlowLabel(delta = {}) {
  const signed = (value) => (value > 0 ? `+${value}` : `${value}`);
  const parts = [];
  if (delta.rescued) parts.push(`解救${signed(delta.rescued)}`);
  if (delta.immigrated) parts.push(`迁入${signed(delta.immigrated)}`);
  if (delta.breeding) parts.push(`繁殖剩余${signed(delta.breeding)}`);
  if (delta.comforted) parts.push(`安抚${signed(delta.comforted)}`);
  if (delta.advertised) parts.push(`幸运${signed(delta.advertised)}`);
  if (delta.shared) parts.push(`分享${signed(delta.shared)}`);
  if (delta.tasked) parts.push(`任务${signed(delta.tasked)}`);
  if (delta.emigrated) parts.push(`迁出-${Math.abs(delta.emigrated)}`);
  if (delta.died) parts.push(`死亡-${Math.abs(delta.died)}`);
  return parts.slice(0, 2).join(" · ");
}

module.exports = {
  populationSnapshot,
  recordIncrease,
  recordDecrease,
  trackPopulationChange,
  animalSourceSummary,
  animalSourceFlowDelta,
  animalSourceFlowLabel,
  applyBreedingIncrease,
  applyNamedSpeciesBirth,
  breedingBlocked,
  livingStock,
  EARLY_CHAPTER_BREEDING_CAP
};
