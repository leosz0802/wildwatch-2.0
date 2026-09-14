const assert = require("assert");
const {
  normalizeChapterRescue,
  nextRescueTask,
  addRescueItem,
  rescueItemCount,
  canRescueAnimal,
  rescueAnimal,
  chapterRescueSummary,
  rescueStoryFor
} = require("../js/chapterRescueSystem");
const { resolveMaterialExploration } = require("../js/materialExploration");

const reserve = { progression: { level: 1, totalActions: 0 }, ecology: { herbivores: { deer: 80 } } };
const state = normalizeChapterRescue(reserve, 1, { fresh: true });
assert.deepStrictEqual(state.starter, ["deer"]);
assert.strictEqual(state.captive.length, 2);
assert.strictEqual(nextRescueTask(reserve, 1).status, "captive");
const first = nextRescueTask(reserve, 1);
assert.ok(rescueStoryFor(first).paragraphs.length >= 3);
first.requiredItems.forEach((id) => addRescueItem(reserve, id));
assert.ok(first.requiredItems.every((id) => rescueItemCount(reserve, id) === 1));
assert.ok(canRescueAnimal(reserve, first.speciesId));
assert.strictEqual(rescueAnimal(reserve, first.speciesId).ok, true);
assert.strictEqual(chapterRescueSummary(reserve, 1).rescued, 1);

const collectionReserve = { progression: { level: 3 } };
for (const expected of [6, 12, 18]) {
  const partial = resolveMaterialExploration(collectionReserve, [], "rescue_reed_cord", () => 0, 6, null);
  assert.strictEqual(partial.collectionProgress.current, expected);
  assert.strictEqual(partial.collectionProgress.required, 20);
  assert.strictEqual(partial.reward, null);
}
const found = resolveMaterialExploration(collectionReserve, [], "rescue_reed_cord", () => 0, 6, null);
assert.strictEqual(found.reward.id, "rescue_reed_cord");
assert.strictEqual(found.reward.amount, 1);
console.log("chapter-rescue-system-check: ok");
