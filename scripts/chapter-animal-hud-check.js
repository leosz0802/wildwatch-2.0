"use strict";

const assert = require("node:assert/strict");
const { createCharacter } = require("../js/storage");
const { Game, chapterCoreMetrics } = require("../js/game");
const {
  chapterTargets,
  chapterAnimalCarryover,
  chapterAnimalTotal,
  chapterAnimalInherited,
  chapterHasAnimalLedgerFlow,
  beginChapterAnimalCheckpoint,
  chapterVisitorTotal,
  legacyCareerAnimalGate
} = require("../js/chapterTargets");
const { livingAnimalTotal, normalizeChapterRescue, addRescueItem, rescueAnimal } = require("../js/chapterRescueSystem");
const { recordIncrease, animalSourceSummary } = require("../js/animalSourceLedger");
const { simulateDay } = require("../js/simulator");

// All chapters must use the same chapter-local strategy. A legacy save that
// accidentally stored the whole target as inherited progress is repaired to
// the previous chapter's 10% carryover floor.
for (let chapter = 2; chapter <= 20; chapter += 1) {
  const corrupted = createCharacter(null, `动物策略修复${chapter}`).world.reserve;
  Object.assign(corrupted.progression, { stage: chapter, displayChapter: chapter, animalHudVersion: 0 });
  corrupted.chapterAnimalCarryover = {
    stage: chapter,
    fromTotal: chapterTargets(chapter - 1).animals,
    inherited: chapterTargets(chapter).animals
  };
  const expected = Math.max(
    chapterAnimalCarryover(chapterTargets(chapter - 1).animals, chapter),
    chapterAnimalCarryover(chapterTargets(chapter - 1).animals, chapter)
  );
  assert.equal(chapterAnimalTotal(corrupted), expected, `chapter ${chapter} inherited animal strategy was not repaired`);
  assert.equal(corrupted.chapterAnimalCarryover.inherited, expected);
}

const state = createCharacter(null, "本章动物");
const reserve = state.world.reserve;
const living = livingAnimalTotal(reserve);
const gate = chapterTargets(1);
const startHud = chapterAnimalTotal(reserve);

assert.ok(living >= 80, `chapter 1 still has a live herd, got ${living}`);
assert.equal(startHud, 0, `chapter 1 animal HUD must start at 0 like visitors, got ${startHud}`);
assert.equal(chapterCoreMetrics(reserve, 1).animals, 0, "core animal metric must ignore opening stock");
assert.equal(gate.animals, 12, "chapter 1 animal gate is 12, not the later-chapter herd");
assert.ok(startHud < gate.animals, "chapter 1 must not start already complete");

normalizeChapterRescue(reserve, 1, { fresh: true });
(normalizeChapterRescue(reserve, 1).targets || []).forEach((record) => {
  (record.requiredItems || []).forEach((itemId) => addRescueItem(reserve, itemId));
  assert.equal(rescueAnimal(reserve, record.targetId).ok, true);
});

const afterRescue = chapterAnimalTotal(reserve);
const afterLiving = livingAnimalTotal(reserve);
assert.ok(afterRescue > 0, "rescue must add this-chapter animals");
assert.equal(afterRescue, 44, `antelope 1→45 must credit 44, got ${afterRescue}`);
assert.ok(afterLiving > living, "the live herd still grows");
assert.ok(afterRescue >= gate.animals, `one antelope rescue must reach the chapter 1 animal gate: ${afterRescue}/${gate.animals}`);
assert.equal(chapterCoreMetrics(reserve, 1).percentages.animals >= 100, true, "antelope rescue must complete the chapter 1 animal gate");

const game = Object.create(Game.prototype);
game.state = state;
game.screen = "home";
game.settlementModal = null;
assert.equal(game.reserveDynamicTargets(reserve).animalTotal, afterLiving, "dock animal total must follow the live herd");
game.ctx = {
  save() {}, restore() {}, fillRect() {}, drawImage() {}, beginPath() {}, closePath() {},
  rect() {}, clip() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, bezierCurveTo() {},
  arc() {}, arcTo() {}, ellipse() {}, fill() {}, stroke() {}, setLineDash() {},
  fillText() {}, measureText(text) { return { width: String(text || "").length * 6 }; },
  createLinearGradient() { return { addColorStop() {} }; },
  createRadialGradient() { return { addColorStop() {} }; }
};
game.width = 375;
game.height = 667;
game.hitAreas = [];
game.infoDetailModal = null;
game.scrollY = 0;
game.drawSandboxInfoDock(game.ctx, 18, game.homeHeroTop(), game.width - 36);
const openingAnimalTile = (game.renderedSandboxStateTiles || []).find((tile) => tile.id === "animalTotal");
assert.equal(openingAnimalTile.value, afterRescue, "chapter 1 HUD must display chapter-earned animals, not opening ecology");
assert.equal(openingAnimalTile.progressText, `${afterRescue}/${gate.animals}`, "chapter 1 HUD must use the chapter animal ledger");
assert.equal(openingAnimalTile.animationKey, "chapterAnimalTotal");

beginChapterAnimalCheckpoint(reserve, 2, afterRescue);
reserve.progression.stage = 2;
reserve.progression.displayChapter = 2;
const ch2 = chapterAnimalTotal(reserve);
const inherit = Math.round(Math.max(afterRescue, gate.animals) * 0.1);
assert.equal(ch2, inherit, `chapter 2 must inherit 10% of the previous chapter HUD, got ${ch2}`);
assert.ok(ch2 < chapterTargets(2).animals, `chapter 2 must not open already complete: ${ch2}/${chapterTargets(2).animals}`);
assert.equal(game.reserveDynamicTargets(reserve).animalTotal, livingAnimalTotal(reserve), "chapter 2 dock must keep the live herd across the chapter boundary");

const veteran = createCharacter(null, "旧动物峰值").world.reserve;
const veteranVisitors = chapterVisitorTotal(veteran);
veteran.progression.coreBest = { stage: 1, species: 6, animals: 125, visitors: 0 };
veteran.progression.animalHudVersion = 0;
const repaired = chapterCoreMetrics(veteran, 1);
assert.equal(legacyCareerAnimalGate(1), 180, "current-version users completed animals against career 180");
assert.equal(repaired.animals, 0, "an unfinished old peak of 125 must not convert the opening herd");
assert.equal(repaired.best.animals, 0, "unfinished old career peaks must reset to this-chapter live");
assert.equal(repaired.met.animals, false, "chapter 1 must not start complete from a 125 living-stock latch");
assert.equal(chapterVisitorTotal(veteran), veteranVisitors, "animal HUD repair must not rewrite visitors");
assert.equal(livingAnimalTotal(veteran), living, "opening living stock stays on the map");

const finished = createCharacter(null, "旧关已满").world.reserve;
finished.ecology.herbivores.deer = Math.max(0, Number(finished.ecology.herbivores.deer) || 0) + 120;
const finishedHerd = livingAnimalTotal(finished);
assert.ok(finishedHerd >= 180, `old complete fixture must reach career 180, got ${finishedHerd}`);
finished.progression.coreBest = { stage: 1, species: 6, animals: 0, visitors: 0 };
finished.progression.animalHudVersion = 0;
const finishedHud = chapterCoreMetrics(finished, 1);
assert.equal(finishedHud.animals, gate.animals, "old living stock that already cleared 180 must mark the new gate complete");
assert.equal(finishedHud.met.animals, true);
assert.equal(livingAnimalTotal(finished), finishedHerd, "completion seed must not change the live herd");
assert.ok(finishedHerd > finishedHud.animals, "the live herd stays career-sized and off the chapter bar");

const peaked = createCharacter(null, "旧峰值已满").world.reserve;
peaked.progression.coreBest = { stage: 1, species: 6, animals: 180, visitors: 0 };
peaked.progression.animalHudVersion = 0;
const peakedHud = chapterCoreMetrics(peaked, 1);
assert.equal(peakedHud.animals, gate.animals, "an old peak of 180 must keep the chapter complete");
assert.equal(livingAnimalTotal(peaked), living, "peak-complete repair must not scale the opening herd");

const mid = createCharacter(null, "本章已有流水").world.reserve;
normalizeChapterRescue(mid, 1, { fresh: true });
(normalizeChapterRescue(mid, 1).targets || []).forEach((record) => {
  (record.requiredItems || []).forEach((itemId) => addRescueItem(mid, itemId));
  assert.equal(rescueAnimal(mid, record.targetId).ok, true);
});
recordIncrease(mid, "tasked", 6);
const ledgerBefore = animalSourceSummary(mid).rescued;
const midHudBefore = chapterAnimalTotal(mid);
assert.equal(midHudBefore, 50, "rescue 44 + patrol 6 stays on the ledger");
assert.equal(chapterHasAnimalLedgerFlow(mid), true);
mid.progression.coreBest = { stage: 1, species: 7, animals: 125, visitors: 0 };
mid.progression.animalHudVersion = 0;
const midHud = chapterCoreMetrics(mid, 1);
assert.equal(midHud.animals, 50, "this-chapter rescue and patrol must not be rewritten");
assert.equal(animalSourceSummary(mid).rescued, ledgerBefore, "migration must not rewrite the animal ledger");
assert.ok(midHud.animals >= gate.animals, "rescue plus patrol already clears the chapter 1 animal gate");
assert.equal(midHud.met.animals, true, "chapter 1 animal gate closes once the rescued herd is counted");

const ch2Done = createCharacter(null, "第二章旧关已满").world.reserve;
ch2Done.progression.stage = 2;
ch2Done.progression.displayChapter = 2;
ch2Done.ecology.herbivores.deer = Math.max(0, Number(ch2Done.ecology.herbivores.deer) || 0) + 160;
const ch2Herd = livingAnimalTotal(ch2Done);
assert.ok(ch2Herd >= 220, `chapter 2 old complete fixture must reach career 220, got ${ch2Herd}`);
ch2Done.progression.animalHudVersion = 0;
const ch2DoneHud = chapterCoreMetrics(ch2Done, 2);
assert.equal(ch2DoneHud.animals, chapterTargets(2).animals, "old chapter 2 completion must seed the new 70 gate");
assert.equal(livingAnimalTotal(ch2Done), ch2Herd);

const ch2Mid = createCharacter(null, "第二章未满认账本").world.reserve;
ch2Mid.progression.stage = 2;
ch2Mid.progression.displayChapter = 2;
beginChapterAnimalCheckpoint(ch2Mid, 2, gate.animals);
recordIncrease(ch2Mid, "comforted", 10);
ch2Mid.progression.animalHudVersion = 0;
const ch2MidHud = chapterCoreMetrics(ch2Mid, 2);
const ch2Inherit = chapterAnimalCarryover(gate.animals, 2);
assert.equal(chapterAnimalInherited(ch2Mid), ch2Inherit);
assert.equal(ch2MidHud.animals, ch2Inherit + 10, "unfinished chapter 2 must keep inherit + comfort and ignore the opening herd");
assert.ok(livingAnimalTotal(ch2Mid) >= 80);
assert.ok(ch2MidHud.animals < chapterTargets(2).animals);

const habitatLedger = createCharacter(null, "迁入不进本章账").world.reserve;
const habitatHudBefore = chapterAnimalTotal(habitatLedger);
recordIncrease(habitatLedger, "immigrated", 8);
assert.equal(animalSourceSummary(habitatLedger).immigrated, 8, "habitat still records map immigration");
assert.equal(chapterAnimalTotal(habitatLedger), habitatHudBefore, "habitat immigration must not raise the chapter animal HUD");

const habitatState = createCharacter(null, "栖息地结算本章账");
habitatState.world.reserve.supplies.fieldKit = 5;
const habitatLivingBefore = livingAnimalTotal(habitatState.world.reserve);
const habitatBeforeSnap = JSON.parse(JSON.stringify(habitatState.world.reserve));
const originalRandom = Math.random;
Math.random = () => 0.2;
let habitatResult;
try {
  habitatResult = simulateDay("修复水源和草场：去东部河岸湿地修复水源", habitatState);
} finally {
  Math.random = originalRandom;
}
const habitatReserve = habitatResult.world.reserve;
assert.ok(livingAnimalTotal(habitatReserve) > habitatLivingBefore, "habitat still grows the live herd");
game.state = habitatState;
const habitatSettlement = game.buildPatrolSettlement(
  habitatBeforeSnap,
  habitatReserve,
  habitatResult,
  "修复水源和草场：去东部河岸湿地修复水源"
);
const animalStat = (habitatSettlement.stats || []).find((item) => item.key === "animalTotal");
assert.ok(animalStat, "settlement must report chapter animal totals");
assert.equal(animalStat.before, chapterAnimalTotal(habitatBeforeSnap));
assert.equal(animalStat.after, chapterAnimalTotal(habitatReserve));
assert.ok(animalStat.after < livingAnimalTotal(habitatReserve), "settlement animal total must not flash living stock");
const habitatLines = game.settlementRewardDisplayLines(habitatSettlement);
assert.ok(!/动物承载/.test(habitatLines.join("")), "settlement copy must not show living-stock carrying capacity");

const shielded = createCharacter(null, "开局死亡不扣本章").world.reserve;
shielded.animalSourceLedger = {
  version: 2,
  chapters: {
    1: {
      opening: 81,
      openingSet: true,
      immigrated: 14,
      rescued: 44,
      breeding: 4,
      comforted: 9,
      advertised: 29,
      shared: 4,
      tasked: 22,
      emigrated: 3,
      died: 118,
      rareMigrated: 0,
      rareStolen: 0,
      rareAuction: 0,
      species: {},
      birthQuota: {},
      birthQuotaTotal: 0,
      birthQuotaDay: 0
    }
  }
};
assert.equal(chapterAnimalTotal(shielded), 89, "deaths of the opening herd and immigrants must not zero earned chapter animals");

console.log("chapter animal hud check ok: opening 0, rescue 44/58, habitat stays off HUD, ledger kept");
