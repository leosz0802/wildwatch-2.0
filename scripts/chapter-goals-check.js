const assert = require("assert");
const { chapterTargets, CHAPTER_TARGETS, beginChapterVisitorCheckpoint, beginChapterAnimalCheckpoint, chapterVisitorTotal, chapterVisitorCarryover, chapterAnimalCarryover, chapterAnimalTotal } = require("../js/chapterTargets");
const { createReserveState } = require("../js/world");
const { createCharacter } = require("../js/storage");
const { Game } = require("../js/game");
const { recordIncrease } = require("../js/animalSourceLedger");
const { consumeVisitorRecruitment } = require("../js/visitorRecruitment");
const { applyChapterSpecialReward, UNLOCK_DELAY_MS } = require("../js/chapterSpecialSystem");
const { buildReserveDevelopmentPlan, settleReserveDevelopmentDay } = require("../js/reserveDevelopment");

assert.strictEqual(CHAPTER_TARGETS.length, 11, "there must be one target row per chapter");
for (let chapter = 1; chapter <= 11; chapter += 1) {
  const current = chapterTargets(chapter);
  assert(current.species > 0 && current.animals > 0 && current.visitors > 0, `chapter ${chapter} target is empty`);
  if (chapter > 1) assert.ok(current.visitors > chapterTargets(chapter - 1).visitors, `chapter ${chapter} visitor target must keep rising`);
  if (chapter === 9) {
    assert.ok(current.animals <= 300, "chapter 9 this-chapter animal gate must stay a session-scale target");
    assert.ok(current.animals - chapterTargets(8).animals <= 80, "chapter 9 must not ask for a 100+ this-chapter animal jump");
  }
  if (chapter === 10) {
    assert.ok(current.animals >= 240 && current.animals <= 280, "chapter 10 this-chapter animal gate must stay a session-scale target");
    assert.ok(current.animals - chapterTargets(9).animals <= 50, "chapter 10 must not jump +100 this-chapter animals");
  }
  if (chapter > 1) {
    const animalInherit = chapterAnimalCarryover(chapterTargets(chapter - 1).animals, chapter);
    assert.strictEqual(animalInherit, Math.round(chapterTargets(chapter - 1).animals * 0.1), `chapter ${chapter} animal inherit must stay at 10%`);
    assert.ok(current.animals - animalInherit > animalInherit, `chapter ${chapter} animal gate must be earned mostly in this chapter`);
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
  beginChapterAnimalCheckpoint(reserve, 1, 0);
  const remaining = Math.max(0, chapterTargets(1).animals - chapterAnimalTotal(reserve));
  if (remaining) recordIncrease(reserve, "rescued", remaining);
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
  assert.strictEqual(repairedVisitors, chapterVisitorCarryover(chapterTargets(6).visitors, 7), "legacy cumulative visitor count must fall back to the normal chapter carryover");
  assert.ok(repairedVisitors < chapterTargets(7).visitors, "legacy cumulative visitor count must not satisfy the current chapter gate");
  assert.strictEqual(legacy.development.operations.totalVisitors, 36764, "repair must preserve lifetime visitor history");

  const oldStageCheckpoint = createReserveState();
  oldStageCheckpoint.progression.stage = 7;
  oldStageCheckpoint.progression.displayChapter = 7;
  oldStageCheckpoint.progression.chapterStart = { stage: 1, totalVisitors: 0 };
  oldStageCheckpoint.progression.stageStart = { stage: 1, totalVisitors: 0 };
  oldStageCheckpoint.development.operations.totalVisitors = 36764;
  oldStageCheckpoint.development.operations.visitorLedger.totalVisitors = 36764;
  assert.strictEqual(chapterVisitorTotal(oldStageCheckpoint), chapterVisitorCarryover(chapterTargets(6).visitors, 7), "old stage-only checkpoints must use the chapter carryover instead of lifetime visitors");
}

// A chapter-5 save that already contains the old synthetic legacySeed must
// keep only the real carryover, while preserving the lifetime total used by
// economy and historical reports.
{
  const chapterFiveCarry = chapterVisitorCarryover(chapterTargets(4).visitors, 5);
  const chapterFive = createReserveState();
  chapterFive.progression.stage = 5;
  chapterFive.progression.displayChapter = 5;
  chapterFive.progression.chapterStart = {
    stage: 5,
    totalVisitors: 495,
    inheritedVisitors: chapterFiveCarry,
    visitorLedger: { totalVisitors: 495 }
  };
  chapterFive.development.operations.totalVisitors = 495;
  chapterFive.development.operations.visitorLedger = { totalVisitors: 495 };
  chapterFive.development.operations.chapterVisitors = {
    stage: 5,
    inherited: chapterFiveCarry,
    legacySeed: 454,
    start: { totalVisitors: 495 },
    startLifetime: 495
  };
  assert.strictEqual(chapterVisitorTotal(chapterFive), chapterFiveCarry, "chapter 5 HUD must show the inherited carryover, not the lifetime 495");
  assert.strictEqual(chapterFive.development.operations.totalVisitors, 495, "chapter 5 migration must preserve lifetime visitors");
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
assert.strictEqual(visitorBefore, chapterVisitorCarryover(chapterTargets(1).visitors, 2), "new chapter should start at 10% of the previous chapter gate when that floor is higher than the raw total");
beginChapterVisitorCheckpoint(chapterVisitors, 14, 100);
chapterVisitors.progression.stage = 14;
chapterVisitors.progression.displayChapter = 14;
const lateVisitorFloor = chapterVisitorCarryover(chapterTargets(13).visitors, 14);
const lateVisitorBefore = game.reserveProgression(chapterVisitors).coreMetrics.visitors;
assert.strictEqual(lateVisitorFloor, chapterVisitorCarryover(chapterTargets(13).visitors, 14), `chapter 13 visitor gate ${chapterTargets(13).visitors} floors chapter 14 inherit at ${lateVisitorFloor}`);
assert.strictEqual(lateVisitorBefore, lateVisitorFloor, "late-chapter HUD floors to 10% of the previous visitor gate when the raw carryover is smaller");
function visitorMixBody(detail) {
  const items = (((detail || {}).metricDetails || {}).visitors || {}).items || [];
  const mix = items.find((item) => item.title === "当前游客构成") || items[0] || {};
  return mix.body || "";
}

game.state = { character: { name: "本章游客" }, world: { reserve: chapterVisitors } };
const lateMix = visitorMixBody(game.buildChapterProgressDetail());
assert(new RegExp(`继承 ${lateVisitorFloor} 人`).test(lateMix), "visitor mix must show the floored inherit, not the hidden carryover rule");
assert(!/%带入|10%|15%|1%—3%/.test(lateMix), "visitor mix must not explain the system percentage");
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
const mix = visitorMixBody(visitorDetail);
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
  assert.strictEqual(hudBefore, chapterVisitorCarryover(chapterTargets(1).visitors, 2), "chapter 2 HUD starts at 10% of the previous visitor gate");
  const wave = consumeVisitorRecruitment(recruitHud, 2, 0.5, Date.now());
  game.commitReserveProgression(recruitHud);
  assert.strictEqual(chapterVisitorTotal(recruitHud), hudBefore + wave.visitors, "recruitment must add the displayed count after progression commit");
  const recruitMix = (() => {
    game.state = { character: { name: "招募计入" }, world: { reserve: recruitHud } };
    return visitorMixBody(game.buildChapterProgressDetail());
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
  assert.strictEqual(hudBefore, chapterVisitorCarryover(chapterTargets(1).visitors, 2), "building settlement must start from the previous chapter visitor floor");
  const settlement = settleReserveDevelopmentDay(buildingHud, 2, { weather: "阴" });
  assert(settlement && settlement.visitors > 0, "visitor buildings should produce this chapter's facility visits");
  game.commitReserveProgression(buildingHud);
  assert.strictEqual(chapterVisitorTotal(buildingHud), hudBefore + settlement.visitors, "facility visits must add to the chapter HUD after progression commit");
  const buildingMix = (() => {
    game.state = { character: { name: "建筑到访" }, world: { reserve: buildingHud } };
    return visitorMixBody(game.buildChapterProgressDetail());
  })();
  assert(new RegExp(`到访 ${settlement.visitors} 人`).test(buildingMix), "mix must attribute facility visits to this chapter");
  assert(new RegExp(`继承 ${chapterVisitorCarryover(chapterTargets(1).visitors, 2)} 人`).test(buildingMix), "building visits must not replace the chapter inherit");
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
assert.strictEqual((opening.renderedAdvance.metrics || []).length, 3, "chapter advance must render three numeric goal cards");
assert(opening.renderedAdvance.metrics.every((item) => item.target > 0 && item.progress >= 0 && item.progress <= 1), "chapter numeric cards must expose bounded progress");
assert.strictEqual(opening.renderedAdvance.style, "shared-prologue-goal-screen", "chapter advance must reuse the shared prologue goal screen style");
assert.strictEqual(opening.renderedAdvance.theme, "dark-prologue", "chapter advance must reuse the original dark prologue theme");
assert.strictEqual(opening.renderedAdvance.sharedImage, "prologue-fog-v1.jpg", "chapter advance must reuse the same chapter background image");
assert.strictEqual(opening.buttonLabel, "进入游戏", "later chapter start must keep the gold enter-game action");
assert.strictEqual(opening.renderedAdvance.headerLabel, "荒野守望 · 第2章", "chapter 2 header must keep a single chapter title");
assert.strictEqual(opening.renderedAdvance.guideLabel, "引导", "chapter 2 must keep one guide chip");
assert.strictEqual(opening.renderedAdvance.prologueChrome, false, "chapter 2 must not also draw the prologue 序章/引导 labels");
game.screen = "home";
const enterHit = game.hitAreas.find((hit) => hit.modalAction && hit.y > game.height * 0.7);
const guideHit = game.hitAreas.find((hit) => hit.guideChip);
assert(enterHit, "进入游戏 must stay tappable above the locked nav band");
assert(guideHit, "引导 must have its own hit");
game.hitAreas.push({ x: enterHit.x, y: enterHit.y - 10, w: 80, h: 80, animal: true, map: true, hud: false, onTap() { throw new Error("animal under the chapter card"); } });
const enterTap = game.hitAreaAt(enterHit.x + enterHit.w / 2, enterHit.y + enterHit.h / 2);
const guideTap = game.hitAreaAt(guideHit.x + 8, guideHit.y + 8);
assert(enterTap === enterHit, "an animal under the chapter card must not take 进入游戏");
assert(guideTap === guideHit, "引导 must win its own tap");
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
  assert.strictEqual((story.renderedAdvance.metrics || []).length, 3, `chapter ${chapter} opening must keep three numeric goal cards`);
  assert.strictEqual(story.renderedAdvance.guideLabel, "引导", `chapter ${chapter} opening must keep one guide chip`);
  assert.strictEqual(story.renderedAdvance.theme, "dark-prologue", `chapter ${chapter} opening must keep the original dark prologue theme`);
  assert.strictEqual(story.renderedAdvance.prologueChrome, false, `chapter ${chapter} opening must not stack 序章 labels`);
  const close = game.buildChapterStory(chapter, "end");
  game.chapterStoryModal = close;
  game.drawChapterStoryModal();
  assert.strictEqual(close.renderedAdvance.headerLabel, `荒野守望 · 第${chapter}章`, `chapter ${chapter} ending must show the chapter title once`);
  assert.strictEqual(close.renderedAdvance.theme, "dark-prologue", `chapter ${chapter} ending must keep the original dark prologue theme`);
  assert.strictEqual(close.renderedAdvance.prologueChrome, false, `chapter ${chapter} ending must not stack 序章 labels`);
}
const chapterDetail = game.buildChapterProgressDetail();
assert.strictEqual(chapterDetail.kind, "chapterProgress", "chapter title should open the dedicated progress view");
assert(chapterDetail.metricDetails && chapterDetail.metricDetails.visitors && chapterDetail.metricDetails.species && chapterDetail.metricDetails.animals, "all three core metrics need click-through details");
assert(/下一章/.test(chapterDetail.metricDetails.visitors.kicker), "visitor detail should describe the next chapter gate");
assert(Array.isArray(chapterDetail.speciesNeeded), "species detail should expose the species still to unlock");
const animalSourceStrip = chapterDetail.metricDetails.animals.items.find((item) => item.sourceStrip);
assert(animalSourceStrip
  && animalSourceStrip.parts.map((part) => part.label).join("") === "解救迁入繁殖剩余"
  && chapterDetail.metricDetails.animals.items.some((item) => item.tag === "幸运")
  && /动物.*如何增加/.test(chapterDetail.metricDetails.animals.title), "animal detail should show rescue, migration and breeding in one strip plus the daily rewarded-ad slot");
assert.strictEqual((chapterDetail.passGoals || []).length, 3, "chapter progress must expose the three pass tasks");
assert.deepStrictEqual((chapterDetail.passGoals || []).map((item) => item.passMetric), ["species", "visitors", "animals"]);
assert((chapterDetail.passGoals || []).every((item) => item.eventTitle), "each pass task must name a nearest event");
const visitorHowTo = chapterDetail.metricDetails.visitors.items;
assert.strictEqual(visitorHowTo[0].tag, "最近");
assert(visitorHowTo[0].title, "visitor how-to must lead with a concrete nearest event");
assert.strictEqual(visitorHowTo[1].title, "当前游客构成");
assert.strictEqual(visitorHowTo[2].title, "完成地图事件");
assert.strictEqual(visitorHowTo[3].title, "改善保护区并招募");
assert(!/都按本章重新计算/.test(visitorHowTo[1].body), "visitor mix must not bury the next card under a long recap");
assert(visitorHowTo.every((item) => !/%带入|游客目标的|1%—3%|约\d+%|的 \d+% 计算/.test(`${item.title} ${item.body}`)), "visitor how-to must keep results and hide the percentage rules");
assert.strictEqual(chapterDetail.metricDetails.animals.items[1].tag, "最近");
assert.strictEqual(chapterDetail.metricDetails.species.items[0].tag, "最近");
game.info = { windowWidth: 375, windowHeight: 667, pixelRatio: 1, safeArea: { top: 0, bottom: 667 } };
game.width = 375;
game.height = 667;
game.dpr = 1;
game.scrollY = 0;
game.hitAreas = [];
game.infoDetailModal = Object.assign({}, chapterDetail.metricDetails.visitors, { kind: "visitorMetricDetail" });
game.drawInfoDetailModal();
const paintedVisitorCards = (game.infoDetailModal.renderedInfoItems || []).filter((row) => row.layout);
assert(paintedVisitorCards.length >= 4, "visitor how-to must show the nearest event plus cards 1-3");
assert.strictEqual(paintedVisitorCards[3].item.title, "改善保护区并招募");
assert(paintedVisitorCards[3].y - (paintedVisitorCards[2].y + paintedVisitorCards[2].h) <= 12, "card 3 must sit immediately under card 2");
console.log("chapter goals check ok (11 chapters, six-chapter onboarding pacing, live-core promotion)");
