const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function testGame(screen = "survival") {
  const game = Object.create(Game.prototype);
  game.state = createCharacter(null, "后台事件测试");
  game.screen = screen;
  game.gesture = null;
  game.anim = { t: 2000 };
  game.screenChangedAt = 0;
  game.chapterStoryModal = null;
  game.chapterStoryQueue = [];
  game.settlementModal = null;
  game.patrolTaskModal = null;
  game.infoDetailModal = null;
  game.pendingEmotionEvent = null;
  game.pendingEmotionEvents = [];
  game.pendingShareInvite = null;
  game.pendingOfflineBrief = null;
  game.pendingGuardianLetter = null;
  game.pendingAnimalLetterId = "";
  game.mapCrisisBurst = null;
  game.renderCount = 0;
  game.render = () => { game.renderCount += 1; };
  game.prepareChapterArt = () => {};
  game.trackNarrative = () => {};
  game.markPopupQuiet = () => {};
  return game;
}

const performanceGame = testGame("role");
performanceGame.mapCrisisBurst = { expiresAt: Date.now() + 5000 };
assert(performanceGame.targetFrameMs() === 1000, "an offscreen map crisis still forced the UI into the map frame rate");
performanceGame.chapterStoryModal = { level: 2 };
assert(performanceGame.targetFrameMs() === 1000, "a deferred chapter story still accelerated an unrelated screen");
assert(!performanceGame.openDataInputBlocked(), "a deferred chapter story blocked input outside the sandbox");
performanceGame.settlementModal = { presentationScreen: "home", revealAt: Date.now() + 5000 };
assert(!performanceGame.settlementBlocksCurrentScreen(), "a deferred settlement blocked touch input outside the sandbox");
assert(performanceGame.targetFrameMs() === 1000, "a deferred settlement accelerated an unrelated screen");
performanceGame.settlementModal = null;

const emotionGame = testGame("collection");
const emotion = {
  id: "offscreen_return",
  type: "return",
  day: 3,
  title: "它回来了",
  body: "林缘留下了熟悉的脚印。",
  individual: { id: "animal_return", name: "晨角", species: "鹿" }
};
emotionGame.pendingEmotionEvent = emotion;
assert(!emotionGame.openPendingEmotionEvent(), "an animal event opened over the collection screen");
assert(emotionGame.pendingEmotionEvent === emotion && !emotionGame.infoDetailModal, "an offscreen animal event was consumed instead of deferred");
emotionGame.screen = "home";
assert(emotionGame.openPendingEmotionEvent(), "the deferred animal event did not open after returning to the sandbox");
assert(emotionGame.infoDetailModal && !emotionGame.pendingEmotionEvent, "the deferred animal event was not consumed exactly once on the sandbox");

const ecologyGame = testGame("survival");
ecologyGame.state.world.reserve.ecologyNarrative = {
  pendingDecision: {
    id: "offscreen_ecology",
    type: "competition",
    day: 4,
    title: "水边出现争夺",
    scene: "两群动物停在同一处浅滩。",
    cause: "水位下降。",
    stakes: "开放通道或分隔水线。",
    dialogues: [],
    choices: [
      { id: "open", label: "保留通道", cost: "巡护+1", preview: "迁徙改善" },
      { id: "divide", label: "分隔水线", cost: "基金-20", preview: "冲突下降" }
    ]
  }
};
assert(!ecologyGame.openPendingEcologyDecision(), "an ecology decision opened over the survival screen");
assert(ecologyGame.state.world.reserve.ecologyNarrative.pendingDecision, "an offscreen ecology decision was consumed");
ecologyGame.screen = "home";
assert(ecologyGame.openPendingEcologyDecision(), "the ecology decision did not open after returning to the sandbox");

const chapterGame = testGame("role");
chapterGame.chapterStorySeen = () => false;
chapterGame.buildChapterStory = (level, phase) => ({ level, phase, narrativeBeat: { id: `chapter_${level}_${phase}` } });
assert(chapterGame.queueChapterStoriesForSettlement({ chapterTransition: { from: 1, to: 2 } }), "the offscreen chapter event was not queued");
assert(!chapterGame.chapterStoryModal && chapterGame.chapterStoryQueue.length === 1, "the chapter event appeared outside the sandbox instead of entering the queue");
chapterGame.screen = "home";
assert(chapterGame.openQueuedChapterStory(), "the queued chapter event did not open on the sandbox");
assert(chapterGame.chapterStoryModal && chapterGame.chapterStoryQueue.length === 0, "the queued chapter event was not consumed exactly once");

const navigationGame = testGame("home");
navigationGame.chapterStoryModal = { level: 3, phase: "start", narrativeBeat: { id: "chapter_3_start" } };
navigationGame.prepareLocalAssetsForScreen = () => {};
navigationGame.queueRemoteAssetsForScreen = () => {};
navigationGame.markScreenChange = () => {};
navigationGame.firstSessionFeatureLocked = () => false;
navigationGame.setScreen("survival");
assert(navigationGame.screen === "survival" && !navigationGame.chapterStoryModal, "a chapter overlay survived after leaving the sandbox");
assert(navigationGame.chapterStoryQueue.length === 1, "a chapter overlay was lost instead of being returned to the queue");

console.log("offscreen sandbox event check ok (deferred overlays, preserved events, background frame throttle)");
