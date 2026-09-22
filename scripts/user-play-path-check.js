"use strict";

const assert = require("node:assert/strict");
const { createCharacter, saveState, loadState } = require("../js/storage");
const { buildGoalView } = require("../js/goalSystem");
const { CHAPTERS } = require("../js/animalWorld");
const {
  applyEmergencyFundReward,
  emergencyFundAdStatus,
  animalTotalAdStatus,
  applyAnimalTotalAdReward,
  REWARDED_ANIMAL_AD_CONFIG
} = require("../js/adSystem");
const {
  DAILY_AD_WATCH_CAP,
  visitorRecruitmentStatus
} = require("../js/visitorRecruitment");
const { livingAnimalTotal } = require("../js/chapterRescueSystem");
const {
  UNLOCK_DELAY_MS,
  chapterSpecialStatus,
  applyChapterSpecialReward
} = require("../js/chapterSpecialSystem");

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

function completeAd() {
  return {
    available: () => true,
    show() {
      return {
        then(onOk) {
          if (typeof onOk === "function") onOk({ completed: true });
          return { then() { return this; }, catch() { return this; } };
        },
        catch() { return this; }
      };
    }
  };
}

function seedReserve(reserve, chapter = 2) {
  Object.assign(reserve.progression, {
    stage: chapter,
    displayChapter: chapter,
    level: CHAPTERS[Math.max(0, chapter - 1)].level
  });
  reserve.guardianCycle = Object.assign({}, reserve.guardianCycle || {}, { day: Math.max(3, Number((reserve.guardianCycle || {}).day) || 1) });
  reserve.fund = 1800;
  reserve.supplies = Object.assign({ dogFood: 12, alarm: 8, fieldKit: 8, medicalKit: 6, tranquilizer: 8 }, reserve.supplies || {});
  reserve.inventory = Object.assign({}, reserve.inventory, { researchSample: 4, recoveredTrap: 2 });
  reserve.ecology.water = 62;
  reserve.ecology.grass = 58;
  reserve.safety = 74;
  reserve.poacherPressure = 28;
}

function makeGame(label, chapter = 2) {
  stored.clear();
  const game = new Game();
  game.stopLoop();
  game.state = createCharacter(null, label);
  game.state.ui = Object.assign({}, game.state.ui || {}, {
    onboarding: { completed: true, recruitmentDone: true, seen: {} }
  });
  seedReserve(game.state.world.reserve, chapter);
  game.width = 375;
  game.height = 812;
  game.dpr = 1;
  game.screen = "home";
  game.render = game.requestRender = game.playSfx = game.playSettlementSfx = () => {};
  game.prepareLocalAssetsForScreen = () => {};
  game.toast = () => {};
  game.rewardedSupplyAds = completeAd();
  game.rewardedVisitorAds = completeAd();
  game.rewardedAnimalAds = completeAd();
  game.archeryScoreFor = () => 5;
  game.lockArcheryAim = () => {};
  game.interstitialAds = null;
  game.openNextSandboxEvent = game.openQueuedMissionPush = () => false;
  return game;
}

function finite(value, label) {
  assert(Number.isFinite(Number(value)), `${label} is not finite: ${value}`);
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
  const groups = [(reserve.ecology || {}).herbivores, (reserve.ecology || {}).predators, (reserve.ecology || {}).birds];
  groups.forEach((group) => {
    Object.values(group || {}).forEach((count) => assert(Number(count) >= 0, `${label}: animal count went negative`));
  });
  finite(livingAnimalTotal(reserve), `${label}.livingAnimals`);
  const visitors = Number(((((reserve.development || {}).operations || {}).today || {}).visitors) || 0)
    + Number(((((reserve.development || {}).operations || {}).today || {}).recruitedVisitors) || 0);
  finite(visitors, `${label}.visitors`);
  const special = chapterSpecialStatus(reserve);
  assert.equal(special.state.chapter, Math.max(1, Number((reserve.progression || {}).stage) || 1), `${label}: special chapter drifted`);
  const view = buildGoalView(game.state, game.state.world.goals);
  assert(view, `${label}: goal view disappeared`);
  if (view.primary) assert(typeof view.primary.id === "string" && view.primary.id, `${label}: primary task has no id`);
  const ids = [view.primary].concat(view.alternatives || []).filter(Boolean).map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, `${label}: duplicate task cards`);
  JSON.stringify(game.state.world.reserve);
  ["home", "role", "action"].forEach((screen) => {
    game.settlementModal = null;
    game.patrolTaskModal = null;
    game.infoDetailModal = null;
    game.activeTaskLock = null;
    game.setScreen(screen);
    assert.equal(game.screen, screen, `${label}: cannot open ${screen}`);
  });
  game.setScreen("home");
  return view;
}

function closeLayers(game) {
  if (game.settlementModal) game.finishSettlement("home");
  if (game.infoDetailModal && game.infoDetailModal.kind === "animalComfort" && game.infoDetailModal.phase === "result") {
    game.advanceAnimalCareProcess();
  }
  if (typeof game.dismissInfoDetailModal === "function") game.dismissInfoDetailModal();
  game.infoDetailModal = null;
  game.patrolTaskModal = null;
  game.settlementModal = null;
  game.activeTaskLock = null;
  game.chapterStoryModal = null;
}

function resolveOpenedWork(game) {
  const modal = game.infoDetailModal;
  if (game.patrolTaskModal && !game.settlementModal) {
    try { game.confirmPatrolTask(game.patrolTaskModal); } catch (error) {
      throw new Error(`patrol confirm threw: ${error.message}`);
    }
  }
  if (modal && modal.kind === "visitorRecruitment" && modal.phase !== "result") {
    game.publishVisitorRecruitment() || game.watchVisitorRecruitmentAd();
  }
  if (game.infoDetailModal && game.infoDetailModal.kind === "animalComfort" && game.infoDetailModal.phase !== "result") {
    game.advanceAnimalCareProcess();
  }
  if (game.infoDetailModal && game.infoDetailModal.kind === "materialExploration") {
    game.executeMaterialExploration(game.infoDetailModal.targetId || "researchSample", 6);
  }
  if (game.infoDetailModal && game.infoDetailModal.kind === "chapterSpecialTask" && game.infoDetailModal.phase === "ready") {
    game.archeryScoreFor = () => 5;
    game.resolveChapterSpecialTask();
  }
  if (game.settlementModal) game.finishSettlement("home");
  if (game.infoDetailModal && game.infoDetailModal.phase === "result") {
    if (game.infoDetailModal.kind === "animalComfort") game.advanceAnimalCareProcess();
    else if (typeof game.dismissInfoDetailModal === "function") game.dismissInfoDetailModal();
    else game.infoDetailModal = null;
  }
}

function followPrimary(game, label) {
  const view = buildGoalView(game.state, game.state.world.goals);
  const goal = view.primary;
  if (!goal) {
    assertHealthy(game, `${label}-idle`);
    return null;
  }
  closeLayers(game);
  const opened = game.executeGoalAction(goal);
  if (opened === false && !game.patrolTaskModal && !game.infoDetailModal && !game.settlementModal) {
    game.executeMaterialExploration("researchSample", 6);
  }
  resolveOpenedWork(game);
  closeLayers(game);
  assertHealthy(game, label);
  return goal.id;
}

function unlockSpecial(game, now = Date.now()) {
  const reserve = game.state.world.reserve;
  reserve.chapterRescue = Object.assign({}, reserve.chapterRescue || {}, { enforceCompletion: false });
  const status = chapterSpecialStatus(reserve, now);
  status.state.enteredAt = now - UNLOCK_DELAY_MS - 250;
  status.state.unlocked = false;
  status.state.completed = false;
  status.state.offered = false;
  game.maybeUnlockChapterSpecial(now);
  return chapterSpecialStatus(reserve, now);
}

function completeSpecialIfAvailable(game, roll = 5, label = "special") {
  const reserve = game.state.world.reserve;
  const status = chapterSpecialStatus(reserve);
  if (!status.available) return false;
  closeLayers(game);
  game.archeryScoreFor = () => roll;
  const opened = game.openChapterSpecialTask();
  assert(opened, `${label}: special task did not open`);
  resolveOpenedWork(game);
  closeLayers(game);
  assert(chapterSpecialStatus(reserve).state.completed, `${label}: special task did not complete`);
  assertHealthy(game, `${label}-after-special`);
  return true;
}

function spamAnimalAds(game, label) {
  const reserve = game.state.world.reserve;
  const before = livingAnimalTotal(reserve);
  let claims = 0;
  for (let i = 0; i < 8; i += 1) {
    const status = animalTotalAdStatus(reserve);
    if (!status.eligible) break;
    const opened = game.claimAnimalTotalAd();
    if (!opened) applyAnimalTotalAdReward(reserve, 0.5);
    claims += 1;
  }
  const afterStatus = animalTotalAdStatus(reserve);
  assert(claims >= 1, `${label}: lucky animal ads never applied`);
  assert.equal(afterStatus.eligible, false, `${label}: lucky animal ads must stop after the daily cap`);
  assert(afterStatus.claimedToday <= REWARDED_ANIMAL_AD_CONFIG.dailyCap, `${label}: animal ads exceeded daily cap`);
  assert(livingAnimalTotal(reserve) >= before, `${label}: animal ads reduced living total`);
  assertHealthy(game, `${label}-after-animal-ads`);
}

function runLinear(chapter) {
  const game = makeGame(`线形执行-第${chapter}章`, chapter);
  assertHealthy(game, `linear-${chapter}-start`);
  const seen = new Set();
  unlockSpecial(game);
  completeSpecialIfAvailable(game, 5, `linear-${chapter}-special`);
  for (let step = 0; step < 10; step += 1) {
    const goalId = followPrimary(game, `linear-${chapter}-step-${step + 1}`);
    if (goalId) seen.add(goalId);
  }
  return seen.size;
}

function runJumpSkipSpecial(chapter) {
  const game = makeGame(`跳跃跳过特别任务-第${chapter}章`, chapter);
  const unlocked = unlockSpecial(game);
  assert(unlocked.available, `jump-skip-${chapter}: special should unlock after one minute`);
  closeLayers(game);
  assert(game.openChapterSpecialTask(), `jump-skip-${chapter}: special opened`);
  closeLayers(game);
  assert.equal(chapterSpecialStatus(game.state.world.reserve).state.completed, false, `jump-skip-${chapter}: closing without play must not complete the special`);
  runJumpBody(game, chapter, "skip-special");
  completeSpecialIfAvailable(game, 2, `jump-skip-${chapter}-late-fail`);
  followPrimary(game, `jump-skip-${chapter}-resume`);
}

function runJumpBody(game, chapter, tag) {
  const jumpActions = ["habitat", "houndScout", "antiPoacher", "exploreMaterials", "viewVisitors"];
  for (let step = 0; step < 12; step += 1) {
    closeLayers(game);
    const view = buildGoalView(game.state, game.state.world.goals);
    const cards = [view.primary].concat(view.alternatives || []).filter(Boolean);
    const pick = cards[step % cards.length];
    if (step % 3 === 0 && pick) {
      game.executeGoalAction(pick);
      closeLayers(game);
    } else {
      const action = jumpActions[step % jumpActions.length];
      if (action === "viewVisitors") {
        game.openVisitorRecruitment();
        closeLayers(game);
      } else if (action === "exploreMaterials") {
        game.executeMaterialExploration("researchSample", 3 + (step % 4));
        if (game.settlementModal) game.finishSettlement("home");
      } else {
        const option = (game.reserveActionOptions() || []).find((item) => item.id === action);
        if (option) {
          game.openPatrolTaskModal(option);
          if (step % 2 === 0) game.confirmPatrolTask(game.patrolTaskModal);
          else closeLayers(game);
        }
      }
    }
    game.setScreen(step % 2 ? "role" : "home");
    if (game.settlementModal) game.finishSettlement("home");
    assertHealthy(game, `jump-${tag}-${chapter}-step-${step + 1}`);
  }
  followPrimary(game, `jump-${tag}-${chapter}-resume`);
}

function runJump(chapter) {
  const game = makeGame(`跳跃执行-第${chapter}章`, chapter);
  runJumpBody(game, chapter, "mix");
}

function runDisruptive(chapter) {
  const game = makeGame(`破坏式执行-第${chapter}章`, chapter);
  const reserve = game.state.world.reserve;
  reserve.fund = 400;
  const fundBefore = reserve.fund;
  let fundClaims = 0;
  for (let i = 0; i < 12; i += 1) {
    const status = emergencyFundAdStatus(reserve);
    if (!status.eligible) break;
    const viaUi = game.claimEmergencyFundAd();
    if (!viaUi) applyEmergencyFundReward(reserve);
    fundClaims += 1;
  }
  assert(fundClaims >= 3, `disrupt-${chapter}: fund ads never applied`);
  assert(reserve.fund > fundBefore, `disrupt-${chapter}: continuous fund ads did not raise fund`);
  assertHealthy(game, `disrupt-${chapter}-after-fund-ads`);
  spamAnimalAds(game, `disrupt-${chapter}`);
  unlockSpecial(game);
  completeSpecialIfAvailable(game, 6, `disrupt-${chapter}-special`);
  assert.equal(game.openChapterSpecialTask(), false, `disrupt-${chapter}: completed special must not reopen`);
  assertHealthy(game, `disrupt-${chapter}-after-special`);

  let recruits = 0;
  let ads = 0;
  for (let i = 0; i < 20; i += 1) {
    closeLayers(game);
    game.openVisitorRecruitment();
    const day = game.visitorRecruitmentDay();
    const status = visitorRecruitmentStatus(reserve, day);
    if (status.canRecruit || Number(status.totalAvailable) > 0) {
      if (game.publishVisitorRecruitment()) recruits += 1;
    } else if (status.canWatchAd && ads < DAILY_AD_WATCH_CAP) {
      game.watchVisitorRecruitmentAd();
      ads += 1;
    } else {
      break;
    }
    closeLayers(game);
  }
  assert(recruits >= 2, `disrupt-${chapter}: continuous recruitment never succeeded`);
  const afterCap = visitorRecruitmentStatus(reserve, game.visitorRecruitmentDay());
  assert.equal(game.publishVisitorRecruitment(), false, `disrupt-${chapter}: recruitment must stop when quota is empty`);
  assert(afterCap.adWatchedToday <= DAILY_AD_WATCH_CAP, `disrupt-${chapter}: recruitment ads exceeded the daily cap`);
  assertHealthy(game, `disrupt-${chapter}-after-recruit-spam`);

  const animals = (game.state.world.knownCharacters || []).filter((animal) => animal && animal.id).slice(0, 6);
  assert(animals.length >= 2, `disrupt-${chapter}: need animals to soothe`);
  let soothed = 0;
  animals.forEach((animal) => {
    game.speakingAnimalId = animal.id;
    closeLayers(game);
    const opened = game.openAnimalCareProcess(animal, "calmObserve");
    if (opened) {
      game.advanceAnimalCareProcess();
      closeLayers(game);
      soothed += 1;
    }
    game.speakingAnimalId = animal.id;
    game.performAnimalAction(animal, "calmObserve");
    closeLayers(game);
  });
  assert(soothed >= 1, `disrupt-${chapter}: animal comfort never ran`);
  assertHealthy(game, `disrupt-${chapter}-after-comfort-spam`);

  for (let i = 0; i < 6; i += 1) {
    closeLayers(game);
    game.executeMaterialExploration(i % 2 ? "shedAntlerB" : "researchSample", 1 + (i % 6));
    if (game.settlementModal) game.finishSettlement("home");
    closeLayers(game);
  }
  assertHealthy(game, `disrupt-${chapter}-after-explore-spam`);

  followPrimary(game, `disrupt-${chapter}-resume-task`);
  followPrimary(game, `disrupt-${chapter}-second-task`);

  saveState(game.state);
  const restored = loadState();
  assert(restored && restored.world && restored.world.reserve, `disrupt-${chapter}: save/load lost the reserve`);
  game.state = restored;
  game.rewardedSupplyAds = completeAd();
  game.rewardedVisitorAds = completeAd();
  game.rewardedAnimalAds = completeAd();
  closeLayers(game);
  assertHealthy(game, `disrupt-${chapter}-after-reload`);
  followPrimary(game, `disrupt-${chapter}-after-reload-task`);
}

function runInterleave(chapter) {
  const game = makeGame(`穿插破坏-第${chapter}章`, chapter);
  const animals = (game.state.world.knownCharacters || []).filter((animal) => animal && animal.id);
  for (let step = 0; step < 8; step += 1) {
    closeLayers(game);
    const mode = step % 4;
    if (mode === 0) {
      game.claimEmergencyFundAd();
    } else if (mode === 1) {
      game.openVisitorRecruitment();
      game.publishVisitorRecruitment() || game.watchVisitorRecruitmentAd();
    } else if (mode === 2 && animals[step % Math.max(1, animals.length)]) {
      const animal = animals[step % animals.length];
      game.speakingAnimalId = animal.id;
      if (game.openAnimalCareProcess(animal, "calmObserve")) game.advanceAnimalCareProcess();
    } else {
      game.claimAnimalTotalAd();
      const option = (game.reserveActionOptions() || []).find((item) => item.id === "habitat");
      if (option) {
        game.openPatrolTaskModal(option);
        closeLayers(game);
      }
      game.executeMaterialExploration("researchSample", 4);
    }
    if (game.settlementModal) game.finishSettlement("home");
    closeLayers(game);
    followPrimary(game, `interleave-${chapter}-step-${step + 1}`);
  }
}

const linearSeen = runLinear(1) + runLinear(3);
runJump(2);
runJump(5);
runJumpSkipSpecial(2);
runJumpSkipSpecial(8);
runDisruptive(2);
runDisruptive(4);
runDisruptive(12);
runInterleave(3);

console.log(`user play path check ok (linear 1/3 with special, jump 2/5, skip-special 2/8, disruptive fund-ad/animal-ad/recruit/comfort/explore/special on 2/4/12, interleaved chapter 3, ${linearSeen} linear task ids)`);
