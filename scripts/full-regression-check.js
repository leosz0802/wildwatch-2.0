const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function run(args, label) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    env: Object.assign({}, process.env, { NODE_NO_WARNINGS: "1" })
  });
  const ok = result.status === 0 && !result.signal;
  process.stdout.write(`${ok ? "ok" : "fail"} ${label}\n`);
  if (!ok) {
    process.stdout.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    process.exit(result.status || 1);
  }
}

const runtimeFiles = [path.join(root, "game.js")]
  .concat(walk(path.join(root, "js")).filter((file) => file.endsWith(".js")));

runtimeFiles.forEach((file) => {
  run(["--check", path.relative(root, file)], `syntax ${path.relative(root, file)}`);
});

run(["scripts/stardew-v3-regression-check.js", "--rounds=1"], "current V3 regression (34 checks)");

[
  "animal-motion-check.js",
  "dialogue-check.js",
  "ecology-economy-check.js",
  "season-depth-check.js",
  "balance-v2-check.js",
  "progression-check.js",
  "achievement-feedback-check.js",
  "no-user-input-check.js",
  "performance-check.js",
  "numeric-regression-check.js",
  "animal-condition-dynamics-check.js",
  "map-marker-affordance-check.js",
  "task-resource-pipeline-check.js",
  "action-resource-rhythm-check.js",
  "resource-loop-check.js",
  "system-balance-check.js"
].forEach((target) => run([path.join("scripts", target)], target));

console.log(`full regression check ok (${runtimeFiles.length} syntax files, 34 current checks, 16 supplemental checks)`);
