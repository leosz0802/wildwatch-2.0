const assert = require("assert");
const { CHAPTERS, SPECIES_DB, getUnlockedSpecies } = require("../js/animalWorld");
const { progressionGate } = require("../js/balanceConfig");
const { reserveProgressionFor } = require("../js/simulator");
const { advanceEndlessGuardMode } = require("../js/endlessGuardMode");

assert.strictEqual(CHAPTERS.length, 20, "主线必须包含20章");
assert.deepStrictEqual(CHAPTERS.map((chapter) => chapter.chapter), Array.from({ length: 20 }, (_, index) => index + 1));
assert(Object.keys(SPECIES_DB).length >= 33, "物种库应持续扩展");
assert(getUnlockedSpecies(7, 20).length > getUnlockedSpecies(7, 15).length, "新物种应按章节逐步解锁");
assert(progressionGate(20).nextStage === 20, "第20章应为主线终点");

const reserve = {
  fund: 18000,
  safety: 82,
  business: 86,
  ecologyScore: 88,
  reputation: 80,
  progression: { level: 7, stage: 20, displayChapter: 20, chapterComplete: true },
  ecology: { water: 80, grass: 82, disease: 8, predators: { wolf: 20 }, herbivores: { deer: 200 }, birds: { crow: 15 } },
  visitors: 240
};
const progression = reserveProgressionFor(reserve);
assert.strictEqual(progression.stage, 20);
assert.strictEqual(progression.level, 7);
const first = advanceEndlessGuardMode(reserve, { day: 1, action: "habitat" });
const second = advanceEndlessGuardMode(reserve, { day: 2, action: "antiPoacher" });
assert(first && first.active && second.active, "第20章后应进入无限守护");
assert.strictEqual(second.cycle, 1);
assert(/旅游圣地 \d星 · 保护区 等级\d/.test(second.pkLabel), "无限守护应提供旅游与保护区PK数据");
console.log("endless chapter checks passed (20 chapters, 33 species, infinite PK)");
