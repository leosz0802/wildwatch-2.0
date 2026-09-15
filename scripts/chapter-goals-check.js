const assert = require("assert");
const { chapterTargets, CHAPTER_TARGETS } = require("../js/chapterTargets");
const { createReserveState } = require("../js/world");
const { Game } = require("../js/game");

assert.strictEqual(CHAPTER_TARGETS.length, 20, "there must be one target row per chapter");
for (let chapter = 1; chapter <= 20; chapter += 1) {
  const current = chapterTargets(chapter);
  assert(current.species > 0 && current.animals > 0 && current.visitors > 0, `chapter ${chapter} target is empty`);
  if (chapter <= 5) assert(current.expectedMinutes >= 3 && current.expectedMinutes <= 5, `chapter ${chapter} should take 3–5 minutes`);
  if (chapter >= 6) {
    const previous = chapterTargets(chapter - 1);
    assert(Math.abs(current.expectedMinutes / previous.expectedMinutes - 1.3) < 0.001, `chapter ${chapter} duration should grow by 30%`);
  }
}

const game = new Game();
if (game.stopLoop) game.stopLoop();
const reserve = createReserveState();
reserve.progression = Object.assign({}, reserve.progression, {
  totalMeaningfulActions: 100,
  totalStrategicChoices: 100,
  totalMajorStrategicChoices: 100,
  activeSeconds: 1000,
  chapterComplete: true
});
reserve.chapterRescue = { enforceCompletion: false, legacyGateBypass: true };
reserve.storyDiscoveries = { case_1: { evidence: 3 } };
reserve.eventChain = { chapterLevel: 1, step: 99, length: 1, completed: true };
const blocked = game.reserveProgression(reserve);
assert.strictEqual(blocked.stage, 1, "chapter cannot advance before visitor target is met");
reserve.development.operations.totalVisitors = chapterTargets(1).visitors;
const advanced = game.reserveProgression(reserve);
assert.strictEqual(advanced.stage, 2, "chapter advances after all core metrics are met");

// Core metrics are the chapter gate; the legacy operation counters must not
// be required once the three readable goals are complete.
const coreOnly = createReserveState();
coreOnly.development.operations.totalVisitors = chapterTargets(1).visitors;
const coreOnlyProgression = game.reserveProgression(coreOnly);
assert.strictEqual(coreOnlyProgression.stage, 2, "core goals should replace legacy operation gates");

const opening = game.buildChapterStory(2, "start");
assert(/种群/.test(opening.goalLine) && /动物总数/.test(opening.goalLine) && /游客累计/.test(opening.goalLine), "chapter opening must show all three core goals");
for (let chapter = 1; chapter <= 20; chapter += 1) {
  const story = game.buildChapterStory(chapter, "start");
  assert(Array.isArray(story.goalItems) && story.goalItems.length === 3, `chapter ${chapter} opening should expose three goal tiles`);
  assert(story.goalItems.every((item) => item.target > 0 && item.current >= 0), `chapter ${chapter} goal tiles should have numeric progress`);
  assert(Array.isArray(story.rescueNames) && story.rescueNames.length > 0 && /本章必救：/.test(story.rescueLine), `chapter ${chapter} opening should name required rescue animals`);
}
const chapterDetail = game.buildChapterProgressDetail();
assert.strictEqual(chapterDetail.kind, "chapterProgress", "chapter title should open the dedicated progress view");
assert(chapterDetail.metricDetails && chapterDetail.metricDetails.visitors && chapterDetail.metricDetails.species && chapterDetail.metricDetails.animals, "all three core metrics need click-through details");
assert(/下一章/.test(chapterDetail.metricDetails.visitors.kicker), "visitor detail should describe the next chapter gate");
assert(Array.isArray(chapterDetail.speciesNeeded), "species detail should expose the species still to unlock");
assert(/下一章门槛/.test(chapterDetail.metricDetails.animals.items[0].tag), "animal detail should expose the next chapter animal threshold");
console.log("chapter goals check ok (20 chapters, 30% pacing, gated promotion)");
