const assert = require("assert");
const { createReserveState } = require("../js/world");
const {
  ARCHIVE_CHAPTERS,
  ARCHIVE_ITEMS,
  archiveItemsForChapter,
  recordSpeciesArchiveItem,
  recordSpeciesArchiveFromMaterial,
  speciesArchiveView,
  synthesizeSpeciesArchive
} = require("../js/speciesArchiveBox");
const {
  ensureExtinctionClueTask,
  collectExtinctionClue
} = require("../js/extinctionClueTask");
const { resolveMaterialExploration, ARCHIVE_EXPLORATION_GOODS } = require("../js/materialExploration");

assert.strictEqual(ARCHIVE_CHAPTERS.length, 9, "第3～11章应各有一组档案");
assert.strictEqual(ARCHIVE_ITEMS.length, 27, "每章三件线索，共27件");
assert.strictEqual(new Set(ARCHIVE_ITEMS.map((item) => item.id)).size, ARCHIVE_ITEMS.length, "档案线索 ID 必须唯一");

const reserve = createReserveState();
for (let chapter = 3; chapter <= 11; chapter += 1) {
  reserve.progression.stage = chapter;
  reserve.progression.displayChapter = chapter;
  const task = ensureExtinctionClueTask(reserve);
  const items = archiveItemsForChapter(chapter);
  assert.strictEqual(task.drops.length, 3, `第${chapter}章应生成3个沙盘线索`);
  items.forEach((item) => {
    const result = collectExtinctionClue(reserve, item.id);
    assert.strictEqual(result.ok, true, `第${chapter}章地图线索应可拾取`);
    recordSpeciesArchiveItem(reserve, item.id);
  });
  assert.strictEqual(speciesArchiveView(reserve).canSynthesize, true, `第${chapter}章收齐后应可合成`);
  const synthesized = synthesizeSpeciesArchive(reserve, chapter);
  assert.strictEqual(synthesized.ok, true, `第${chapter}章档案应可合成`);
  assert.strictEqual(synthesized.recipe.chapter, chapter);
}

const target = ARCHIVE_EXPLORATION_GOODS.find((item) => item.chapter === 11);
const animalReserve = createReserveState();
animalReserve.progression.level = 7;
const animalResult = resolveMaterialExploration(animalReserve, [], target.id, () => 0.99, 6);
assert(animalResult.reward && animalResult.reward.id === target.id, "动物探索应能直接获得档案线索");
recordSpeciesArchiveItem(animalReserve, animalResult.reward.id);
const reused = recordSpeciesArchiveFromMaterial(animalReserve, "researchSample", 11);
assert(reused.item && reused.item.chapter === 11, "旧研究样本应能复用为当前章节档案线索");
console.log("species archive expansion check passed");
