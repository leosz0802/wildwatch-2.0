"use strict";

const assert = require("node:assert/strict");
const { createReserveState } = require("../js/world");
const { chapterTargets, chapterVisitorDailyAttrition } = require("../js/chapterTargets");
const { lateChapterRealNatureChance, neighborEventChance } = require("../js/worldEventSystem");
const { sandboxTaskCap, proposeEcologyCrises } = require("../js/sandboxTaskCadence");

assert.deepEqual(chapterTargets(1), { species: 7, animals: 12, visitors: 50, expectedMinutes: 4 });
assert.deepEqual(chapterTargets(2), { species: 7, animals: 84, visitors: 174, expectedMinutes: 9 });
assert.ok(chapterTargets(2).animals > chapterTargets(1).animals, "chapter 2 animal gate must rise above chapter 1");

const earlyAnimals = chapterTargets(2).animals;
const earlyVisitors = chapterTargets(2).visitors;
for (let chapter = 3; chapter <= 11; chapter += 1) {
  const current = chapterTargets(chapter);
  const previous = chapterTargets(chapter - 1);
  assert.ok(current.animals > previous.animals, `chapter ${chapter} animal gate must rise`);
  assert.ok(current.visitors > previous.visitors, `chapter ${chapter} visitor gate must rise`);
  assert.ok(current.animals > earlyAnimals, `chapter ${chapter} animals must sit above the onboarding pair`);
  assert.ok(current.visitors > earlyVisitors, `chapter ${chapter} visitors must sit above the onboarding pair`);
  if (chapter >= 4) {
    assert.ok(current.visitors - previous.visitors >= 70, `chapter ${chapter} visitor jump must stay large enough to stretch clear time`);
  }
  assert.ok(current.expectedMinutes >= 14, `chapter ${chapter} expected minutes must stretch past onboarding`);
  assert.ok(lateChapterRealNatureChance(chapter) > 0, `chapter ${chapter} must reserve real-nature events`);
  assert.ok(neighborEventChance(chapter) >= 0.16, `chapter ${chapter} neighbor events must be denser than onboarding`);
}

const early = createReserveState();
early.progression = Object.assign({}, early.progression, { stage: 1, displayChapter: 1 });
assert.equal(sandboxTaskCap(early), 1);
assert.equal(chapterVisitorDailyAttrition(early, { tourism: { retention: 50 } }), 0);
assert.equal(lateChapterRealNatureChance(1), 0);
assert.equal(lateChapterRealNatureChance(2), 0);

const mid = createReserveState();
mid.progression = Object.assign({}, mid.progression, { stage: 4, displayChapter: 4, level: 2 });
mid.development = { operations: { chapterVisitors: { stage: 4, inherited: 80, legacySeed: 0, start: {}, startLifetime: 0 }, visitorLedger: { totalVisitors: 220, recruitedVisitors: 140, lostVisitors: 0 } } };
mid.ecology = Object.assign({}, mid.ecology, { grass: 58, water: 70, disease: 16 });
mid.seasonState = { name: "旱季", weather: "阴" };
mid.poacherPressure = 40;
assert.equal(sandboxTaskCap(mid), 1);
assert.ok(chapterVisitorDailyAttrition(mid, { tourism: { retention: 55 } }) >= 4, "chapter 3+ must leak visitors each settlement day");
const quietVisits = chapterVisitorDailyAttrition(mid, { tourism: { retention: 55 }, visitors: 12 });
const busyVisits = chapterVisitorDailyAttrition(mid, { tourism: { retention: 55 }, visitors: 180 });
assert.ok(busyVisits > quietVisits, "a heavy visit day must lose more visitors than a quiet day");
assert.ok(busyVisits >= Math.round(180 * 0.25), "heavy visit loss must match a meaningful share of that day's arrivals");
const crises = proposeEcologyCrises(mid, { season: "旱季", weather: "阴" });
assert.ok(crises.some((item) => item.id === "wildfire"), "chapter 3+ dry grass must surface fire");
assert.ok(crises.some((item) => item.id === "poacher"), "chapter 3+ poacher pressure must surface a harsh border task");

console.log("chapter mid difficulty check ok");
