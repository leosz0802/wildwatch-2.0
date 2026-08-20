const assert = require("assert");
const { createReserveState } = require("../js/world");
const {
  MASTERY_THRESHOLDS,
  normalizeMastery,
  awardMastery,
  awardKeyActionMastery,
  chooseMasteryBranch,
  masteryView
} = require("../js/guardianCycle");

assert.deepStrictEqual(MASTERY_THRESHOLDS, [0, 60, 150, 280, 450, 700, 1000, 1400, 1900, 2500]);
const reserve = createReserveState();
reserve.mastery = normalizeMastery(reserve.mastery);
for (let i = 0; i < 23; i += 1) awardKeyActionMastery(reserve, "houndScout");
assert.strictEqual(reserve.mastery.patrol.xp, 460, "关键行动必须稳定获得20经验");
assert.strictEqual(reserve.mastery.patrol.level, 5, "450经验应达到Lv.5");
assert.strictEqual(reserve.mastery.patrol.pendingChoice, 5, "Lv.5必须等待职业分支选择");
const branch = chooseMasteryBranch(reserve, "patrol", 5, "tracking");
assert(branch.ok && /痕迹/.test(branch.branch.unlock), "专长分支必须解锁交互或地图能力，而非纯数值");
for (let i = 0; i < 12; i += 1) awardMastery(reserve, "relationship", 5, "动物互动");
assert.strictEqual(reserve.mastery.relationship.xp, 60, "12次普通动物互动应累计60经验");
assert.strictEqual(reserve.mastery.relationship.level, 2);
const view = masteryView(reserve);
assert.strictEqual(view.length, 3, "玩家只需要理解三条守护专长");
assert(view.every((track) => track.progress >= 0 && track.progress <= 1));

console.log("guardian mastery check ok");
