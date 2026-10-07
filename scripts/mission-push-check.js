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
const { normalizeGoalState } = require("../js/goalSystem");

const game = new Game();
game.stopLoop();
game.state = createCharacter(null, "保护区卫士");
game.state.world.reserve.progression.stage = 2;
game.state.world.reserve.progression.displayChapter = 2;
game.state.world.goals = normalizeGoalState(game.state.world.goals, game.state);
game.state.ui = { onboarding: { version: 2, completed: true, seen: {} } };
game.state.world.reserve.progression.totalActions = 9;
game.state.world.reserve.progression.activeSeconds = 45;
if (game.maybeOpenMissionPush("login")) {
  throw new Error("ordinary card mission must wait through the opening minute");
}
game.state.world.reserve.progression.activeSeconds = 60;
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
  throw new Error("the first chapter/system recommendation should auto-push once after the opening minute");
}

game.infoDetailModal = null;
const reopened = game.maybeOpenMissionPush("login");
if (reopened) {
  throw new Error("same mission should not auto-push repeatedly after being seen");
}

// After three minutes of active play, automatic mission cards must leave a
// real-time browsing window of more than 82 seconds. The queue remains
// available; only the unsolicited popup is delayed.
game.state.world.reserve.progression.activeSeconds = 181;
game.state.world.reserve.ecology.water = 5;
game.currentGoalView(true);
game.state.ui.missionPushSeenKey = "";
game.state.ui.lastMissionAutoAction = 0;
game.state.ui.lastMissionAutoPushAt = Date.now();
game.state.ui.lastSystemTaskTriggerAt = Date.now();
if (game.maybeOpenMissionPush("home")) {
  throw new Error("experienced players should not receive another automatic mission within 82 seconds");
}
game.state.ui.lastMissionAutoPushAt = Date.now() - 105001;
game.state.ui.lastSystemTaskTriggerAt = Date.now() - 105001;
game.state.ui.lastUserTaskTriggerAt = Date.now() - 105001;
game.state.ui.missionPushSeenKey = "";
game.state.world.reserve.progression.totalActions = 20;
if (game.maybeOpenMissionPush("home")) {
  throw new Error("the same non-exception system task must stay retired after the quiet window");
}
game.infoDetailModal = null;
game.state.ui.missionPushSeenKey = "";
game.state.ui.lastMissionAutoPushAt = Date.now();
game.state.ui.lastSystemTaskTriggerAt = Date.now();
game.state.ui.lastUserTaskTriggerAt = 0;
if (game.maybeOpenMissionPush("chapter")) {
  throw new Error("the extra system-push interval must still apply after chapter advance");
}
game.state.ui.lastMissionAutoPushAt = Date.now() - 82001;
game.state.ui.lastSystemTaskTriggerAt = Date.now() - 82001;
if (game.maybeOpenMissionPush("chapter")) {
  throw new Error("a previously recommended non-exception task must not repeat after the quiet window");
}
game.infoDetailModal = null;
// Restore the short synthetic timeline used by the legacy action-gap checks.
game.state.world.reserve.progression.activeSeconds = 60;
game.state.ui.lastMissionAutoPushAt = 0;
game.state.ui.lastSystemTaskTriggerAt = 0;
game.state.ui.lastUserTaskTriggerAt = 0;
game.state.ui.lastMissionAutoAction = 9;
game.state.ui.missionAutoPushAttempts = 3;

// A seven-beat chapter event updates its progress, but must remain one
// consolidated mission card instead of pushing the same task seven times.
const stableMissionKey = game.missionPushKey();
for (let step = 1; step <= 7; step += 1) {
  game.state.world.reserve.eventChain = Object.assign({}, game.state.world.reserve.eventChain || {}, { step });
  if (game.missionPushKey() !== stableMissionKey) {
    throw new Error("chapter event step changes must not split one mission into repeated pushes");
  }
}

game.state.world.goals.daily.cycle = 2;
game.state.world.reserve.progression.totalActions = 14;
if (game.maybeOpenMissionPush("home")) {
  throw new Error("a newly rotated task should still respect the minimum action interval");
}
game.state.world.reserve.progression.totalActions = 18;
if (game.maybeOpenMissionPush("home")) {
  throw new Error("routine patrol guidance should leave room for player-led browsing");
}
game.state.world.reserve.progression.totalActions = 23;
if (game.maybeOpenMissionPush("home")) {
  throw new Error("routine sampling should skip one of the later card opportunities");
}
game.state.world.reserve.progression.totalActions = 24;
if (game.maybeOpenMissionPush("home")) {
  throw new Error("same-day daily must not auto-push a second time after visitor or ecology rotation");
}
game.state.world.reserve.emergency = {
  active: { id: "fire_test", type: "wildfire", title: "山火", recommendedAction: "antiPoacher", daysRemaining: 1, recommendLabel: "处理现场" }
};
game.currentGoalView(true);
if (!game.maybeOpenMissionPush("home")) {
  throw new Error("a new crisis task should auto-push after the quieter patrol interval");
}
game.infoDetailModal = null;
game.state.world.reserve.emergency = { active: null };
game.currentGoalView(true);

game.state.world.goals.daily.cycle = 3;
game.markPopupQuiet(2);
game.state.world.reserve.progression.totalActions = 19;
if (game.maybeOpenMissionPush("home")) {
  throw new Error("mission push should respect the quiet interval after major popups");
}

game.openGoalCenter();
if (!game.infoDetailModal || typeof game.infoDetailModal.action !== "function") {
  throw new Error("manual mission push should still be available");
}
const routed = game.selectedGoalFromModal() || {};
game.infoDetailModal.action();
if (["houndScout", "antiPoacher", "habitat", "intervention"].includes(routed.recommendedAction)) {
  if (game.screen !== "action" && (!game.patrolTaskModal || game.patrolTaskModal.id !== routed.recommendedAction)) {
    throw new Error("mission action should open the recommended patrol task");
  }
  if (!game.patrolTaskModal || game.patrolTaskModal.id !== routed.recommendedAction) {
    throw new Error("mission action should open the recommended patrol task directly");
  }
  if (!game.command) {
    throw new Error("mission action should prefill the patrol command");
  }
} else if (game.screen !== "survival" && game.screen !== "role" && !(game.infoDetailModal && game.infoDetailModal.kind)) {
  throw new Error("mission action should route into the recommended task");
}

game.screen = "home";
game.patrolTaskModal = null;
game.settlementModal = null;
game.chapterStoryModal = null;
game.activeTaskLock = null;
game.infoDetailModal = { kind: "animalInteractionStory", phase: "result" };
game.openPendingAnimalInteraction = () => {
  game.infoDetailModal = { kind: "animalInteractionStory", title: "chained" };
  return true;
};
const previousQueued = game.openQueuedMissionPush;
game.openQueuedMissionPush = () => {
  game.infoDetailModal = { kind: "missionPush", title: "chained-mission" };
  return true;
};
game.dismissInfoDetailModal();
if (game.infoDetailModal) {
  throw new Error("closing a popup must not immediately open another unsolicited popup");
}
game.openQueuedMissionPush = previousQueued;

const sequenceGame = new Game();
sequenceGame.stopLoop();
sequenceGame.state = createCharacter(null, "保护区卫士");
sequenceGame.state.world.reserve.progression.stage = 2;
sequenceGame.state.world.reserve.progression.displayChapter = 2;
sequenceGame.state.world.goals = normalizeGoalState(sequenceGame.state.world.goals, sequenceGame.state);
sequenceGame.state.ui = { onboarding: { version: 2, completed: true, seen: {} } };
sequenceGame.state.world.reserve.progression.totalActions = 12;
sequenceGame.state.world.reserve.progression.activeSeconds = 60;
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
if (sequenceGame.settlementModal || sequenceGame.infoDetailModal) {
  throw new Error("operation result must close without creating a routine filler mission");
}
if (sequenceGame.pendingMissionPush) {
  throw new Error("the queued mission should be consumed exactly once after settlement");
}
if ((sequenceGame.state.ui || {}).pendingMissionPush) {
  throw new Error("consumed mission queue state must also be cleared from the save");
}

console.log("mission push check ok");
