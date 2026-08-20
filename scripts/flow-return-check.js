function createFakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (text) => ({ width: String(text || "").length * 7 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (prop === "canvas") return { width: 375, height: 667 };
      if (!target[prop]) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    }
  });
}

global.wx = {
  getSystemInfoSync() {
    return { windowWidth: 375, windowHeight: 667, pixelRatio: 1 };
  },
  createCanvas() {
    return {
      width: 375,
      height: 667,
      getContext() {
        return createFakeContext();
      }
    };
  },
  createImage() {
    return {
      loaded: true,
      set src(value) {
        this._src = value;
        this.loaded = true;
        if (this.onload) this.onload();
      },
      get src() {
        return this._src;
      }
    };
  },
  getStorageSync() {
    return null;
  },
  setStorageSync() {},
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
const { createCharacter } = require("../js/storage");

function makeGame(screen) {
  const game = new Game();
  game.stopLoop();
  game.state = createCharacter(null, "保护区卫士");
  game.state.ui = {};
  game.screen = screen;
  game.scrollY = 0;
  game.infoDetailModal = null;
  game.patrolTaskModal = null;
  game.settlementModal = null;
  game.pendingTaskOriginScreen = null;
  return game;
}

function tapSettlementDone(game, expectedScreen) {
  if (game.settlementModal && game.settlementModal.silent) {
    game.settlementModal.autoFinishAt = 0;
    game.drawSettlementModal();
    if (game.screen !== expectedScreen || game.settlementModal) {
      throw new Error(`silent sandbox settlement should auto-finish on ${expectedScreen}`);
    }
    return;
  }
  if (game.settlementModal) {
    game.settlementModal.revealAt = 0;
    game.settlementModal.animalRevealAt = 0;
  }
  game.hitAreas = [];
  game.drawSettlementModal();
  const doneHit = game.hitAreas
    .slice()
    .reverse()
    .find((hit) => hit.x > game.width / 2 && hit.w > 90 && hit.h >= 36 && typeof hit.onTap === "function");
  if (!doneHit) {
    throw new Error("settlement done button should be clickable");
  }
  doneHit.onTap();
  if (game.screen !== expectedScreen) {
    throw new Error(`settlement done button should stay on ${expectedScreen}, got ${game.screen}`);
  }
  if (game.settlementModal) {
    throw new Error("settlement done button should close the modal");
  }
}

const patrolGame = makeGame("action");
patrolGame.openPatrolTaskModal(patrolGame.reserveActionOptions().find((item) => item.id === "houndScout"));
if (patrolGame.pendingTaskOriginScreen !== "action") {
  throw new Error("patrol task should remember action screen as origin");
}
patrolGame.submitCommand();
if (patrolGame.screen !== "home") {
  throw new Error("patrol settlement should return to the home sandbox");
}
if (!patrolGame.settlementModal || patrolGame.settlementModal.returnScreen !== "home") {
  throw new Error("patrol settlement should return to the home sandbox");
}
if (!patrolGame.mapConsequencePulse) {
  throw new Error("every action resolution must expose sandbox causality first");
}
if (patrolGame.settlementModal.silent) {
  if (!(patrolGame.settlementModal.autoFinishAt > Date.now())) throw new Error("ordinary sandbox feedback must auto-finish without a full-screen popup");
} else {
  const major = patrolGame.settlementModal.breakthrough || patrolGame.settlementModal.chapterTransition || patrolGame.settlementModal.finalChapterEnding || patrolGame.settlementModal.mysteryRecovery || (patrolGame.settlementModal.emotionEvent && patrolGame.settlementModal.emotionEvent.isMajor);
  if (!major || !(patrolGame.settlementModal.revealAt > Date.now()) || !(patrolGame.settlementModal.animalRevealAt > patrolGame.settlementModal.revealAt)) {
    throw new Error("only a real breakthrough may retain the delayed full-screen settlement");
  }
}
if (!(patrolGame.mapConsequencePulse.expiresAt > patrolGame.mapConsequencePulse.startedAt + 2000)) {
  throw new Error("sandbox causality should have time to show environment, numbers and animal response in order");
}
const pulseStart = patrolGame.mapConsequencePulse.startedAt;
if (patrolGame.mapConsequenceStage(patrolGame.mapConsequencePulse, pulseStart + 200) !== "environment"
  || patrolGame.mapConsequenceStage(patrolGame.mapConsequencePulse, pulseStart + 800) !== "numbers"
  || patrolGame.mapConsequenceStage(patrolGame.mapConsequencePulse, pulseStart + 1700) !== "animal") {
  throw new Error("sandbox consequence must reveal environment, exact numbers, then animal response");
}
tapSettlementDone(patrolGame, "home");

const materialPatrolScreen = makeGame("role");
materialPatrolScreen.openPatrolOperationScreen("houndScout");
if (materialPatrolScreen.screen !== "action" || materialPatrolScreen.actionScreenOrigin !== "role") {
  throw new Error("materials patrol shortcut should remember the materials page as its close destination");
}
materialPatrolScreen.closePatrolOperationScreen();
if (materialPatrolScreen.screen !== "role" || materialPatrolScreen.actionScreenOrigin) {
  throw new Error("patrol close button should return to the materials page and clear the saved origin");
}

const homePatrolScreen = makeGame("home");
homePatrolScreen.openPatrolOperationScreen("antiPoacher");
homePatrolScreen.closePatrolOperationScreen();
if (homePatrolScreen.screen !== "home") {
  throw new Error("patrol close button should return to the sandbox when patrol started there");
}

const blockedGame = makeGame("action");
blockedGame.state.world.reserve.supplies.alarm = 0;
blockedGame.selectedReserveAction = "antiPoacher";
blockedGame.command = "驱赶偷猎者：检查边界直线脚印";
blockedGame.openPatrolTaskModal(blockedGame.reserveActionOptions().find((item) => item.id === "antiPoacher"));
blockedGame.hitAreas = [];
blockedGame.drawPatrolTaskModal();
const materialsHit = blockedGame.hitAreas.slice().reverse().find((hit) => hit.x > blockedGame.width / 2 && hit.w > 90 && hit.h >= 36 && typeof hit.onTap === "function");
if (!materialsHit) throw new Error("blocked patrol should expose a materials shortcut");
materialsHit.onTap();
if (blockedGame.screen !== "role" || blockedGame.patrolTaskModal) {
  throw new Error("missing supply shortcut should open materials and close the patrol modal");
}

const materialGame = makeGame("role");
materialGame.useMaterialAction("buySupplies");
if (materialGame.screen !== "role") {
  throw new Error("material action should not jump to patrol page before confirmation");
}
if (!materialGame.patrolTaskModal || materialGame.patrolTaskModal.id !== "buySupplies") {
  throw new Error("material action should open the matching task modal on material page");
}
if (materialGame.pendingTaskOriginScreen !== "role") {
  throw new Error("material task should remember role screen as origin");
}
materialGame.submitCommand();
if (materialGame.screen !== "home") {
  throw new Error("material settlement should reveal the sandbox consequence before returning to materials");
}
if (!materialGame.settlementModal || materialGame.settlementModal.returnScreen !== "role") {
  throw new Error("material settlement should return to material screen");
}
tapSettlementDone(materialGame, "role");

console.log("flow return check ok");
