"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createInitialWorld, createReserveState } = require("../js/world");
const { createCharacter, normalizeReserve } = require("../js/storage");
const { Game, chapterCoreMetrics } = require("../js/game");
const { chapterTargets, chapterVisitorCarryover, chapterVisitorTotal, chapterAnimalTotal, applyChapterVisitorDelta, beginChapterVisitorCheckpoint } = require("../js/chapterTargets");
const { livingAnimalTotal } = require("../js/chapterRescueSystem");
const { animalSourceSummary } = require("../js/animalSourceLedger");
const { applyHarshNatureOutcome, isHarshNatureEvent } = require("../js/sandboxTaskCadence");
const { pickActiveShareRewardType } = require("../js/shareSystem");
const { parkOpenDataOverlay } = require("../js/wechatFriendSystem");
const { usesFragileCanvas } = require("../js/game");

function makeGame() {
  const game = new Game();
  if (game.stopLoop) game.stopLoop();
  game.wechatFriends = null;
  game.cloudService = null;
  return game;
}

const gameSource = fs.readFileSync(path.join(__dirname, "../js/game.js"), "utf8");

// 1. Today's click/freeze/fade/map bugs must stay closed.
assert.ok(gameSource.includes("justEnteredPlayableGameUntil = Date.now() + 520"), "enter-game guard must expire");
assert.ok(gameSource.includes("return 0.72 + 0.28 * Math.max(0, Math.min(1, dt / 280))"), "channel fade must not start from 0");
assert.ok(gameSource.includes("skipsScreenFade()"), "HarmonyOS must skip the residual whole-page fade");
assert.ok(gameSource.includes("parkIdleOpenDataOverlay()"), "leaving a channel must re-park the open-data overlay");
assert.ok(/rollMaterialExplorationDice[\s\S]*setArcheryConfirmationState/.test(gameSource), "archery must enter the shared manual confirmation state");
assert.ok(gameSource.includes("if (options.skipInterstitial || options.preserveCurrentScreen)"), "material fill must skip interstitial lock");
assert.ok(gameSource.includes("if (this.infoDetailModal || this.patrolTaskModal || this.chapterStoryModal"), "tryEnter must yield to open modals");
assert.ok(gameSource.includes("drawPrologueMapHold"), "missing map must hold green grass, not yellow sand");
assert.ok(!/#f6c85b/.test(gameSource), "procedural yellow-sand fallback must stay removed");

const enterGame = makeGame();
enterGame.screen = "choose";
enterGame.justEnteredPlayableGame = true;
enterGame.justEnteredPlayableGameUntil = Date.now() + 8000;
assert.equal(enterGame.consumeEnterGuard(), true, "fresh enter guard still swallows the leftover prologue tap");
enterGame.screen = "home";
enterGame.justEnteredPlayableGame = true;
enterGame.justEnteredPlayableGameUntil = Date.now() + 8000;
assert.equal(enterGame.consumeEnterGuard(), false, "enter guard must drop once the player is already in the game");
enterGame.screen = "choose";
enterGame.justEnteredPlayableGame = true;
enterGame.justEnteredPlayableGameUntil = Date.now() - 10;
assert.equal(enterGame.consumeEnterGuard(), false, "enter guard must expire instead of freezing the homepage");

enterGame.screenChangedAtMs = Date.now();
assert.ok(enterGame.screenFade() >= 0.72, "first discovery/home frame must already be readable");

const overlay = { canvas: { width: 320, height: 480, style: { top: "0px", left: "0px" } } };
parkOpenDataOverlay({ getOpenDataContext: () => overlay });
assert.equal(overlay.canvas.width, 1);
assert.ok(String(overlay.canvas.style.left).includes("-9999"), "open-data overlay must stay parked offscreen");

const shareState = createCharacter(null, "主动分享随机");
const first = pickActiveShareRewardType(shareState, () => 0.1);
const second = pickActiveShareRewardType(shareState, () => 0.9);
assert.ok(first === "animals" || first === "visitors");
assert.ok(second === "animals" || second === "visitors");
assert.notEqual(first, second, "unlocked mailbox share must be able to pick animals or visitors");

// 2. Visitor/animal HUD must follow the chapter-stock contract.
const live = createCharacter(null, "本章账本").world.reserve;
live.progression = Object.assign({}, live.progression, { stage: 4, displayChapter: 4 });
live.ecology.herbivores.deer = 40;
live.ecology.herbivores.antelope = 36;
live.development = live.development || {};
const visitorLedger = { totalVisitors: 900, recruitedVisitors: 820, lostVisitors: 0, facilityVisitors: 0, taskVisitors: 0, shareVisitors: 0, migratedVisitors: 0 };
live.development.operations = Object.assign({}, live.development.operations, {
  totalVisitors: 900,
  chapterVisitors: { stage: 4, inherited: 80, legacySeed: 0, start: Object.assign({}, visitorLedger), startLifetime: 900 },
  visitorLedger
});
const hud = chapterCoreMetrics(live, 4);
assert.equal(hud.visitors, chapterVisitorTotal(live), "HUD 游客必须读本章游客，不是生涯总数");
assert.equal(hud.animals, chapterAnimalTotal(live), "HUD 动物必须读本章账，不是在园存量");
assert.ok(hud.animals < livingAnimalTotal(live), "本章动物不得把开局在园整笔写上 HUD");
assert.equal(hud.visitors, 80, "生涯游客必须停在账本起点，HUD 只显示本章继承+流水");
assert.ok(hud.visitors < 900, "本章游客不得把生涯游客整笔写上 HUD");

const hudGame = makeGame();
hudGame.state.world.reserve = live;
assert.equal(hudGame.reserveVisitorCount(live), chapterVisitorTotal(live));
assert.equal(hudGame.reserveSpeciesTotal(live), livingAnimalTotal(live));

const transitioned = createInitialWorld().reserve;
transitioned.development.operations.totalVisitors = 100;
transitioned.development.operations.visitorLedger = { totalVisitors: 100, recruitedVisitors: 100, lostVisitors: 0 };
transitioned.progression.stage = 2;
transitioned.progression.displayChapter = 2;
beginChapterVisitorCheckpoint(transitioned, 2, 100);
applyChapterVisitorDelta(transitioned, 25, "recruit");
assert.equal(chapterVisitorTotal(transitioned), 35, "本章游客 = 上章结束×10% + 本章流水");

const veteran = createInitialWorld().reserve;
veteran.progression = Object.assign({}, veteran.progression, {
  stage: 15,
  displayChapter: 15,
  chapterStart: { stage: 1, totalVisitors: 0, inheritedVisitors: 0 }
});
veteran.development.operations.totalVisitors = 4800;
veteran.development.operations.visitorLedger = { totalVisitors: 4800, recruitedVisitors: 4800, lostVisitors: 0 };
assert.equal(chapterVisitorTotal(veteran), chapterVisitorCarryover(chapterTargets(14).visitors, 15), "老存档第15章只显示可确认的跨章继承游客");
assert.ok(chapterVisitorTotal(veteran) < 4800, "老存档不得把生涯游客倒进本章 HUD");
assert.equal(chapterVisitorTotal(normalizeReserve(JSON.parse(JSON.stringify(veteran)))), chapterVisitorCarryover(chapterTargets(14).visitors, 15));

const fire = JSON.parse(JSON.stringify(live));
const fireAnimalsBefore = livingAnimalTotal(fire);
const fireVisitorsBefore = chapterVisitorTotal(fire);
const fireBreedingBefore = animalSourceSummary(fire).breeding;
applyHarshNatureOutcome(fire, "wildfire", 3);
assert.equal(chapterVisitorTotal(fire), fireVisitorsBefore, "火灾只伤草场/动物，不改游客");
assert.ok(livingAnimalTotal(fire) < fireAnimalsBefore);
assert.equal(animalSourceSummary(fire).breeding, fireBreedingBefore, "火灾不得记进繁殖剩余");
assert.ok(animalSourceSummary(fire).died > 0, "火灾动物损失必须记死亡");
assert.equal(chapterCoreMetrics(fire, 4).animals, chapterAnimalTotal(fire));
assert.ok(chapterAnimalTotal(fire) < chapterAnimalTotal(live) || animalSourceSummary(fire).died > 0, "火灾必须记入本章动物流出");
assert.equal(chapterCoreMetrics(fire, 4).visitors, chapterVisitorTotal(fire));

const flood = JSON.parse(JSON.stringify(live));
const floodAnimalsBefore = livingAnimalTotal(flood);
const floodVisitorsBefore = chapterVisitorTotal(flood);
applyHarshNatureOutcome(flood, "flood", 2);
assert.ok(chapterVisitorTotal(flood) < floodVisitorsBefore, "水灾必须减少本章游客");
assert.ok(livingAnimalTotal(flood) < floodAnimalsBefore, "水灾必须减少动物总数");
assert.equal(chapterCoreMetrics(flood, 4).visitors, chapterVisitorTotal(flood), "水灾后 HUD 游客仍读本章账");
assert.ok(flood.development.operations.visitorLedger.totalVisitors < 900, "水灾流失必须写入生涯账本的 lost/total，但不能把 HUD 改成生涯数");
assert.equal(animalSourceSummary(flood).breeding, fireBreedingBefore);

const summary = animalSourceSummary(flood);
assert.equal(
  summary.ending,
  livingAnimalTotal(flood),
  "动物期末必须等于在园存量"
);
assert.equal(
  summary.ending,
  summary.opening + summary.immigrated + summary.rescued + summary.breeding + summary.comforted + summary.advertised + summary.shared + summary.tasked - summary.emigrated - summary.died,
  "期末=期初+迁入+解救+繁殖剩余(+安抚/幸运/分享/任务)−迁出−死亡"
);

const dry = createReserveState();
dry.seasonState = { name: "旱季", weather: "热浪", day: 4, cycleDay: 16 };
dry.ecology.grass = 36;
const fireGame = makeGame();
fireGame.screen = "home";
fireGame.state.world.reserve = dry;
const fireMarker = {
  id: "wildfire",
  type: "crisis",
  visualKind: "wildfire",
  eventType: "sandbox_wildfire",
  recommendAction: "harshNature",
  title: "火灾预警"
};
assert.equal(isHarshNatureEvent(fireMarker), true);
fireGame.openMapMarkerDetail(fireMarker);
assert.equal(fireGame.screen, "home");
assert.equal(fireGame.infoDetailModal && fireGame.infoDetailModal.kind, "harshNatureDice");
assert.notEqual(fireGame.screen, "action", "火灾预警不得再掉进空巡护页");

assert.equal(typeof usesFragileCanvas, "function");

console.log("today bug and totals check ok");
