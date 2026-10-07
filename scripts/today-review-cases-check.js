"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");

const SUITES = [
  {
    group: "A 射箭入账",
    cases: ["A01", "A02", "A05"],
    file: "archery-score-regression-check.js"
  },
  {
    group: "A 射箭入账",
    cases: ["A07"],
    file: "archery-angle-score-check.js"
  },
  {
    group: "A 射箭入账",
    cases: ["A03", "A04"],
    file: "rescue-point-feedback-check.js"
  },
  {
    group: "A 射箭入账",
    cases: ["A08"],
    file: "harsh-nature-archery-check.js"
  },
  {
    group: "A 射箭入账",
    cases: ["A08"],
    file: "neighbor-exchange-archery-check.js"
  },
  {
    group: "B 任务不可点",
    cases: ["B02", "B03", "B04", "B05", "B10"],
    file: "map-marker-affordance-check.js"
  },
  {
    group: "B 任务不可点",
    cases: ["B06"],
    file: "metric-improvement-task-check.js"
  },
  {
    group: "B 任务不可点",
    cases: ["B07"],
    file: "chapter-water-recovery-check.js"
  },
  {
    group: "B 任务不可点",
    cases: ["B08"],
    file: "navigation-routing-check.js"
  },
  {
    group: "B 任务不可点",
    cases: ["B12"],
    file: "ios-ui-consistency-check.js"
  },
  {
    group: "C 界面优化",
    cases: ["C02"],
    file: "chapter-story-check.js"
  },
  {
    group: "C 界面优化",
    cases: ["C03"],
    file: "chapter-gate-order-check.js"
  },
  {
    group: "C 界面优化",
    cases: ["C08"],
    file: "visitor-reception-check.js"
  },
  {
    group: "C 界面优化",
    cases: ["C08"],
    file: "visitor-recruitment-check.js"
  },
  {
    group: "C 界面优化",
    cases: ["C09"],
    file: "dice-ui-check.js"
  },
  {
    group: "C 界面优化",
    cases: ["C10"],
    file: "share-reward-check.js"
  },
  {
    group: "C 界面优化",
    cases: ["C10"],
    file: "share-source-routing-check.js"
  },
  {
    group: "C 界面优化",
    cases: ["C11"],
    file: "world-event-visual-check.js"
  },
  {
    group: "C 界面优化",
    cases: ["C12"],
    file: "ui-layout-check.js"
  },
  {
    group: "C 界面优化",
    cases: ["C07"],
    file: "pace-economy-check.js"
  },
  {
    group: "D 基金出售限额",
    cases: ["D01", "D02", "D03", "D04", "D05", "D06", "D07", "D08"],
    file: "today-sell-fund-review-check.js"
  },
  {
    group: "D 基金出售限额",
    cases: ["D01", "D02", "D04"],
    file: "sell-fund-cap-check.js"
  },
  {
    group: "D 基金出售限额",
    cases: ["D03", "D05"],
    file: "single-sale-flow-check.js"
  }
];

const MANUAL = [
  "A06 飞行中关闭不得入账",
  "A09 鸿蒙瞄准指针持续摆动",
  "A10 结算后任务卡立即显示新总分",
  "B01 鸿蒙切页后地图满不透明且可点",
  "B07 鸿蒙点「执行修复」必须立刻结算",
  "B09 弹窗蒙层挡住时地图不可点，关闭后恢复",
  "B11 底栏往返后沙盘仍可点",
  "C01 鸿蒙不做整屏半透明淡入",
  "C06 射箭/事件文案无百分比公式"
];

const failed = [];

function run(suite) {
  const result = spawnSync(process.execPath, [path.join("scripts", suite.file)], {
    cwd: root,
    encoding: "utf8",
    env: Object.assign({}, process.env, { NODE_NO_WARNINGS: "1" })
  });
  const ok = result.status === 0 && !result.signal;
  const label = `${suite.cases.join("/")} ${suite.file}`;
  process.stdout.write(`${ok ? "ok" : "fail"} ${suite.group} ${label}\n`);
  if (!ok) {
    process.stdout.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    failed.push(label);
  }
}

process.stdout.write("today review cases\n");
SUITES.forEach(run);
process.stdout.write("\nmanual still required:\n");
MANUAL.forEach((item) => process.stdout.write(`- ${item}\n`));

if (failed.length) {
  process.stdout.write(`\nfailed ${failed.length}: ${failed.join(" | ")}\n`);
  process.exit(1);
}
process.stdout.write("\ntoday review auto cases ok\n");
