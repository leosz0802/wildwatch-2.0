"use strict";

const assert = require("node:assert/strict");
const { createCharacter } = require("../js/storage");
const { Game } = require("../js/game");
const { reserveProgressionFor } = require("../js/simulator");
const { normalizeChapterRescue } = require("../js/chapterRescueSystem");
const { chapterTargets, chapterAdvanceReady, chapterCoreLiveComplete } = require("../js/chapterTargets");
const { reconcileSpeciesPopulations } = require("../js/animalWorld");

function primedReserve(stage) {
  const reserve = createCharacter(null, "核心门槛").world.reserve;
  const level = Math.min(7, Math.ceil(stage / 2));
  reserve.progression = Object.assign({}, reserve.progression, {
    stage,
    displayChapter: stage,
    level,
    totalActions: 1000,
    totalMeaningfulActions: 1000,
    totalStrategicChoices: 100,
    totalMajorStrategicChoices: 100,
    activeSeconds: 10000,
    totalFundEarned: 0,
    totalMigratedIn: 0,
    totalRareRecovered: 0,
    storyDiscoveries: {},
    eventChain: { chapterLevel: 1, step: 0, length: 7, completed: false }
  });
  reserve.supplies = { dogFood: 0, alarm: 0, tranquilizer: 0, fieldKit: 0, medicalKit: 0, evidenceTrap: 0 };
  reserve.fund = 0;
  normalizeChapterRescue(reserve, stage, { fresh: true });
  reconcileSpeciesPopulations(reserve, { initializeUnlocked: true, removeLocked: false });
  ["herbivores", "predators", "birds"].forEach((group) => {
    Object.keys(reserve.ecology[group] || {}).forEach((id) => {
      reserve.ecology[group][id] = 10000;
    });
  });
  if (stage >= 10) {
    reserve.rareAnimal.status = "resident";
    reserve.rareAnimal.health = 72;
    reserve.ecology.herbivores.pangolin = 10000;
  }
  reserve.development.operations.totalVisitors = 10000;
  reserve.development.operations.visitorLedger = { totalVisitors: 10000 };
  const visitorBaseline = stage === 1 ? 0 : Math.max(0, 10000 - chapterTargets(stage).visitors);
  reserve.progression.chapterStart = {
    stage,
    totalVisitors: visitorBaseline,
    inheritedVisitors: 0,
    visitorLedger: { totalVisitors: visitorBaseline }
  };
  reserve.development.operations.chapterVisitors = {
    stage,
    inherited: stage === 1 ? 0 : chapterTargets(stage).visitors,
    legacySeed: 0,
    start: { totalVisitors: visitorBaseline },
    startLifetime: visitorBaseline
  };
  return reserve;
}

{
  const reserve = primedReserve(1);
  const targets = normalizeChapterRescue(reserve, 1).targets || [];
  assert.ok(targets.some((item) => item.status !== "rescued"), "chapter 1 still has an unfinished rescue");
  assert.equal(reserve.supplies.dogFood, 0, "supplies stay empty");
  assert.equal((reserve.eventChain || {}).completed, false, "story stays unfinished");
  assert.equal(chapterAdvanceReady(reserve, 1), chapterCoreLiveComplete(reserve, 1));
  if (chapterAdvanceReady(reserve, 1)) {
    assert.equal(reserveProgressionFor(reserve).stage, 2, "cores met must promote even with empty supplies and unfinished rescue");
    const game = new Game();
    if (game.stopLoop) game.stopLoop();
    game.render = () => {};
    game.state = { character: { name: "核心门槛" }, world: { reserve }, ui: {} };
    assert.equal(game.reserveProgression(reserve).stage, 2, "game wrapper must not add a rescue or supply gate");
  }
}

{
  const reserve = primedReserve(2);
  const beforeVisitors = JSON.parse(JSON.stringify(reserve.development.operations.chapterVisitors));
  reserve.development.operations.chapterVisitors = {
    stage: 2,
    inherited: 0,
    legacySeed: 0,
    start: { totalVisitors: 10000 },
    startLifetime: 10000
  };
  assert.equal(chapterAdvanceReady(reserve, 2), false, "missing visitors must still block chapter 2");
  assert.equal(reserveProgressionFor(reserve).stage, 2, "empty visitor HUD must keep the player in chapter 2");
  reserve.development.operations.chapterVisitors = beforeVisitors;
}

{
  const game = new Game();
  if (game.stopLoop) game.stopLoop();
  game.render = () => {};
  const reserve = primedReserve(1);
  game.state = { character: { name: "进度弹层" }, world: { reserve }, ui: {} };
  game.pendingChapterPromotion = { from: 1, to: 2, summary: {} };
  const detail = game.buildChapterProgressDetail();
  assert.equal(detail.chapter, 1, "pending promotion must keep the animal detail on the current chapter");
  assert.equal(detail.core.target.animals, chapterTargets(1).animals, "pending promotion must not preview the next chapter animal gate");
  assert.ok(!/解救未完成|物资|剧情/.test(JSON.stringify(detail.items.map((item) => item.body))), "progress copy must not treat rescue or supplies as a gate");
}

console.log("chapter core-only gate check ok");
