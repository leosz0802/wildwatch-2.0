const assert = require("node:assert/strict");
const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");

const game = Object.create(Game.prototype);
game.state = createCharacter(null, "目标入口一致性");
game.painting = true;
game.onboardingHomeGuide = () => null;
game.chapterCoreFallbackGoal = () => null;
game.state.world.reserve.guardianCycle = { day: 8, actionIndex: 0, sevenDay: { completed: {}, progress: {} } };

const liveGoal = {
  id: "pass:animals:rescue:antelope-1",
  kind: "daily",
  title: "解救动物：解救羚羊",
  buttonLabel: "前往沙盘解救",
  recommendedAction: "rescueAnimal",
  chapter: 1,
  progress: 6,
  target: 7
};
const staleGuidance = {
  id: "stage:1:chapterStory",
  title: "驱赶偷猎",
  onboarding: { step: "stale", title: "驱赶偷猎", actionLabel: "驱赶偷猎" }
};

game.currentGoalView = () => ({
  primary: liveGoal,
  stage: { chapter: 1, title: "泥岸初醒" },
  daily: { complete: 0, required: 2 }
});
game.frameMemoStore = { primaryGuidance: staleGuidance };
const bar = Game.prototype.sandboxGoalBarData.call(game);
assert.equal(bar.title, liveGoal.title, "goal bar title must come from the live goal snapshot");
assert.equal(bar.action, liveGoal.buttonLabel, "goal entry action must come from the same live goal");
assert.equal(bar.title, "解救动物：解救羚羊", "stale previous task title must not remain on the map");

game.frameMemoStore = {
  goalView: { primary: { id: "old" } },
  goalBar: { id: "old" },
  primaryGuidance: staleGuidance
};
const invalidated = Game.prototype.markChapterSystemAutoGuideSeen.call(game, liveGoal, 1);
assert(invalidated.length > 0, "system guide should record its seen keys");
assert.equal(game.frameMemoStore.goalView, undefined, "goal view cache must be invalidated after system guidance");
assert.equal(game.frameMemoStore.goalBar, undefined, "goal bar cache must be invalidated after system guidance");
assert.equal(game.frameMemoStore.primaryGuidance, undefined, "primary guidance cache must be invalidated after system guidance");

// A system-guided action is not shown again as the persistent map entry
// even when a metric later becomes risky. This prevents the same task from
// appearing three times after the information card has already been seen.
game.painting = false;
game.currentGoalView = () => ({
  primary: Object.assign({}, liveGoal, {
    id: "theme:1:first-protection",
    kind: "stage",
    themeTask: true,
    themeChapter: 1,
    title: "完成首次保护",
    buttonLabel: "驱赶偷猎",
    recommendedAction: "antiPoacher"
  }),
  alternatives: [{
    id: "pass:animals:rescue:antelope-1",
    kind: "stage",
    title: "解救动物：解救羚羊",
    buttonLabel: "前往沙盘解救",
    recommendedAction: "rescueAnimal",
    rescueAligned: true
  }],
  stage: { chapter: 1, title: "泥岸初醒" },
  daily: { complete: 0, required: 2 }
});
game.state.ui.chapterSystemAutoGuides = { "chapter:1:action:antiPoacher": Date.now() };
game.state.ui.chapterSystemAutoGuideKeys = ["chapter:1:action:antiPoacher"];
const nextBar = Game.prototype.sandboxGoalBarData.call(game);
assert.equal(nextBar.title, "解救动物：解救羚羊", "a seen system task must yield the next available entry");
assert.equal(nextBar.action, "前往沙盘解救", "entry action must match the displayed alternative");

game.state.ui.chapterSystemAutoGuides = {};
game.state.ui.chapterSystemAutoGuideKeys = [];
const themeBar = Game.prototype.sandboxGoalBarData.call(game);
assert.equal(themeBar.title, "完成首次保护", "theme target title should remain visible before it is seen");
assert.equal(themeBar.action, "完成首次保护", "theme entry label must match the current target title");

const lockedGame = Object.create(Game.prototype);
lockedGame.state = createCharacter(null, "旧锁不抢入口");
lockedGame.screen = "home";
lockedGame.infoDetailModal = null;
lockedGame.patrolTaskModal = null;
lockedGame.chapterStoryModal = null;
lockedGame.noticeIfSettlementBlocksAction = () => false;
lockedGame.isTodaysDailyGoal = () => false;
lockedGame.currentDailyMatchesGoal = () => false;
lockedGame.actionResourceStatus = () => ({ canRun: true, costs: [] });
let openedAction = "";
lockedGame.openReserveViewAction = (action) => {
  openedAction = action;
  return true;
};
lockedGame.saveState = () => {};
lockedGame.toast = () => {};
lockedGame.activeTaskLock = {
  id: "theme:1:first-patrol-line",
  kind: "stage",
  goal: { id: "theme:1:first-patrol-line", recommendedAction: "facilityUse" }
};
const protectionGoal = {
  id: "theme:1:first-protection",
  kind: "stage",
  title: "完成首次保护",
  recommendedAction: "antiPoacher",
  buttonLabel: "完成首次保护"
};
const opened = Game.prototype.executeGoalAction.call(lockedGame, protectionGoal);
assert.equal(opened, true, "live goal should execute after stale facility lock is cleared");
assert.equal(openedAction, "antiPoacher", "stale patrol station lock must not steal the current goal entry");

console.log("current goal and entry consistency check ok");
