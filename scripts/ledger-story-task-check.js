const assert = require("assert");
const { createReserveState } = require("../js/world");
const { eventStepGuidance } = require("../js/storyGuidance");
const { advanceLedgerSampleHandover } = require("../js/simulator");
const { resolveGoals } = require("../js/goalSystem");

const reserve = createReserveState();
reserve.progression = Object.assign({}, reserve.progression, {
  level: 3,
  totalActions: 40,
  totalMeaningfulActions: 40
});
reserve.progression.objectives = [{ id: "chapterStory", label: "阶段剧情", current: 4, target: 7, complete: false }];
reserve.eventChain = {
  id: "seven_day_guardian",
  branch: "ledger",
  branchTitle: "补给线",
  chapterLevel: 3,
  step: 4,
  length: 7,
  completed: false,
  lastAdvancedAction: 36
};
reserve.eventChain.next = { title: "样本的去向", recommendedAction: "antiPoacher", validActions: ["antiPoacher"] };

const staleState = { world: { reserve } };
const goals = resolveGoals(staleState, null, "ledger-task");
assert.strictEqual(goals.active.primary.recommendedAction, "salvage", "旧存档的样本任务不得保留驱赶偷猎入口");

assert.strictEqual(eventStepGuidance(reserve, 5, "ledger").recommendedAction, "salvage", "样本去向不得推荐驱赶偷猎");
assert.deepStrictEqual(eventStepGuidance(reserve, 5, "ledger").validActions, ["salvage"], "样本去向只允许出售/移交入口");
assert.strictEqual(advanceLedgerSampleHandover(reserve, 12), true, "样本移交应推进补给线剧情");
assert.strictEqual(reserve.eventChain.step, 5, "样本移交后剧情必须从4/7推进到5/7");
assert.strictEqual(reserve.eventChain.action, "salvage", "剧情记录必须保存为样本移交");
assert.strictEqual(advanceLedgerSampleHandover(reserve, 12), false, "同一移交不能重复推进剧情");

console.log("ledger story task check ok");
