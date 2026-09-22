const assert = require("assert");
const { chapterTargets, CHAPTER_TARGETS, beginChapterVisitorCheckpoint, chapterVisitorTotal, chapterVisitorCarryover } = require("../js/chapterTargets");
const { createReserveState } = require("../js/world");
const { createCharacter } = require("../js/storage");
const { Game } = require("../js/game");
const { livingAnimalTotal } = require("../js/chapterRescueSystem");
const { consumeVisitorRecruitment } = require("../js/visitorRecruitment");
const { applyChapterSpecialReward, UNLOCK_DELAY_MS } = require("../js/chapterSpecialSystem");
const { buildReserveDevelopmentPlan, settleReserveDevelopmentDay } = require("../js/reserveDevelopment");

assert.strictEqual(CHAPTER_TARGETS.length, 20, "there must be one target row per chapter");
for (let chapter = 1; chapter <= 20; chapter += 1) {
  const current = chapterTargets(chapter);
  assert(current.species > 0 && current.animals > 0 && current.visitors > 0, `chapter ${chapter} target is empty`);
  if (chapter > 1) assert.ok(current.visitors > chapterTargets(chapter - 1).visitors, `chapter ${chapter} visitor target must keep rising`);
  if (chapter === 9) {
    assert.ok(current.animals <= 760, "chapter 9 animal gate must stay under typical level-5 habitat capacity");
    assert.ok(current.animals - chapterTargets(8).animals <= 70, "chapter 9 must not ask for a 100+ animal jump after a 3–12 rescue");
  }
  if (chapter === 10) {
    assert.ok(current.animals >= 780 && current.animals <= 840, "chapter 10 animal gate must sit under typical water/grass carrying");
    assert.ok(current.animals - chapterTargets(9).animals <= 100, "chapter 10 must not jump +200 animals above the typical cap");
  }
  if (chapter > 1) {
    const inherit = chapterVisitorCarryover(chapterTargets(chapter - 1).visitors, chapter);
    assert.strictEqual(inherit, Math.round(chapterTargets(chapter - 1).visitors * 0.1), `chapter ${chapter} inherit must stay at 10%`);
    const need = current.visitors - inherit;
    assert.ok(need > inherit, `chapter ${chapter} visitor gate must be earned mostly in this chapter`);
    assert.ok(need >= chapterTargets(1).visitors, `chapter ${chapter} this-chapter visitor need must not shrink below chapter 1`);
  }
  if (chapter === 1) assert(current.expectedMinutes >= 3 && current.expectedMinutes <= 5, "chapter 1 should take 3–5 minutes");
  if (chapter === 2) assert(current.expectedMinutes >= 8 && current.expectedMinutes <= 10, "chapter 2 should take 8–10 minutes");
  if (chapter >= 3) {
    assert(current.expectedMinutes >= 12 && current.expectedMinutes <= 24, `chapter ${chapter} should take 12–24 minutes after the onboarding pair`);
    assert(current.expectedMinutes >= chapterTargets(chapter - 1).expectedMinutes, `chapter ${chapter} expected minutes must not shrink`);
  }
}

const game = new Game();
if (game.stopLoop) game.stopLoop();
const openingState = createCharacter(null, "第一章开局");
const openingCore = game.reserveProgression(openingState.world.reserve).coreMetrics;
assert(openingCore.species < openingCore.target.species, `chapter 1 must not start with species already complete: ${openingCore.species}/${openingCore.target.species}`);
assert(openingCore.animals < openingCore.target.animals, `chapter 1 must not start with animals already complete: ${openingCore.animals}/${openingCore.target.animals}`);
assert(openingCore.visitors < openingCore.target.visitors, "chapter 1 must not start with visitors already complete");
openingState.world.reserve.ecology.herbivores.antelope = 45;
const trappedCore = game.reserveProgression(openingState.world.reserve).coreMetrics;
assert.strictEqual(trappedCore.species, openingCore.species, "trapped herds must not count toward owned species");
assert.strictEqual(trappedCore.animals, openingCore.animals, "trapped animals must not count toward owned animal total");

function readyChapterOneReserve() {
  const reserve = createReserveState();
  const freed = {
    speciesId: "antelope",
    status: "rescued",
    rescuedAt: 1,
    targetId: "chapter:1:rescue:1"
  };
  reserve.chapterRescue = {
    enforceCompletion: false,
    legacyGateBypass: true,
    chapter: 1,
    animals: { "chapter:1:rescue:1": freed, antelope: freed },
    targets: [freed]
  };
  reserve.ecology.herbivores.antelope = 45;
  const remaining = Math.max(0, chapterTargets(1).animals - livingAnimalTotal(reserve));
  if (remaining) {
    reserve.ecology.herbivores.deer = Math.max(0, Number(reserve.ecology.herbivores.deer) || 0) + remaining;
  }
  return reserve;
}

const reserve = readyChapterOneReserve();
reserve.progression = Object.assign({}, reserve.progression, {
  totalMeaningfulActions: 100,
  totalStrategicChoices: 100,
  totalMajorStrategicChoices: 100,
  activeSeconds: 1000,
  chapterComplete: true
});
reserve.storyDiscoveries = { case_1: { evidence: 3 } };
reserve.eventChain = { chapterLevel: 1, step: 99, length: 1, completed: true };
const blocked = game.reserveProgression(reserve);
assert.strictEqual(blocked.stage, 1, "chapter cannot advance before visitor target is met");
reserve.development.operations.totalVisitors = chapterTargets(1).visitors;
const advanced = game.reserveProgression(reserve);
assert.strictEqual(advanced.stage, 2, "chapter advances after all core metrics are met");

assert.strictEqual(chapterVisitorCarryover(100, 2), 10, "chapter 2 inherit is 10% of the previous total");
assert.strictEqual(chapterVisitorCarryover(100, 14), 10, "late chapters still inherit only 10%");
assert.strictEqual(chapterVisitorCarryover(100, 20), 10, "final chapter inherit stays at 10%");

// Legacy-save repair: a cumulative visitor ledger must not appear as tens of
// thousands of current-chapter visitors when the old checkpoint has no
// baseline. The lifetime ledger is preserved, while the current chapter starts
// from zero because the previous chapter boundary cannot be recovered.
{
  const legacy = createReserveState();
  legacy.progression.stage = 7;
  legacy.progression.displayChapter = 7;
  legacy.progression.chapterStart = {
    stage: 7,
    totalVisitors: 0,
    inheritedVisitors: 0,
    visitorLedger: { totalVisitors: 0 }
  };
  legacy.development.operations.totalVisitors = 36764;
  legacy.development.operations.visitorLedger.totalVisitors = 36764;
  const repairedVisitors = chapterVisitorTotal(legacy);
  assert.strictEqual(repairedVisitors, chapterTargets(7).visitors, "legacy cumulative visitors must meet the current gate without becoming the HUD number");
  assert.ok(repairedVisitors < 36764, "legacy cumulative visitor count must not become chapter 7 progress");
  assert.strictEqual(legacy.development.operations.totalVisitors, 36764, "repair must preserve lifetime visitor history");

  const oldStageCheckpoint = createReserveState();
  oldStageCheckpoint.progression.stage = 7;
  oldStageCheckpoint.progression.displayChapter = 7;
  oldStageCheckpoint.progression.chapterStart = { stage: 1, totalVisitors: 0 };
  oldStageCheckpoint.progression.stageStart = { stage: 1, totalVisitors: 0 };
  oldStageCheckpoint.development.operations.totalVisitors = 36764;
  oldStageCheckpoint.development.operations.visitorLedger.totalVisitors = 36764;
  assert.strictEqual(chapterVisitorTotal(oldStageCheckpoint), chapterTargets(7).visitors, "old stage-only checkpoints must keep a late-chapter veteran at the current gate");
}

// Visitor progress is chapter-local: a new chapter starts at 10% of the
// previous chapter's ending total, then counts only visitors gained here.
const chapterVisitors = createReserveState();
chapterVisitors.development.operations.totalVisitors = 100;
chapterVisitors.development.operations.visitorLedger = {
  totalVisitors: 100, migratedVisitors: 40, recruitedVisitors: 60, facilityVisitors: 0
};
game.commitReserveProgression(chapterVisitors);
beginChapterVisitorCheckpoint(chapterVisitors, 2, 100);
chapterVisitors.progression.stage = 2;
chapterVisitors.progression.displayChapter = 2;
const visitorBefore = game.reserveProgression(chapterVisitors).coreMetrics.visitors;
assert.strictEqual(visitorBefore, 10, "new chapter should start at 10% of the previous chapter total");
beginChapterVisitorCheckpoint(chapterVisitors, 14, 100);
chapterVisitors.progression.stage = 14;
chapterVisitors.progression.displayChapter = 14;
const lateVisitorBefore = game.reserveProgression(chapterVisitors).coreMetrics.visitors;
assert.strictEqual(lateVisitorBefore, 10, "every chapter should start at 10% of the previous chapter total");
game.state = { character: { name: "本章游客" }, world: { reserve: chapterVisitors } };
const lateMix = game.buildChapterProgressDetail().metricDetails.visitors.items[0].body;
assert(/上一章只把结束时游客总数的10%带入/.test(lateMix), "visitor mix must state that only 10% carries over");
beginChapterVisitorCheckpoint(chapterVisitors, 2, 100);
chapterVisitors.progression.stage = 2;
chapterVisitors.progression.displayChapter = 2;
chapterVisitors.development.operations.totalVisitors = 104;
chapterVisitors.development.operations.visitorLedger.totalVisitors = 104;
chapterVisitors.development.operations.visitorLedger.recruitedVisitors = 64;
const visitorAfter = game.reserveProgression(chapterVisitors).coreMetrics.visitors;
assert.strictEqual(visitorAfter, 14, "chapter visitor metric should add only this chapter's new visitors");
const previousState = game.state;
game.state = { character: { name: "本章游客" }, world: { reserve: chapterVisitors } };
const visitorDetail = game.buildChapterProgressDetail();
const mix = visitorDetail.metricDetails.visitors.items[0].body;
assert(/继承 10 人/.test(mix) && /招募 4 人/.test(mix), "visitor mix must use this chapter's inherited and new counts");
assert(!/招募 64 人/.test(mix), "visitor mix must not show lifetime recruitment");
game.state = previousState;

{
  const recruitHud = createReserveState();
  recruitHud.development.operations.totalVisitors = 100;
  recruitHud.development.operations.visitorLedger = {
    totalVisitors: 100, migratedVisitors: 0, recruitedVisitors: 0, facilityVisitors: 0, taskVisitors: 0, lostVisitors: 0
  };
  recruitHud.development.operations.recruitment = {
    version: 3, day: 1, dateKey: "2026-01-01", freeRemaining: 2, adCredits: 0, adWatchedToday: 0, totalRecruited: 40, publishCount: 2, lastResult: null
  };
  beginChapterVisitorCheckpoint(recruitHud, 2, 100);
  recruitHud.progression.stage = 2;
  recruitHud.progression.displayChapter = 2;
  const hudBefore = chapterVisitorTotal(recruitHud);
  assert.strictEqual(hudBefore, 10, "chapter 2 HUD starts at 10% inherit");
  const wave = consumeVisitorRecruitment(recruitHud, 2, 0.5, Date.now());
  game.commitReserveProgression(recruitHud);
  assert.strictEqual(chapterVisitorTotal(recruitHud), hudBefore + wave.visitors, "recruitment must add the displayed count after progression commit");
  const recruitMix = (() => {
    game.state = { character: { name: "招募计入" }, world: { reserve: recruitHud } };
    return game.buildChapterProgressDetail().metricDetails.visitors.items[0].body;
  })();
  assert(new RegExp(`招募 ${wave.visitors} 人`).test(recruitMix), "mix must attribute the full recruit wave to this chapter");
}

{
  const specialHud = createCharacter(null, "特别任务游客").world.reserve;
  const now = Date.now();
  specialHud.progression = Object.assign({}, specialHud.progression, { stage: 3, displayChapter: 3 });
  beginChapterVisitorCheckpoint(specialHud, 3, 100);
  specialHud.chapterSpecial = { version: 1, chapter: 3, enteredAt: now - UNLOCK_DELAY_MS, unlocked: true, completed: false };
  const beforeSpecial = chapterVisitorTotal(specialHud);
  const special = applyChapterSpecialReward(specialHud, 6, now);
  const visitorChange = (special.changes || []).find((item) => item.metric === "visitors");
  assert(visitorChange && visitorChange.delta === 18, "chapter 3 special success should display +18 visitors");
  assert.strictEqual(chapterVisitorTotal(specialHud), beforeSpecial + visitorChange.delta, "chapter special visitor reward must land on the chapter HUD");
}

{
  const buildingHud = createReserveState();
  buildingHud.development.operations.totalVisitors = 100;
  buildingHud.development.operations.visitorLedger = {
    totalVisitors: 100, migratedVisitors: 0, recruitedVisitors: 0, facilityVisitors: 0, taskVisitors: 0, lostVisitors: 0
  };
  beginChapterVisitorCheckpoint(buildingHud, 2, 100);
  buildingHud.progression.stage = 2;
  buildingHud.progression.displayChapter = 2;
  assert(buildReserveDevelopmentPlan(buildingHud, "river_shallows", "visitor_boardwalk", 1).ok);
  const hudBefore = chapterVisitorTotal(buildingHud);
  assert.strictEqual(hudBefore, 10, "building settlement must start from this chapter's 10% inherit");
  const settlement = settleReserveDevelopmentDay(buildingHud, 2, { weather: "阴" });
  assert(settlement && settlement.visitors > 0, "visitor buildings should produce this chapter's facility visits");
  game.commitReserveProgression(buildingHud);
  assert.strictEqual(chapterVisitorTotal(buildingHud), hudBefore + settlement.visitors, "facility visits must add to the chapter HUD after progression commit");
  const buildingMix = (() => {
    game.state = { character: { name: "建筑到访" }, world: { reserve: buildingHud } };
    return game.buildChapterProgressDetail().metricDetails.visitors.items[0].body;
  })();
  assert(new RegExp(`到访 ${settlement.visitors} 人`).test(buildingMix), "mix must attribute facility visits to this chapter");
  assert(/继承 10 人/.test(buildingMix), "building visits must not replace the 10% inherit");
}

const incompleteVisitorSnap = {
  progression: JSON.parse(JSON.stringify(chapterVisitors.progression)),
  ecology: JSON.parse(JSON.stringify(chapterVisitors.ecology))
};
assert.notEqual(chapterVisitorTotal(incompleteVisitorSnap), 0, "a snapshot without the visitor ledger must not collapse the chapter total to 0");
game.state = { character: { name: "游客冻结" }, world: { reserve: chapterVisitors } };
game.settlementModal = { pendingDisplayBefore: incompleteVisitorSnap };
assert.equal(game.reserveDynamicTargets(chapterVisitors).visitors, visitorAfter, "HUD visitors must not flash 0 while a settlement snapshot is missing the visitor ledger");
game.settlementModal = null;
game.state = previousState;

// Live core metrics are the only hard promotion gate. Leftover fund / story
// counters must not keep the player on the current chapter after HUD 100%.
const coreOnly = readyChapterOneReserve();
coreOnly.development.operations.totalVisitors = chapterTargets(1).visitors;
coreOnly.progression = Object.assign({}, coreOnly.progression, {
  totalFundEarned: 0,
  totalMeaningfulActions: 0,
  totalStrategicChoices: 0,
  totalMajorStrategicChoices: 0,
  activeSeconds: 0
});
const coreOnlyProgression = game.reserveProgression(coreOnly);
assert.strictEqual(coreOnlyProgression.stage, 2, "live core metrics must promote without leftover fund or story gates");
const fundStarvedGame = new Game();
if (fundStarvedGame.stopLoop) fundStarvedGame.stopLoop();
fundStarvedGame.render = () => {};
fundStarvedGame.state = { character: { name: "基金不足" }, world: { reserve: coreOnly }, ui: {} };
assert(fundStarvedGame.armPendingChapterPromotion(coreOnly, 1), "cores complete should queue the next chapter even at 0 fund earned");
assert.strictEqual(Number(coreOnly.progression.stage), 1, "queued promotion must hold the HUD on the current chapter");
assert.strictEqual(Number(fundStarvedGame.pendingChapterPromotion.to), 2, "queued promotion should target the next chapter");

const opening = game.buildChapterStory(2, "start");
assert(/种群/.test(opening.goalLine) && /动物总数/.test(opening.goalLine) && /本章游客/.test(opening.goalLine), "chapter opening must show all three core goals");
const gradient = { addColorStop() {} };
game.ctx = new Proxy({}, {
  get(target, prop) {
    if (prop === "measureText") return (value) => ({ width: String(value || "").length * 6 });
    if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
    if (prop === "canvas") return { width: 375, height: 667 };
    if (!target[prop]) target[prop] = () => {};
    return target[prop];
  },
  set(target, prop, value) { target[prop] = value; return true; }
});
game.chapterStoryModal = opening;
game.drawChapterStoryModal();
assert(opening.renderedAdvance && opening.renderedAdvance.homepageLayout, "later chapter advance must reuse the prologue homepage layout");
assert.strictEqual(opening.renderedAdvance.speaker, "第2章目标", "chapter advance speaker must match 第N章目标");
assert.strictEqual((opening.renderedAdvance.goals || []).length, 3, "chapter advance must keep three icon rows");
assert(/解救/.test(opening.renderedAdvance.goals[0]) && /招募/.test(opening.renderedAdvance.goals[1]) && /种群/.test(opening.renderedAdvance.goals[2]), "chapter advance rows must stay 解救/招募/种群");
assert(/无代价的善意/.test(opening.renderedAdvance.rule), "chapter advance must keep the prologue rule line");
assert.strictEqual(opening.buttonLabel, "进入游戏", "later chapter start must keep the gold enter-game action");
assert.strictEqual(opening.renderedAdvance.headerLabel, "荒野守望 · 第2章", "chapter 2 header must keep a single chapter title");
assert.strictEqual(opening.renderedAdvance.guideLabel, "引导", "chapter 2 must keep one guide chip");
assert.strictEqual(opening.renderedAdvance.prologueChrome, false, "chapter 2 must not also draw the prologue 序章/引导 labels");
const ending = game.buildChapterStory(5, "end");
game.chapterStoryModal = ending;
game.drawChapterStoryModal();
assert(ending.renderedAdvance && ending.renderedAdvance.homepageLayout, "chapter ending must keep the same homepage layout");
assert.strictEqual(ending.renderedAdvance.speaker, "第5章总结", "chapter ending speaker must match 第N章总结");
assert.strictEqual((ending.renderedAdvance.goals || []).length, 3, "chapter ending must keep three icon rows");
assert.strictEqual(ending.buttonLabel, "走向下一章", "chapter ending must keep the gold next-chapter action");
assert.strictEqual(ending.renderedAdvance.headerLabel, "荒野守望 · 第5章", "chapter 5 ending must keep a single chapter title");
assert.strictEqual(ending.renderedAdvance.prologueChrome, false, "chapter endings must not also draw the prologue 序章/引导 labels");
for (let chapter = 1; chapter <= 20; chapter += 1) {
  const story = game.buildChapterStory(chapter, "start");
  assert(Array.isArray(story.goalItems) && story.goalItems.length === 3, `chapter ${chapter} opening should expose three goal tiles`);
  assert(story.goalItems.every((item) => item.target > 0 && item.current >= 0), `chapter ${chapter} goal tiles should have numeric progress`);
  assert(Array.isArray(story.rescueNames) && /本章必救：/.test(story.rescueLine), `chapter ${chapter} opening should describe rescue requirements`);
  game.chapterStoryModal = story;
  game.drawChapterStoryModal();
  assert.strictEqual(story.renderedAdvance.headerLabel, `荒野守望 · 第${chapter}章`, `chapter ${chapter} opening must show the chapter title once`);
  assert.strictEqual(story.renderedAdvance.guideLabel, "引导", `chapter ${chapter} opening must keep one guide chip`);
  assert.strictEqual(story.renderedAdvance.prologueChrome, false, `chapter ${chapter} opening must not stack 序章 labels`);
  const close = game.buildChapterStory(chapter, "end");
  game.chapterStoryModal = close;
  game.drawChapterStoryModal();
  assert.strictEqual(close.renderedAdvance.headerLabel, `荒野守望 · 第${chapter}章`, `chapter ${chapter} ending must show the chapter title once`);
  assert.strictEqual(close.renderedAdvance.prologueChrome, false, `chapter ${chapter} ending must not stack 序章 labels`);
}
const chapterDetail = game.buildChapterProgressDetail();
assert.strictEqual(chapterDetail.kind, "chapterProgress", "chapter title should open the dedicated progress view");
assert(chapterDetail.metricDetails && chapterDetail.metricDetails.visitors && chapterDetail.metricDetails.species && chapterDetail.metricDetails.animals, "all three core metrics need click-through details");
assert(/下一章/.test(chapterDetail.metricDetails.visitors.kicker), "visitor detail should describe the next chapter gate");
assert(Array.isArray(chapterDetail.speciesNeeded), "species detail should expose the species still to unlock");
assert(chapterDetail.metricDetails.animals.items.length >= 3
  && chapterDetail.metricDetails.animals.items.slice(0, 3).map((item) => item.tag).join("") === "123"
  && chapterDetail.metricDetails.animals.items.some((item) => item.tag === "幸运")
  && /动物.*如何增加/.test(chapterDetail.metricDetails.animals.title), "animal detail should expose three ways to increase animals plus the daily rewarded-ad slot");
console.log("chapter goals check ok (20 chapters, six-chapter onboarding pacing, live-core promotion)");
