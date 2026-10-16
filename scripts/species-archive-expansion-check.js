const assert = require("assert");
const { createReserveState } = require("../js/world");
const {
  ARCHIVE_CHAPTERS,
  ARCHIVE_ITEMS,
  RECIPES,
  archiveItemsForChapter,
  recordSpeciesArchiveItem,
  synthesizeSpeciesArchive,
  sellSpeciesArchive
} = require("../js/speciesArchiveBox");
const {
  ensureExtinctionClueTask,
  collectExtinctionClue,
  presentExtinctionClue,
  clueItemsForChapter,
  tickExtinctionClueDrops
} = require("../js/extinctionClueTask");
const { resolveMaterialExploration, ARCHIVE_EXPLORATION_GOODS, EXPLORATION_GOODS } = require("../js/materialExploration");

assert.strictEqual(ARCHIVE_CHAPTERS.length, 9, "档案仍是9个物种");
assert.strictEqual(ARCHIVE_CHAPTERS.filter((entry) => entry.chapter === 2).map((entry) => entry.speciesId).join(","), "white_sturgeon,passenger_pigeon,great_auk", "第2章应能收集白鲟、旅鸽、大海雀");
assert.strictEqual(ARCHIVE_CHAPTERS[ARCHIVE_CHAPTERS.length - 1].chapter, 8, "最后一组档案在第8章");
assert.strictEqual(ARCHIVE_ITEMS.length, 27, "每个物种三件线索，共27件");
assert.strictEqual(new Set(ARCHIVE_ITEMS.map((item) => item.id)).size, ARCHIVE_ITEMS.length, "档案线索 ID 必须唯一");

const reserve = createReserveState();
const chapters = [2, 3, 4, 5, 6, 7, 8];
chapters.forEach((chapter) => {
  reserve.progression.stage = chapter;
  reserve.progression.displayChapter = chapter;
  const task = ensureExtinctionClueTask(reserve);
  const sets = ARCHIVE_CHAPTERS.filter((entry) => entry.chapter === chapter);
  const items = archiveItemsForChapter(chapter);
  assert.strictEqual(items.length, sets.length * 3, `第${chapter}章线索数量应等于物种数乘3`);
  assert.strictEqual(task.drops.length, 0, `第${chapter}章线索改为轮流出现，不会一次铺满`);
  items.forEach((item) => {
    assert.strictEqual(collectExtinctionClue(reserve, item.id).ok, false, `第${chapter}章未出现的线索不能直接拾取`);
    const shown = presentExtinctionClue(reserve, item.id);
    assert.ok(shown && shown.id === item.id, `第${chapter}章应能把${item.name}放到沙盘上`);
    const result = collectExtinctionClue(reserve, item.id);
    assert.strictEqual(result.ok, true, `第${chapter}章地图线索应可拾取`);
    recordSpeciesArchiveItem(reserve, item.id);
  });
  sets.forEach((set) => {
    const recipe = RECIPES.find((entry) => entry.speciesId === set.speciesId);
    const synthesized = synthesizeSpeciesArchive(reserve, recipe);
    assert.strictEqual(synthesized.ok, true, `第${chapter}章${set.speciesName}档案应可合成`);
    assert.strictEqual(synthesized.recipe.id, recipe.id, `合成必须对准选中的${set.speciesName}，不能合成同章的另一份`);
    const sale = sellSpeciesArchive(reserve, recipe);
    assert.strictEqual(sale.ok, true, `第${chapter}章${set.speciesName}档案应可出售`);
    assert.strictEqual(sale.value, recipe.saleValue, `第${chapter}章${set.speciesName}售价应使用自己的配方值`);
    assert.strictEqual(sellSpeciesArchive(reserve, recipe).ok, false, `第${chapter}章${set.speciesName}不能重复出售`);
  });
});

const target = ARCHIVE_EXPLORATION_GOODS.find((item) => item.chapter === 8);
const animalReserve = createReserveState();
animalReserve.progression.level = 7;
const animalResult = resolveMaterialExploration(animalReserve, [], target.id, () => 0.99, 6);
assert(!(animalResult.reward && animalResult.reward.id === target.id), "动物探索不再发放档案线索");
const randomResult = resolveMaterialExploration(animalReserve, [], "", () => 0.99, 6);
if (randomResult.reward) {
  assert(EXPLORATION_GOODS.some((item) => item.id === randomResult.reward.id), "动物探索只发放科研与执法样本");
}
// Use a fresh save for the visibility check. The loop above intentionally
// completes chapter 8, so reusing that reserve would correctly reject a
// second pickup as a duplicate rather than test map spawning.
const visibilityReserve = createReserveState();
visibilityReserve.progression.stage = 8;
visibilityReserve.progression.displayChapter = 8;
const mapItem = archiveItemsForChapter(8)[0];
ensureExtinctionClueTask(visibilityReserve);
assert.strictEqual(collectExtinctionClue(visibilityReserve, mapItem.id).ok, false, "没有出现在沙盘上的线索不能拾取");
presentExtinctionClue(visibilityReserve, mapItem.id);
const picked = collectExtinctionClue(visibilityReserve, mapItem.id);
assert.strictEqual(picked.ok, true, "档案线索仍可在沙盘拾取");
[9, 10, 11].forEach((chapter) => {
  const later = createReserveState();
  later.progression.stage = chapter;
  later.progression.displayChapter = chapter;
  const task = ensureExtinctionClueTask(later);
  assert.strictEqual(task.status, "active", `第${chapter}章继续刷新档案线索`);
  assert.strictEqual(task.chapter, chapter, `第${chapter}章掉落任务不能被收成第8章`);
  const items = clueItemsForChapter(chapter);
  assert.strictEqual(items.length, ARCHIVE_ITEMS.length, `第${chapter}章可以掉落全部档案物资`);
  recordSpeciesArchiveItem(later, items[0].id);
  later.extinctionClueTask.drops = [];
  later.extinctionClueTask.nextDropAt = 1000;
  later.extinctionClueTask.dropCursor = 0;
  tickExtinctionClueDrops(later, 1000, () => 0);
  assert.ok(later.extinctionClueTask.drops[0], `第${chapter}章到点应掉落一条档案物资`);
  assert.notStrictEqual(later.extinctionClueTask.drops[0].id, items[0].id, `第${chapter}章已有的物资不排在仍缺少的物资前面`);
});
const { Game } = require("../js/game");
const freshGame = new Game();
freshGame.stopLoop();
freshGame.render = () => {};
freshGame.ensurePlayablePrologueGuardian();
const fresh = freshGame.state.world.reserve;
const freshChapter = Math.max(1, Math.round(Number(fresh.progression.displayChapter || fresh.progression.stage) || 1));
const freshCollected = ARCHIVE_ITEMS.reduce((sum, item) => sum + (Number((fresh.speciesArchiveBox.collected || {})[item.id]) || 0), 0);
assert.strictEqual(freshChapter, 1, "正常开局必须停在第1章");
assert.strictEqual(freshCollected, 0, "正常开局不得预置档案物资");
console.log("species archive expansion check passed");
