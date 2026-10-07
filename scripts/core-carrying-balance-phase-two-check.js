"use strict";

const assert = require("node:assert/strict");
const { createCharacter } = require("../js/storage");
const {
  reserveEcologyScore,
  applyWaterGrassHealthDynamics,
  reserveProgressionFor
} = require("../js/simulator");
const {
  visitorWaterUseForCount,
  VISITOR_WATER_USE_CAP,
  VISITOR_WATER_CRISIS_LINE,
  VISITOR_WATER_WARNING_LINE
} = require("../js/visitorRecruitment");
const {
  habitatCapacitySnapshot
} = require("../js/ecologyConsistency");
const {
  chapterTargets,
  chapterAnimalTotal,
  beginChapterAnimalCheckpoint
} = require("../js/chapterTargets");
const { recordIncrease } = require("../js/animalSourceLedger");

function ecology(water, grass, disease, safety = 60) {
  return {
    water, grass, disease,
    predators: {}, herbivores: {}, birds: {}
  };
}

// 1. Safety is a visitor/security input, never a hidden ecology-score input.
const scoreBase = createCharacter(null, "生态评分口径").world.reserve;
scoreBase.ecology = ecology(68, 64, 18);
scoreBase.migration = { delta: 9, trend: "in" };
const safeLow = JSON.parse(JSON.stringify(scoreBase));
const safeHigh = JSON.parse(JSON.stringify(scoreBase));
safeLow.safety = 15;
safeHigh.safety = 95;
assert.equal(reserveEcologyScore(safeLow), reserveEcologyScore(safeHigh), "安全变化不得改变生态评分");
assert.equal(reserveProgressionFor(safeLow).score, reserveProgressionFor(safeHigh).score, "晋级评分不得偷偷读取安全值");

// 2. Water/grass and disease pressure change continuously around former cliffs.
const diseaseAt = (water, grass, disease) => {
  const reserve = { ecology: ecology(water, grass, disease) };
  applyWaterGrassHealthDynamics(reserve);
  return reserve.habitatHealth;
};
const water49 = diseaseAt(49, 58, 18);
const water50 = diseaseAt(50, 58, 18);
const water51 = diseaseAt(51, 58, 18);
assert(Math.abs(water50.diseaseDelta - water49.diseaseDelta) < 1, "49→50水源不得跳整点疾病");
assert(Math.abs(water51.diseaseDelta - water50.diseaseDelta) < 1, "50→51水源不得跳整点疾病");
const grass47 = diseaseAt(62, 47, 18);
const grass48 = diseaseAt(62, 48, 18);
const grass49 = diseaseAt(62, 49, 18);
assert(Math.abs(grass48.diseaseDelta - grass47.diseaseDelta) < 1, "47→48草场不得跳整点疾病");
assert(Math.abs(grass49.diseaseDelta - grass48.diseaseDelta) < 1, "48→49草场不得跳整点疾病");

const capacity49 = habitatCapacitySnapshot({ progression: { level: 3 }, ecology: ecology(70, 70, 49) });
const capacity50 = habitatCapacitySnapshot({ progression: { level: 3 }, ecology: ecology(70, 70, 50) });
const capacity51 = habitatCapacitySnapshot({ progression: { level: 3 }, ecology: ecology(70, 70, 51) });
assert(capacity49.effectiveCapacity >= capacity50.effectiveCapacity);
assert(capacity50.effectiveCapacity >= capacity51.effectiveCapacity);
assert(capacity49.diseasePenalty < capacity51.diseasePenalty, "疾病承载压力必须随疾病连续增加");
assert(capacity51.effectiveCapacity - capacity49.effectiveCapacity > -10, "单点疾病变化不得造成承载断崖");

// 3. Visitor waves have an explicit, water-aware cap and never spend the last reserve.
for (const water of [0, 12, 24, VISITOR_WATER_CRISIS_LINE, 26, 30, VISITOR_WATER_WARNING_LINE, 50, 100]) {
  const use = visitorWaterUseForCount(100000, { ecology: { water } });
  assert(use >= 0 && use <= VISITOR_WATER_USE_CAP, `游客用水越界: ${water}→${use}`);
  if (water >= VISITOR_WATER_CRISIS_LINE) assert(use <= Math.max(1, Math.floor(water - 20)), "游客用水不能把水源压到安全底线以下");
}
assert.equal(visitorWaterUseForCount(240, { ecology: { water: 24 } }), 0);
assert.equal(visitorWaterUseForCount(240, { ecology: { water: 30 } }), 1);
assert.equal(visitorWaterUseForCount(100000, { ecology: { water: 100 } }), VISITOR_WATER_USE_CAP);

// 4. Chapter animal goals use the chapter ledger. Migration can change the map
// stock and its source record, but cannot satisfy the chapter animal target.
const chapterState = createCharacter(null, "迁入不进动物目标");
const reserve = chapterState.world.reserve;
reserve.progression.stage = 2;
reserve.progression.displayChapter = 2;
beginChapterAnimalCheckpoint(reserve, 2, chapterTargets(1).animals);
const before = chapterAnimalTotal(reserve);
recordIncrease(reserve, "immigrated", 999);
assert.equal(chapterAnimalTotal(reserve), before, "迁入不得增加本章动物目标进度");
const populationObjective = reserveProgressionFor(reserve).objectives.find((item) => item.id === "population");
assert(populationObjective, "晋级进度仍需保留动物总量目标");
assert.equal(populationObjective.current, before, "晋级动物目标不得读取迁入后的在园总量");

console.log("core carrying balance phase two check ok: smooth water/grass/disease, visitor cap, safety-free ecology score, migration-free animal targets");
