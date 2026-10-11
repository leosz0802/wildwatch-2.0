const assert = require("assert");
const { createReserveState } = require("../js/world");
const { normalizeReserve } = require("../js/storage");
const { CHAPTER_ECOLOGY_BALANCE } = require("../js/balanceConfig");
const { applyStrategicChoice } = require("../js/strategySystem");

const fresh = createReserveState();
assert(fresh.safety >= 50 && fresh.safety <= 70, `fresh safety should stay in the normal band, got ${fresh.safety}`);

const migratedOpening = normalizeReserve({
  safety: 68,
  progression: { stage: 1, displayChapter: 1, totalActions: 0, daysManaged: 0 }
}, fresh);
assert.strictEqual(migratedOpening.safety, fresh.safety, "untouched legacy opening should use the new baseline");

const experienced = normalizeReserve({
  safety: 68,
  progression: { stage: 1, displayChapter: 1, totalActions: 1, daysManaged: 0 }
}, fresh);
assert.strictEqual(experienced.safety, 68, "experienced save safety must not be overwritten by migration");

Object.entries(CHAPTER_ECOLOGY_BALANCE).forEach(([chapter, balance]) => {
  assert(balance.safetyTarget >= 50 && balance.safetyTarget <= 70,
    `chapter ${chapter} passive safety target should stay in 50-70, got ${balance.safetyTarget}`);
});

// A deliberate, costly governance choice still provides a clear route into the
// managed 70-90 band; this is not a passive baseline bonus.
fresh.safety = 58;
fresh.strategy.pendingDilemma = { id: "water_governance", actionIndex: 14, chapter: 2, day: 14 };
const outcome = applyStrategicChoice(fresh, "water_governance", "water_command", { roll: 6, routeModifier: 0, resourceModifier: 0 });
assert(outcome && fresh.safety === 70, `focused governance should reach 70 from 58, got ${fresh.safety}`);

console.log("safety band check ok (default 50-70, focused governance reaches 70)");
