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
  tasked: "tasked",
  rareAuction: "rareAuction",
  rareBirth: "rareBirth",
  rarePatrol: "rarePatrol",
  rareMigratedIn: "rareMigratedIn"
});
const OUTFLOW_ALIASES = Object.freeze({
  emigrated: "emigrated",
  died: "died",
  rareMigrated: "rareMigrated",
  rareStolen: "rareStolen"
});
const OUTFLOW_FOR_SOURCE = Object.freeze({
  returned: "emigrated",
  immigrated: "emigrated",
  emigrated: "emigrated",
  died: "died"
});
const INFLOW_KEYS = ["immigrated", "rescued", "breeding", "comforted", "advertised", "shared", "tasked", "rareAuction", "rareBirth", "rarePatrol", "rareMigratedIn"];
const OUTFLOW_KEYS = ["emigrated", "died", "rareMigrated", "rareStolen"];
const EARLY_CHAPTER_BREEDING_CAP = 3;
function chapterKey(reserve = {}) {
  const progression = reserve.progression || {};
  return Math.max(1, Math.round(Number(progression.displayChapter || progression.stage || 1)));
}
function addLivingAnimals(reserve, amount, source = "tasked") {
  const wanted = Math.max(0, Math.round(Number(amount) || 0));
  const before = livingStock(reserve);
  if (!wanted || !reserve) return { added: 0, before, after: before, speciesId: "" };
  const { chapterCaptiveSpeciesSet } = require("./chapterRescueSystem");
  const { getChapterSandboxSpecies } = require("./animalWorld");
  const ecology = reserve.ecology || (reserve.ecology = {});
  ["predators", "herbivores", "birds"].forEach((group) => { if (!ecology[group] || typeof ecology[group] !== "object") ecology[group] = {}; });
  const chapter = chapterKey(reserve);
  const captive = chapterCaptiveSpeciesSet(reserve);
  const ids = new Set();
  getChapterSandboxSpecies(chapter).forEach((species) => {
    const id = species && species.id ? species.id : species;
    if (id) ids.add(id);
  });
  Object.keys(SPECIES_DB).forEach((id) => {
    const species = SPECIES_DB[id] || {};
    if (species.unlockChapter && species.unlockChapter > chapter) return;
    ids.add(id);
  });
  const candidates = [];
  ids.forEach((id) => {
    if (!id || captive.has(id)) return;
    const group = speciesPopulationGroup(id);
    const current = Math.max(0, Math.round(Number((ecology[group] || {})[id]) || 0));
    const maxPop = Math.max(1, Math.round(Number((SPECIES_DB[id] || {}).maxPop) || 999));
    candidates.push({ id, group, current, maxPop });
  });
  const living = candidates.filter((item) => item.current > 0)
    .sort((a, b) => (b.current - a.current) || a.id.localeCompare(b.id));
  const withRoom = living.filter((item) => item.current < item.maxPop);
  let targets = withRoom.length ? withRoom : living;
  if (!targets.length) {
    targets = candidates.sort((a, b) => a.id.localeCompare(b.id));
  }
  if (!targets.length) return { added: 0, before, after: before, speciesId: "", reason: "no_candidates" };
  let added = 0;
  let left = wanted;
  targets.forEach((target) => {
    if (left <= 0) return;
    const room = Math.max(0, target.maxPop - target.current);
    const take = room ? Math.min(left, room) : 0;
    if (!take) return;
    ecology[target.group][target.id] = target.current + take;
    target.current += take;
    added += take;
    left -= take;
  });
  if (left > 0) {
    const overflow = living[0] || targets[0];
    ecology[overflow.group][overflow.id] = overflow.current + left;
    overflow.current += left;
    added += left;
    left = 0;
  }
  if (added > 0) recordIncrease(reserve, source, added);
  return {
    added,
    before,
    after: livingStock(reserve),
    speciesId: (living[0] || targets[0]).id
  };
}
function removeLivingAnimals(reserve, amount, source = "emigrated", options = {}) {
  const wanted = Math.max(0, Math.round(Number(amount) || 0));
  const before = livingStock(reserve);
  const floor = Math.max(0, Math.round(Number(options.floor) || 0));
  const take = Math.min(wanted, Math.max(0, before - floor));
  if (!take || !reserve) return { removed: 0, before, after: before, speciesId: "" };
  const { chapterCaptiveSpeciesSet } = require("./chapterRescueSystem");
  const ecology = reserve.ecology || (reserve.ecology = {});
  ["predators", "herbivores", "birds"].forEach((group) => { if (!ecology[group] || typeof ecology[group] !== "object") ecology[group] = {}; });
  const living = [];
  const captive = chapterCaptiveSpeciesSet(reserve);
  ["herbivores", "predators", "birds"].forEach((group) => {
    Object.keys(ecology[group] || {}).forEach((id) => {
      if (captive.has(id)) return;
      const current = Math.max(0, Math.round(Number(ecology[group][id]) || 0));
      if (current > 0) living.push({ id, group, current });
    });
  });
  living.sort((a, b) => (b.current - a.current) || a.id.localeCompare(b.id));
  let left = take;
  living.forEach((item) => {
    if (left <= 0) return;
    const cut = Math.min(item.current, left);
    ecology[item.group][item.id] = item.current - cut;
    item.current -= cut;
    left -= cut;
  });
  const removed = take - left;
  if (removed > 0) recordDecrease(reserve, source, removed);
  return {
    removed,
    before,
    after: livingStock(reserve),
    speciesId: (living[0] || {}).id || ""
  };
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
    rareAuction: 0,
    emigrated: 0,
    died: 0,
    rareMigrated: 0,
    rareStolen: 0,
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
  INFLOW_KEYS.concat(["opening"], OUTFLOW_KEYS).forEach((key) => {
    entry[key] = numberOf(entry[key]);
  });
  if (!entry.openingSet) {
    const inflows = INFLOW_KEYS.reduce((sum, key) => sum + numberOf(entry[key]), 0);
    const outflows = OUTFLOW_KEYS.reduce((sum, key) => sum + numberOf(entry[key]), 0);
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
function beginChapterSourceLedger(reserve = {}, stage) {
  const chapter = Math.max(1, Math.round(Number(stage) || chapterKey(reserve)));
  const ledger = ledgerRoot(reserve);
  const entry = emptyTotals();
  entry.opening = livingStock(reserve);
  entry.openingSet = true;
  ledger.chapters[chapter] = entry;
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
  if (["rareAuction", "rareBirth", "rarePatrol", "rareMigratedIn"].includes(key) && options.speciesId) {
    const row = entry.species[options.speciesId] || (entry.species[options.speciesId] = {});
    row[key] = numberOf(row[key]) + amount;
  }
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
  const before = livingStock(reserve);
  const result = action();
  const after = livingStock(reserve);
  const delta = after - before;
  if (delta > 0) recordIncrease(reserve, source, delta);
  if (delta < 0) recordDecrease(reserve, OUTFLOW_FOR_SOURCE[source] || "emigrated", -delta);
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
  const rareAuction = numberOf(raw.rareAuction);
  const rareMigrated = numberOf(raw.rareMigrated);
  const rareStolen = numberOf(raw.rareStolen);
  const inflows = immigrated + rescued + breeding + comforted + advertised + shared + tasked + rareAuction;
  const opening = raw.openingSet
    ? numberOf(raw.opening)
    : (inflows || emigrated || died ? Math.max(0, ending - inflows + emigrated + died) : ending);
  const retainedBase = opening + immigrated + rescued + rareAuction;
  const retained = Math.max(0, retainedBase - emigrated - died - rareMigrated - rareStolen);
  const expectedEnding = retained + breeding + comforted + advertised + shared + tasked;
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
    rareAuction,
    emigrated,
    died,
    rareMigrated,
    rareStolen,
    ending,
    expectedEnding,
    closureDelta: ending - expectedEnding,
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
  const keys = ["immigrated", "rescued", "breeding", "comforted", "advertised", "shared", "tasked", "rareAuction", "emigrated", "died", "rareMigrated", "rareStolen"];
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
  if (delta.rareAuction) parts.push(`珍稀竞拍${signed(delta.rareAuction)}`);
  if (delta.emigrated) parts.push(`迁出-${Math.abs(delta.emigrated)}`);
  if (delta.died) parts.push(`死亡-${Math.abs(delta.died)}`);
  if (delta.rareMigrated) parts.push(`珍稀迁徙-${Math.abs(delta.rareMigrated)}`);
  if (delta.rareStolen) parts.push(`珍稀盗猎-${Math.abs(delta.rareStolen)}`);
  return parts.slice(0, 2).join(" · ");
}
module.exports = {
  populationSnapshot,
  beginChapterSourceLedger,
  recordIncrease,
  recordDecrease,
  trackPopulationChange,
  animalSourceSummary,
  animalSourceFlowDelta,
  animalSourceFlowLabel,
  applyBreedingIncrease,
  applyNamedSpeciesBirth,
  breedingBlocked,
  addLivingAnimals,
  removeLivingAnimals,
  livingStock,
  EARLY_CHAPTER_BREEDING_CAP
};
