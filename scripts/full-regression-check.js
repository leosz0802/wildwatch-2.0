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
run(["scripts/harmony-habitat-touch-check.js"], "HarmonyOS physical-pixel taps execute water and grass repair tasks");
run(["scripts/harmony-archery-touch-check.js"], "HarmonyOS archery drag stays in modal and stalled arrow recovers");
run(["scripts/archery-mash-dismiss-check.js"], "archery play-area and later-handle mashes do not leave the archery modal");
run(["scripts/visitor-metric-touch-check.js"], "visitor metric detail close and recruit stay tappable on HarmonyOS");
run(["scripts/settlement-crisis-touch-check.js"], "crisis settlement close and hound-scout stay tappable above the sandbox nav");
run(["scripts/overlay-modal-touch-check.js"], "settlement, metric, patrol, story and purchase overlays stay tappable above the sandbox nav");
run(["scripts/harmony-overlay-footer-check.js"], "HarmonyOS settlement, supply and archery footers catch taps that land on the nav arc");
run(["scripts/harmony-android-purchase-action-check.js"], "HarmonyOS/Android purchase and task actions survive pointer fallback");
run(["scripts/materials-scroll-purchase-check.js"], "materials page swipe must scroll and not auto-open purchase");
run(["scripts/harmony-supply-confirmation-check.js"], "HarmonyOS single and batch supply settlement survive physical-only touch reports");
run(["scripts/settlement-pending-escape-check.js"], "unfinished settlement toasts, never locks, and always returns to sandbox");
run(["scripts/cross-platform-archery-touch-check.js"], "iOS/Android logical input and Android/HarmonyOS physical archery touch regression");
run(["scripts/platform-touch-matrix-check.js"], "iOS/Android/HarmonyOS official clientX and physical touch matrix");
run(["scripts/mail-entry-interaction-check.js"], "mail entry render, touch scrolling and sandbox recovery across 20 chapters");
run(["scripts/chapter-population-carryover-check.js"], "20 cumulative population gates and cross-chapter preservation");
run(["scripts/recurring-rescue-task-routing-check.js"], "recurring rescue collection and real button routing regression");
run(["scripts/rescue-point-feedback-check.js"], "rescue cumulative points and count-up feedback regression");
run(["scripts/survival-animal-sources-check.js"], "survival impacts and actual animal sources across 20 chapters");
run(["scripts/nonlinear-task-routing-check.js"], "nonlinear task routing and independent rescue gate regression");
run(["scripts/user-play-path-check.js"], "linear, jump and disruptive user play paths stay playable");
run(["scripts/single-choice-play-path-check.js"], "single-choice tasks: linear, jump and disruptive play");
run(["scripts/mixed-task-deadlock-check.js"], "mixed rescue, visitor/disaster, restart and shared-material deadlock regression");
run(["scripts/disruptive-robustness-check.js"], "disruptive play without story or task progression stays healthy");
run(["scripts/chapter-goal-progress-check.js"], "20 chapters: executable cards, no task lock deadlock");
run(["scripts/visitor-incident-check.js"], "20 chapters: visitor sandbox keeps only the graphic reminder");
run(["scripts/chapter-gate-order-check.js"], "all chapter gates in forward/reverse rescue order");
run(["scripts/chapter-core-only-gate-check.js"], "chapter advance only checks species, animals, visitors, rare auction");
run(["scripts/chapter-required-unlock-check.js"], "required chapter animals can unlock and remain after rescue");
run(["scripts/chapter-15-16-rescue-gate-check.js"], "chapters 15-16 require otter/pelican rescue before promotion");
run(["scripts/chapter-core-latch-check.js"], "chapter core goals latch after first completion");
run(["scripts/chapter-story-check.js"], "last core task notice, chapter cutscene, then enter next chapter");
run(["scripts/sandbox-task-cadence-check.js"], "sandbox task cap, early 2-minute gap, later 3-minute gap");
run(["scripts/disaster-online-drain-check.js"], "untreated disasters drain visitors and animals 1% per in-game minute");
run(["scripts/harsh-nature-archery-check.js"], "fire/flood/disease archery always deals scaled negative damage");
run(["scripts/non-rescue-archery-result-check.js"], "non-rescue archery result card stays visible and settles once");
run(["scripts/animal-total-snap-check.js"], "animal total does not snap 120↔80 from captive reseed");
run(["scripts/chapter-animal-hud-check.js"], "chapter 1 animal HUD starts at 0 and rescue stays under 58");
run(["scripts/ecology-consistency-check.js"], "idle animal drift stays slow, tasks keep larger migration");
run(["scripts/core-carrying-balance-phase-two-check.js"], "phase two carrying balance: smooth thresholds, visitor cap, ecology score and chapter animal sources");
run(["scripts/archery-angle-score-check.js"], "archery aim angle maps to a deterministic 1–6 score");
run(["scripts/archery-score-regression-check.js"], "live archery score is written to the animal-owned ledger");
run(["scripts/metric-number-format-check.js"], "metric values round to at most one decimal in the UI");
run(["scripts/archery-ledger-commit-check.js"], "archery ledger survives HarmonyOS modal loss and does not double-count");
run(["scripts/archery-persistence-check.js"], "HarmonyOS restart restores the last archery score and rescue progress");
run(["scripts/archery-reopen-persistence-check.js"], "latest archery score survives reserve cloning and task re-entry");
run(["scripts/archery-multi-round-reentry-check.js"], "multi-round archery survives close, reopen and restart without losing cumulative score");
run(["scripts/archery-generic-reentry-check.js"], "generic Harmony/Android material entry restores the unfinished rescue archery ledger");
run(["scripts/harmony-archery-settlement-recovery-check.js"], "HarmonyOS modal-loss settlement and item-only archery ledger recovery");
run(["scripts/archery-android-autosettle-check.js"], "Android rescue archery auto-settles each round and does not freeze the rescue card");
run(["scripts/archery-confirm-stay-check.js"], "archery and dice stay on 确认得分 until the button is pressed");
run(["scripts/android-three-round-settlement-check.js"], "Android three archery rounds and three dice rounds keep confirmation and clear all locks");
run(["scripts/android-intl-fallback-check.js"], "Android/HarmonyOS hound scout settles when Intl is unavailable");
run(["scripts/archery-vivo-confirm-check.js"], "vivo confirm stays tappable and persists visible scores");
run(["scripts/archery-settlement-unlock-check.js"], "Android archery settlement closes immediately and does not lock later screens");
run(["scripts/chapter-rescue-no-repeat-check.js"], "chapter targets excluded from poaching, duplicate save recovery and restart");
run(["scripts/chapter6-auction-promotion-check.js"], "chapter 6 auction settles before promotion and survives re-entry");

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
  "sandbox-late-herd-rotation-check.js",
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
  "sandbox-animal-select-check.js",
  "world-hound-patrol-check.js",
  "ios-hound-patrol-overlay-check.js",
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
  "pace-economy-check.js",
  "startup-performance-check.js",
  "relationship-notification-check.js",
  "league-ranking-check.js",
  "world-friend-detail-consistency-check.js",
  "world-own-detail-consistency-check.js",
  "reserve-valuation-check.js",
  "wechat-friend-authorize-check.js",
  "world-friend-identity-check.js",
  "cloud-service-check.js",
  "cache-first-startup-check.js",
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
  "collection-task-clarity-check.js",
  "navigation-routing-check.js",
  "channel-screen-fade-check.js",
  "device-canvas-hardening-check.js",
  "button-coordinate-alignment-check.js",
  "today-bug-and-totals-check.js",
  "ambient-loop-check.js",
  "flow-return-check.js",
  "impact-settlement-check.js",
  "dice-ui-check.js",
  "letter-inbox-check.js",
  "letter-inbox-regression-check.js",
  "daily-event-mail-entry-check.js",
  "rescue-daily-entry-regression-check.js",
  "daily-partial-complete-check.js",
  "friend-letter-check.js",
  "animal-letter-system-check.js",
  "fund-ledger-persistence-check.js",
  "ledger-story-task-check.js",
  "chapter-theme-species-check.js",
  "late-chapter-theme-hud-check.js",
  "chapter-story-scope-check.js",
  "task-story-alignment-check.js",
  "chapter-theme-task-check.js",
  "chapter-11-share-once-check.js",
  "chapter-theme-mid-chapters-check.js",
  "all-chapters-habitat-recurrence-check.js",
  "first-return-hook-check.js",
  "chapter-one-goal-focus-check.js",
  "task-category-whitelist-check.js",
  "chapter-special-check.js",
  "friend-aid-check.js",
  "friend-contract-check.js",
  "friend-contract-history-scroll-check.js",
  "reserve-development-check.js",
  "building-pair-gate-check.js",
  "building-strategy-phase-three-check.js",
  "visitor-building-material-route-check.js",
  "surplus-exchange-building-check.js",
  "building-operation-cooldown-check.js",
  "visitor-recruitment-check.js",
  "visitor-reception-check.js",
  "visitor-facility-guidance-check.js",
  "visitor-building-attendance-check.js",
  "supply-quantity-picker-check.js",
  "minigame-favorite-check.js",
  "chapter-visitor-recruitment-check.js",
  "chapter-visitor-carryover-regression-check.js",
  "share-source-routing-check.js",
  "share-reward-check.js",
  "animal-source-ledger-v2-check.js",
  "facility-operating-impact-check.js",
  "station-facility-use-check.js",
  "facility-use-guidance-once-check.js",
  "rare-animal-mvp-check.js",
  "chapter-animal-hud-check.js",
  "chapter-balance-check.js",
  "chapter-tight-balance-check.js",
  "fund-tight-balance-check.js",
  "sell-fund-cap-check.js",
  "today-sell-fund-review-check.js",
  "platform-matrix-strict-check.js",
  "chapter-mid-difficulty-check.js",
  "chapter-water-recovery-check.js",
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
console.log(`full regression check ok (${runtimeFiles.length} syntax files, 37 current checks, ${supplementalChecks.length} supplemental checks, API and release preflight)`);
