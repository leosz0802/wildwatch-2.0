function createFakeContext(drawCalls = null) {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (text) => ({ width: String(text || "").length * 7 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (prop === "drawImage") return (...args) => { if (drawCalls) drawCalls.push(args[0]); };
      if (prop === "canvas") return { width: 430, height: 932 };
      if (!target[prop]) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) { target[prop] = value; return true; }
  });
}

global.wx = {
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 1 }; },
  createCanvas() { return { width: 430, height: 932, getContext() { return createFakeContext(); } }; },
  createImage() { return { loaded: true, set src(value) { this._src = value; this.loaded = true; if (this.onload) this.onload(); }, get src() { return this._src; } }; },
  getStorageSync() { return null; }, setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
const { CHAPTER_PROGRESSION_GATES } = require("../js/simulator");
const { getUnlockedSpecies } = require("../js/animalWorld");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function prepareGame() {
  const game = new Game();
  game.stopLoop();
  game.ctx = createFakeContext();
  game.render = () => {};
  game.state = createCharacter(null, "保护区卫士");
  game.state.ui = {
    onboarding: { version: 2, stage: "chapter", firstChoice: "", firstActionDone: false, completed: false, seen: {} }
  };
  game.screen = "home";
  game.chapterStoryModal = null;
  game.infoDetailModal = null;
  game.settlementModal = null;
  game.patrolTaskModal = null;
  return game;
}

const directBoot = prepareGame();
directBoot.art.map = { loaded: false, failed: false };
directBoot.art.atlas = { loaded: false, failed: false };
directBoot.art.animalMapSprites = { loaded: false, failed: false };
directBoot.clear = () => {};
directBoot.clampScroll = () => {};
directBoot.syncNativeTemplateAd = () => {};
directBoot.drawBottomNav = () => {};
let directBootScreenDrawn = false;
directBoot.drawCurrentScreen = () => { directBootScreenDrawn = true; };
Game.prototype.render.call(directBoot);
assert(directBootScreenDrawn, "cold start should draw the real first screen immediately instead of waiting behind a splash screen");

const chapterMinutes = Object.values(CHAPTER_PROGRESSION_GATES).map((gate) => gate.expectedMinutes);
assert(chapterMinutes.join(",") === "5,20,30,35,40,45,50,55,60,60,65,70,75,80,86,92,98,104,110,120", `twenty-stage pacing drifted: ${chapterMinutes.join("/")}`);
assert(chapterMinutes.every((minutes, index) => !index || minutes >= chapterMinutes[index - 1]), "stage forecasts should rise smoothly without a late-game cliff");
assert(chapterMinutes.reduce((sum, value) => sum + value, 0) === 1300, "the twenty stages should forecast 1300 minutes of effective play");
assert(Object.values(CHAPTER_PROGRESSION_GATES).every((gate) => gate.stage >= 1 && gate.stage <= 20 && gate.storyLevel >= 1 && gate.storyLevel <= 7), "twenty operating stages should map cleanly onto the story chapter range");

const game = prepareGame();
game.state.character = null;
game.state.ui = { prologue: { version: 1, stage: "fog", completed: false } };
game.screen = "choose";
game.drawChoose(game.ctx);
assert(game.renderedPlayablePrologue.stage === "fog"
  && !game.renderedPlayablePrologue.dynamicMap
  && game.renderedPlayablePrologue.staticUnderlay
  && !game.renderedPlayablePrologue.staticChapterArt
  && game.renderedPlayablePrologue.cinematicArt
  && game.renderedPlayablePrologue.comicPanels === 1
  && game.renderedPlayablePrologue.panel === 1
  && game.renderedPlayablePrologue.panelOneReady
  && !game.renderedPlayablePrologue.panelTwoReady
  && game.renderedPlayablePrologue.beat === "listen"
  && game.renderedPlayablePrologue.soundCue === "叮——"
  && game.renderedPlayablePrologue.actionLabel === "听……"
  && game.renderedPlayablePrologue.actionBounds.hidden
  && game.renderedPlayablePrologue.dialogue.style === "survival-manifesto"
  && !game.renderedPlayablePrologue.dialogue.cloud
  && game.renderedPlayablePrologue.dialogue.textPriority === "primary"
  && game.renderedPlayablePrologue.imageTransitionMode === "hold"
  && game.renderedPlayablePrologue.transitionFlash === false
  && game.renderedPlayablePrologue.geometryContinuous
  && game.renderedPlayablePrologue.lateLoadHold
  && game.renderedPlayablePrologue.avoidsDoubleExposure
  && /解救 1 只动物/.test(game.renderedPlayablePrologue.dialogue.line)
  && /招募 95 名游客/.test(game.renderedPlayablePrologue.dialogue.line)
  && /扩大到 180 只/.test(game.renderedPlayablePrologue.dialogue.line)
  && /没有无代价的善意/.test(game.renderedPlayablePrologue.dialogue.rule)
  && game.renderedPlayablePrologue.dialogue.layeredCloud,
"first frame should foreground chapter-one goals without showing a premature fake button");
assert(!game.advancePlayablePrologue(), "the player should not be able to skip the opening bell before the first beat lands");
game.prologueRuntime.startedAt = Date.now() - 900;
game.drawChoose(game.ctx);
assert(game.renderedPlayablePrologue.actionLabel === "进入游戏" && game.renderedPlayablePrologue.actionEnabled
  && game.renderedPlayablePrologue.actionBounds.compact && game.renderedPlayablePrologue.actionBounds.cartoon
  && game.renderedPlayablePrologue.actionBounds.w <= 190
  && game.renderedPlayablePrologue.panel === 1
  && !game.renderedPlayablePrologue.panelTwoReady,
  "the first image should expose a single enter-game button");
assert(game.advancePlayablePrologue() && game.state.character, "tapping enter game should create the reserve on the first image");
assert(game.screen === "home" && !game.chapterStoryModal && game.chapterStorySeen(1, "start"), "playable prologue should replace the first static chapter illustration");
assert(game.infoDetailModal && game.infoDetailModal.kind === "onboardingChoice", "new player should enter the first choice instead of the full mission report");
assert(game.infoDetailModal.kind === "onboardingChoice" && game.infoDetailModal.choices.length === 1, "first interaction should be a single clear action");
assert(game.infoDetailModal.items.length === 1
  && game.infoDetailModal.items.every((item) => /\d+→\d+/.test(`${item.title}${item.body}`))
  && /偷猎|线索/.test(`${game.infoDetailModal.items[0].title}${game.infoDetailModal.items[0].body}`), "first action should preview real costs and result ranges");
assert(!game.maybeOpenMissionPush("home"), "complex mission push must stay quiet during onboarding");

const holdGame = prepareGame();
holdGame.state.character = null;
holdGame.state.ui = { prologue: { version: 1, stage: "fog", completed: false } };
holdGame.screen = "choose";
holdGame.prologueRuntime = { stage: "fog", startedAt: Date.now() - 900 };
holdGame.renderedPlayablePrologue = { actionEnabled: true };
holdGame.mapImageSource = () => null;
assert(holdGame.tryEnterPlayableGame() && holdGame.screen === "home", "enter must leave prologue even while the illustrated map is still loading");
assert(holdGame.holdPrologueMapUntilIllustrated, "first enter must hold the forest art instead of flashing the grassless fallback");
let riverDraws = 0;
holdGame.drawSavannaRiver = () => { riverDraws += 1; };
holdGame.drawCartoonSavannaMap(holdGame.ctx, { worldX: 0, worldY: 0, worldW: 375, worldH: 600, worldSize: 375, scale: 1, x: 0, y: 0, w: 375, h: 600 }, false, true);
assert(riverDraws === 0, "first enter must not flash the yellow sand map without grass");

const audioFailureEntry = prepareGame();
audioFailureEntry.state.character = null;
audioFailureEntry.state.ui = { prologue: { version: 1, stage: "fog", completed: false } };
audioFailureEntry.screen = "choose";
audioFailureEntry.prologueRuntime = { stage: "fog", startedAt: Date.now() - 900 };
audioFailureEntry.audio = {
  attachState() { throw new Error("simulated developer-tool audio failure"); },
  playEffect() { throw new Error("simulated developer-tool audio failure"); }
};
assert(audioFailureEntry.advancePlayablePrologue()
  && audioFailureEntry.screen === "home"
  && audioFailureEntry.state.character,
"developer-tool audio errors must not interrupt the enter-game button");

const resumed = prepareGame();
resumed.state.ui.prologue = { version: 1, stage: "reveal", completed: false, revealStartedAt: Date.now() - 900 };
assert(resumed.playablePrologueState().active && resumed.playablePrologueState().stage === "fog", "an interrupted legacy save should land on the first image instead of a second panel");
const legacy = prepareGame();
delete legacy.state.ui.prologue;
assert(!legacy.playablePrologueState().active && legacy.playablePrologueState().legacy, "existing saves must never replay the new opening");

[[320, 568], [375, 667], [430, 932]].forEach(([width, height]) => {
  const entry = prepareGame();
  entry.width = width;
  entry.height = height;
  entry.screen = "choose";
  entry.state.character = null;
  entry.state.ui = { prologue: { version: 1, stage: "fog", completed: false } };
  entry.contentHeight = 0;
  entry.drawChoose(entry.ctx);
  assert(entry.maxScroll() === 0, `entry page should fit one screen at ${width}x${height}`);
  const fogVisual = entry.renderedPlayablePrologue;
  assert(fogVisual.stage === "fog" && fogVisual.dogBounds.w >= 88
    && fogVisual.cinematicArt && !fogVisual.actionEnabled && fogVisual.fogOpacity >= .7
    && fogVisual.comicPanels === 1 && fogVisual.panel === 1
    && fogVisual.panelOneReady && !fogVisual.panelTwoReady
    && fogVisual.dialogue && fogVisual.actionBounds.y + fogVisual.actionBounds.h <= height - 20,
  `fog discovery should stay cinematic and safe at ${width}x${height}`);
  entry.prologueRuntime.startedAt = Date.now() - 900;
  entry.drawChoose(entry.ctx);
  assert(entry.renderedPlayablePrologue.actionEnabled, `enter-game should unlock after its film beat at ${width}x${height}`);
  assert(entry.renderedPlayablePrologue.actionLabel === "进入游戏"
    && entry.renderedPlayablePrologue.panel === 1
    && entry.maxScroll() === 0,
    `the first image should keep a single enter-game control at ${width}x${height}`);
  assert(entry.advancePlayablePrologue(true) && entry.screen === "home" && entry.state.character,
    `one image plus enter-game should enter the playable reserve directly at ${width}x${height}`);
  const visual = prepareGame();
  visual.width = width;
  visual.height = height;
  visual.openFirstOnboardingChoice();
  visual.hitAreas = [];
  visual.drawInfoDetailModal();
  const choiceButtons = visual.hitAreas.filter((hit) => hit.h >= 36 && hit.w > 90);
  assert(choiceButtons.length >= 1, `first choice needs a safe button at ${width}x${height}`);
  choiceButtons.slice(-1).forEach((hit) => assert(hit.x >= 0 && hit.y >= 0 && hit.x + hit.w <= width && hit.y + hit.h <= height, `onboarding control should stay inside ${width}x${height}`));
});

assert(game.executeOnboardingAction("houndScout"), "first choice should execute directly");
assert((((game.state.world.reserve || {}).progression || {}).totalActions || 0) === 1, "first choice should immediately produce one real operating action");
assert(!game.patrolTaskModal, "first 30 seconds should not add a second confirmation popup");
assert(game.settlementModal && game.settlementModal.onboardingFirstAction && game.settlementModal.breakthrough, "first action should land on the real settlement with a first-choice marker");
assert(game.onboardingProgress().firstChoice === "houndScout" && game.onboardingProgress().firstActionDone, "first choice and result must persist");

game.finishSettlement("home");
assert(game.screen === "role" && game.patrolTaskModal && game.patrolTaskModal.id === "salvage", "first patrol reward should open the direct transfer confirmation on materials");
assert(game.patrolTaskModal.label === "立即移交" && /自动入库/.test(game.patrolTaskModal.modalType || ""), "first patrol transfer should explain that the system already collected the samples");
const firstRecovery = (game.state.ui || {}).firstPatrolRecovery || {};
assert(firstRecovery.total >= 2 && firstRecovery.promptPending === false, "first patrol should auto-collect its real recovered samples exactly once");
assert((game.state.world.reserve.pendingRecovered.researchSample || 0) === 0 && (game.state.world.reserve.inventory.researchSample || 0) >= 2, "new player research samples should move from pending collection into inventory");
game.patrolTaskModal = null;
game.setScreen("home");
game.openOnboardingGuide("after_first", true);
assert(game.infoDetailModal && game.infoDetailModal.kind === "onboardingGuide" && game.infoDetailModal.stage === "after_first", "first settlement should explain how to read numbers and animal feedback");
game.infoDetailModal.action();
assert(!game.infoDetailModal, "after-first guide should return to the sandbox in one tap");
let nextGuide = game.onboardingHomeGuide();
assert(nextGuide && nextGuide.stage === "second_action" && nextGuide.direct, "completing the result guide must immediately generate a second playable task");
const resumedAfterFirst = prepareGame();
resumedAfterFirst.state = JSON.parse(JSON.stringify(game.state));
assert(resumedAfterFirst.onboardingHomeGuide() && resumedAfterFirst.onboardingHomeGuide().stage === "second_action", "the generated next task must survive save-and-reload");
game.activateOnboardingGuide(nextGuide);
assert(game.patrolTaskModal, "the generated second task must open a real patrol action");
game.patrolTaskModal = null;
game.setScreen("home");

game.selectedReserveAction = "habitat";
game.command = "修复水源和草场";
game.pendingTaskOriginScreen = "home";
game.submitCommand();
game.finishSettlement("home");
assert(game.infoDetailModal && game.infoDetailModal.stage === "recruitment", "second action should route the new player into the visitor recruitment task");
assert(!game.onboardingProgress().completed && game.onboardingHomeGuide().stage === "recruitment", "recruitment must remain the active third onboarding task");
game.infoDetailModal.action();
assert(game.infoDetailModal && game.infoDetailModal.kind === "visitorRecruitment" && game.infoDetailModal.onboardingRecruitment, "recruitment task should open the real visitor operation modal");
assert(game.publishVisitorRecruitment() && game.infoDetailModal.phase === "result", "the onboarding recruitment should produce a real visitor and fund result");
assert(game.onboardingProgress().recruitmentDone, "recruitment completion must persist");
game.infoDetailModal = null;
game.openOnboardingGuide("core_complete", true);
assert(game.infoDetailModal && game.infoDetailModal.stage === "core_complete", "recruitment result should lead to the core loop completion guide");
assert(game.infoDetailModal.items.some((item) => /逐步开放/.test(item.tag)), "completion should explain that secondary systems unlock contextually");
game.infoDetailModal.action();
assert(game.screen === "home" && !game.infoDetailModal, "completion CTA should return directly to free sandbox play");
const resumedComplete = prepareGame();
resumedComplete.state = JSON.parse(JSON.stringify(game.state));
assert(resumedComplete.onboardingProgress().completed && !resumedComplete.openFirstOnboardingChoice(), "completed onboarding must survive save-and-reload");

console.log("onboarding pacing check ok (single opening image with enter-game, two-action core loop, legacy resume, 3 sizes)");
