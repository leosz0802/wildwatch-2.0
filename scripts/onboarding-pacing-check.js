function createFakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (text) => ({ width: String(text || "").length * 7 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
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

const chapterMinutes = Object.values(CHAPTER_PROGRESSION_GATES).map((gate) => gate.expectedMinutes);
assert(chapterMinutes.join(",") === "10,20,30,35,40,45,50,55,60,60", `ten-stage pacing should be 10/20/30/35/40/45/50/55/60/60, got ${chapterMinutes.join("/")}`);
assert(chapterMinutes.every((minutes, index) => !index || minutes >= chapterMinutes[index - 1]), "stage forecasts should rise smoothly without a late-game cliff");
assert(chapterMinutes.reduce((sum, value) => sum + value, 0) === 405, "the ten stages should forecast 405 minutes of effective play");
assert(Object.values(CHAPTER_PROGRESSION_GATES).every((gate) => gate.stage >= 1 && gate.stage <= 10 && gate.storyLevel === Math.ceil(gate.stage / 2)), "ten operating stages should map cleanly onto five story chapters");

const game = prepareGame();
game.state.character = null;
game.state.ui = { prologue: { version: 1, stage: "fog", completed: false } };
game.screen = "choose";
game.drawChoose(game.ctx);
assert(game.renderedPlayablePrologue.stage === "fog"
  && game.renderedPlayablePrologue.dynamicMap
  && !game.renderedPlayablePrologue.staticChapterArt
  && game.renderedPlayablePrologue.cinematicArt
  && game.renderedPlayablePrologue.comicPanels === 3
  && game.renderedPlayablePrologue.panel === 1
  && game.renderedPlayablePrologue.panelOneReady
  && game.renderedPlayablePrologue.panelTwoReady
  && game.renderedPlayablePrologue.beat === "listen"
  && game.renderedPlayablePrologue.soundCue === "叮——"
  && game.renderedPlayablePrologue.actionLabel === "听……"
  && game.renderedPlayablePrologue.actionBounds.hidden
  && game.renderedPlayablePrologue.dialogue.style === "cloud-bubble"
  && game.renderedPlayablePrologue.dialogue.cloud
  && game.renderedPlayablePrologue.dialogue.layeredCloud,
"first frame should enter with a cartoon cloud bubble without showing a premature fake button");
assert(!game.advancePlayablePrologue(), "the player should not be able to skip the opening bell before the first beat lands");
game.prologueRuntime.startedAt = Date.now() - 2200;
game.drawChoose(game.ctx);
assert(game.renderedPlayablePrologue.actionLabel === "轻触犬铃" && game.renderedPlayablePrologue.actionEnabled
  && game.renderedPlayablePrologue.actionBounds.compact && game.renderedPlayablePrologue.actionBounds.cartoon
  && game.renderedPlayablePrologue.actionBounds.w <= 190,
  "the first interaction should appear only after the bell-and-dialogue beat");
assert(game.advancePlayablePrologue() && game.playablePrologueState().stage === "trail" && !game.state.character, "first discovery should reveal pawprints without prematurely creating the reserve");
assert(!game.advancePlayablePrologue(), "hound dialogue should get a readable pause before the second interaction");
game.prologueRuntime.startedAt = Date.now() - 450;
game.drawChoose(game.ctx);
assert(game.renderedPlayablePrologue.panel === 2
  && game.renderedPlayablePrologue.panelTransition > .2
  && game.renderedPlayablePrologue.panelTransition < 1
  && game.renderedPlayablePrologue.dialogue.hidden
  && game.renderedPlayablePrologue.actionBounds.hidden,
"panel 2 should slide over panel 1 without dialogue or a fake action crowding the page turn");
game.prologueRuntime.startedAt = Date.now() - 2300;
game.drawChoose(game.ctx);
assert(game.renderedPlayablePrologue.panelTransition === 1
  && /水边有陌生的气味/.test(game.renderedPlayablePrologue.dialogue.line)
  && game.renderedPlayablePrologue.dialogue.style === "cloud-bubble"
  && game.renderedPlayablePrologue.dialogue.cloud
  && game.renderedPlayablePrologue.dialogue.layeredCloud
  && game.renderedPlayablePrologue.dialogue.y < game.height * .3
  && game.renderedPlayablePrologue.actionLabel === "跟上砾灰",
"the second comic panel should settle before its single line and interaction appear");
assert(game.advancePlayablePrologue() && game.playablePrologueState().stage === "reveal" && game.state.character, "following the hound should create the reserve and begin the fog reveal");
game.state.ui.prologue.revealStartedAt = Date.now() - 4000;
game.prologueRuntime.startedAt = Date.now() - 4000;
game.drawChoose(game.ctx);
assert(game.renderedPlayablePrologue.revealProgress >= .94
  && game.renderedPlayablePrologue.panel === 3
  && game.renderedPlayablePrologue.panelTransition === 1
  && game.renderedPlayablePrologue.beat === "decide"
  && game.renderedPlayablePrologue.layeredFog
  && game.renderedPlayablePrologue.imageDissolveMode === "comic-mist-wipe"
  && /水边那道陌生气味/.test(game.renderedPlayablePrologue.dialogue.line)
  && game.renderedPlayablePrologue.actionLabel === "去水边看看", "fog reveal should end with hound dialogue and the first real water-side decision");
assert(game.completePlayablePrologue(), "completed reveal should enter the active reserve");
assert(game.screen === "home" && !game.chapterStoryModal && game.chapterStorySeen(1, "start"), "playable prologue should replace the first static chapter illustration");
assert(game.infoDetailModal && game.infoDetailModal.kind === "onboardingChoice", "new player should enter the first choice instead of the full mission report");
assert(game.infoDetailModal.kind === "onboardingChoice" && game.infoDetailModal.choices.length === 2, "first interaction should be a clear two-choice decision");
assert(game.infoDetailModal.items.length === 2
  && game.infoDetailModal.items.every((item) => /\d+→\d+/.test(`${item.title}${item.body}`))
  && /水源/.test(game.infoDetailModal.items[0].title)
  && /偷猎|情报/.test(game.infoDetailModal.items[1].title), "first choice should preview both real costs and result ranges");
assert(!game.maybeOpenMissionPush("home"), "complex mission push must stay quiet during onboarding");

const resumed = prepareGame();
resumed.state.ui.prologue = { version: 1, stage: "reveal", completed: false, revealStartedAt: Date.now() - 900 };
assert(resumed.playablePrologueState().active && resumed.playablePrologueState().stage === "reveal"
  && resumed.prologueRevealProgress() > .25, "interrupted fog reveal should resume from its saved stage and timestamp");
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
    && fogVisual.comicPanels === 3 && fogVisual.panel === 1
    && fogVisual.panelOneReady && fogVisual.panelTwoReady
    && fogVisual.dialogue && fogVisual.actionBounds.y + fogVisual.actionBounds.h <= height - 20,
  `fog discovery should stay cinematic and safe at ${width}x${height}`);
  entry.prologueRuntime.startedAt = Date.now() - 2200;
  entry.drawChoose(entry.ctx);
  assert(entry.renderedPlayablePrologue.actionEnabled, `bell interaction should unlock after its film beat at ${width}x${height}`);
  entry.advancePlayablePrologue(true);
  entry.drawChoose(entry.ctx);
  assert(entry.renderedPlayablePrologue.stage === "trail" && entry.renderedPlayablePrologue.panel === 2
    && entry.renderedPlayablePrologue.actionBounds.hidden && entry.maxScroll() === 0,
  `comic page turn should fit one screen without premature controls at ${width}x${height}`);
  entry.prologueRuntime.startedAt = Date.now() - 2300;
  entry.drawChoose(entry.ctx);
  assert(entry.renderedPlayablePrologue.panelTransition === 1
    && entry.renderedPlayablePrologue.actionLabel === "跟上砾灰"
    && entry.renderedPlayablePrologue.actionEnabled,
  `second comic panel should expose one clear interaction at ${width}x${height}`);
  entry.advancePlayablePrologue(true);
  entry.state.ui.prologue.revealStartedAt = Date.now() - 4000;
  entry.prologueRuntime.startedAt = Date.now() - 4000;
  entry.drawChoose(entry.ctx);
  assert(entry.renderedPlayablePrologue.panel === 3
    && entry.renderedPlayablePrologue.panelTransition === 1
    && entry.renderedPlayablePrologue.imageDissolveMode === "comic-mist-wipe"
    && entry.renderedPlayablePrologue.actionLabel === "去水边看看"
    && entry.renderedPlayablePrologue.actionEnabled, `revealed sandbox should expose the real next action at ${width}x${height}`);
  const visual = prepareGame();
  visual.width = width;
  visual.height = height;
  visual.openFirstOnboardingChoice();
  visual.hitAreas = [];
  visual.drawInfoDetailModal();
  const choiceButtons = visual.hitAreas.filter((hit) => hit.h === 36 && hit.w > 90);
  assert(choiceButtons.length >= 2, `first choice needs two safe buttons at ${width}x${height}`);
  choiceButtons.slice(-2).forEach((hit) => assert(hit.x >= 0 && hit.y >= 0 && hit.x + hit.w <= width && hit.y + hit.h <= height, `onboarding control should stay inside ${width}x${height}`));
});

assert(game.executeOnboardingAction("houndScout"), "first choice should execute directly");
assert((((game.state.world.reserve || {}).progression || {}).totalActions || 0) === 1, "first choice should immediately produce one real operating action");
assert(!game.patrolTaskModal, "first 30 seconds should not add a second confirmation popup");
assert(game.settlementModal && game.settlementModal.onboardingFirstAction && game.settlementModal.breakthrough, "first action should land on the real settlement with a first-choice marker");
assert(game.onboardingProgress().firstChoice === "houndScout" && game.onboardingProgress().firstActionDone, "first choice and result must persist");

game.finishSettlement("home");
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
assert(game.infoDetailModal && game.infoDetailModal.stage === "materials", "second action should teach the supply and material loop");
game.infoDetailModal.action();
assert(game.screen === "role" && game.infoDetailModal && game.infoDetailModal.kind === "materialExploration", "material guide completion should immediately generate a playable exploration task");
assert(game.onboardingHomeGuide().stage === "materials_action", "closing the exploration task must leave a recoverable material task on the sandbox");

game.suppressNextHomeMission = true;
game.setScreen("home");
game.infoDetailModal = null;
game.selectedReserveAction = "antiPoacher";
game.command = "驱赶偷猎者：封锁边界";
game.pendingTaskOriginScreen = "home";
game.submitCommand();
game.finishSettlement("home");
assert(game.infoDetailModal && game.infoDetailModal.stage === "population", "third action should teach species and relationship meaning");
game.infoDetailModal.action();
assert(game.screen === "animalworld", "population guide action should open the population page");
nextGuide = game.onboardingHomeGuide();
assert(nextGuide && nextGuide.stage === "population_view", "population guide completion must generate the concrete card-view task");
game.openSpeciesProfile(getUnlockedSpecies(1)[0].id);
assert(game.infoDetailModal && game.infoDetailModal.kind === "speciesProfile" && game.infoDetailModal.actionLabel === "回沙盘接新任务", "opening one population card must complete that task and expose the next task button");
assert(game.onboardingHomeGuide().stage === "final_action", "population card completion must generate the final patrol task before the modal closes");
game.infoDetailModal.action();
assert(game.screen === "home", "population task CTA should return to the sandbox");
const guide = game.onboardingHomeGuide();
assert(guide && guide.step === 4 && guide.stage === "final_action" && guide.direct, "home should retain a clickable final task until onboarding completes");

game.suppressNextHomeMission = true;
game.setScreen("home");
game.infoDetailModal = null;
game.selectedReserveAction = "houndScout";
game.command = "派猎犬侦察：检查陌生气味";
game.pendingTaskOriginScreen = "home";
game.submitCommand();
game.finishSettlement("home");
assert(game.onboardingProgress().completed && !game.onboardingHomeGuide(), "fourth valid action should complete onboarding and remove the persistent guide");
assert(game.infoDetailModal && game.infoDetailModal.kind === "strategicDilemma", "first strategy event should take priority over the normal mission push after onboarding");

console.log("onboarding pacing check ok (playable fog discovery, dynamic sandbox reveal, 30-second choice loop, progressive guides, 3 sizes, 10-stage 10-60 minute staircase)");
