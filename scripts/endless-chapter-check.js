const assert = require("assert");
const { CHAPTERS, SPECIES_DB, getUnlockedSpecies } = require("../js/animalWorld");
const { progressionGate } = require("../js/balanceConfig");
const { reserveProgressionFor } = require("../js/simulator");
const {
  advanceEndlessGuardMode,
  ensureEndlessGuardMode,
  isEndlessGuardReady
} = require("../js/endlessGuardMode");
const { normalizeReserve, normalizeState } = require("../js/storage");
const { Game } = require("../js/game");
const { chapterTargets } = require("../js/chapterTargets");

assert.strictEqual(CHAPTERS.length, 11, "主线必须包含11章");
assert.deepStrictEqual(CHAPTERS.map((chapter) => chapter.chapter), Array.from({ length: 11 }, (_, index) => index + 1));
assert.strictEqual(CHAPTERS[9].title, "传奇之地", "前10章保持不变");
assert.strictEqual(CHAPTERS[10].title, "无限守望", "第11章是原来的无限守望");
assert(Object.keys(SPECIES_DB).length >= 33, "物种库应持续扩展");
assert(getUnlockedSpecies(6, 11).length > getUnlockedSpecies(5, 10).length, "新物种应按章节逐步解锁");
assert(progressionGate(11).nextStage === 11, "第11章应为主线终点");
assert(progressionGate(10).nextStage === 11, "第10章完成后进入无限守望");

function baseReserve(extra = {}) {
  return {
    fund: 18000,
    safety: 82,
    business: 86,
    ecologyScore: 88,
    reputation: 80,
    visitors: 240,
    ecology: { water: 80, grass: 82, disease: 8, predators: { wolf: 20 }, herbivores: { deer: 200 }, birds: { crow: 15 } },
    progression: { level: 7, stage: 11, displayChapter: 11, chapterComplete: true },
    ...extra
  };
}

const reserve = baseReserve();
const progression = reserveProgressionFor(reserve);
assert.strictEqual(progression.stage, 11);
assert.strictEqual(progression.level, 7);
const first = advanceEndlessGuardMode(reserve, { day: 1, action: "habitat" });
const second = advanceEndlessGuardMode(reserve, { day: 2, action: "antiPoacher" });
assert(first && first.active && second.active, "第18章后应进入无限守护");
assert.strictEqual(second.cycle, 1);
assert(/旅游圣地 \d星 · 保护区 等级\d/.test(second.pkLabel), "无限守护应提供旅游与保护区PK数据");

const unfinished = baseReserve({
  progression: { level: 7, stage: 11, displayChapter: 11, chapterComplete: false }
});
assert.strictEqual(advanceEndlessGuardMode(unfinished, { day: 1, action: "habitat" }), null, "未完成第18章不能进入无限守护");
assert.ok(!unfinished.endlessMode || unfinished.endlessMode.active !== true, "未完成第18章不能留下激活的无限守护");

const loaded = normalizeReserve(baseReserve({
  progression: { level: 7, stage: 11, displayChapter: 11, chapterComplete: true },
  endlessMode: null
}));
assert.ok(isEndlessGuardReady(loaded), "已完成18章的存档读档后应可进入无限守护");
assert.ok(loaded.endlessMode && loaded.endlessMode.active, "已完成18章的存档读档应直接激活无限守护");

const dipped = baseReserve({
  progression: { level: 7, stage: 11, displayChapter: 11, chapterComplete: true },
  ecology: { water: 5, grass: 5, disease: 95, predators: { wolf: 1 }, herbivores: { deer: 2 }, birds: { crow: 1 } }
});
const game = Object.create(Game.prototype);
game.state = { world: { reserve: dipped }, ui: {} };
const afterDip = game.reserveProgression(dipped);
assert.strictEqual(afterDip.chapterComplete, true, "通关后数值回落不能取消第18章完成");
ensureEndlessGuardMode(dipped);
assert.ok(dipped.endlessMode && dipped.endlessMode.active, "通关后数值回落仍应继续无限守护");

const seenEnd = baseReserve({
  progression: { level: 7, stage: 11, displayChapter: 11, chapterComplete: false }
});
const restored = Object.create(Game.prototype);
restored.state = { world: { reserve: seenEnd }, ui: { chapterStoriesSeen: { "18:end": true } } };
restored.commitReserveProgression(seenEnd);
assert.strictEqual(seenEnd.progression.chapterComplete, true, "看过第18章结束剧情的存档应补记通关");
assert.ok(seenEnd.endlessMode && seenEnd.endlessMode.active, "看过结束剧情后应进入无限守护");

const target = chapterTargets(11);
const belowNewVisitorCap = baseReserve({
  progression: {
    level: 7,
    stage: 18,
    displayChapter: 18,
    chapterComplete: true,
    coreBest: { stage: 11, species: target.species, animals: target.animals, visitors: Math.max(0, target.visitors - 80) }
  }
});
const kept = game.reserveProgression(belowNewVisitorCap);
assert.strictEqual(kept.chapterComplete, true, "游客门槛上调后，已通关玩家不能被打回未完成");
ensureEndlessGuardMode(belowNewVisitorCap);
assert.ok(belowNewVisitorCap.endlessMode.active, "游客门槛上调后，已通关玩家仍继续无限守护");

const storySave = normalizeState({
  world: {
    reserve: {
      progression: { level: 7, stage: 11, displayChapter: 11, chapterComplete: false },
      ecology: { water: 80, grass: 82, disease: 8, predators: { wolf: 20 }, herbivores: { deer: 200 }, birds: { crow: 15 } }
    }
  },
  ui: { chapterStoriesSeen: { "18:end": true } }
});
assert.ok(storySave.world.reserve.endlessMode && storySave.world.reserve.endlessMode.active, "已看结束剧情的旧存档加载后应能继续玩");

console.log("endless chapter checks passed (11 chapters, finale is endless guard)");
