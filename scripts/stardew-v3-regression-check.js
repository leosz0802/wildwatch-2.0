const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const roundsArg = process.argv.find((arg) => /^--rounds=\d+$/.test(arg));
const rounds = Math.max(1, Math.min(5, Number((roundsArg || "--rounds=1").split("=")[1]) || 1));
const targets = [
  "guardian-cycle-check.js",
  "guardian-mastery-check.js",
  "stardew-core-loop-check.js",
  "guardian-24day-soak-check.js",
  "loop-safety-check.js",
  "task-story-alignment-check.js",
  "story-system-consistency-check.js",
  "goal-system-v3-check.js",
  "goal-ui-check.js",
  "collection-system-check.js",
  "collection-v2-soak-check.js",
  "core-resource-system-check.js",
  "ecology-consistency-check.js",
  "water-grass-guidance-check.js",
  "threat-action-check.js",
  "numeric-feedback-check.js",
  "reserve-facilities-check.js",
  "reserve-presentation-check.js",
  "ios-ui-consistency-check.js",
  "toy-ui-style-check.js",
  "modal-header-style-check.js",
  "ui-icon-layout-check.js",
  "ui-layout-check.js",
  "supply-purchase-check.js",
  "map-layout-check.js",
  "map-interaction-check.js",
  "sandbox-delight-check.js",
  "map-speech-rotation-check.js",
  "modal-close-check.js",
  "asset-reference-check.js",
  "art-atlas-check.js",
  "runtime-reachability-check.js",
  "package-size-check.js",
  "smoke-test.js"
];

for (let round = 1; round <= rounds; round += 1) {
  targets.forEach((target) => {
    const result = spawnSync(process.execPath, [path.join(__dirname, target)], {
      cwd: root,
      encoding: "utf8",
      env: Object.assign({}, process.env, { NODE_NO_WARNINGS: "1" })
    });
    if (result.status !== 0) {
      process.stderr.write(`V3 regression failed · round ${round} · ${target}\n`);
      process.stderr.write(result.stdout || "");
      process.stderr.write(result.stderr || "");
      process.exit(result.status || 1);
    }
  });
  process.stdout.write(`V3 regression round ${round}/${rounds} ok (${targets.length} checks)\n`);
}

console.log(`stardew V3 regression ok (${rounds} rounds, ${targets.length * rounds} checks)`);
