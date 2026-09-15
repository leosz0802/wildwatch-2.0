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
  .concat(walk(path.join(root, "js")).filter((file) => file.endsWith(".js")))
  .concat(walk(path.join(root, "open-data")).filter((file) => file.endsWith(".js")));

runtimeFiles.forEach((file) => {
  run(["--check", path.relative(root, file)], `syntax ${path.relative(root, file)}`);
});

run(["scripts/chapter-rescue-strict-cache-check.js"], "WeChat strict-mode rescue cache regression");
run(["scripts/patrol-single-step-check.js"], "four patrol cards direct settlement regression");
run(["scripts/task-lock-recovery-check.js"], "task close and sandbox continuation regression");
run(["scripts/recurring-rescue-task-routing-check.js"], "recurring rescue collection and real button routing regression");
run(["scripts/rescue-point-feedback-check.js"], "rescue cumulative points and count-up feedback regression");
run(["scripts/nonlinear-task-routing-check.js"], "nonlinear task routing and independent rescue gate regression");
run(["scripts/mixed-task-deadlock-check.js"], "mixed rescue, visitor/disaster, restart and shared-material deadlock regression");
run(["scripts/chapter-gate-order-check.js"], "all chapter gates in forward/reverse rescue order");
run(["scripts/chapter-rescue-no-repeat-check.js"], "chapter targets excluded from poaching, duplicate save recovery and restart");

run(["scripts/stardew-v3-regression-check.js", "--rounds=1"], "current V3 regression (34 checks)");

const supplementalChecks = [
  "animal-motion-check.js",
  "animal-gait-check.js",
  "dialogue-check.js",
  "ecology-economy-check.js",
  "season-depth-check.js",
  "balance-v2-check.js",
  "progression-check.js",
  "achievement-feedback-check.js",
  "no-user-input-check.js",
  "performance-check.js",
  "long-run-soak-check.js",
  "tight-economy-check.js",
  "offscreen-sandbox-event-check.js",
  "numeric-regression-check.js",
  "animal-condition-dynamics-check.js",
  "loop-safety-check.js",
  "map-marker-affordance-check.js",
  "map-task-story-dedupe-check.js",
  "task-resource-pipeline-check.js",
  "action-resource-rhythm-check.js",
  "resource-loop-check.js",
  "system-balance-check.js",
  "interstitial-ad-check.js",
  "recent-ui-regression-check.js",
  "guardian-turnover-loop-check.js",
  "first-supply-sample-assist-check.js",
  "first-stage-reduction-check.js",
  "stage1-regression-check.js",
  "custom-ad-check.js",
  "rewarded-supply-ad-check.js",
  "startup-performance-check.js",
  "relationship-notification-check.js",
  "league-ranking-check.js",
  "reserve-valuation-check.js",
  "wechat-friend-authorize-check.js",
  "cloud-service-check.js",
  "remote-art-check.js",
  "world-event-system-check.js",
  "wilderness-knowledge-check.js",
  "offline-brief-check.js",
  "population-interaction-check.js",
  "animal-interaction-check.js",
  "endless-chapter-check.js",
  "ecology-narrative-check.js",
  "documentary-narrative-check.js",
  "narrative-depth-check.js",
  "life-memory-timeline-check.js",
  "task-story-resource-match-check.js",
  "story-activation-check.js",
  "collection-system-check.js",
  "collection-animal-guide-check.js",
  "navigation-routing-check.js",
  "flow-return-check.js",
  "letter-inbox-check.js",
  "letter-inbox-regression-check.js",
  "daily-event-mail-entry-check.js",
  "friend-letter-check.js",
  "animal-letter-system-check.js",
  "fund-ledger-persistence-check.js",
  "ledger-story-task-check.js",
  "first-return-hook-check.js",
  "reserve-development-check.js",
  "building-operation-cooldown-check.js",
  "visitor-recruitment-check.js",
  "chapter-balance-check.js",
  "visitor-incident-check.js",
  "world-event-idle-check.js",
  "sticky-table-header-check.js"
];

supplementalChecks.forEach((target) => run([path.join("scripts", target)], target));

run([path.join("server", "wild-api", "test.js")], "wild-api real friend/world trade check");
run([path.join("scripts", "wechat-release-preflight-check.js")], "wechat-release-preflight-check.js");

console.log(`full regression check ok (${runtimeFiles.length} syntax files, 34 current checks, ${supplementalChecks.length} supplemental checks, API and release preflight)`);
