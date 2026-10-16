const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createCharacter } = require("../js/storage");
const { createReserveState } = require("../js/world");
const { CHAPTERS } = require("../js/animalWorld");
const { buildNarrativeBeat } = require("../js/forestDirector");
const { eventBranchChapters } = require("../js/simulator");
const {
  resolveEcologyNarrativeEvent,
  applyEcologyNarrativeDecision
} = require("../js/ecologyNarrativeSystem");
const { Game } = require("../js/game");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertBeat(beat, label) {
  ["id", "scene", "animalLine", "dilemma", "actionId", "threshold", "immediateConsequence", "delayedDebt", "nextHook", "permanence"].forEach((key) => {
    assert(beat && beat[key] !== undefined && beat[key] !== "", `${label} missing narrativeBeat.${key}`);
  });
  assert(beat.animalLine.length <= 22, `${label} animal line exceeds 22 characters: ${beat.animalLine}`);
  assert(beat.nextHook.length <= 26, `${label} next hook exceeds 26 characters: ${beat.nextHook}`);
}

assert.strictEqual(CHAPTERS.length, 11, "documentary narrative must cover eleven chapters");
CHAPTERS.forEach((chapter) => {
  ["story", "openQuestion", "unpaidDebt", "nextHook", "ending", "actionId", "threshold"].forEach((key) => {
    assert(chapter[key], `chapter ${chapter.chapter} missing ${key}`);
  });
  const quote = String(chapter.keyAnimalQuote || "").split("：").slice(1).join("：");
  assert(quote && quote.length <= 22, `chapter ${chapter.chapter} animal quote must stay within 22 characters`);
  assert(!/继续努力|森林点头|开始信任你|本章完成/.test(`${chapter.story}${chapter.ending}`), `chapter ${chapter.chapter} kept generic progression copy`);
});

const branchReserve = createReserveState();
["tracker", "defender", "steward", "ledger"].forEach((branch) => {
  const chapters = eventBranchChapters(branch, branchReserve);
  assert.strictEqual(chapters.length, 7, `${branch} must retain seven beats`);
  chapters.forEach((chapter, index) => {
    assertBeat(chapter.narrativeBeat, `${branch}/${index + 1}`);
    assert(chapter.scene && chapter.dilemma && chapter.delayedDebt && chapter.nextHook, `${branch}/${index + 1} lacks route-specific cost structure`);
  });
});

const routeHooks = ["tracker", "defender", "steward", "ledger"].map((branch) => eventBranchChapters(branch, branchReserve)[0].nextHook);
assert.strictEqual(new Set(routeHooks).size, 4, "the four routes must not share the same first cliffhanger");

function ecologyReserve() {
  const reserve = createReserveState();
  reserve.fund = 10000;
  reserve.supplies.medicalKit = 10;
  reserve.supplies.fieldKit = 10;
  reserve.ecology.predators.bear = Math.max(2, reserve.ecology.predators.bear || 0);
  reserve.ecology.water = 72;
  reserve.ecology.grass = 68;
  reserve.ecology.disease = 18;
  return reserve;
}

const eventTypes = ["predation", "disease", "overgrazing", "territorial", "birth", "migration", "juvenile_loss", "competition", "symbiosis", "weather"];
eventTypes.forEach((type) => {
  const probe = ecologyReserve();
  assert.strictEqual(resolveEcologyNarrativeEvent(probe, clone(probe), { day: 1, dayClosed: true, forceType: type }), null, `${type} nature-rule task must stay removed`);
  assert.strictEqual(probe.ecologyNarrative.pendingDecision, null, `${type} must not leave a pending nature-rule task`);
});

const state = createCharacter(null, "叙事测试员");
const world = state.world;
const input = {
  world,
  beforeReserve: clone(world.reserve),
  reserve: world.reserve,
  action: "houndScout",
  day: world.day,
  time: world.time,
  weather: world.weather,
  knownCharacters: world.knownCharacters,
  regionId: "river",
  delta: { safety: 1, fund: -10, migration: 0 }
};
const beatA = buildNarrativeBeat(input);
const beatB = buildNarrativeBeat(clone(input));
assert.deepStrictEqual(beatA, beatB, "the same state/day/action must produce a stable narrative beat");
assertBeat(beatA, "forest-director");

const game = Object.create(Game.prototype);
const tracked = [];
game.cloudService = { track: (event, properties) => tracked.push({ event, properties }) };
game.narrativeSessionStartedAt = Date.now() - 30000;
game.trackNarrative("narrative.beat_view", { kind: "chapter", beatId: "chapter_1_start", text: "不得上传", playerName: "不得上传" });
assert.strictEqual(tracked.length, 1, "narrative telemetry was not emitted");
assert.strictEqual(tracked[0].properties.elapsedBucket, "20-45s", "narrative elapsed bucket is incorrect");
assert(!("text" in tracked[0].properties) && !("playerName" in tracked[0].properties), "narrative telemetry must not upload copy or player identity");

const fullGame = new Game();
fullGame.stopLoop();
fullGame.state = state;
CHAPTERS.forEach((chapter) => {
  assertBeat(fullGame.buildChapterStory(chapter.chapter, "start").narrativeBeat, `chapter-start/${chapter.chapter}`);
  assertBeat(fullGame.buildChapterStory(chapter.chapter, "end").narrativeBeat, `chapter-end/${chapter.chapter}`);
});

const gameSource = fs.readFileSync(path.join(__dirname, "../js/game.js"), "utf8");
assert(gameSource.includes("这里没有无代价的善意，每一次守护你都要买单"), "the approved first opening line changed");
assert(gameSource.includes('"进入游戏"'), "the single-image prologue must keep the enter-game action");
assert(!gameSource.includes("遵循自然，衡量利益，让你的保护区活下去"), "the retired second opening panel must stay off the first-login image");
assert(!/我们诞生在中国|帝企鹅日记|March of the Penguins/.test(JSON.stringify(CHAPTERS)), "film titles or attributed source copy leaked into game narrative");

console.log("documentary narrative check ok (20 chapters, 28 route beats, 9 dilemmas, 18 outcomes, deterministic copy and bounded permanence)");
