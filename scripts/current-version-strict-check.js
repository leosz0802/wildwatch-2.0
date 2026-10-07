"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");

const SUITES = [
  {
    group: "剧情",
    cases: ["S01 章节过场", "S02 特别任务", "S03 生态叙事", "S04 纪录片口径", "S05 任务与剧情对齐"],
    files: [
      "chapter-story-check.js",
      "chapter-special-check.js",
      "ecology-narrative-check.js",
      "documentary-narrative-check.js",
      "task-story-resource-match-check.js",
      "story-activation-check.js"
    ]
  },
  {
    group: "任务",
    cases: ["T01 章节目标", "T02 地图可点", "T03 单选路径", "T04 非线性", "T05 死锁", "T06 完成反馈"],
    files: [
      "chapter-goal-progress-check.js",
      "chapter-goals-check.js",
      "chapter-core-only-gate-check.js",
      "chapter-gate-order-check.js",
      "map-marker-affordance-check.js",
      "single-choice-play-path-check.js",
      "nonlinear-task-routing-check.js",
      "mixed-task-deadlock-check.js",
      "task-completion-feedback-check.js",
      "sandbox-task-cadence-check.js"
    ]
  },
  {
    group: "数值",
    cases: ["N01 本章账本", "N02 游客继承", "N03 章节紧平衡", "N04 基金紧平衡", "N05 出售限额", "N06 生态变化"],
    files: [
      "today-bug-and-totals-check.js",
      "chapter-animal-hud-check.js",
      "animal-total-snap-check.js",
      "chapter-visitor-carryover-regression-check.js",
      "visitor-reception-check.js",
      "chapter-tight-balance-check.js",
      "fund-tight-balance-check.js",
      "today-sell-fund-review-check.js",
      "sell-fund-cap-check.js",
      "ecology-consistency-check.js",
      "pace-economy-check.js"
    ]
  },
  {
    group: "射箭",
    cases: ["A01 入账", "A02 角度", "A03 解救分", "A04 灾害", "A05 邻区交换", "A06 弹窗丢失仍入账", "A07 连点不退出"],
    files: [
      "archery-score-regression-check.js",
      "archery-angle-score-check.js",
      "rescue-point-feedback-check.js",
      "harsh-nature-archery-check.js",
      "neighbor-exchange-archery-check.js",
      "archery-ledger-commit-check.js",
      "archery-mash-dismiss-check.js",
      "archery-android-autosettle-check.js",
      "archery-confirm-stay-check.js",
      "archery-vivo-confirm-check.js"
    ]
  },
  {
    group: "掷骰",
    cases: ["D01 骰面与按钮", "D02 探索结算"],
    files: [
      "dice-ui-check.js",
      "material-exploration-check.js"
    ]
  },
  {
    group: "地图",
    cases: ["M01 标记可点", "M02 事件外观", "M03 解救点", "M04 游客沙盘"],
    files: [
      "map-marker-affordance-check.js",
      "world-event-visual-check.js",
      "chapter-rescue-map-regression-check.js",
      "visitor-incident-check.js",
      "map-task-story-dedupe-check.js"
    ]
  },
  {
    group: "三端",
    cases: ["P01 画布硬化", "P02 切页淡入", "P03 iOS 版式", "P04 三端矩阵", "P05 触摸矩阵", "P06 弹层触摸"],
    files: [
      "device-canvas-hardening-check.js",
      "channel-screen-fade-check.js",
      "ios-ui-consistency-check.js",
      "platform-matrix-strict-check.js",
      "platform-touch-matrix-check.js",
      "settlement-crisis-touch-check.js",
      "overlay-modal-touch-check.js",
      "harmony-overlay-footer-check.js",
      "settlement-pending-escape-check.js"
    ]
  }
];

const MANUAL = [
  "真机 iOS：飞行中关闭射箭应完成一次结算并入账",
  "真机 鸿蒙：瞄准指针持续摆动，切页后地图满不透明且可点",
  "真机 Android：无整屏残影，底栏往返后沙盘仍可点",
  "真机三端：弹窗蒙层挡住时地图不可点，关闭后恢复",
  "文案：射箭/事件不写百分比公式"
];

const failed = [];
const seen = new Set();

function runFile(file, group) {
  if (seen.has(file)) return;
  seen.add(file);
  const result = spawnSync(process.execPath, [path.join("scripts", file)], {
    cwd: root,
    encoding: "utf8",
    env: Object.assign({}, process.env, { NODE_NO_WARNINGS: "1" })
  });
  const ok = result.status === 0 && !result.signal;
  process.stdout.write(`${ok ? "ok" : "fail"} ${group} ${file}\n`);
  if (!ok) {
    process.stdout.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    failed.push(`${group} ${file}`);
  }
}

process.stdout.write("current version strict cases\n");
SUITES.forEach((suite) => {
  process.stdout.write(`\n[${suite.group}] ${suite.cases.join(" · ")}\n`);
  suite.files.forEach((file) => runFile(file, suite.group));
});

process.stdout.write("\nmanual still required:\n");
MANUAL.forEach((item) => process.stdout.write(`- ${item}\n`));

if (failed.length) {
  process.stdout.write(`\nfailed ${failed.length}: ${failed.join(" | ")}\n`);
  process.exit(1);
}
process.stdout.write(`\ncurrent version strict auto cases ok (${seen.size} scripts)\n`);
