const assert = require("assert");
const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
const { applyGoalProgress, normalizeGoalState } = require("../js/goalSystem");

function makeGame() {
  const game = Object.create(Game.prototype);
  game.state = createCharacter(null, "每日单项回归");
  game.state.world.reserve.progression.stage = 2;
  game.state.world.reserve.progression.displayChapter = 2;
  game.state.world.goals = normalizeGoalState(game.state.world.goals, game.state);
  game.state.ui = { onboarding: { version: 2, completed: true, recruitmentDone: true, seen: {} } };
  game.screen = "home";
  game.render = game.toast = () => {};
  game.setScreen = (screen) => { game.screen = screen; };
  game.playSfx = () => {};
  return game;
}

function completeByAction(game, action) {
  const before = JSON.parse(JSON.stringify(game.state));
  const result = applyGoalProgress(before, game.state, { action, now: Date.now() });
  game.state = result.state;
  return result;
}

for (const action of ["viewVisitors", "habitat"]) {
  const game = makeGame();
  const result = completeByAction(game, action);
  assert.deepEqual(game.state.world.goals.daily.objectives, []);
  assert(!result.completions.some((item) => String(item.type || "").startsWith("daily_")), `${action} 不得再完成每日任务`);
  assert(!result.rewards.some((item) => String(item.source || "").startsWith("daily_")), `${action} 不得再发放每日奖励`);
  assert.equal(game.dailyEventChecklist().total, 0);
  assert.equal(game.dailyEventChecklist().remaining, 0);
  game.infoDetailModal = null;
  assert.notEqual(game.infoDetailModal && game.infoDetailModal.kind, "dailyEvents");
}

const staleRequired = makeGame();
staleRequired.state.world.goals.daily.required = 1;
staleRequired.state.world.goals.daily.objectives = [{ id: "daily_visitor", kind: "visitor", progress: 0, target: 1, complete: false }];
staleRequired.state.world.goals.daily.coreClaimed = false;
staleRequired.state.world.goals.daily.fullClaimed = false;
const stale = completeByAction(staleRequired, "viewVisitors");
assert(!stale.completions.some((item) => String(item.type || "").startsWith("daily_")), "旧存档里的每日任务也不能再结算");
assert(!stale.rewards.some((item) => String(item.source || "").startsWith("daily_")));
assert.deepEqual(staleRequired.state.world.goals.daily.objectives, []);
assert.equal(staleRequired.state.world.goals.daily.required, 0);

const list = makeGame();
assert.equal(list.openDailyEvents(), false);
assert.equal(list.executeDailyEvent("daily_ecology", "today"), false);
assert.equal(list.infoDetailModal, null);

console.log("daily partial complete check ok (daily tasks removed, no partial reward, old saves do not settle)");
