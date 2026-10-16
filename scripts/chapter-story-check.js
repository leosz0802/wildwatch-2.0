const fs = require("fs");
const path = require("path");
const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
const { getUnlockedSpecies } = require("../js/animalWorld");
const { CHAPTERS } = require("../js/animalWorld");
const { chapterTargets, beginChapterAnimalCheckpoint, chapterAnimalTotal } = require("../js/chapterTargets");
const { recordIncrease } = require("../js/animalSourceLedger");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = path.resolve(__dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(root, "game.json"), "utf8"));
const chapterPackage = (config.subpackages || []).find((item) => item.name === "chapters");
assert(chapterPackage && chapterPackage.root === "chapter-assets", "chapter asset subpackage is missing");
const artFiles = fs.readdirSync(path.join(root, chapterPackage.root)).filter((file) => /\.jpg$/i.test(file));
assert(artFiles.length === 0, "chapter transitions must reuse the first opening illustration instead of shipping a second chapter jpg");

const game = Object.create(Game.prototype);
game.state = createCharacter(null, "保护区卫士");
game.chapterArt = {};
game.chapterStoryQueue = [];
game.chapterStoryModal = null;
game.pendingMissionAfterChapter = false;
game.render = () => {};
game.maybeOpenMissionPush = () => false;
game.prepareChapterArt = () => {};

Array.from({ length: CHAPTERS.length }, (_, index) => index + 1).forEach((chapterNumber) => {
  const start = game.buildChapterStory(chapterNumber, "start");
  const ending = game.buildChapterStory(chapterNumber, "end", { population: 100 + chapterNumber, daysManaged: chapterNumber * 7 });
  assert(start.level === chapterNumber && start.phase === "start", `chapter ${chapterNumber} start metadata is invalid`);
  assert(ending.level === chapterNumber && ending.phase === "end", `chapter ${chapterNumber} ending metadata is invalid`);
  assert(start.body && ending.body, `chapter ${chapterNumber} should have start and ending prose`);
  assert(start.speaker && start.quote && start.objective, `chapter ${chapterNumber} opening dialogue is incomplete`);
  assert(start.speciesLine.includes("本章出现") || start.speciesLine.includes("本章收束") || /首巡/.test(start.speciesLine), `chapter ${chapterNumber} species line missing`);
  assert(ending.speciesLine.includes(`${getUnlockedSpecies(chapterNumber, chapterNumber).length} 种动物`), `chapter ${chapterNumber} ending species count is wrong`);
  if (!(chapterNumber === 1 && start.firstRun)) assert(/待结案|支线/.test(start.body), `chapter ${chapterNumber} start should acknowledge an unresolved preceding case`);
  assert(/未解证据/.test(ending.body), `chapter ${chapterNumber} ending should preserve unresolved case continuity`);
});

game.state.world.collection.cases.case_1.ending = { id: "resolved", name: "已经结案" };
const resolvedStart = game.buildChapterStory(2, "start");
assert(!/仍未结案/.test(resolvedStart.body) && /案件已结/.test(resolvedStart.speciesLine), "resolved case should remove the unresolved chapter branch");

const transition = {
  chapterTransition: { from: 2, to: 3, summary: { population: 188, daysManaged: 10 } }
};
assert(game.queueChapterStoriesForSettlement(transition), "level transition should queue chapter stories");
assert(game.chapterStoryModal.level === 3 && game.chapterStoryModal.phase === "start", "a transition should open the next chapter directly");
assert(game.chapterStoryQueue.length === 0 && game.chapterStoryModal.transitionFrom === 2, "chapter progression must use one shared-image text screen");
assert(game.chapterStoryModal.body.includes(game.buildChapterStory(2, "end").narrativeBeat.scene), "single transition screen must retain the previous chapter conclusion");
game.dismissChapterStory();
assert(game.chapterStorySeen(2, "end"), "combined transition should mark the previous ending as seen");
assert(game.chapterStorySeen(3, "start"), "chapter start watch record was not saved");
assert(!game.queueChapterStoriesForSettlement(transition), "watched chapter transition should not repeat");

const bootGame = Object.create(Game.prototype);
bootGame.state = createCharacter(null, "保护区卫士");
bootGame.screen = "home";
bootGame.chapterStoryModal = null;
bootGame.chapterStoryQueue = [];
bootGame.playablePrologueState = () => ({ active: false });
bootGame.openFirstReturnHook = () => false;
bootGame.openQueuedMissionPush = () => false;
bootGame.openPendingShareInvite = () => false;
bootGame.openOfflineBrief = () => false;
bootGame.openGuardianReturnLetter = () => false;
bootGame.openFirstOnboardingChoice = () => false;
bootGame.openPendingGuardianPromise = () => false;
bootGame.openAnimalLetterPrompt = () => false;
bootGame.maybeOpenMissionPush = () => false;
assert(bootGame.openPostFirstFrameExperience(), "post-frame startup should still run");
assert(!bootGame.chapterStoryModal, "startup should not auto-open a chapter story on resume");

game.state.ui = Object.assign({}, game.state.ui || {}, { chapterStoriesSeen: {} });
assert(game.queueChapterStoriesForSettlement({ finalChapterEnding: true }), "final chapter ending should queue after a valid action");
assert(game.chapterStoryModal.level === CHAPTERS.length && game.chapterStoryModal.phase === "end", "final chapter ending metadata is wrong");
game.dismissChapterStory();
assert(game.chapterStorySeen(CHAPTERS.length, "end"), "final chapter ending watch record missing");
assert(!game.queueChapterStoriesForSettlement({ finalChapterEnding: true }), "Lv20 final ending should not repeat");

game.state.ui = Object.assign({}, game.state.ui || {}, { chapterStoriesSeen: {} });
game.screen = "home";
game.chapterStoryModal = null;
game.chapterStoryQueue = [];
game.pendingChapterAdvance = false;
assert(game.queueChapterStoriesForSettlement({ chapterTransition: { from: 1, to: 2 }, deferChapterStory: true }), "chapter 2 entry should queue behind settlement");
game.pendingChapterAdvance = true;
assert(game.queueChapterStoriesForSettlement({ deferChapterStory: true }), "later settlements must keep the queued chapter card");
assert(!game.chapterStoryModal && game.chapterStoryQueue.length === 1 && game.chapterStoryQueue[0].level === 2, "a follow-up settlement must not drop the chapter 2 entry card");
game.mapConsequencePulse = { expiresAt: Date.now() + 8000 };
game.activeTaskLock = null;
game.settlementModal = null;
game.patrolTaskModal = null;
game.infoDetailModal = null;
game.taskCompletionFeedback = { pending: [] };
assert(game.tryPresentPendingChapterAdvance() && game.chapterStoryModal && game.chapterStoryModal.level === 2, "chapter 2 entry must open even while the map pulse is playing");
game.chapterStoryModal = null;
game.chapterStoryQueue = [];
game.pendingChapterAdvance = false;
game.state.world.reserve.progression = Object.assign({}, game.state.world.reserve.progression || {}, { stage: 2, displayChapter: 2 });
game.state.ui = Object.assign({}, game.state.ui || {}, { chapterStoriesSeen: { "1:start": true } });
game.mapConsequencePulse = null;
assert(game.maybeOpenChapterStoryOnLogin() && game.chapterStoryModal && game.chapterStoryModal.level === 2, "returning to chapter 2 must still show the unseen entry card");
game.dismissChapterStory();

game.state.ui = Object.assign({}, game.state.ui || {}, { chapterStoriesSeen: {} });
game.screen = "home";
game.chapterStoryModal = null;
game.chapterStoryQueue = [];
game.pendingChapterAdvance = false;
game.activeTaskLock = null;
game.settlementModal = null;
game.patrolTaskModal = null;
game.infoDetailModal = null;
game.taskCompletionFeedback = {
  pending: [{ key: "last-unlock", title: "解救最后一只动物" }],
  take() { return this.pending.shift(); }
};
game.trackNarrative = () => {};
game.saveState = () => {};
game.queueChapterStoriesForSettlement(Object.assign({}, transition, { deferChapterStory: true }));
game.pendingChapterAdvance = true;
assert(!game.chapterStoryModal && game.chapterStoryQueue.length === 1, "chapter advance must stay queued behind the last unlock task");
assert(game.showNextTaskCompletionNotice(), "the last unlock task UI must play first");
assert(game.infoDetailModal && game.infoDetailModal.kind === "taskCompletionNotice", "last unlock completion should be visible");
assert(!game.chapterStoryModal, "chapter advance must not cover the last unlock task UI");
game.dismissInfoDetailModal();
assert(game.chapterStoryModal && game.chapterStoryModal.level === 3, "chapter advance should open only after the last unlock UI closes");

game.state.ui = Object.assign({}, game.state.ui || {}, { chapterStoriesSeen: {} });
game.chapterStoryModal = null;
game.chapterStoryQueue = [];
game.queueChapterStoriesForSettlement({ chapterTransition: { from: 4, to: 5 }, deferChapterStory: true });
game.pendingChapterAdvance = true;
game.infoDetailModal = { kind: "chapterRescueResult", pendingChapterAdvance: true, action() {} };
assert(!game.tryPresentPendingChapterAdvance(), "last chapter rescue result must finish before promotion");
game.infoDetailModal = null;
assert(game.tryPresentPendingChapterAdvance() && game.chapterStoryModal.level === 5, "promotion follows the last rescue result");

{
  const seq = new Game();
  if (seq.stopLoop) seq.stopLoop();
  seq.render = () => {};
  seq.playSfx = () => {};
  seq.prepareChapterArt = () => {};
  seq.openFirstReturnHook = () => false;
  seq.openPendingShareInvite = () => false;
  seq.openPendingStrategicDilemma = () => false;
  seq.openPendingEmotionEvent = () => false;
  seq.openOfflineBrief = () => false;
  seq.openGuardianReturnLetter = () => false;
  seq.openAnimalLetterPrompt = () => false;
  seq.openQueuedMissionPush = () => false;
  seq.maybeOpenMissionPush = () => false;
  seq.trackNarrative = () => {};
  seq.screen = "home";
  seq.state = createCharacter(null, "章节进阶顺序");
  seq.state.ui = Object.assign({}, seq.state.ui || {}, { chapterStoriesSeen: {}, onboarding: { completed: true, recruitmentDone: true, seen: {} } });
  seq.pendingChapterPromotion = null;
  seq.pendingChapterAdvance = false;
  seq.chapterStoryModal = null;
  seq.chapterStoryQueue = [];
  seq.infoDetailModal = null;
  seq.settlementModal = null;
  seq.patrolTaskModal = null;
  seq.activeTaskLock = null;
  seq.gesture = null;
  seq.interstitialAds = null;
  seq.mapConsequencePulse = { expiresAt: Date.now() + 8000 };
  const reserve = seq.state.world.reserve;
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
  reserve.progression = Object.assign({}, reserve.progression, {
    stage: 1,
    displayChapter: 1,
    totalMeaningfulActions: 100,
    totalStrategicChoices: 100,
    totalMajorStrategicChoices: 100,
    activeSeconds: 1000,
    chapterComplete: true
  });
  reserve.storyDiscoveries = { case_1: { evidence: 3 } };
  reserve.eventChain = { chapterLevel: 1, step: 99, length: 1, completed: true };
  reserve.development = reserve.development || {};
  reserve.development.operations = Object.assign({}, reserve.development.operations || {}, {
    totalVisitors: chapterTargets(1).visitors
  });
  beginChapterAnimalCheckpoint(reserve, 1, 0);
  const remaining = Math.max(0, chapterTargets(1).animals - chapterAnimalTotal(reserve) - 1);
  if (remaining) recordIncrease(reserve, "rescued", remaining);
  seq.resetTaskCompletionFeedback();
  recordIncrease(reserve, "rescued", 1);
  seq.commitReserveProgression(reserve, undefined, 1);
  assert(Number(seq.state.world.reserve.progression.stage) === 1, "last core completion must not enter the next chapter immediately");
  assert(seq.pendingChapterPromotion && Number(seq.pendingChapterPromotion.to) === 2, "last core completion should hold the next chapter");
  seq.collectTaskCompletionFeedback();
  assert(seq.taskCompletionFeedback.pending.some((item) => /动物总数|本章动物/.test(item.title)), "the last chapter task must queue its completion notice");
  seq.settlementModal = { title: "结果" };
  assert(!seq.showNextTaskCompletionNotice(), "other occupying tasks must delay the last-core notice");
  seq.settlementModal = null;
  assert(seq.showNextTaskCompletionNotice(), "the last-core notice must skip the generic map pulse");
  assert(seq.infoDetailModal && seq.infoDetailModal.kind === "taskCompletionNotice", "show the finished third chapter task first");
  assert(!seq.chapterStoryModal, "cutscene must wait behind the last-core notice");
  assert(Number(seq.state.world.reserve.progression.stage) === 1, "HUD chapter must stay on the current chapter during the notice");
  seq.dismissInfoDetailModal();
  assert(seq.chapterStoryModal && seq.chapterStoryModal.level === 2, "next-chapter cutscene comes after the last-core notice");
  assert(Number(seq.state.world.reserve.progression.stage) === 1, "must not enter the next chapter during the cutscene");
  seq.dismissChapterStory();
  assert(Number(seq.state.world.reserve.progression.stage) === 2, "enter the next chapter only after the cutscene is dismissed");
}

{
  const drain = new Game();
  if (drain.stopLoop) drain.stopLoop();
  drain.render = () => {};
  drain.playSfx = () => {};
  drain.prepareChapterArt = () => {};
  drain.openFirstReturnHook = () => false;
  drain.openPendingShareInvite = () => false;
  drain.openPendingStrategicDilemma = () => false;
  drain.openPendingEmotionEvent = () => false;
  drain.openOfflineBrief = () => false;
  drain.openGuardianReturnLetter = () => false;
  drain.openAnimalLetterPrompt = () => false;
  drain.openQueuedMissionPush = () => false;
  drain.maybeOpenMissionPush = () => false;
  drain.trackNarrative = () => {};
  drain.screen = "home";
  drain.state = createCharacter(null, "章节任务收尾");
  drain.state.ui = Object.assign({}, drain.state.ui || {}, { chapterStoriesSeen: {}, onboarding: { completed: true, recruitmentDone: true, seen: {} } });
  drain.pendingChapterPromotion = { from: 1, to: 2, summary: {} };
  drain.pendingChapterAdvance = true;
  drain.chapterStoryModal = null;
  drain.chapterStoryQueue = [];
  drain.infoDetailModal = null;
  drain.settlementModal = null;
  drain.patrolTaskModal = null;
  drain.activeTaskLock = null;
  drain.gesture = null;
  drain.interstitialAds = null;
  drain.mapConsequencePulse = null;
  drain.completionFeedbackHasCharacter = true;
  drain.taskCompletionFeedback = {
    pending: [
      { key: "goal:ch1:daily:patrol", title: "第一章每日巡护" },
      { key: "core:1:animals", title: "第1章动物总数目标" }
    ],
    collect() {},
    absorb() {},
    take() { return this.pending.shift() || null; }
  };
  drain.queueChapterStoriesForSettlement({ chapterTransition: { from: 1, to: 2 }, deferChapterStory: true });
  assert(!drain.tryPresentPendingChapterAdvance(), "leftover chapter-1 results must block the promotion card");
  assert(!drain.chapterStoryModal, "promotion UI must wait behind leftover task results");
  assert(Number(drain.state.world.reserve.progression.stage) === 1, "must stay on chapter 1 while leftover results are open");
  assert(drain.showNextTaskCompletionNotice() && drain.infoDetailModal && /每日巡护/.test(drain.infoDetailModal.prose), "first leftover result must play first");
  drain.dismissInfoDetailModal();
  assert(drain.showNextTaskCompletionNotice() && drain.infoDetailModal && /动物总数/.test(drain.infoDetailModal.prose), "second leftover result must play next");
  assert(!drain.chapterStoryModal, "promotion UI must wait until every leftover result is closed");
  drain.dismissInfoDetailModal();
  assert(drain.chapterStoryModal && drain.chapterStoryModal.level === 2, "promotion UI comes only after leftover results");
  assert(Number(drain.state.world.reserve.progression.stage) === 1, "must not enter chapter 2 during the promotion card");
  drain.dismissChapterStory();
  assert(Number(drain.state.world.reserve.progression.stage) === 2, "enter the next chapter only after leftover results and the promotion card");
}

{
  const late = new Game();
  if (late.stopLoop) late.stopLoop();
  late.render = () => {};
  late.playSfx = () => {};
  late.prepareChapterArt = () => {};
  late.openFirstReturnHook = () => false;
  late.openPendingShareInvite = () => false;
  late.openPendingStrategicDilemma = () => false;
  late.openPendingEmotionEvent = () => false;
  late.openOfflineBrief = () => false;
  late.openGuardianReturnLetter = () => false;
  late.openAnimalLetterPrompt = () => false;
  late.openQueuedMissionPush = () => false;
  late.maybeOpenMissionPush = () => false;
  late.trackNarrative = () => {};
  late.screen = "home";
  late.state = createCharacter(null, "晋级卡回退");
  late.state.ui = Object.assign({}, late.state.ui || {}, { chapterStoriesSeen: {}, onboarding: { completed: true, recruitmentDone: true, seen: {} } });
  late.pendingChapterPromotion = { from: 1, to: 2, summary: {} };
  late.pendingChapterAdvance = true;
  late.chapterStoryModal = null;
  late.chapterStoryQueue = [];
  late.infoDetailModal = null;
  late.settlementModal = null;
  late.patrolTaskModal = null;
  late.activeTaskLock = null;
  late.gesture = null;
  late.interstitialAds = null;
  late.mapConsequencePulse = null;
  late.completionFeedbackHasCharacter = true;
  late.taskCompletionFeedback = {
    pending: [],
    collect() {},
    absorb() {},
    take() { return this.pending.shift() || null; }
  };
  late.queueChapterStoriesForSettlement({ chapterTransition: { from: 1, to: 2 }, deferChapterStory: true });
  assert(late.tryPresentPendingChapterAdvance() && late.chapterStoryModal && late.chapterStoryModal.level === 2, "empty leftover queue may open the promotion card");
  late.taskCompletionFeedback.pending.push({ key: "goal:ch1:daily:late", title: "第一章未收尾任务" });
  assert(late.showNextTaskCompletionNotice() && late.infoDetailModal && /未收尾/.test(late.infoDetailModal.prose), "a late leftover result must pull the promotion card back");
  assert(!late.chapterStoryModal, "promotion card must yield to the leftover result");
  assert(Number(late.state.world.reserve.progression.stage) === 1, "late leftover must not enter chapter 2");
  assert((late.chapterStoryQueue || []).some((story) => story && story.level === 2), "promotion card stays queued behind the leftover result");
  late.dismissInfoDetailModal();
  assert(late.chapterStoryModal && late.chapterStoryModal.level === 2, "promotion card returns after the leftover result");
  late.dismissChapterStory();
  assert(Number(late.state.world.reserve.progression.stage) === 2, "enter chapter 2 only after the leftover result and promotion card");
}

{
  const upgraded = game;
  upgraded.screen = "home";
  upgraded.render = () => {};
  upgraded.playSfx = () => {};
  upgraded.prepareChapterArt = () => {};
  upgraded.openFirstReturnHook = () => false;
  upgraded.openPendingShareInvite = () => false;
  upgraded.openPendingStrategicDilemma = () => false;
  upgraded.openPendingEmotionEvent = () => false;
  upgraded.openOfflineBrief = () => false;
  upgraded.openGuardianReturnLetter = () => false;
  upgraded.openAnimalLetterPrompt = () => false;
  upgraded.openQueuedMissionPush = () => false;
  upgraded.maybeOpenMissionPush = () => false;
  upgraded.openFirstOnboardingChoice = () => false;
  upgraded.openPendingWorldHoundPatrolResult = () => false;
  upgraded.trackNarrative = () => {};
  upgraded.pendingChapterPromotion = null;
  upgraded.pendingChapterAdvance = false;
  upgraded.chapterStoryQueue = [];
  upgraded.infoDetailModal = null;
  upgraded.pendingMissionAfterChapter = false;
  upgraded.state.ui = Object.assign({}, upgraded.state.ui || {}, { chapterStoriesSeen: {} });
  const reserve = upgraded.state.world.reserve;
  reserve.progression = Object.assign({}, reserve.progression || {}, { stage: 6, displayChapter: 6 });
  const story = upgraded.buildChapterStory(6, "start");
  story.transitionFrom = 5;
  upgraded.chapterStoryModal = story;
  upgraded.taskCompletionFeedback = {
    pending: [{ key: "goal:legacy:chapter6", title: "旧版本已完成任务" }],
    collect() {},
    absorb() {},
    take() { return this.pending.shift() || null; }
  };
  const originalMark = upgraded.markChapterStorySeen.bind(upgraded);
  upgraded.markChapterStorySeen = (level, phase) => {
    originalMark(level, phase);
    throw new Error("setStorageSync: fail the maximum size of the key");
  };
  upgraded.dismissChapterStory();
  assert(!upgraded.chapterStoryModal, "进入游戏 must close the chapter card when an upgraded save cannot be written");
  assert(upgraded.chapterStorySeen(6, "start"), "the closed chapter card must stay seen in memory");
  assert(!(upgraded.chapterStoryQueue || []).some((item) => item && item.level === 6 && item.phase === "start"), "old task results must not put the same 进入游戏 card back");
}

console.log("chapter story check ok");
