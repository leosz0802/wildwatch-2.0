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

function primeFriendRank(game) {
  game.screen = "league";
  game.leagueScope = "friends";
  game.scrollY = 0;
  game.renderedWechatFriendRank = {
    rankReady: true,
    view: { x: 24, y: 150, w: 327, h: 360 }
  };
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
tapSettlementDone(patrolGame, "role");
if (!patrolGame.patrolTaskModal || patrolGame.patrolTaskModal.id !== "salvage" || patrolGame.patrolTaskModal.label !== "立即移交") {
  throw new Error("first patrol settlement should auto-collect recovery and open the direct transfer confirmation");
}
patrolGame.patrolTaskModal = null;

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

for (const width of [320, 375, 430]) {
  for (const [action, supply] of [["antiPoacher", "alarm"], ["habitat", "fieldKit"]]) {
    const blockedGame = makeGame("action");
    blockedGame.width = width;
    blockedGame.state.world.reserve.fund = 1000;
    blockedGame.state.world.reserve.supplies[supply] = 0;
    blockedGame.selectedReserveAction = action;
    blockedGame.openPatrolTaskModal(blockedGame.reserveActionOptions().find(item => item.id === action));
    const buttons = [];
    const drawButton = blockedGame.modalButton.bind(blockedGame);
    blockedGame.modalButton = (...args) => { buttons.push({ label: args[5], onTap: args[7] }); return drawButton(...args); };
    blockedGame.hitAreas = [];
    blockedGame.drawPatrolTaskModal();
    const materialsButton = buttons.find(button => button.label === "去物资");
    if (!materialsButton) throw new Error(`${width}/${action}: blocked task needs a supply route`);
    materialsButton.onTap();
    if (blockedGame.screen !== "role" || blockedGame.patrolTaskModal) {
      throw new Error(`${width}/${action}: supply route must open materials and close the blocked task`);
    }
  }
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
materialGame.scrollY = 288;
materialGame.submitCommand();
if (materialGame.screen !== "home") {
  throw new Error("material purchase should reveal the sandbox consequence before returning to materials");
}
if (!materialGame.settlementModal || materialGame.settlementModal.returnScreen !== "role") {
  throw new Error("material purchase settlement should remember the materials page as return screen");
}
if (!materialGame.mapConsequencePulse) {
  throw new Error("material purchase should create a visible sandbox consequence pulse");
}
if (!materialGame.materialChangeNotice) {
  throw new Error("material purchase should still expose exact inventory and fund changes");
}
tapSettlementDone(materialGame, "role");

const crossScreenSettlement = makeGame("home");
crossScreenSettlement.settlementModal = {
  silent: false,
  revealAt: Date.now() - 1,
  animalRevealAt: 0,
  presentationScreen: "home",
  returnScreen: "home"
};
primeFriendRank(crossScreenSettlement);
crossScreenSettlement.hitAreas = [];
crossScreenSettlement.drawSettlementModal();
if (crossScreenSettlement.hitAreas.length || !crossScreenSettlement.settlementModal) {
  throw new Error("sandbox settlement must stay queued instead of appearing on the friend leaderboard");
}
if (!crossScreenSettlement.wechatFriendRankTouchPoint(80, 220)) {
  throw new Error("a queued off-screen settlement must not freeze friend leaderboard input");
}

crossScreenSettlement.infoDetailModal = { kind: "rival" };
if (crossScreenSettlement.wechatFriendRankTouchPoint(80, 220)) {
  throw new Error("a visible game modal must receive taps before the friend open-data context");
}
crossScreenSettlement.infoDetailModal = null;
crossScreenSettlement.settlementModal.presentationScreen = "league";
if (crossScreenSettlement.wechatFriendRankTouchPoint(80, 220)) {
  throw new Error("a visible settlement must receive taps before the friend open-data context");
}

const silentCrossScreenSettlement = makeGame("league");
silentCrossScreenSettlement.settlementModal = {
  silent: true,
  autoFinishAt: Date.now() - 1,
  presentationScreen: "home",
  returnScreen: "home"
};
silentCrossScreenSettlement.drawSettlementModal();
if (silentCrossScreenSettlement.screen !== "league" || !silentCrossScreenSettlement.settlementModal) {
  throw new Error("an off-screen silent settlement must not force the player out of the friend leaderboard");
}

console.log("flow return check ok");
