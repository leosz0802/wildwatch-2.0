const assert = require('node:assert/strict');
const { createCharacter } = require('../js/storage');
const {
  CHAPTERS,
  chapterDefinition,
  normalizeChapterRescue,
  rescuePointTarget
} = (() => {
  const { CHAPTERS } = require('../js/animalWorld');
  return Object.assign({ CHAPTERS }, require('../js/chapterRescueSystem'));
})();

const rows = [];
for (let chapter = 1; chapter <= 20; chapter += 1) {
  const reserve = createCharacter(null, `章节解救审计-${chapter}`).world.reserve;
  const state = normalizeChapterRescue(reserve, chapter, { fresh: true });
  const targets = state.targets || [];
  const targetIds = new Set();
  const speciesIds = new Set();
  const itemIds = new Set();
  targets.forEach((record) => {
    assert(record.targetId && !targetIds.has(record.targetId), `chapter ${chapter}: duplicate target id`);
    assert(record.speciesId && !speciesIds.has(record.speciesId), `chapter ${chapter}: duplicate species target`);
    assert.equal(record.requiredItems.length, 1, `chapter ${chapter}: every animal must use exactly one rescue item`);
    assert.equal(record.pointTarget, 12, `chapter ${chapter}: chapter rescue target must be 12 points`);
    assert.deepEqual(record.pointProgress, {}, `chapter ${chapter}: fresh animal starts with its own empty point ledger`);
    assert.equal(rescuePointTarget(record, record.requiredItems[0]), 12);
    targetIds.add(record.targetId);
    speciesIds.add(record.speciesId);
    itemIds.add(record.requiredItems[0]);
  });
  // The legacy mirror can contain aliases, but only the canonical target list
  // is allowed to drive chapter progression.
  assert.equal(targets.length, chapterDefinition(chapter).targets.length);
  rows.push({ chapter, title: CHAPTERS[chapter - 1].title, targets: targets.map((r) => r.speciesName), items: [...itemIds] });
}

console.log(JSON.stringify({ ok: true, chapters: rows }, null, 2));
