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

const game = new Game();
game.stopLoop();
game.state = createCharacter(null, "保护区卫士");
game.state.ui = { onboarding: { version: 2, completed: true, seen: {} } };
game.state.world.reserve.progression.totalActions = 9;
game.screen = "home";
game.infoDetailModal = null;
game.patrolTaskModal = null;
game.settlementModal = null;

const daily = game.state.world.goals.daily;
if (!daily || !daily.story || !daily.recommendedAction || !daily.buttonLabel) {
  throw new Error("daily mission should be story-driven before push");
}

const opened = game.maybeOpenMissionPush("login");
if (!opened || !game.infoDetailModal) {
  throw new Error("mission push should open only after the low-density auto interval");
}
if (game.infoDetailModal.kicker !== daily.chapter || game.infoDetailModal.actionLabel !== daily.buttonLabel) {
  throw new Error("mission push should foreground current chapter and recommended action");
}
if (game.infoDetailModal.kind !== "missionPush" || !game.infoDetailModal.mission || !game.infoDetailModal.mission.actionTitle) {
  throw new Error("mission push should use the dedicated guided mission layout");
}
if (!game.infoDetailModal.items || game.infoDetailModal.items.length < 3
  || game.infoDetailModal.items.some((item) => item.tag === "为什么")
  || !game.infoDetailModal.items.some((item) => item.tag === "奖励")) {
  throw new Error("mission push should keep story/action/reward and remove the duplicate why card");
}
if (!game.state.ui.missionPushSeenKey) {
  throw new Error("mission push should mark the current task as seen");
}

game.infoDetailModal = null;
const reopened = game.maybeOpenMissionPush("login");
if (reopened) {
  throw new Error("same mission should not auto-push repeatedly after being seen");
}

game.state.world.goals.daily.cycle = 2;
game.state.world.reserve.progression.totalActions = 14;
if (game.maybeOpenMissionPush("home")) {
  throw new Error("a newly rotated task should still respect the minimum action interval");
}
game.state.world.reserve.progression.totalActions = 18;
if (!game.maybeOpenMissionPush("home")) {
  throw new Error("a new stage task should auto-push after enough meaningful operations");
}
game.infoDetailModal = null;

game.state.world.goals.daily.cycle = 3;
game.markPopupQuiet(2);
game.state.world.reserve.progression.totalActions = 19;
if (game.maybeOpenMissionPush("home")) {
  throw new Error("mission push should respect the quiet interval after major popups");
}

game.openMissionPush("manual");
if (!game.infoDetailModal || typeof game.infoDetailModal.action !== "function") {
  throw new Error("manual mission push should still be available");
}
game.infoDetailModal.action();
if (game.screen !== "action") {
  throw new Error("mission action should take the player to patrol command page");
}
if (!game.patrolTaskModal || game.patrolTaskModal.id !== daily.recommendedAction) {
  throw new Error("mission action should open the recommended patrol task directly");
}
if (!game.command) {
  throw new Error("mission action should prefill the patrol command");
}

const sequenceGame = new Game();
sequenceGame.stopLoop();
sequenceGame.state = createCharacter(null, "保护区卫士");
sequenceGame.state.ui = { onboarding: { version: 2, completed: true, seen: {} } };
sequenceGame.state.world.reserve.progression.totalActions = 12;
sequenceGame.state.world.goals.daily.completedPrevious = true;
sequenceGame.screen = "home";
sequenceGame.infoDetailModal = null;
sequenceGame.patrolTaskModal = null;
sequenceGame.chapterStoryModal = null;
sequenceGame.settlementModal = {
  goalDone: true,
  returnScreen: "home",
  emotionEvent: null
};
sequenceGame.finishSettlement("home");
if (sequenceGame.settlementModal || !sequenceGame.infoDetailModal || sequenceGame.infoDetailModal.kind !== "missionPush") {
  throw new Error("operation result must close before the newly refreshed mission opens");
}
if (sequenceGame.pendingMissionPush) {
  throw new Error("the queued mission should be consumed exactly once after settlement");
}
if ((sequenceGame.state.ui || {}).pendingMissionPush) {
  throw new Error("consumed mission queue state must also be cleared from the save");
}

console.log("mission push check ok");
