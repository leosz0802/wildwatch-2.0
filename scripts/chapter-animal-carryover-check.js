"use strict";

const assert = require("node:assert/strict");
const { createCharacter } = require("../js/storage");
const {
  chapterAnimalCarryover,
  beginChapterAnimalCheckpoint,
  chapterAnimalTotal,
  chapterTargets,
  repairFreshChapterAnimalCarryover
} = require("../js/chapterTargets");
const { livingAnimalTotal } = require("../js/chapterRescueSystem");
const { Game } = require("../js/game");

// Every chapter uses the same bounded carryover strategy. A corrupted save
// that stores the whole chapter target as inherited progress must be repaired
// back to the previous chapter's 10% floor before the HUD is rendered.
for (let chapter = 2; chapter <= 20; chapter += 1) {
  const corrupted = createCharacter(null, `第${chapter}章动物策略修复`).world.reserve;
  Object.assign(corrupted.progression, { stage: chapter, displayChapter: chapter });
  corrupted.chapterAnimalCarryover = {
    stage: chapter,
    fromTotal: chapterTargets(chapter - 1).animals,
    inherited: chapterTargets(chapter).animals,
    legacyCompleteSeed: true
  };
  const repairedExpected = Math.max(
    chapterAnimalCarryover(chapterTargets(chapter - 1).animals, chapter),
    chapterAnimalCarryover(chapterTargets(chapter - 1).animals, chapter)
  );
  assert.equal(
    chapterAnimalTotal(corrupted),
    repairedExpected,
    `第${chapter}章不应把整章目标 ${chapterTargets(chapter).animals} 当成继承值`
  );
  assert.equal(corrupted.chapterAnimalCarryover.inherited, repairedExpected);
}

const reserve = createCharacter(null, "第7章动物继承回归").world.reserve;
Object.assign(reserve.progression, { stage: 6, displayChapter: 6 });

assert.equal(chapterAnimalCarryover(73, 7), 7, "章节进度继承仍按10%规则计算");

beginChapterAnimalCheckpoint(reserve, 7, 73);
Object.assign(reserve.progression, { stage: 7, displayChapter: 7 });
const expectedInherited = Math.max(7, Math.round(chapterTargets(6).animals * 0.1));
assert.equal(chapterAnimalTotal(reserve), expectedInherited, "第6章动物进度进入第7章仍按章节规则继承");
assert.equal(reserve.chapterAnimalCarryover.fromTotal, 73, "动物继承应记录真实上一章收盘数");
assert.equal(reserve.chapterAnimalCarryover.inherited, expectedInherited, "章节继承值应按上一章收盘数和上一章目标的10%取较大值");
const game = Object.create(Game.prototype);
game.state = { world: { reserve } };
game.screen = "home";
game.settlementModal = null;
assert.equal(
  game.reserveDynamicTargets(reserve).animalTotal,
  livingAnimalTotal(reserve),
  "首页动物总数必须显示实际存活数量，不能回落到章节进度个位数"
);

const legacy = createCharacter(null, "老存档动物继承兼容").world.reserve;
Object.assign(legacy.progression, { stage: 7, displayChapter: 7 });
delete legacy.chapterAnimalCarryover;
repairFreshChapterAnimalCarryover(legacy);
assert.equal(chapterAnimalTotal(legacy), Math.round(chapterTargets(6).animals * 0.1), "缺失动物 checkpoint 的老存档按上一章目标的10%兜底");

console.log("chapter animal carryover check ok");
