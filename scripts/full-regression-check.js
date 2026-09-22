const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const failedChecks = [];

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
    failedChecks.push(label);
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
run(["scripts/patrol-trigger-policy-check.js"], "20 chapters: no routine patrols, story and critical-risk triggers only");
run(["scripts/task-lock-recovery-check.js"], "task close and sandbox continuation regression");
run(["scripts/task-completion-feedback-check.js"], "core metric colors and task completion popup regression");
run(["scripts/metric-improvement-task-check.js"], "water and grass detail tasks settle their selected environment metric");
run(["scripts/mail-entry-interaction-check.js"], "mail entry render, touch scrolling and sandbox recovery across 20 chapters");
run(["scripts/chapter-population-carryover-check.js"], "20 cumulative population gates and cross-chapter preservation");
run(["scripts/recurring-rescue-task-routing-check.js"], "recurring rescue collection and real button routing regression");
run(["scripts/rescue-point-feedback-check.js"], "rescue cumulative points and count-up feedback regression");
run(["scripts/survival-animal-sources-check.js"], "survival impacts and actual animal sources across 20 chapters");
run(["scripts/nonlinear-task-routing-check.js"], "nonlinear task routing and independent rescue gate regression");
run(["scripts/user-play-path-check.js"], "linear, jump and disruptive user play paths stay playable");
run(["scripts/single-choice-play-path-check.js"], "single-choice tasks: linear, jump and disruptive play");
run(["scripts/mixed-task-deadlock-check.js"], "mixed rescue, visitor/disaster, restart and shared-material deadlock regression");
run(["scripts/chapter-goal-progress-check.js"], "20 chapters: executable cards, no task lock deadlock");
run(["scripts/visitor-incident-check.js"], "20 chapters: visitor sandbox keeps only the graphic reminder");
run(["scripts/chapter-gate-order-check.js"], "all chapter gates in forward/reverse rescue order");
run(["scripts/chapter-required-unlock-check.js"], "required chapter animals can unlock and remain after rescue");
run(["scripts/chapter-core-latch-check.js"], "chapter core goals latch after first completion");
run(["scripts/chapter-story-check.js"], "last core task notice, chapter cutscene, then enter next chapter");
run(["scripts/sandbox-task-cadence-check.js"], "sandbox task cap, early 2-minute gap, later 3-minute gap");
run(["scripts/harsh-nature-archery-check.js"], "fire/flood/disease archery always deals scaled negative damage");
run(["scripts/animal-total-snap-check.js"], "animal total does not snap 120↔80 from captive reseed");
run(["scripts/ecology-consistency-check.js"], "idle animal drift stays slow, tasks keep larger migration");
run(["scripts/archery-angle-score-check.js"], "archery aim angle maps to a deterministic 1–6 score");
run(["scripts/archery-score-regression-check.js"], "live archery score is written to the animal-owned ledger");
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
  "inline-number-title-check.js",
  "animal-condition-dynamics-check.js",
  "loop-safety-check.js",
  "map-marker-affordance-check.js",
  "trapped-animal-motion-check.js",
  "map-task-story-dedupe-check.js",
  "task-resource-pipeline-check.js",
  "late-chapter-task-frequency-check.js",
  "action-resource-rhythm-check.js",
  "resource-loop-check.js",
  "system-balance-check.js",
  "interstitial-ad-check.js",
  "recent-ui-regression-check.js",
  "guardian-turnover-loop-check.js",
  "first-supply-sample-assist-check.js",
  "first-stage-reduction-check.js",
  "onboarding-pacing-check.js",
  "stage1-regression-check.js",
  "custom-ad-check.js",
  "rewarded-supply-ad-check.js",
  "startup-performance-check.js",
  "relationship-notification-check.js",
  "league-ranking-check.js",
  "reserve-valuation-check.js",
  "wechat-friend-authorize-check.js",
  "world-friend-identity-check.js",
  "cloud-service-check.js",
  "remote-art-check.js",
  "world-event-system-check.js",
  "wilderness-knowledge-check.js",
  "survival-collection-acquire-check.js",
  "offline-brief-check.js",
  "population-interaction-check.js",
  "animal-interaction-check.js",
  "animal-care-daily-reset-check.js",
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
  "channel-screen-fade-check.js",
  "device-canvas-hardening-check.js",
  "today-bug-and-totals-check.js",
  "ambient-loop-check.js",
  "flow-return-check.js",
  "impact-settlement-check.js",
  "dice-ui-check.js",
  "letter-inbox-check.js",
  "letter-inbox-regression-check.js",
  "daily-event-mail-entry-check.js",
  "daily-partial-complete-check.js",
  "friend-letter-check.js",
  "animal-letter-system-check.js",
  "fund-ledger-persistence-check.js",
  "ledger-story-task-check.js",
  "first-return-hook-check.js",
  "chapter-one-goal-focus-check.js",
  "task-category-whitelist-check.js",
  "chapter-special-check.js",
  "friend-aid-check.js",
  "reserve-development-check.js",
  "visitor-building-material-route-check.js",
  "surplus-exchange-building-check.js",
  "building-operation-cooldown-check.js",
  "visitor-recruitment-check.js",
  "visitor-reception-check.js",
  "visitor-facility-guidance-check.js",
  "chapter-visitor-recruitment-check.js",
  "chapter-visitor-carryover-regression-check.js",
  "share-source-routing-check.js",
  "share-reward-check.js",
  "animal-source-ledger-v2-check.js",
  "facility-operating-impact-check.js",
  "chapter-balance-check.js",
  "chapter-mid-difficulty-check.js",
  "neighbor-exchange-archery-check.js",
  "world-event-idle-check.js",
  "sticky-table-header-check.js"
];

supplementalChecks.forEach((target) => run([path.join("scripts", target)], target));

run([path.join("server", "wild-api", "test.js")], "wild-api real friend/world trade check");
run([path.join("scripts", "wechat-release-preflight-check.js")], "wechat-release-preflight-check.js");

if (failedChecks.length) {
  console.error(`full regression failed (${failedChecks.length}): ${failedChecks.join(", ")}`);
  process.exit(1);
}
console.log(`full regression check ok (${runtimeFiles.length} syntax files, 34 current checks, ${supplementalChecks.length} supplemental checks, API and release preflight)`);
