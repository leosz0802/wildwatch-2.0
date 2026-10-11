const assert = require("assert");
const { createReserveState } = require("../js/world");
const {
  CLUE_ITEMS,
  ensureExtinctionClueTask,
  extinctionClueVisibleDrops,
  collectExtinctionClue,
  normalizeExtinctionClueTask
} = require("../js/extinctionClueTask");

function snapshotEconomy(reserve) {
  return JSON.stringify({
    fund: reserve.fund,
    visitors: reserve.visitors,
    supplies: reserve.supplies,
    inventory: reserve.inventory,
    ecology: reserve.ecology
  });
}

const reserve = createReserveState();
assert.strictEqual(extinctionClueVisibleDrops(reserve).length, 0, "第1章不应生成灭绝线索");
reserve.progression.stage = 3;
reserve.progression.displayChapter = 3;
const before = snapshotEconomy(reserve);
const task = ensureExtinctionClueTask(reserve);
assert.strictEqual(task.status, "active");
assert.strictEqual(task.drops.length, CLUE_ITEMS.length);
assert.strictEqual(extinctionClueVisibleDrops(reserve).length, 3);

CLUE_ITEMS.forEach((item, index) => {
  const result = collectExtinctionClue(reserve, item.id);
  assert.strictEqual(result.ok, true, `第${index + 1}条线索应可收集`);
  assert.strictEqual(result.progress, `${index + 1}/${CLUE_ITEMS.length}`);
  assert.strictEqual(collectExtinctionClue(reserve, item.id).ok, false, "重复点击不应重复结算");
});

assert.strictEqual(reserve.extinctionClueTask.status, "completed");
assert.strictEqual(extinctionClueVisibleDrops(reserve).length, 0);
assert.strictEqual(snapshotEconomy(reserve), before, "灭绝线索不应修改基金、游客、动物或物资");

const restored = normalizeExtinctionClueTask(JSON.parse(JSON.stringify(reserve.extinctionClueTask)));
assert.strictEqual(restored.status, "completed", "存档恢复后任务应保持完成");
assert.strictEqual(restored.collectedIds.length, CLUE_ITEMS.length);
console.log("extinction clue task check passed");
