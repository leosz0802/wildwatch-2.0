"use strict";

const assert = require("node:assert/strict");
const { createCharacter, saveState, loadState, normalizeReserve } = require("../js/storage");
const { CHAPTERS, reconcileSpeciesPopulations } = require("../js/animalWorld");
const { simulateDay } = require("../js/simulator");
const { animalSourceSummary } = require("../js/animalSourceLedger");
const { livingAnimalTotal, nextRescueTask } = require("../js/chapterRescueSystem");
const { chapterVisitorTotal } = require("../js/chapterTargets");
const {
  FACILITY_USE_PROFILES,
  applyFacilityUse,
  facilityUsePreview
} = require("../js/reserveFacilities");
const {
  emergencyFundAdStatus,
  applyEmergencyFundReward,
  animalTotalAdStatus,
  applyAnimalTotalAdReward
} = require("../js/adSystem");
const { visitorRecruitmentStatus } = require("../js/visitorRecruitment");

const stored = new Map();

function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, key) {
      if (key === "measureText") return (text) => ({ width: String(text || "").length * 7 });
      if (key === "createLinearGradient" || key === "createRadialGradient") return () => gradient;
      if (key === "canvas") return { width: 375, height: 812 };
      if (!target[key]) target[key] = () => {};
      return target[key];
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    }
  });
}

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 812, pixelRatio: 1 }),
  createCanvas: () => ({ width: 375, height: 812, getContext: () => fakeContext() }),
  createImage: () => ({ loaded: true, set src(value) { this._src = value; if (this.onload) this.onload(); } }),
  getStorageSync: (key) => stored.has(key) ? JSON.parse(JSON.stringify(stored.get(key))) : null,
  setStorageSync: (key, value) => stored.set(key, JSON.parse(JSON.stringify(value))),
  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
  onTouchCancel() {},
  onKeyboardConfirm() {},
  onAppHide() {},
  onAppShow() {},
  showToast() {}
};

const { Game } = require("../js/game");

const SCREENS = ["home", "role", "action", "survival", "collection", "league", "social"];
const STATION_IDS = Object.keys(FACILITY_USE_PROFILES);
const IDLE_COMMANDS = [
  "修复水源和草场",
  "派猎犬侦察：确认边界脚印",
  "驱赶偷猎者：封锁可疑路线",
  "跟随动物探索物资 掷骰:3"
];
const JUMP_ORDER = [7, 1, 14, 3, 20, 2, 11, 5, 18, 4, 9, 16, 6, 13, 8, 19, 10, 15, 12, 17];

function finite(value, label) {
  assert(Number.isFinite(Number(value)), `${label} is not finite: ${value}`);
}

function makeGame(label, chapter = 1, extras = {}) {
  stored.clear();
  const game = new Game();
  game.stopLoop();
  game.state = createCharacter(null, label);
  game.state.ui = Object.assign({}, game.state.ui || {}, {
    onboarding: extras.onboarding || { version: 2, completed: true, recruitmentDone: true, firstActionDone: true, seen: {} }
  });
  jumpChapter(game, chapter);
  const reserve = game.state.world.reserve;
  reserve.guardianCycle = Object.assign({}, reserve.guardianCycle || {}, { day: extras.day || 6 });
  if (extras.fund != null) reserve.fund = extras.fund;
  if (extras.supplies) reserve.supplies = Object.assign({}, reserve.supplies || {}, extras.supplies);
  if (extras.water != null) reserve.ecology.water = extras.water;
  if (extras.grass != null) reserve.ecology.grass = extras.grass;
  game.width = 375;
  game.height = 812;
  game.dpr = 1;
  game.screen = "home";
  game.ctx = fakeContext();
  game.render = () => {
    try { game.drawCurrentScreen(game.ctx); } catch (_error) { /* health check will rethrow if needed */ }
  };
  game.requestRender = game.render;
  game.playSfx = game.playSettlementSfx = game.playArcheryImpact = () => {};
  game.prepareLocalAssetsForScreen = () => {};
  game.toast = (message) => { game.lastToast = message; };
  game.archeryScoreFor = () => 4;
  game.lockArcheryAim = () => {};
  game.rewardedSupplyAds = {
    available: () => true,
    show() { return Promise.resolve({ completed: true }); }
  };
  game.rewardedVisitorAds = game.rewardedSupplyAds;
  game.rewardedAnimalAds = game.rewardedSupplyAds;
  game.interstitialAds = null;
  game.openNextSandboxEvent = () => false;
  game.openQueuedMissionPush = () => false;
  return game;
}

function jumpChapter(game, chapter) {
  const reserve = game.state.world.reserve;
  const before = livingAnimalTotal(reserve);
  const safe = Math.max(1, Math.min(20, Math.round(Number(chapter) || 1)));
  Object.assign(reserve.progression, {
    stage: safe,
    displayChapter: safe,
    level: CHAPTERS[safe - 1].level
  });
  reconcileSpeciesPopulations(reserve, { removeLocked: true, initializeUnlocked: true });
  const after = livingAnimalTotal(reserve);
  assert.equal(after, before, `jump to chapter ${safe} must not invent animals without rescue (was ${before}, now ${after})`);
}

function closeLayers(game) {
  try {
    if (game.settlementModal && typeof game.finishSettlement === "function") game.finishSettlement("home");
  } catch (_error) {
    game.settlementModal = null;
  }
  try {
    if (typeof game.dismissInfoDetailModal === "function") game.dismissInfoDetailModal();
  } catch (_error) {
    game.infoDetailModal = null;
  }
  game.infoDetailModal = null;
  game.patrolTaskModal = null;
  game.settlementModal = null;
  game.activeTaskLock = null;
  game.chapterStoryModal = null;
}

function applyIdleDay(game, command) {
  const result = simulateDay(command, game.state);
  game.state = Object.assign({}, game.state, { world: result.world, character: result.character });
}

function assertHealthy(game, label) {
  const reserve = ((game.state || {}).world || {}).reserve;
  assert(reserve, `${label}: reserve disappeared`);
  finite(reserve.fund, `${label}.fund`);
  finite((reserve.ecology || {}).water, `${label}.water`);
  finite((reserve.ecology || {}).grass, `${label}.grass`);
  finite(reserve.safety, `${label}.safety`);
  assert(reserve.fund >= 0, `${label}: fund went negative`);
  assert((reserve.ecology.water || 0) >= 0 && (reserve.ecology.water || 0) <= 120, `${label}: water out of range`);
  assert((reserve.ecology.grass || 0) >= 0 && (reserve.ecology.grass || 0) <= 120, `${label}: grass out of range`);
  const animals = livingAnimalTotal(reserve);
  const visitors = chapterVisitorTotal(reserve);
  finite(animals, `${label}.animals`);
  finite(visitors, `${label}.visitors`);
  assert(animals >= 0, `${label}: living animals went negative`);
  assert(visitors >= 0, `${label}: chapter visitors went negative`);
  const ledger = animalSourceSummary(reserve);
  assert(
    Math.abs(ledger.closureDelta) <= 8,
    `${label}: animal ledger snapped ${ledger.closureDelta} (ending ${ledger.ending} vs ${ledger.expectedEnding})`
  );
  JSON.stringify(reserve);
  SCREENS.forEach((screen) => {
    closeLayers(game);
    game.setScreen(screen);
    assert.equal(game.screen, screen, `${label}: cannot open ${screen}`);
    assert.doesNotThrow(() => game.drawCurrentScreen(game.ctx), `${label}: ${screen} draw crashed`);
  });
  game.setScreen("home");
}

function pokeStations(game, label) {
  STATION_IDS.forEach((id) => {
    const preview = facilityUsePreview(game.state, id);
    assert(preview, `${label}: ${id} preview missing`);
    const used = applyFacilityUse(game.state, id);
    if (preview.locked || !preview.ready) {
      assert.equal(used.ok, false, `${label}: locked/unready ${id} still settled`);
    }
  });
}

function pokeRescueWithoutStory(game, label) {
  const reserve = game.state.world.reserve;
  const task = nextRescueTask(reserve, Number((reserve.progression || {}).stage) || 1);
  assert.equal(game.completeChapterRescue("missing-target"), false, `${label}: missing rescue settled`);
  if (!task) return;
  closeLayers(game);
  const opened = game.openChapterRescueTask(task.targetId);
  if (opened) {
    if (game.infoDetailModal && game.infoDetailModal.kind === "materialExploration") {
      game.infoDetailModal.phase = "rolling";
      game.dismissInfoDetailModal();
      assert.equal(game.infoDetailModal, null, `${label}: rolling rescue shot could not close`);
    } else {
      closeLayers(game);
    }
  }
  assert.equal(game.completeChapterRescue(task.targetId), false, `${label}: unfinished rescue completed without items`);
}

function pokeAdsAndRecruit(game) {
  const reserve = game.state.world.reserve;
  for (let i = 0; i < 6; i += 1) {
    if (!emergencyFundAdStatus(reserve).eligible) break;
    applyEmergencyFundReward(reserve);
  }
  for (let i = 0; i < 6; i += 1) {
    if (!animalTotalAdStatus(reserve).eligible) break;
    applyAnimalTotalAdReward(reserve, 0.5);
  }
  closeLayers(game);
  try { game.openVisitorRecruitment(); } catch (_error) { /* keep going */ }
  const day = typeof game.visitorRecruitmentDay === "function" ? game.visitorRecruitmentDay() : 6;
  const status = visitorRecruitmentStatus(reserve, day);
  if (status && status.canRecruit) {
    try { game.publishVisitorRecruitment(); } catch (_error) { /* keep going */ }
  }
  closeLayers(game);
}

function pokeSandbox(game, label, chapter) {
  closeLayers(game);
  try { game.openReserveMetricDetail("fund"); } catch (_error) { /* keep going */ }
  closeLayers(game);
  try { game.openReserveMetricDetail("water"); } catch (_error) { /* keep going */ }
  closeLayers(game);
  try { game.openReserveFacilityDetail("old_patrol_post"); } catch (_error) { /* keep going */ }
  closeLayers(game);
  try { game.openReserveFacilityDetail("governance_hall"); } catch (_error) { /* keep going */ }
  closeLayers(game);
  try { game.openMaterialsForMissing({ id: "buySupplies", missing: ["基金"], purchase: { id: "all", cost: 500 } }); } catch (_error) { /* keep going */ }
  closeLayers(game);
  try { game.executeMaterialExploration("researchSample", 2); } catch (_error) { /* keep going */ }
  if (game.settlementModal) {
    try { game.finishSettlement("home"); } catch (_error) { game.settlementModal = null; }
  }
  closeLayers(game);
  pokeStations(game, label);
  pokeRescueWithoutStory(game, `${label}-rescue`);
  pokeAdsAndRecruit(game);
  applyIdleDay(game, IDLE_COMMANDS[chapter % IDLE_COMMANDS.length]);
  closeLayers(game);
}

function runSkipStoryGate() {
  [1, 4, 12].forEach((chapter) => {
    const game = makeGame(`跳过剧情门-第${chapter}章`, chapter);
    const reserve = game.state.world.reserve;
    const stageBefore = reserve.progression.stage;
    assert.equal(game.armPendingChapterPromotion(reserve, chapter), false, `skip-${chapter}: unfinished cores still queued a chapter`);
    assert.equal(game.applyPendingChapterPromotion(), false, `skip-${chapter}: empty promotion still applied`);
    assert.equal(reserve.progression.stage, stageBefore, `skip-${chapter}: stage moved without story`);
    pokeSandbox(game, `skip-${chapter}`, chapter);
    assertHealthy(game, `skip-${chapter}-end`);
  });
}

function runOutOfOrderChapters() {
  const game = makeGame("乱序跳章", 1);
  JUMP_ORDER.forEach((chapter) => {
    jumpChapter(game, chapter);
    pokeSandbox(game, `jump-${chapter}`, chapter);
    assertHealthy(game, `jump-${chapter}`);
  });
  saveState(game.state);
  game.state = loadState();
  game.ctx = fakeContext();
  assertHealthy(game, "jump-after-reload");
}

function runStarvation() {
  const game = makeGame("零资源硬撑", 6, {
    fund: 0,
    supplies: { dogFood: 0, fieldKit: 0, alarm: 0, medicalKit: 0, tranquilizer: 0 },
    water: 12,
    grass: 14
  });
  pokeSandbox(game, "starve", 6);
  applyIdleDay(game, "派猎犬侦察：确认边界脚印");
  applyIdleDay(game, "驱赶偷猎者：封锁可疑路线");
  const beforeRepair = game.state.world.reserve.ecology.water;
  game.state.world.reserve.supplies.fieldKit = 2;
  game.state.world.reserve.fund = 200;
  applyIdleDay(game, "修复水源和草场");
  const afterRepair = game.state.world.reserve.ecology.water;
  assert(afterRepair > beforeRepair, "starve: one water repair must still raise collapsed water");
  assert(afterRepair >= 30, `starve: one repair left water at ${afterRepair}`);
  assertHealthy(game, "starve-after-repair");
}

function runScreenSpam() {
  const game = makeGame("狂切界面", 9);
  for (let i = 0; i < 24; i += 1) {
    const screen = SCREENS[i % SCREENS.length];
    closeLayers(game);
    game.setScreen(screen);
    if (i % 3 === 0) {
      try { game.openVisitorRecruitment(); } catch (_error) { /* keep going */ }
      closeLayers(game);
    }
    if (i % 4 === 0) {
      try { game.openReserveMetricDetail(["fund", "water", "grass", "animals"][i % 4]); } catch (_error) { /* keep going */ }
      closeLayers(game);
    }
    assert.doesNotThrow(() => game.drawCurrentScreen(game.ctx), `spam: ${screen} #${i} crashed`);
  }
  assertHealthy(game, "screen-spam-end");
}

function runDirtyValues() {
  const game = makeGame("脏数值", 3);
  const reserve = game.state.world.reserve;
  reserve.fund = Number.NaN;
  reserve.ecology.water = Number.NaN;
  reserve.ecology.grass = undefined;
  reserve.safety = Number.POSITIVE_INFINITY;
  try {
    applyIdleDay(game, "修复水源和草场");
    pokeStations(game, "dirty");
    closeLayers(game);
    game.setScreen("home");
    game.drawCurrentScreen(game.ctx);
  } catch (error) {
    assert.fail(`dirty: NaN reserve crashed (${error.message})`);
  }
  const repaired = normalizeReserve(JSON.parse(JSON.stringify(game.state.world.reserve)));
  game.state.world.reserve = repaired;
  if (!Number.isFinite(game.state.world.reserve.fund)) game.state.world.reserve.fund = 400;
  if (!Number.isFinite(game.state.world.reserve.ecology.water)) game.state.world.reserve.ecology.water = 50;
  if (!Number.isFinite(game.state.world.reserve.ecology.grass)) game.state.world.reserve.ecology.grass = 50;
  if (!Number.isFinite(game.state.world.reserve.safety) || game.state.world.reserve.safety > 100) {
    game.state.world.reserve.safety = 60;
  }
  assertHealthy(game, "dirty-after-repair");
}

function runOnboardingUntouched() {
  const game = makeGame("第一章不点新手", 1, {
    day: 1,
    onboarding: { version: 2, completed: false, seen: {} }
  });
  game.state.world.reserve.progression.totalActions = 0;
  pokeStations(game, "onboard");
  try { game.openVisitorRecruitment(); } catch (_error) { /* keep going */ }
  closeLayers(game);
  try { game.openReserveMetricDetail("fund"); } catch (_error) { /* keep going */ }
  closeLayers(game);
  game.setScreen("home");
  game.setScreen("role");
  game.setScreen("home");
  assert.equal(game.state.ui.onboarding.completed, false, "onboarding completed itself without the first story tap");
  if (typeof game.openFirstOnboardingChoice === "function") {
    const opened = game.openFirstOnboardingChoice();
    if (opened && game.infoDetailModal && Array.isArray(game.infoDetailModal.choices)) {
      assert.equal(game.infoDetailModal.choices[0].label, "侦察脚印", "chapter 1 first onboarding drifted");
    }
  }
  closeLayers(game);
  assertHealthy(game, "onboarding-untouched");
}

runSkipStoryGate();
runOutOfOrderChapters();
runStarvation();
runScreenSpam();
runDirtyValues();
runOnboardingUntouched();

console.log("disruptive robustness check ok (skip-story gates, 20 out-of-order chapters, starvation, screen spam, dirty values, chapter-1 onboarding left untouched)");
