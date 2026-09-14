const assert = require("assert");
const { execFileSync } = require("child_process");
const path = require("path");
const { createCharacter } = require("../js/storage");
const { markOfflineCheckpoint, prepareOfflineBrief, MIN_OFFLINE_MS } = require("../js/offlineBrief");
const { normalizeChapterRescue, poacherRescueState } = require("../js/chapterRescueSystem");

const root = path.join(__dirname, "..");
const scenarios = [
  ["new-player", "onboarding-pacing-check.js"],
  ["returning-player", "offline-brief-check.js"],
  ["jumping-tasks", "nonlinear-task-routing-check.js"],
  ["rescue-in-progress", "chapter-rescue-no-repeat-check.js"],
  ["mixed-interruptions", "mixed-task-deadlock-check.js"],
  ["narrow-layouts", "visitor-routine-layout-check.js"],
  ["map-interactions", "map-marker-affordance-check.js"]
];

function runScenario(label, file) {
  const output = execFileSync(process.execPath, [path.join(root, "scripts", file)], {
    cwd: root,
    timeout: 30000,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024
  });
  assert(output.trim(), `${label} produced no verification output`);
  return output.trim().split("\n").pop();
}

// A return brief must be one-shot and must not mutate a second time on the
// same checkpoint, even when the player repeatedly background-switches.
const returning = createCharacter(null, "次日回归用户");
const base = Date.UTC(2026, 8, 14, 8, 0, 0);
markOfflineCheckpoint(returning, base);
const firstReturn = prepareOfflineBrief(returning, base + 24 * 60 * 60 * 1000);
assert(firstReturn.brief, "returning player should receive one next-day brief");
const secondReturn = prepareOfflineBrief(firstReturn.state, base + 24 * 60 * 60 * 1000 + MIN_OFFLINE_MS - 1);
assert(!secondReturn.brief, "same return session must not duplicate the brief");

// A captive species remains a single independent rescue record and does not
// leak into chapter normalization or generate a second poacher record.
const rescueState = createCharacter(null, "解救进行中用户");
const reserve = rescueState.world.reserve;
normalizeChapterRescue(reserve, 1, { fresh: true });
poacherRescueState(reserve);
const targets = reserve.chapterRescue.targets || [];
assert(targets.length === 1 && targets[0].status !== "rescued", "chapter rescue should start with one target");
assert(!((reserve.poacherRescue || {}).active || []).some((entry) => entry.speciesId === targets[0].speciesId), "chapter target must not duplicate as poacher rescue");

const results = scenarios.map(([label, file]) => `${label}: ${runScenario(label, file)}`);
console.log(`second-day user scenarios ok (${results.length} scenarios, one-shot return brief, no deadlock, no layout timeout)`);
console.log(results.join("\n"));
